import { describe, expect, it } from 'vitest'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Company } from '@/shared/types/company'
import type { Member } from '@/shared/types/member'
import type { Project } from '@/shared/types/project'
import {
  buildClientStatementCsvRows,
  buildClientStatementLines,
  buildClientStatementRecords,
  buildPartnerPaymentCsvRows,
  buildPartnerPaymentLines,
  buildPartnerPaymentRecords,
  CLIENT_STATEMENT_SOURCE,
  PARTNER_PAYMENT_SOURCE,
  sumStatementAmount,
  sumStatementRatio,
} from '@/shared/utils/statement-utils'

const PARTNER_COMPANY_ID = crypto.randomUUID()
const INTERNAL_COMPANY_ID = crypto.randomUUID()
const BP_MEMBER_ID = crypto.randomUUID()
const PROPER_MEMBER_ID = crypto.randomUUID()
const PROJECT_A = crypto.randomUUID()
const PROJECT_B = crypto.randomUUID()
const NOW = '2025-04-01T00:00:00.000Z'

const companies: Company[] = [
  {
    id: PARTNER_COMPANY_ID,
    name: 'パートナーズ株式会社',
    sortOrder: 0,
    isInternal: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: INTERNAL_COMPANY_ID,
    name: '自社',
    sortOrder: 1,
    isInternal: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
]

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: BP_MEMBER_ID,
    name: 'BP太郎',
    sectionId: null,
    companyId: PARTNER_COMPANY_ID,
    role: 'PG',
    isActive: true,
    techTagIds: [],
    startDate: null,
    endDate: null,
    // 見積単価100万円・契約単価80万円（自社マージン20万円）
    unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
    contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 80 }],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

const projects: Project[] = [
  {
    id: PROJECT_A,
    code: 'P001',
    name: '基幹刷新',
    parentId: null,
    level: 0,
    status: 'active',
    confidence: null,
    completed: false,
    clientName: '株式会社発注元',
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: PROJECT_B,
    code: 'P002',
    name: '保守運用',
    parentId: null,
    level: 0,
    status: 'active',
    confidence: null,
    completed: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
]

function makeAssignment(
  overrides: Partial<AssignmentEntry> = {},
): AssignmentEntry {
  return {
    id: crypto.randomUUID(),
    projectId: PROJECT_A,
    taskId: crypto.randomUUID(),
    memberId: BP_MEMBER_ID,
    monthlyValues: { '2025-04': 0.5 },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    month: '2025-04',
    members: [makeMember()],
    companies,
    projects,
    assignments: [makeAssignment()],
    useActual: false,
    ...overrides,
  }
}

describe('buildPartnerPaymentLines（協力会社向け支払）', () => {
  it('契約単価×配分で支払額を算出し、会社・人・PJコードを持つ行を返す', () => {
    const lines = buildPartnerPaymentLines(baseInput())
    expect(lines).toHaveLength(1)
    const line = lines[0]
    expect(line?.companyName).toBe('パートナーズ株式会社')
    expect(line?.memberName).toBe('BP太郎')
    expect(line?.projectCode).toBe('P001')
    expect(line?.ratio).toBe(0.5)
    // 契約単価80（見積単価100ではない）
    expect(line?.unitPrice).toBe(80)
    expect(line?.amount).toBe(40)
  })

  // 核心の反証: 支払に見積単価を使うと過大請求になる
  it('反証: 見積単価ではなく契約単価を使う（両者が異なるメンバーで検証）', () => {
    const lines = buildPartnerPaymentLines(baseInput())
    expect(lines[0]?.unitPrice).not.toBe(100)
  })

  // 反証: 内部リソース・所属未設定への「支払」は存在しない
  it('反証: 内部リソース会社所属・所属未設定のメンバーは対象外', () => {
    const internalMember = makeMember({
      id: PROPER_MEMBER_ID,
      name: '自社花子',
      companyId: INTERNAL_COMPANY_ID,
    })
    const unsetMember = makeMember({
      id: crypto.randomUUID(),
      name: '未設定次郎',
      companyId: null,
    })
    const lines = buildPartnerPaymentLines(
      baseInput({
        members: [makeMember(), internalMember, unsetMember],
        assignments: [
          makeAssignment(),
          makeAssignment({ memberId: internalMember.id }),
          makeAssignment({ memberId: unsetMember.id }),
        ],
      }),
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]?.memberName).toBe('BP太郎')
  })

  // 反証: 契約単価未入力なら見積単価へフォールバックせず0のまま出す（入力漏れの検知）
  it('反証: 契約単価履歴が無いメンバーは単価0のまま出力する（見積単価へフォールバックしない）', () => {
    const lines = buildPartnerPaymentLines(
      baseInput({
        members: [makeMember({ contractUnitPriceHistory: [] })],
      }),
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]?.unitPrice).toBe(0)
    expect(lines[0]?.amount).toBe(0)
  })

  it('複数タスクへのアサインは同一PJで1行に合算される', () => {
    const lines = buildPartnerPaymentLines(
      baseInput({
        assignments: [
          makeAssignment({ monthlyValues: { '2025-04': 0.3 } }),
          makeAssignment({ monthlyValues: { '2025-04': 0.2 } }),
        ],
      }),
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]?.ratio).toBe(0.5)
    expect(lines[0]?.amount).toBe(40)
  })

  it('複数PJへのアサインはPJごとに行が分かれる（PJコード昇順）', () => {
    const lines = buildPartnerPaymentLines(
      baseInput({
        assignments: [
          makeAssignment({ projectId: PROJECT_B }),
          makeAssignment({ projectId: PROJECT_A }),
        ],
      }),
    )
    expect(lines.map((l) => l.projectCode)).toEqual(['P001', 'P002'])
  })

  it('実績モードでは例外入力を優先し、未入力月は計画どおりになる', () => {
    const lines = buildPartnerPaymentLines(
      baseInput({
        useActual: true,
        assignments: [
          makeAssignment({
            monthlyValues: { '2025-04': 0.5 },
            actualMonthlyValues: { '2025-04': 0.8 },
          }),
          makeAssignment({
            projectId: PROJECT_B,
            monthlyValues: { '2025-04': 0.2 },
          }),
        ],
      }),
    )
    expect(lines.find((l) => l.projectCode === 'P001')?.ratio).toBe(0.8)
    // 例外入力の無いPJは計画どおり
    expect(lines.find((l) => l.projectCode === 'P002')?.ratio).toBe(0.2)
  })

  // 反証: 対象月に配分の無い行がノイズとして出ない
  it('反証: 対象月の配分が0のメンバーは出力しない', () => {
    const lines = buildPartnerPaymentLines(
      baseInput({
        month: '2025-05',
      }),
    )
    expect(lines).toHaveLength(0)
  })

  it('単価は対象月の履歴で解決する（月をまたぐ単価改定）', () => {
    const lines = buildPartnerPaymentLines(
      baseInput({
        month: '2025-06',
        members: [
          makeMember({
            contractUnitPriceHistory: [
              { effectiveFrom: '2025-04', amount: 80 },
              { effectiveFrom: '2025-06', amount: 90 },
            ],
          }),
        ],
        assignments: [makeAssignment({ monthlyValues: { '2025-06': 1.0 } })],
      }),
    )
    expect(lines[0]?.unitPrice).toBe(90)
  })
})

describe('buildClientStatementLines（発注元向け）', () => {
  it('見積単価を使い、案件→会社→人の順に並ぶ（発注元名を含む）', () => {
    const internalMember = makeMember({
      id: PROPER_MEMBER_ID,
      name: '自社花子',
      companyId: INTERNAL_COMPANY_ID,
      unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 120 }],
    })
    const lines = buildClientStatementLines(
      baseInput({
        members: [makeMember(), internalMember],
        assignments: [
          makeAssignment(),
          makeAssignment({ memberId: internalMember.id }),
        ],
      }),
    )
    // 発注元向けは内部リソースも含む（体制表）
    expect(lines).toHaveLength(2)
    // 見積単価ベース（BP太郎=100、自社花子=120）
    expect(lines.find((l) => l.memberName === 'BP太郎')?.unitPrice).toBe(100)
    expect(lines.find((l) => l.memberName === '自社花子')?.unitPrice).toBe(120)
    expect(lines[0]?.clientName).toBe('株式会社発注元')
  })

  it('所属会社未設定のメンバーは「（所属会社未設定）」として出力する', () => {
    const lines = buildClientStatementLines(
      baseInput({ members: [makeMember({ companyId: null })] }),
    )
    expect(lines[0]?.companyName).toBe('（所属会社未設定）')
  })
})

describe('CSV行の構築', () => {
  it('協力会社向けCSVはヘッダー＋明細＋合計行を持つ', () => {
    const lines = buildPartnerPaymentLines(baseInput())
    const rows = buildPartnerPaymentCsvRows(lines, '2025-04')
    expect(rows).toHaveLength(3)
    expect(rows[0]?.[0]).toBe('対象月')
    expect(rows[1]).toEqual([
      '2025-04',
      'パートナーズ株式会社',
      'BP太郎',
      'PG',
      'P001',
      '基幹刷新',
      0.5,
      80,
      40,
    ])
    const totalRow = rows[2]
    expect(totalRow?.[1]).toBe('(合計)')
    expect(totalRow?.[8]).toBe(40)
  })

  it('発注元向けCSVは発注元列を含む', () => {
    const lines = buildClientStatementLines(baseInput())
    const rows = buildClientStatementCsvRows(lines, '2025-04')
    expect(rows[1]?.[3]).toBe('株式会社発注元')
  })

  it('sumStatementAmount/Ratioは浮動小数点の丸め誤差を吸収する', () => {
    const lines = buildPartnerPaymentLines(
      baseInput({
        assignments: [
          makeAssignment({ monthlyValues: { '2025-04': 0.1 } }),
          makeAssignment({
            projectId: PROJECT_B,
            monthlyValues: { '2025-04': 0.2 },
          }),
        ],
      }),
    )
    expect(sumStatementRatio(lines)).toBe(0.3)
    expect(sumStatementAmount(lines)).toBe(24)
  })
})

describe('CSVマッピング用レコードビルダー（Phase C）', () => {
  const line = {
    companyId: null,
    companyName: '協力会社A',
    memberId: 'm1',
    memberName: '山田',
    memberRole: 'SE',
    projectId: 'p1',
    projectCode: 'P001',
    projectName: '案件A',
    clientName: null,
    ratio: 0.5,
    unitPrice: 80,
    amount: 40,
  }

  it('反証: レコード出力は合計行を含まない（外部システム取込で合計行が混入エラーになるため）', () => {
    expect(buildPartnerPaymentRecords([line], '2026-01')).toHaveLength(1)
    expect(buildClientStatementRecords([line], '2026-01')).toHaveLength(1)
  })

  it('フィールドカタログのkeyと行データのキーが一致している（両ソース）', () => {
    const partner = buildPartnerPaymentRecords([line], '2026-01')[0]
    for (const field of PARTNER_PAYMENT_SOURCE.fields) {
      expect(partner).toHaveProperty(field.key)
    }
    const client = buildClientStatementRecords([line], '2026-01')[0]
    for (const field of CLIENT_STATEMENT_SOURCE.fields) {
      expect(client).toHaveProperty(field.key)
    }
  })

  it('反証: 発注元未設定はnullではなく空文字で出力される', () => {
    const client = buildClientStatementRecords([line], '2026-01')[0]
    expect(client?.clientName).toBe('')
    expect(client?.month).toBe('2026-01')
  })
})

describe('準委任精算（非公開の設計文書）', () => {
  // 基準額80万円・精算幅140h〜180h（既定換算: 20人日×8h=160h/人月）
  const settlementMember = () =>
    makeMember({
      contractUnitPriceHistory: [
        {
          effectiveFrom: '2025-04',
          amount: 80,
          settlementLowerHours: 140,
          settlementUpperHours: 180,
        },
      ],
    })

  it('実績モード×下回り: 案件横断の合計実績で判定し、行へ実績比で按分される（Σ=精算額）', () => {
    const lines = buildPartnerPaymentLines(
      baseInput({
        useActual: true,
        members: [settlementMember()],
        assignments: [
          // 合計0.5人月=80h < 140h → 控除: 80/140×80h = 45.71万円
          makeAssignment({
            monthlyValues: {},
            actualMonthlyValues: { '2025-04': 0.3 },
          }),
          makeAssignment({
            projectId: PROJECT_B,
            monthlyValues: {},
            actualMonthlyValues: { '2025-04': 0.2 },
          }),
        ],
      }),
    )
    expect(lines).toHaveLength(2)
    for (const line of lines) {
      expect(line.settlementKind).toBe('deduction')
      expect(line.settlementActualHours).toBe(80)
      expect(line.settlementBaseAmount).toBe(80)
    }
    // 反証: 按分の丸め差は最終行で調整され、合計は必ず精算額と一致する
    const total = lines.reduce((sum, l) => sum + l.amount, 0)
    expect(Math.round(total * 100) / 100).toBe(45.71)
  })

  it('実績モード×幅内: 実績1.0人月=160hは固定額80万円のまま', () => {
    const lines = buildPartnerPaymentLines(
      baseInput({
        useActual: true,
        members: [settlementMember()],
        assignments: [
          makeAssignment({
            monthlyValues: {},
            actualMonthlyValues: { '2025-04': 1.0 },
          }),
        ],
      }),
    )
    expect(lines[0]?.settlementKind).toBe('within')
    expect(lines[0]?.amount).toBe(80)
  })

  it('実績モード×超過: 1.25人月=200hは 80+80/180×20h=88.89万円', () => {
    const lines = buildPartnerPaymentLines(
      baseInput({
        useActual: true,
        members: [settlementMember()],
        assignments: [
          makeAssignment({
            monthlyValues: {},
            actualMonthlyValues: { '2025-04': 1.25 },
          }),
        ],
      }),
    )
    expect(lines[0]?.settlementKind).toBe('overage')
    expect(lines[0]?.amount).toBe(88.89)
  })

  it('反証: 計画モード（useActual=false）では精算せず従来どおり 単価×計画配分', () => {
    const lines = buildPartnerPaymentLines(
      baseInput({
        useActual: false,
        members: [settlementMember()],
        assignments: [makeAssignment({ monthlyValues: { '2025-04': 0.5 } })],
      }),
    )
    expect(lines[0]?.settlementKind).toBeUndefined()
    expect(lines[0]?.amount).toBe(40)
  })

  it('反証: 精算幅を持たないメンバーは実績モードでも従来どおり（適用されない）', () => {
    const lines = buildPartnerPaymentLines(
      baseInput({
        useActual: true,
        assignments: [
          makeAssignment({
            monthlyValues: {},
            actualMonthlyValues: { '2025-04': 0.5 },
          }),
        ],
      }),
    )
    expect(lines[0]?.settlementKind).toBeUndefined()
    expect(lines[0]?.amount).toBe(40)
  })

  it('反証: 発注元向け明細（見積単価側）には精算を適用しない', () => {
    const lines = buildClientStatementLines(
      baseInput({
        useActual: true,
        members: [settlementMember()],
        assignments: [
          makeAssignment({
            monthlyValues: {},
            actualMonthlyValues: { '2025-04': 0.5 },
          }),
        ],
      }),
    )
    // 見積単価100万円×0.5のまま（支払側の精算は請求側に波及しない）
    expect(lines[0]?.settlementKind).toBeUndefined()
    expect(lines[0]?.amount).toBe(50)
  })

  it('換算設定（workdaysPerMonth/hoursPerDay）が判定に反映される', () => {
    // 21人日×8h=168h/人月 → 1.0人月は幅内（160h換算と同じ結論だが時間が変わる）
    const lines = buildPartnerPaymentLines(
      baseInput({
        useActual: true,
        workdaysPerMonth: 21,
        hoursPerDay: 8,
        members: [settlementMember()],
        assignments: [
          makeAssignment({
            monthlyValues: {},
            actualMonthlyValues: { '2025-04': 1.0 },
          }),
        ],
      }),
    )
    expect(lines[0]?.settlementActualHours).toBe(168)
    expect(lines[0]?.settlementKind).toBe('within')
  })
})

describe('取引先属性（支払サイト・インボイス登録番号）', () => {
  it('会社に支払サイトがあれば支払期日を算出し、登録番号とともに支払行へ付与する', () => {
    const companiesWithTerms = companies.map((c) =>
      c.isInternal
        ? c
        : {
            ...c,
            invoiceRegistrationNumber: 'T1234567890123',
            paymentTerms: {
              closingDay: 31,
              paymentMonthOffset: 1,
              paymentDay: 31,
            },
          },
    )
    const lines = buildPartnerPaymentLines(
      baseInput({ companies: companiesWithTerms }),
    )
    expect(lines[0]?.paymentDueDate).toBe('2025-05-31')
    expect(lines[0]?.invoiceRegistrationNumber).toBe('T1234567890123')
  })

  it('反証: 支払サイト未設定の会社は支払期日null（勝手な既定値で期日を作らない）', () => {
    const lines = buildPartnerPaymentLines(baseInput())
    expect(lines[0]?.paymentDueDate).toBeNull()
    expect(lines[0]?.invoiceRegistrationNumber).toBeNull()
  })

  it('反証: 発注元向け明細（client）には支払属性を付与しない（支払側専用の概念）', () => {
    const lines = buildClientStatementLines(baseInput())
    expect(lines[0]?.paymentDueDate).toBeUndefined()
  })
})
