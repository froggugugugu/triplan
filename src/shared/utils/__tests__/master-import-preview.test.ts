import { describe, expect, it } from 'vitest'
import type { Company } from '@/shared/types/company'
import type { Division } from '@/shared/types/division'
import type { Member } from '@/shared/types/member'
import type { Project } from '@/shared/types/project'
import type { Section } from '@/shared/types/section'
import { parseCsv } from '../csv-utils'
import { buildAssignmentImportPlan } from '../master-import-assignments'
import { buildMemberImportPlan } from '../master-import-members'
import {
  buildAssignmentPreview,
  buildMemberPreview,
  buildProjectPreview,
} from '../master-import-preview'
import { buildProjectImportPlan } from '../master-import-projects'

/**
 * 「実際に登録される内容」のプレビュー。
 * 件数とスキップ理由だけでは**列を取り違えたまま通る**ケースに気づけないため、
 * 解釈後の値が読める形で出ることを固定する。
 */

const NOW = '2026-04-01T00:00:00.000Z'

const DIV: Division = {
  id: '00000000-0000-4000-8000-0000000000d1',
  name: '開発部',
  sortOrder: 0,
  createdAt: NOW,
  updatedAt: NOW,
}
const SECTION: Section = {
  id: '00000000-0000-4000-8000-0000000000c1',
  divisionId: DIV.id,
  name: '第1課',
  sortOrder: 0,
  createdAt: NOW,
  updatedAt: NOW,
}
const COMPANY: Company = {
  id: '00000000-0000-4000-8000-0000000000f1',
  name: '株式会社ABC',
  sortOrder: 0,
  isInternal: false,
  createdAt: NOW,
  updatedAt: NOW,
}

const MASTERS = {
  divisions: [DIV],
  sections: [SECTION],
  companies: [COMPANY],
}

function memberPreview(csv: string, autoCreateMasters = true) {
  const plan = buildMemberImportPlan(parseCsv(csv), {
    members: [],
    ...MASTERS,
    autoCreateMasters,
    fallbackEffectiveFrom: '2026-04',
  })
  return { plan, table: buildMemberPreview(plan, MASTERS) }
}

/** 列名から値を引く（列の並びを変えても壊れないように） */
function cell(
  table: { columns: string[]; rows: string[][] },
  rowIndex: number,
  column: string,
): string {
  const i = table.columns.indexOf(column)
  if (i < 0) throw new Error(`column not found: ${column}`)
  return table.rows[rowIndex]?.[i] ?? ''
}

describe('buildMemberPreview', () => {
  it('解釈後の値を人が読める形で並べる', () => {
    const { table } = memberPreview(
      [
        '氏名,メール,部門,課,所属会社,役割,契約形態,稼働率上限,開始日,終了日,単価,契約単価',
        '山田太郎,yamada@example.com,開発部,第1課,株式会社ABC,PL,準委任,0.5,2026-04-01,2027-03-31,100,80',
      ].join('\n'),
    )

    expect(table.rows).toHaveLength(1)
    expect(cell(table, 0, '行')).toBe('2')
    expect(cell(table, 0, '氏名')).toBe('山田太郎')
    // 既存の課はidではなく「部門 / 課」の名前で出る
    expect(cell(table, 0, '所属')).toBe('開発部 / 第1課')
    expect(cell(table, 0, '所属会社')).toBe('株式会社ABC')
    expect(cell(table, 0, '契約形態')).toBe('準委任')
    expect(cell(table, 0, '稼働率上限')).toBe('0.50')
    expect(cell(table, 0, '在籍期間')).toBe('2026-04-01 〜 2027-03-31')
    // 単価は適用開始月つき（いつから効くかが取込前に分かる）
    expect(cell(table, 0, '単価')).toBe('100万円（2026-04〜）')
    expect(cell(table, 0, '契約単価')).toBe('80万円（2026-04〜）')
  })

  it('新しく作られるマスタには（新規）が付く', () => {
    const { table } = memberPreview(
      ['氏名,部門,課,所属会社', '山田,新規部,新規課,新規会社'].join('\n'),
    )
    expect(cell(table, 0, '所属')).toBe('新規部 / 新規課（新規）')
    expect(cell(table, 0, '所属会社')).toBe('新規会社（新規）')
  })

  it('部門は既存・課だけ新規のときも（新規）が分かる', () => {
    const { table } = memberPreview(
      ['氏名,部門,課', '山田,開発部,新規課'].join('\n'),
    )
    expect(cell(table, 0, '所属')).toBe('開発部 / 新規課（新規）')
  })

  it('部門だけ指定した場合は課を出さない', () => {
    const { table } = memberPreview(['氏名,部門', '山田,開発部'].join('\n'))
    expect(cell(table, 0, '所属')).toBe('開発部')
  })

  it('未設定の項目は—で埋める（空欄と取り違えない）', () => {
    const { table } = memberPreview(['氏名', '山田'].join('\n'))
    expect(cell(table, 0, 'メール')).toBe('—')
    expect(cell(table, 0, '所属')).toBe('—')
    expect(cell(table, 0, '単価')).toBe('—')
    // 稼働率上限は未設定＝1.0として扱われるので、その旨が出る
    expect(cell(table, 0, '稼働率上限')).toBe('1.0')
  })

  it('在籍中（終了日なし）が分かる', () => {
    const { table } = memberPreview(
      ['氏名,開始日', '山田,2026-04-01'].join('\n'),
    )
    expect(cell(table, 0, '在籍期間')).toBe('2026-04-01 〜 （在籍中）')
  })

  it('反証: 取り込まない行はプレビューに出ない（登録されるものだけを見せる）', () => {
    const { table } = memberPreview(
      ['氏名,メール', '正常,ok@example.com', '不正,bad-email'].join('\n'),
    )
    expect(table.rows).toHaveLength(1)
    expect(cell(table, 0, '氏名')).toBe('正常')
  })

  it('反証: 自動作成しない設定で落ちた行もプレビューに出ない', () => {
    const { table } = memberPreview(
      ['氏名,部門', '山田,新規部'].join('\n'),
      false,
    )
    expect(table.rows).toEqual([])
  })
})

describe('buildProjectPreview', () => {
  function preview(csv: string, projects: Project[] = []) {
    const plan = buildProjectImportPlan(parseCsv(csv), {
      projects,
      divisions: [DIV],
      autoCreateMasters: true,
    })
    return buildProjectPreview(plan, { divisions: [DIV] })
  }

  it('階層が見て分かる形で、親→子の順に並ぶ', () => {
    const table = preview(
      [
        'コード,名前,親コード',
        'P100-01-01,画面設計,P100-01',
        'P100-01,基本設計,P100',
        'P100,新規案件,',
      ].join('\n'),
    )

    expect(table.rows.map((r) => r[table.columns.indexOf('コード')])).toEqual([
      'P100',
      'P100-01',
      'P100-01-01',
    ])
    expect(cell(table, 0, '階層')).toBe('プロジェクト')
    expect(cell(table, 1, '階層')).toContain('L1')
    expect(cell(table, 2, '階層')).toContain('L2')
    // 深い階層ほどインデントが深い
    expect(cell(table, 2, '階層').length).toBeGreaterThan(
      cell(table, 1, '階層').length,
    )
  })

  it('ステータスを日本語で出す', () => {
    const table = preview(
      ['コード,名前,ステータス', 'P1,案件,進行中'].join('\n'),
    )
    expect(cell(table, 0, 'ステータス')).toBe('進行中')
  })

  it('担当部門は既存なら名前、新規なら（新規）', () => {
    const table = preview(
      [
        'コード,名前,担当部門',
        'P1,既存部門の案件,開発部',
        'P2,新部門の案件,新規部',
      ].join('\n'),
    )
    expect(cell(table, 0, '担当部門')).toBe('開発部')
    expect(cell(table, 1, '担当部門')).toBe('新規部（新規）')
  })

  it('金額は単位つきで出す', () => {
    const table = preview(['コード,名前,受注金額', 'P1,案件,3000'].join('\n'))
    expect(cell(table, 0, '受注金額')).toBe('3000万円')
  })

  it('反証: 取り込まない行はプレビューに出ない', () => {
    const table = preview(
      ['コード,名前,親コード', 'P1,正常,', 'P2,親なし,P999'].join('\n'),
    )
    expect(table.rows).toHaveLength(1)
    expect(cell(table, 0, 'コード')).toBe('P1')
  })
})

describe('buildAssignmentPreview', () => {
  const root: Project = {
    id: '00000000-0000-4000-8000-0000000000a0',
    code: 'P001',
    name: '案件',
    parentId: null,
    level: 0,
    status: 'not_started',
    confidence: null,
    completed: false,
    createdAt: NOW,
    updatedAt: NOW,
  }
  const task: Project = {
    ...root,
    id: '00000000-0000-4000-8000-0000000000a1',
    code: 'P001-01',
    name: '要件定義',
    parentId: root.id,
    level: 1,
  }
  const member: Member = {
    id: '00000000-0000-4000-8000-0000000000b1',
    name: '山田太郎',
    email: null,
    sectionId: null,
    role: '',
    isActive: true,
    startDate: null,
    endDate: null,
    unitPriceHistory: [],
    createdAt: NOW,
    updatedAt: NOW,
  }

  function preview(csv: string, closedMonths?: Set<string>) {
    const plan = buildAssignmentImportPlan(parseCsv(csv), {
      projects: [root, task],
      members: [member],
      assignments: [],
      closedMonths,
    })
    return buildAssignmentPreview(plan)
  }

  it('月を列に、配分と合計を並べる', () => {
    const table = preview(
      [
        'タスクコード,担当者,2026-04,2026-05,2026-06',
        'P001-01,山田太郎,0.5,0.5,0.3',
      ].join('\n'),
    )

    expect(table.columns).toEqual([
      '行',
      'プロジェクト',
      'タスク',
      '担当者',
      '合計',
      '2026-04',
      '2026-05',
      '2026-06',
    ])
    expect(cell(table, 0, 'プロジェクト')).toBe('P001')
    expect(cell(table, 0, 'タスク')).toBe('P001-01 要件定義')
    expect(cell(table, 0, '担当者')).toBe('山田太郎')
    expect(cell(table, 0, '合計')).toBe('1.30')
    expect(cell(table, 0, '2026-04')).toBe('0.50')
  })

  it('反証: 配分の無い月は空欄にする（0と書くと「入力した0」に見える）', () => {
    // 他の行が2026-04を使っているので列は出る。この行だけ空欄になることを見る
    const table = preview(
      [
        'タスクコード,担当者,2026-04,2026-05',
        'P001-01,山田太郎,,0.5',
        'P001,山田太郎,0.2,',
      ].join('\n'),
    )
    expect(table.columns).toContain('2026-04')
    expect(cell(table, 0, '2026-04')).toBe('')
    expect(cell(table, 0, '2026-05')).toBe('0.50')
    expect(cell(table, 1, '2026-04')).toBe('0.20')
    expect(cell(table, 1, '2026-05')).toBe('')
  })

  it('反証: どの行も使っていない月は列に出ない（取り込む月だけを見せる）', () => {
    const table = preview(
      ['タスクコード,担当者,2026-04,2026-05', 'P001-01,山田太郎,,0.5'].join(
        '\n',
      ),
    )
    expect(table.columns).not.toContain('2026-04')
    expect(table.columns).toContain('2026-05')
  })

  it('反証: 締め済みで落とした月は列にも出ない（取り込む月だけを見せる）', () => {
    const table = preview(
      ['タスクコード,担当者,2026-04,2026-05', 'P001-01,山田太郎,0.5,0.5'].join(
        '\n',
      ),
      new Set(['2026-04']),
    )
    expect(table.columns).not.toContain('2026-04')
    expect(table.columns).toContain('2026-05')
  })

  it('反証: 取り込まない行はプレビューに出ない', () => {
    const table = preview(
      [
        'タスクコード,担当者,2026-04',
        'P001-01,山田太郎,0.5',
        'P999,山田太郎,0.5',
      ].join('\n'),
    )
    expect(table.rows).toHaveLength(1)
  })
})
