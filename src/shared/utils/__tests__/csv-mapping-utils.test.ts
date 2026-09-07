import { describe, expect, it } from 'vitest'
import type { BillingMilestone, Project } from '@/shared/types'
import {
  applyMappingProfile,
  BILLING_SOURCE,
  buildBillingRows,
  buildDefaultColumns,
  buildMappedCsv,
} from '../csv-mapping-utils'

const FIELDS = [
  { key: 'code', label: 'コード' },
  { key: 'name', label: '名称' },
  { key: 'amount', label: '金額' },
]

const ROWS = [
  { code: 'P001', name: '案件A', amount: 100 },
  { code: 'P002', name: 'カンマ,入り', amount: 0 },
]

function makeProject(overrides: Partial<Project> = {}): Project {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    code: 'P001',
    name: 'テスト案件',
    parentId: null,
    level: 0,
    status: 'active',
    confidence: null,
    completed: false,
    clientName: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeMilestone(
  projectId: string,
  overrides: Partial<BillingMilestone> = {},
): BillingMilestone {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    projectId,
    label: '検収時',
    amount: 500,
    plannedAcceptanceDate: '2026-03-31',
    status: 'planned',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('buildDefaultColumns', () => {
  it('カタログ順・全列有効・ラベル=ヘッダの既定列を作る', () => {
    expect(buildDefaultColumns(FIELDS)).toEqual([
      { field: 'code', header: 'コード', enabled: true, order: 0 },
      { field: 'name', header: '名称', enabled: true, order: 1 },
      { field: 'amount', header: '金額', enabled: true, order: 2 },
    ])
  })
})

describe('applyMappingProfile', () => {
  it('enabled列だけをorder昇順で出力し、ヘッダは改名後の名前になる', () => {
    const table = applyMappingProfile(ROWS, {
      includeHeader: true,
      columns: [
        // 定義順とorderを逆にして、orderが優先されることを確認する
        { field: 'name', header: 'ItemName', enabled: true, order: 1 },
        { field: 'amount', header: 'Price', enabled: true, order: 0 },
        { field: 'code', header: 'コード', enabled: false, order: 2 },
      ],
    })
    expect(table).toEqual([
      ['Price', 'ItemName'],
      [100, '案件A'],
      [0, 'カンマ,入り'],
    ])
  })

  it('反証: includeHeader=falseならヘッダ行を出力しない（会計ソフトのヘッダ無し取込向け）', () => {
    const table = applyMappingProfile(ROWS, {
      includeHeader: false,
      columns: buildDefaultColumns(FIELDS),
    })
    expect(table).toHaveLength(2)
    expect(table[0]?.[0]).toBe('P001')
  })

  it('反証: 行データに存在しないfieldは空欄になりエラーにしない（プロファイルとソースの版ずれ=弱参照）', () => {
    const table = applyMappingProfile(ROWS, {
      includeHeader: true,
      columns: [
        { field: 'code', header: 'コード', enabled: true, order: 0 },
        { field: 'removedField', header: '廃止列', enabled: true, order: 1 },
      ],
    })
    expect(table[1]).toEqual(['P001', ''])
  })

  it('反証: null/undefinedの値は空欄、数値の0はそのまま出力する（0を欠損扱いしない）', () => {
    const table = applyMappingProfile([{ a: null, b: undefined, c: 0 }], {
      includeHeader: false,
      columns: [
        { field: 'a', header: 'A', enabled: true, order: 0 },
        { field: 'b', header: 'B', enabled: true, order: 1 },
        { field: 'c', header: 'C', enabled: true, order: 2 },
      ],
    })
    expect(table[0]).toEqual(['', '', 0])
  })
})

describe('buildMappedCsv', () => {
  it('RFC 4180準拠でエスケープされ、BOMは含まない（ダウンロード時に1回だけ付与する契約）', () => {
    const csv = buildMappedCsv(ROWS, {
      includeHeader: true,
      columns: buildDefaultColumns(FIELDS),
    })
    expect(csv.charCodeAt(0)).not.toBe(0xfeff)
    expect(csv).toContain('"カンマ,入り"')
    expect(csv.split('\r\n')[0]).toBe('コード,名称,金額')
  })
})

describe('buildBillingRows', () => {
  it('検収予定日昇順で、案件情報・ステータスの日本語ラベルを結合する', () => {
    const project = makeProject({ clientName: '株式会社発注元' })
    const rows = buildBillingRows(
      [project],
      [
        makeMilestone(project.id, {
          label: '検収時',
          plannedAcceptanceDate: '2026-03-31',
          status: 'paid',
        }),
        makeMilestone(project.id, {
          label: '中間金',
          plannedAcceptanceDate: '2025-12-31',
          status: 'invoiced',
        }),
      ],
    )
    expect(rows.map((r) => r.label)).toEqual(['中間金', '検収時'])
    expect(rows[0]).toMatchObject({
      projectCode: 'P001',
      clientName: '株式会社発注元',
      status: '請求済',
    })
    expect(rows[1]?.status).toBe('入金済')
  })

  it('projectId指定で該当案件のみに絞り込む（商流ダイアログからの特化用）', () => {
    const a = makeProject({ code: 'P001' })
    const b = makeProject({ code: 'P002' })
    const rows = buildBillingRows(
      [a, b],
      [makeMilestone(a.id), makeMilestone(b.id)],
      b.id,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.projectCode).toBe('P002')
  })

  it('反証: 案件が削除済み（参照切れ）のマイルストンは出力しない', () => {
    const project = makeProject()
    const rows = buildBillingRows(
      [project],
      [makeMilestone(project.id), makeMilestone(crypto.randomUUID())],
    )
    expect(rows).toHaveLength(1)
  })

  it('反証: 発注元・備考が未設定でも空文字で出力される（nullが文字列"null"にならない）', () => {
    const project = makeProject({ clientName: null })
    const rows = buildBillingRows([project], [makeMilestone(project.id)])
    expect(rows[0]?.clientName).toBe('')
    expect(rows[0]?.note).toBe('')
  })

  it('フィールドカタログのkeyと行データのキーが一致している（カタログの整合性）', () => {
    const project = makeProject()
    const rows = buildBillingRows([project], [makeMilestone(project.id)])
    for (const field of BILLING_SOURCE.fields) {
      expect(rows[0]).toHaveProperty(field.key)
    }
  })
})
