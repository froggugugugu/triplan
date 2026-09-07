import { describe, expect, it } from 'vitest'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type {
  AiUsageEntry,
  BudgetBreakdown,
  DivisionBudget,
  SaasContract,
} from '@/shared/types/budget'
import type { Company } from '@/shared/types/company'
import type { Member } from '@/shared/types/member'
import { getFiscalYearMonthKeys } from '@/shared/utils/budget-utils'
import {
  buildProjectCostBreakdownMap,
  calcDivisionOverheadPool,
} from '@/shared/utils/cost-breakdown-utils'
import { calcProjectProfitability } from '@/shared/utils/profitability-utils'

const NOW = new Date().toISOString()
const FISCAL_YEAR = 2025
const MONTH_KEYS = getFiscalYearMonthKeys(FISCAL_YEAR)
// 年度全月が経過済みになる基準日（月内日数按分の影響を受けず配分×単価で検算できる）
const REFERENCE_DATE = new Date(2026, 4, 15)

const DIVISION_A = '00000000-0000-4000-8000-0000000000d1'
const DIVISION_B = '00000000-0000-4000-8000-0000000000d2'
const COMPANY_PARTNER = '00000000-0000-4000-8000-0000000000c1'
const MEMBER_INTERNAL = '00000000-0000-4000-8000-00000000ae01'
const MEMBER_EXTERNAL = '00000000-0000-4000-8000-00000000ae02'
const PROJECT_1 = '00000000-0000-4000-8000-00000000ffa1'
const PROJECT_2 = '00000000-0000-4000-8000-00000000ffa2'
const PROJECT_NO_DIV = '00000000-0000-4000-8000-00000000ffa3'

const companies: Company[] = [
  {
    id: COMPANY_PARTNER,
    name: '協力会社A',
    sortOrder: 0,
    isInternal: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
]

function makeMember(id: string, overrides: Partial<Member> = {}): Member {
  return {
    id,
    name: `member-${id.slice(-2)}`,
    sectionId: null,
    role: 'エンジニア',
    isActive: true,
    startDate: null,
    endDate: null,
    unitPriceHistory: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

// 内部リソース（companyId未設定）: 通常単価100万円/月
const internalMember = makeMember(MEMBER_INTERNAL, {
  unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
})
// 外部リソース（協力会社所属）: 契約単価80万円/月
const externalMember = makeMember(MEMBER_EXTERNAL, {
  companyId: COMPANY_PARTNER,
  contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 80 }],
})
const members = [internalMember, externalMember]

function makeAssignment(
  projectId: string,
  memberId: string,
  monthlyValues: Record<string, number>,
  actualMonthlyValues?: Record<string, number>,
): AssignmentEntry {
  return {
    id: crypto.randomUUID(),
    projectId,
    taskId: crypto.randomUUID(),
    memberId,
    monthlyValues,
    ...(actualMonthlyValues ? { actualMonthlyValues } : {}),
    createdAt: NOW,
    updatedAt: NOW,
  }
}

describe('buildProjectCostBreakdownMap', () => {
  it('労務費=内部リソース、外注費=外部リソースのアサイン実コストに分かれる', () => {
    const assignments = [
      makeAssignment(PROJECT_1, MEMBER_INTERNAL, { '2025-04': 0.5 }),
      makeAssignment(PROJECT_1, MEMBER_EXTERNAL, { '2025-04': 0.5 }),
    ]
    const result = buildProjectCostBreakdownMap({
      topLevelProjects: [{ id: PROJECT_1, divisionId: DIVISION_A }],
      assignments,
      members,
      companies,
      budgetBreakdowns: [],
      monthKeys: MONTH_KEYS,
      overheadPoolByDivision: new Map(),
      referenceDate: REFERENCE_DATE,
    })
    const breakdown = result.get(PROJECT_1)
    expect(breakdown?.laborCost).toBe(50) // 0.5×100万円
    expect(breakdown?.subcontractCost).toBe(40) // 0.5×80万円（契約単価）
  })

  it('反証: 労務費＋外注費は既存の実人件費と丸めに関わらず一致する（恒等式）', () => {
    // 0.335×100=33.5 / 0.335×80=26.8。独立に丸めると34+27=61だが、
    // 既存の実人件費はround(33.5+26.8)=60。外注費の引き算導出で恒等式を保証する
    const assignments = [
      makeAssignment(PROJECT_1, MEMBER_INTERNAL, { '2025-04': 0.335 }),
      makeAssignment(PROJECT_1, MEMBER_EXTERNAL, { '2025-04': 0.335 }),
    ]
    const result = buildProjectCostBreakdownMap({
      topLevelProjects: [{ id: PROJECT_1, divisionId: DIVISION_A }],
      assignments,
      members,
      companies,
      budgetBreakdowns: [],
      monthKeys: MONTH_KEYS,
      overheadPoolByDivision: new Map(),
      referenceDate: REFERENCE_DATE,
    })
    const breakdown = result.get(PROJECT_1)
    const profitability = calcProjectProfitability(
      { id: PROJECT_1, contractAmount: 200 },
      assignments,
      members,
      [],
      REFERENCE_DATE,
    )
    expect(
      (breakdown?.laborCost ?? 0) + (breakdown?.subcontractCost ?? 0),
    ).toBe(profitability.actualPersonnelCost)
    expect(breakdown?.laborCost).toBe(34)
    expect(breakdown?.subcontractCost).toBe(60 - 34) // 26（独立丸めの27ではない）
  })

  it('反証: 削除済みメンバーのアサインは労務費・外注費・配賦基準のどれにも入らない', () => {
    const assignments = [
      makeAssignment(PROJECT_1, MEMBER_INTERNAL, { '2025-04': 0.5 }),
      makeAssignment(PROJECT_1, '00000000-0000-4000-8000-00000000dead', {
        '2025-04': 1.0,
      }),
      makeAssignment(PROJECT_2, MEMBER_EXTERNAL, { '2025-04': 0.5 }),
    ]
    const result = buildProjectCostBreakdownMap({
      topLevelProjects: [
        { id: PROJECT_1, divisionId: DIVISION_A },
        { id: PROJECT_2, divisionId: DIVISION_A },
      ],
      assignments,
      members,
      companies,
      budgetBreakdowns: [],
      monthKeys: MONTH_KEYS,
      overheadPoolByDivision: new Map([[DIVISION_A, 100]]),
      referenceDate: REFERENCE_DATE,
    })
    const p1 = result.get(PROJECT_1)
    expect(p1?.laborCost).toBe(50)
    expect(p1?.subcontractCost).toBe(0)
    // 配賦基準はP1=0.5・P2=0.5（deadメンバーの1.0が入ればP1=75になるはず）
    expect(p1?.allocatedOverhead).toBe(50)
    expect(result.get(PROJECT_2)?.allocatedOverhead).toBe(50)
  })

  it('直接経費は案件紐づき実績明細の合計（他案件・案件なしの明細は含めない）', () => {
    const breakdowns = [
      {
        id: crypto.randomUUID(),
        budgetId: crypto.randomUUID(),
        category: 'project_expense',
        label: '検証端末',
        amount: 100,
        recordedAt: '2025-05-01',
        createdAt: NOW,
        projectId: PROJECT_1,
        actualRecords: [
          {
            id: crypto.randomUUID(),
            purchasedAt: '2025-05-10',
            itemLabel: '検証用スマホ',
            amount: 12,
          },
          {
            id: crypto.randomUUID(),
            purchasedAt: '2025-06-01',
            itemLabel: 'クラウド利用料',
            amount: 8,
          },
        ],
      },
      {
        id: crypto.randomUUID(),
        budgetId: crypto.randomUUID(),
        category: 'general_expense',
        label: '書籍',
        amount: 50,
        recordedAt: '2025-05-01',
        createdAt: NOW,
        projectId: null,
        actualRecords: [
          {
            id: crypto.randomUUID(),
            purchasedAt: '2025-05-10',
            itemLabel: '書籍',
            amount: 999,
          },
        ],
      },
    ] as BudgetBreakdown[]
    const result = buildProjectCostBreakdownMap({
      topLevelProjects: [{ id: PROJECT_1, divisionId: DIVISION_A }],
      assignments: [],
      members,
      companies,
      budgetBreakdowns: breakdowns,
      monthKeys: MONTH_KEYS,
      overheadPoolByDivision: new Map(),
      referenceDate: REFERENCE_DATE,
    })
    expect(result.get(PROJECT_1)?.directExpense).toBe(20)
  })

  it('間接費は部門内案件へ直接工数比例で配賦される（実績優先の基準）', () => {
    const assignments = [
      // P1: 計画0.5だが実績2.0の明示入力 → 基準は2.0
      makeAssignment(
        PROJECT_1,
        MEMBER_INTERNAL,
        { '2025-04': 0.5 },
        { '2025-04': 2.0 },
      ),
      // P2: 計画のまま6.0（複数月合算）
      makeAssignment(PROJECT_2, MEMBER_EXTERNAL, {
        '2025-04': 1.0,
        '2025-05': 1.0,
        '2025-06': 1.0,
        '2025-07': 1.0,
        '2025-08': 1.0,
        '2025-09': 1.0,
      }),
    ]
    const result = buildProjectCostBreakdownMap({
      topLevelProjects: [
        { id: PROJECT_1, divisionId: DIVISION_A },
        { id: PROJECT_2, divisionId: DIVISION_A },
      ],
      assignments,
      members,
      companies,
      budgetBreakdowns: [],
      monthKeys: MONTH_KEYS,
      overheadPoolByDivision: new Map([[DIVISION_A, 100]]),
      referenceDate: REFERENCE_DATE,
    })
    // 基準: P1=2.0 / P2=6.0 → 25%・75%
    expect(result.get(PROJECT_1)?.allocatedOverhead).toBe(25)
    expect(result.get(PROJECT_2)?.allocatedOverhead).toBe(75)
  })

  it('反証: divisionId未設定の案件は間接費配賦の対象外（配賦基準の分母にも入らない）', () => {
    const assignments = [
      makeAssignment(PROJECT_1, MEMBER_INTERNAL, { '2025-04': 1.0 }),
      makeAssignment(PROJECT_NO_DIV, MEMBER_EXTERNAL, { '2025-04': 1.0 }),
    ]
    const result = buildProjectCostBreakdownMap({
      topLevelProjects: [
        { id: PROJECT_1, divisionId: DIVISION_A },
        { id: PROJECT_NO_DIV, divisionId: null },
      ],
      assignments,
      members,
      companies,
      budgetBreakdowns: [],
      monthKeys: MONTH_KEYS,
      overheadPoolByDivision: new Map([[DIVISION_A, 80]]),
      referenceDate: REFERENCE_DATE,
    })
    expect(result.get(PROJECT_NO_DIV)?.allocatedOverhead).toBe(0)
    // divisionId未設定案件が分母に入らないため、P1が原資全額を受ける
    expect(result.get(PROJECT_1)?.allocatedOverhead).toBe(80)
  })

  it('反証: 部門内の配賦基準合計が0なら配賦しない（ゼロ除算回避）', () => {
    const result = buildProjectCostBreakdownMap({
      topLevelProjects: [{ id: PROJECT_1, divisionId: DIVISION_A }],
      assignments: [],
      members,
      companies,
      budgetBreakdowns: [],
      monthKeys: MONTH_KEYS,
      overheadPoolByDivision: new Map([[DIVISION_A, 100]]),
      referenceDate: REFERENCE_DATE,
    })
    expect(result.get(PROJECT_1)?.allocatedOverhead).toBe(0)
  })

  it('反証: 年度外の月のアサインは配賦基準に入らない', () => {
    const assignments = [
      makeAssignment(PROJECT_1, MEMBER_INTERNAL, { '2025-04': 1.0 }),
      // P2は前年度の配分のみ → 基準0
      makeAssignment(PROJECT_2, MEMBER_EXTERNAL, { '2024-04': 1.0 }),
    ]
    const result = buildProjectCostBreakdownMap({
      topLevelProjects: [
        { id: PROJECT_1, divisionId: DIVISION_A },
        { id: PROJECT_2, divisionId: DIVISION_A },
      ],
      assignments,
      members,
      companies,
      budgetBreakdowns: [],
      monthKeys: MONTH_KEYS,
      overheadPoolByDivision: new Map([[DIVISION_A, 60]]),
      referenceDate: REFERENCE_DATE,
    })
    expect(result.get(PROJECT_1)?.allocatedOverhead).toBe(60)
    expect(result.get(PROJECT_2)?.allocatedOverhead).toBe(0)
  })
})

describe('calcDivisionOverheadPool', () => {
  const divisionBudgets: DivisionBudget[] = [
    {
      id: '00000000-0000-4000-8000-00000000bb01',
      divisionId: DIVISION_A,
      fiscalYear: FISCAL_YEAR,
      initialAmount: 0,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: '00000000-0000-4000-8000-00000000bb02',
      divisionId: DIVISION_B,
      fiscalYear: FISCAL_YEAR,
      initialAmount: 0,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]

  function makeSaasContract(
    divisionId: string,
    monthlyActuals: Record<string, number>,
  ): SaasContract {
    return {
      id: crypto.randomUUID(),
      name: 'SaaS-X',
      divisionId,
      contractType: 'monthly',
      amount: 0,
      paymentCycle: 'monthly',
      contractStartDate: '2025-04-01',
      nextRenewalDate: '2026-04-01',
      monthlyActuals,
      createdAt: NOW,
      updatedAt: NOW,
    } as SaasContract
  }

  it('一般経費実績＋SaaS実績（年度内月）＋AI利用費実績（為替換算）を合算する', () => {
    const breakdowns = [
      {
        id: crypto.randomUUID(),
        budgetId: '00000000-0000-4000-8000-00000000bb01',
        category: 'general_expense',
        label: '消耗品',
        amount: 100,
        recordedAt: '2025-04-01',
        createdAt: NOW,
        actualRecords: [
          {
            id: crypto.randomUUID(),
            purchasedAt: '2025-05-10',
            itemLabel: '消耗品',
            amount: 30,
          },
        ],
      },
    ] as BudgetBreakdown[]
    const saasContracts = [
      makeSaasContract(DIVISION_A, { '2025-04': 10, '2024-03': 999 }),
    ]
    const aiUsageEntries: AiUsageEntry[] = [
      {
        id: crypto.randomUUID(),
        divisionId: DIVISION_A,
        fiscalYear: FISCAL_YEAR,
        month: '2025-05',
        budgetAmount: 0,
        actualAmount: 100, // ＄100 × 150円 = 1.5万円
      },
      {
        id: crypto.randomUUID(),
        divisionId: DIVISION_A,
        fiscalYear: FISCAL_YEAR,
        month: '2025-06',
        budgetAmount: 0,
        actualAmount: null, // 未記録は除外
      },
    ]
    const pool = calcDivisionOverheadPool({
      divisionId: DIVISION_A,
      fiscalYear: FISCAL_YEAR,
      monthKeys: MONTH_KEYS,
      divisionBudgets,
      budgetBreakdowns: breakdowns,
      saasContracts,
      aiUsageEntries,
      exchangeRateHistory: [{ effectiveFrom: '2025-04', rate: 150 }],
    })
    expect(pool).toBe(30 + 10 + 1.5)
  })

  it('反証: 案件紐づきの実績明細（project_expense等）は間接費原資に入らない', () => {
    const breakdowns = [
      {
        id: crypto.randomUUID(),
        budgetId: '00000000-0000-4000-8000-00000000bb01',
        category: 'project_expense',
        label: '案件付帯',
        amount: 100,
        recordedAt: '2025-04-01',
        createdAt: NOW,
        projectId: PROJECT_1,
        actualRecords: [
          {
            id: crypto.randomUUID(),
            purchasedAt: '2025-05-10',
            itemLabel: '案件機材',
            amount: 40,
          },
        ],
      },
    ] as BudgetBreakdown[]
    const pool = calcDivisionOverheadPool({
      divisionId: DIVISION_A,
      fiscalYear: FISCAL_YEAR,
      monthKeys: MONTH_KEYS,
      divisionBudgets,
      budgetBreakdowns: breakdowns,
      saasContracts: [],
      aiUsageEntries: [],
      exchangeRateHistory: [],
    })
    expect(pool).toBe(0)
  })

  it('反証: 他部門・他年度の費用は原資に混入しない', () => {
    const breakdowns = [
      {
        id: crypto.randomUUID(),
        budgetId: '00000000-0000-4000-8000-00000000bb02', // DIVISION_Bの予算
        category: 'general_expense',
        label: '他部門経費',
        amount: 100,
        recordedAt: '2025-04-01',
        createdAt: NOW,
        actualRecords: [
          {
            id: crypto.randomUUID(),
            purchasedAt: '2025-05-10',
            itemLabel: '他部門分',
            amount: 500,
          },
        ],
      },
    ] as BudgetBreakdown[]
    const aiUsageEntries: AiUsageEntry[] = [
      {
        id: crypto.randomUUID(),
        divisionId: DIVISION_A,
        fiscalYear: FISCAL_YEAR - 1, // 他年度
        month: '2024-05',
        budgetAmount: 0,
        actualAmount: 1000,
      },
    ]
    const pool = calcDivisionOverheadPool({
      divisionId: DIVISION_A,
      fiscalYear: FISCAL_YEAR,
      monthKeys: MONTH_KEYS,
      divisionBudgets,
      budgetBreakdowns: breakdowns,
      saasContracts: [makeSaasContract(DIVISION_B, { '2025-04': 77 })],
      aiUsageEntries,
      exchangeRateHistory: [{ effectiveFrom: '2024-04', rate: 150 }],
    })
    expect(pool).toBe(0)
  })

  it('反証: 為替レート未設定のAI利用費は0円換算（誤って＄がそのまま万円扱いにならない）', () => {
    const pool = calcDivisionOverheadPool({
      divisionId: DIVISION_A,
      fiscalYear: FISCAL_YEAR,
      monthKeys: MONTH_KEYS,
      divisionBudgets,
      budgetBreakdowns: [],
      saasContracts: [],
      aiUsageEntries: [
        {
          id: crypto.randomUUID(),
          divisionId: DIVISION_A,
          fiscalYear: FISCAL_YEAR,
          month: '2025-05',
          budgetAmount: 0,
          actualAmount: 100,
        },
      ],
      exchangeRateHistory: [],
    })
    expect(pool).toBe(0)
  })
})
