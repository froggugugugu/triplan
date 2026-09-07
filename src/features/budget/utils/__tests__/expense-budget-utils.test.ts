import { describe, expect, it } from 'vitest'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type {
  AiUsageEntry,
  AiUsageMemberAllocation,
  BudgetBreakdown,
  SaasContract,
} from '@/shared/types/budget'
import type { Member } from '@/shared/types/member'
import {
  calcAiUsageMemberAllocationTotal,
  calcAssignedEffortMonths,
  calcBudgetBreakdownActualRecordsTotal,
  calcBudgetBreakdownAmountTotal,
  calcConsumptionRate,
  calcMonthlyTrendSeries,
  calcOtherExpenseActualTotal,
  calcProjectEstimateBudget,
  calcProjectEstimateBudgets,
  calcProjectProfitability,
  calcProjectRowsTotal,
  calcRemainingBudget,
  calcRemainingContractEffort,
  calcRemainingSaasBudget,
  calcSaasActualTotal,
  calcSaasAmountFromHeadcount,
  calcSaasAnnualCost,
  calcSaasContractsTotalCost,
  calcYearEndForecast,
  getFiscalYearMonthKeys,
  isContractRenewalWarning,
  isProjectBudgetOverrun,
} from '../expense-budget-utils'

describe('getFiscalYearMonthKeys', () => {
  it('4月始まりの場合、年度年の4月〜翌年3月を返す', () => {
    expect(getFiscalYearMonthKeys(2025, 4)).toEqual([
      '2025-04',
      '2025-05',
      '2025-06',
      '2025-07',
      '2025-08',
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
    ])
  })

  it('1月始まりの場合、年度年の1月〜12月を返す', () => {
    expect(getFiscalYearMonthKeys(2025, 1)).toEqual([
      '2025-01',
      '2025-02',
      '2025-03',
      '2025-04',
      '2025-05',
      '2025-06',
      '2025-07',
      '2025-08',
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
    ])
  })
})

describe('isContractRenewalWarning', () => {
  it('次回更新日がちょうど2ヶ月後の場合は警告される（境界値、境界含む）', () => {
    const referenceDate = new Date(2026, 0, 1) // 2026-01-01
    expect(isContractRenewalWarning('2026-03-01', referenceDate)).toBe(true)
  })

  it('次回更新日が2ヶ月+1日後の場合は警告されない', () => {
    const referenceDate = new Date(2026, 0, 1) // 2026-01-01
    expect(isContractRenewalWarning('2026-03-02', referenceDate)).toBe(false)
  })

  it('次回更新日が2ヶ月-1日後の場合は警告される', () => {
    const referenceDate = new Date(2026, 0, 1) // 2026-01-01
    expect(isContractRenewalWarning('2026-02-28', referenceDate)).toBe(true)
  })

  it('次回更新日が既に過ぎている場合も警告される', () => {
    const referenceDate = new Date(2026, 0, 1) // 2026-01-01
    expect(isContractRenewalWarning('2025-12-01', referenceDate)).toBe(true)
  })

  it('次回更新日が十分先の場合は警告されない', () => {
    const referenceDate = new Date(2026, 0, 1) // 2026-01-01
    expect(isContractRenewalWarning('2026-12-01', referenceDate)).toBe(false)
  })

  it('しきい値を変更できる', () => {
    const referenceDate = new Date(2026, 0, 1) // 2026-01-01
    expect(isContractRenewalWarning('2026-04-01', referenceDate, 3)).toBe(true)
  })
})

describe('calcConsumptionRate', () => {
  it('実績÷予算×100で消化率を算出する', () => {
    expect(calcConsumptionRate(10000, 5000)).toBe(50)
  })

  it('実績が予算を超える場合は100%を超える値を返す', () => {
    expect(calcConsumptionRate(10000, 12000)).toBe(120)
  })

  it('予算総額が0の場合は0を返す（ゼロ除算ガード）', () => {
    expect(calcConsumptionRate(0, 5000)).toBe(0)
  })

  it('予算総額が負の場合も0を返す', () => {
    expect(calcConsumptionRate(-100, 5000)).toBe(0)
  })
})

describe('calcSaasAnnualCost', () => {
  const baseContract: SaasContract = {
    id: 'c1',
    name: 'Test SaaS',
    divisionId: 'd1',
    contractType: 'annual',
    amount: 10000,
    paymentCycle: 'annual',
    contractStartDate: '2025-04-01',
    nextRenewalDate: '2026-03-31',
    note: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  it('年次払いの場合は金額をそのまま返す（日割りなし）', () => {
    expect(calcSaasAnnualCost(baseContract)).toBe(10000)
  })

  it('月次払いの場合は月額×12で年間コストを算出する', () => {
    expect(
      calcSaasAnnualCost({
        ...baseContract,
        paymentCycle: 'monthly',
        amount: 1000,
      }),
    ).toBe(12000)
  })
})

describe('calcSaasContractsTotalCost', () => {
  it('複数契約の年間コスト合計を算出する', () => {
    const contracts: SaasContract[] = [
      {
        id: 'c1',
        name: 'A',
        divisionId: 'd1',
        contractType: 'annual',
        amount: 10000,
        paymentCycle: 'annual',
        contractStartDate: '2025-04-01',
        nextRenewalDate: '2026-03-31',
        note: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'c2',
        name: 'B',
        divisionId: 'd1',
        contractType: 'monthly',
        amount: 500,
        paymentCycle: 'monthly',
        contractStartDate: '2025-04-01',
        nextRenewalDate: '2026-03-31',
        note: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]
    expect(calcSaasContractsTotalCost(contracts)).toBe(10000 + 500 * 12)
  })

  it('契約が空の場合は0を返す', () => {
    expect(calcSaasContractsTotalCost([])).toBe(0)
  })
})

describe('calcSaasAmountFromHeadcount', () => {
  it('人数×単価で金額を算出する', () => {
    expect(calcSaasAmountFromHeadcount(5, 2)).toBe(10)
  })

  it('人数が0の場合は0を返す', () => {
    expect(calcSaasAmountFromHeadcount(0, 10)).toBe(0)
  })

  it('単価が0の場合は0を返す', () => {
    expect(calcSaasAmountFromHeadcount(10, 0)).toBe(0)
  })
})

describe('calcRemainingBudget', () => {
  it('予算総額から実績合計を差し引いた額を返す', () => {
    expect(calcRemainingBudget(1000, 300)).toBe(700)
  })

  it('実績が予算を超える場合は負の値を返す（予算超過を明示）', () => {
    expect(calcRemainingBudget(1000, 1200)).toBe(-200)
  })

  it('実績が0の場合は予算総額をそのまま返す', () => {
    expect(calcRemainingBudget(1000, 0)).toBe(1000)
  })
})

// =========================================================================
// calcYearEndForecast / calcMonthlyTrendSeries
// =========================================================================
function createAiUsageEntry(
  overrides: Partial<AiUsageEntry> = {},
): AiUsageEntry {
  return {
    id: 'ai-1',
    divisionId: 'div-1',
    fiscalYear: 2025,
    month: '2025-04',
    budgetAmount: 100,
    actualAmount: null,
    ...overrides,
  }
}

function createBreakdown(
  overrides: Partial<BudgetBreakdown> = {},
): BudgetBreakdown {
  return {
    id: 'b-1',
    budgetId: 'budget-1',
    category: 'project_personnel',
    label: '案件A',
    amount: 1200,
    recordedAt: '2025-04-01',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function createContract(overrides: Partial<SaasContract> = {}): SaasContract {
  return {
    id: 'c-1',
    name: 'Test SaaS',
    divisionId: 'div-1',
    contractType: 'annual',
    amount: 1200,
    paymentCycle: 'annual',
    contractStartDate: '2025-04-01',
    nextRenewalDate: '2026-03-31',
    note: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

const monthKeys = getFiscalYearMonthKeys(2025, 4)

// AiUsageEntryは＄建てのため、万円換算（requirements10）が必要になった。
// 1＄=1万円相当（10000円/＄）のレートを与えることで、既存の期待値（万円換算前と同じ数値）のまま検証する
const RATE_1_TO_1 = [{ effectiveFrom: '2000-01', rate: 10000 }]

describe('calcYearEndForecast', () => {
  it('全月のAI利用費実績が記録済みの場合、実績合計をそのまま返す（AI利用費のみのケース）', () => {
    const aiUsageEntries = monthKeys.map((month) =>
      createAiUsageEntry({ month, budgetAmount: 100, actualAmount: 90 }),
    )
    const forecast = calcYearEndForecast(
      monthKeys,
      aiUsageEntries,
      [],
      [],
      RATE_1_TO_1,
    )
    expect(forecast).toBe(90 * 12)
  })

  it('未記録月は予算額で補完する（AI利用費）', () => {
    const aiUsageEntries = [
      createAiUsageEntry({
        month: '2025-04',
        budgetAmount: 100,
        actualAmount: 80,
      }),
      createAiUsageEntry({
        month: '2025-05',
        budgetAmount: 100,
        actualAmount: null,
      }),
    ]
    // 4月: 実績80、5月: 予算100（未記録）、他の月はエントリなし=0として扱う
    const forecast = calcYearEndForecast(
      monthKeys,
      aiUsageEntries,
      [],
      [],
      RATE_1_TO_1,
    )
    expect(forecast).toBe(80 + 100)
  })

  // 反証: 為替レート未指定（省略時）はAI利用費が0扱いになり、他画面の万円建て集計に
  // ＄がそのまま混入しないか
  it('為替レートを指定しない場合、AI利用費は0として扱われる（未換算の混入防止）', () => {
    const aiUsageEntries = [
      createAiUsageEntry({
        month: '2025-04',
        budgetAmount: 100,
        actualAmount: 90,
      }),
    ]
    const forecast = calcYearEndForecast(monthKeys, aiUsageEntries, [], [])
    expect(forecast).toBe(0)
  })

  it('monthlyActuals未設定のBudgetBreakdownは月割りせず現状合計をそのまま加算する', () => {
    const breakdown = createBreakdown({ amount: 1200 })
    const forecast = calcYearEndForecast(monthKeys, [], [breakdown], [])
    expect(forecast).toBe(1200)
  })

  it('monthlyActualsが一部設定されたBudgetBreakdownは、記録月は実績・未記録月はamount/12で補完する', () => {
    const breakdown = createBreakdown({
      amount: 1200, // 月割りすると100/月
      monthlyActuals: { '2025-04': 150 }, // 4月だけ実績150
    })
    // 4月: 150（実績） + 残り11ヶ月: 100（月割り予算）×11 = 150 + 1100 = 1250
    const forecast = calcYearEndForecast(monthKeys, [], [breakdown], [])
    expect(forecast).toBe(150 + 100 * 11)
  })

  it('monthlyActuals未設定のSaasContractは月割りせず年間コストをそのまま加算する', () => {
    const contract = createContract({
      amount: 100,
      paymentCycle: 'monthly',
    })
    // 年間コスト = 100×12 = 1200
    const forecast = calcYearEndForecast(monthKeys, [], [], [contract])
    expect(forecast).toBe(1200)
  })

  it('monthlyActualsが一部設定されたSaasContractは、記録月は実績・未記録月は年間コスト/12で補完する', () => {
    const contract = createContract({
      amount: 1200,
      paymentCycle: 'annual',
      monthlyActuals: { '2025-04': 90 },
    })
    // 4月: 90（実績）+ 残り11ヶ月: 100（1200/12）×11 = 90 + 1100 = 1190
    const forecast = calcYearEndForecast(monthKeys, [], [], [contract])
    expect(forecast).toBe(90 + 100 * 11)
  })

  it('複数カテゴリを合算する', () => {
    const aiUsageEntries = [
      createAiUsageEntry({
        month: '2025-04',
        budgetAmount: 50,
        actualAmount: 50,
      }),
    ]
    const breakdown = createBreakdown({ amount: 500 })
    const contract = createContract({ amount: 300, paymentCycle: 'annual' })
    const forecast = calcYearEndForecast(
      monthKeys,
      aiUsageEntries,
      [breakdown],
      [contract],
      RATE_1_TO_1,
    )
    expect(forecast).toBe(50 + 500 + 300)
  })

  it('入力データが空の場合は0を返す', () => {
    expect(calcYearEndForecast(monthKeys, [], [], [])).toBe(0)
  })

  it('同一入力に対して常に同一の出力を返す（決定論性）', () => {
    const breakdown = createBreakdown({
      amount: 1000,
      monthlyActuals: { '2025-04': 77 },
    })
    const results = Array.from({ length: 5 }, () =>
      calcYearEndForecast(monthKeys, [], [breakdown], []),
    )
    expect(new Set(results).size).toBe(1)
  })
})

describe('calcMonthlyTrendSeries', () => {
  it('月ごとにAI利用費の予算・実績と、その他実績（案件予算内訳・SaaS月次実績）の合算を返す', () => {
    const aiUsageEntries = [
      createAiUsageEntry({
        month: '2025-04',
        budgetAmount: 100,
        actualAmount: 80,
      }),
    ]
    const breakdown = createBreakdown({
      amount: 1200,
      monthlyActuals: { '2025-04': 50 },
    })
    const contract = createContract({
      amount: 1200,
      paymentCycle: 'annual',
      monthlyActuals: { '2025-04': 30 },
    })
    const series = calcMonthlyTrendSeries(
      monthKeys,
      aiUsageEntries,
      [breakdown],
      [contract],
      RATE_1_TO_1,
    )
    const april = series.find((s) => s.month === '2025-04')
    expect(april?.aiUsageBudget).toBe(100)
    expect(april?.aiUsageActual).toBe(80)
    expect(april?.otherActual).toBe(50 + 30)
  })

  // 反証: 為替レート未指定（省略時）はAI利用費予算・実績とも0になるか
  it('為替レートを指定しない場合、AI利用費予算・実績は0として扱われる', () => {
    const aiUsageEntries = [
      createAiUsageEntry({
        month: '2025-04',
        budgetAmount: 100,
        actualAmount: 80,
      }),
    ]
    const series = calcMonthlyTrendSeries(monthKeys, aiUsageEntries, [], [])
    const april = series.find((s) => s.month === '2025-04')
    expect(april?.aiUsageBudget).toBe(0)
    expect(april?.aiUsageActual).toBe(0)
  })

  it('実績未記録月はaiUsageActual/otherActualともに0として扱う', () => {
    const series = calcMonthlyTrendSeries(monthKeys, [], [], [])
    for (const point of series) {
      expect(point.aiUsageBudget).toBe(0)
      expect(point.aiUsageActual).toBe(0)
      expect(point.otherActual).toBe(0)
    }
  })

  it('12ヶ月分の系列を返す', () => {
    const series = calcMonthlyTrendSeries(monthKeys, [], [], [])
    expect(series).toHaveLength(12)
    expect(series[0]?.month).toBe('2025-04')
    expect(series[11]?.month).toBe('2026-03')
  })
})

describe('calcProjectEstimateBudget', () => {
  it('総工数×概算単価を四捨五入して算出する', () => {
    expect(calcProjectEstimateBudget(10, 80)).toBe(800)
  })

  it('総工数が0の場合は0を返す', () => {
    expect(calcProjectEstimateBudget(0, 80)).toBe(0)
  })

  it('概算単価が0の場合は0を返す', () => {
    expect(calcProjectEstimateBudget(10, 0)).toBe(0)
  })

  it('小数第1位を四捨五入する', () => {
    // 3.5 × 100 = 350（丸め不要ケース）
    expect(calcProjectEstimateBudget(3.5, 100)).toBe(350)
    // 3.33 × 100 = 333（切り捨てになるケース）
    expect(calcProjectEstimateBudget(3.33, 100)).toBe(333)
    // 3.336 × 100 = 333.6 → 334（四捨五入で切り上げになるケース）
    expect(calcProjectEstimateBudget(3.336, 100)).toBe(334)
  })

  it('係数を省略した場合は1として扱う（既存呼び出しの後方互換）', () => {
    expect(calcProjectEstimateBudget(10, 80)).toBe(
      calcProjectEstimateBudget(10, 80, 1),
    )
  })

  it('係数を指定すると総工数×概算単価×係数で算出する', () => {
    // 10 × 80 × 1.25 = 1000
    expect(calcProjectEstimateBudget(10, 80, 1.25)).toBe(1000)
  })

  it('係数1未満（値引き相当）でも正しく算出する', () => {
    // 10 × 80 × 0.5 = 400
    expect(calcProjectEstimateBudget(10, 80, 0.5)).toBe(400)
  })
})

describe('calcProjectEstimateBudgets', () => {
  it('複数案件の概算予算を個別に算出する', () => {
    const totalEfforts = new Map([
      ['project-1', 10],
      ['project-2', 5],
    ])
    const result = calcProjectEstimateBudgets(totalEfforts, 80)
    expect(result.get('project-1')).toBe(800)
    expect(result.get('project-2')).toBe(400)
  })

  it('空のMapを渡すと空のMapを返す', () => {
    const result = calcProjectEstimateBudgets(new Map(), 80)
    expect(result.size).toBe(0)
  })

  // 反証: ある案件の工数を変更しても、他案件の概算予算に影響しないか
  it('1案件の値を変更しても他案件の算出結果に影響しない', () => {
    const totalEfforts = new Map([
      ['project-1', 10],
      ['project-2', 5],
    ])
    const result = calcProjectEstimateBudgets(totalEfforts, 80)
    expect(result.get('project-2')).toBe(400)

    totalEfforts.set('project-1', 999)
    // Map参照を渡しているが、算出結果（result）は既に確定済みのため変化しない
    expect(result.get('project-2')).toBe(400)
  })

  it('案件別の係数が設定されている場合はその係数を使う', () => {
    const totalEfforts = new Map([['project-1', 10]])
    const coefficients = new Map([['project-1', 1.5]])
    const result = calcProjectEstimateBudgets(totalEfforts, 80, coefficients)
    // 10 × 80 × 1.5 = 1200
    expect(result.get('project-1')).toBe(1200)
  })

  it('案件別の係数が未設定の場合はdefaultCoefficientにフォールバックする', () => {
    const totalEfforts = new Map([['project-1', 10]])
    const result = calcProjectEstimateBudgets(totalEfforts, 80, new Map(), 1.25)
    // 10 × 80 × 1.25 = 1000
    expect(result.get('project-1')).toBe(1000)
  })

  it('係数・defaultCoefficientともに省略した場合は1として算出する', () => {
    const totalEfforts = new Map([['project-1', 10]])
    const result = calcProjectEstimateBudgets(totalEfforts, 80)
    expect(result.get('project-1')).toBe(800)
  })
})

describe('calcRemainingSaasBudget', () => {
  it('年次払いの場合、契約金額から実績合計を差し引いた額を返す', () => {
    const contract = createContract({
      amount: 1200,
      paymentCycle: 'annual',
      monthlyActuals: { '2025-04': 100, '2025-05': 100 },
    })
    expect(calcRemainingSaasBudget(contract, monthKeys)).toBe(1200 - 200)
  })

  it('月次払いの場合、年間換算額（月額×12）から実績合計を差し引いた額を返す', () => {
    const contract = createContract({
      amount: 100,
      paymentCycle: 'monthly',
      monthlyActuals: { '2025-04': 90 },
    })
    expect(calcRemainingSaasBudget(contract, monthKeys)).toBe(1200 - 90)
  })

  it('monthlyActuals未設定の場合、実績0として年間換算額をそのまま返す', () => {
    const contract = createContract({ amount: 1200, paymentCycle: 'annual' })
    expect(calcRemainingSaasBudget(contract, monthKeys)).toBe(1200)
  })

  it('対象年度外の実績は集計に含まれない', () => {
    const contract = createContract({
      amount: 1200,
      paymentCycle: 'annual',
      monthlyActuals: { '2025-04': 100, '2024-03': 9999 },
    })
    expect(calcRemainingSaasBudget(contract, monthKeys)).toBe(1200 - 100)
  })

  it('実績が年間換算額を超える場合は負の値を返す（予算超過を明示）', () => {
    const contract = createContract({
      amount: 100,
      paymentCycle: 'annual',
      monthlyActuals: { '2025-04': 150 },
    })
    expect(calcRemainingSaasBudget(contract, monthKeys)).toBe(-50)
  })
})

describe('calcOtherExpenseActualTotal', () => {
  it('実績明細の金額合計を返す', () => {
    const breakdown = createBreakdown({
      actualRecords: [
        {
          id: 'r1',
          purchasedAt: '2025-04-10',
          itemLabel: '書籍代',
          amount: 30,
        },
        {
          id: 'r2',
          purchasedAt: '2025-05-01',
          itemLabel: 'セミナー参加費',
          amount: 50,
        },
      ],
    })
    expect(calcOtherExpenseActualTotal(breakdown)).toBe(80)
  })

  it('actualRecordsが未設定の場合は0を返す', () => {
    const breakdown = createBreakdown()
    expect(calcOtherExpenseActualTotal(breakdown)).toBe(0)
  })

  it('actualRecordsが空配列の場合は0を返す', () => {
    const breakdown = createBreakdown({ actualRecords: [] })
    expect(calcOtherExpenseActualTotal(breakdown)).toBe(0)
  })
})

describe('calcBudgetBreakdownAmountTotal', () => {
  it('複数レコードの予算額（amount）合計を返す', () => {
    const breakdowns = [
      createBreakdown({ id: 'b-1', amount: 300 }),
      createBreakdown({ id: 'b-2', amount: 500 }),
    ]
    expect(calcBudgetBreakdownAmountTotal(breakdowns)).toBe(800)
  })

  it('空配列の場合は0を返す', () => {
    expect(calcBudgetBreakdownAmountTotal([])).toBe(0)
  })
})

describe('calcBudgetBreakdownActualRecordsTotal', () => {
  it('複数レコードの実績明細合計を合算する', () => {
    const breakdowns = [
      createBreakdown({
        id: 'b-1',
        actualRecords: [
          {
            id: 'r1',
            purchasedAt: '2025-04-10',
            itemLabel: '書籍代',
            amount: 30,
          },
        ],
      }),
      createBreakdown({
        id: 'b-2',
        actualRecords: [
          {
            id: 'r2',
            purchasedAt: '2025-05-01',
            itemLabel: 'セミナー参加費',
            amount: 50,
          },
        ],
      }),
    ]
    expect(calcBudgetBreakdownActualRecordsTotal(breakdowns)).toBe(80)
  })

  it('actualRecords未設定のレコードが混在しても0として扱われる', () => {
    const breakdowns = [
      createBreakdown({ id: 'b-1' }),
      createBreakdown({
        id: 'b-2',
        actualRecords: [
          {
            id: 'r1',
            purchasedAt: '2025-04-10',
            itemLabel: '書籍代',
            amount: 30,
          },
        ],
      }),
    ]
    expect(calcBudgetBreakdownActualRecordsTotal(breakdowns)).toBe(30)
  })

  it('空配列の場合は0を返す', () => {
    expect(calcBudgetBreakdownActualRecordsTotal([])).toBe(0)
  })
})

describe('calcAiUsageMemberAllocationTotal', () => {
  function createAllocation(
    overrides: Partial<AiUsageMemberAllocation> = {},
  ): AiUsageMemberAllocation {
    return {
      id: 'alloc-1',
      divisionId: 'div-1',
      fiscalYear: 2025,
      month: '2025-04',
      memberId: 'member-1',
      monthlyBudget: 10,
      bufferAmount: 2,
      actualAmount: 8,
      bufferActualAmount: 0,
      ...overrides,
    }
  }

  it('個人予算・バッファ・割当・バッファ割当それぞれの列合計を算出する', () => {
    const allocations = [
      createAllocation({
        id: 'a1',
        monthlyBudget: 10,
        bufferAmount: 2,
        actualAmount: 8,
        bufferActualAmount: 1,
      }),
      createAllocation({
        id: 'a2',
        monthlyBudget: 5,
        bufferAmount: 1,
        actualAmount: 4,
        bufferActualAmount: 3,
      }),
    ]
    const result = calcAiUsageMemberAllocationTotal(allocations)
    expect(result.budgetTotal).toBe(15)
    expect(result.bufferTotal).toBe(3)
    expect(result.actualTotal).toBe(12)
    expect(result.bufferActualTotal).toBe(4)
  })

  it('(割当+バッファ割当)の合計が(個人予算+バッファ)の合計以下の場合、超過なしと判定する', () => {
    const allocations = [
      createAllocation({
        monthlyBudget: 10,
        bufferAmount: 2,
        actualAmount: 8,
        bufferActualAmount: 4,
      }),
    ]
    expect(calcAiUsageMemberAllocationTotal(allocations).isOverBudget).toBe(
      false,
    )
  })

  it('(割当+バッファ割当)の合計が(個人予算+バッファ)の合計を1円でも超えると超過と判定する（境界値）', () => {
    const allocations = [
      createAllocation({
        monthlyBudget: 10,
        bufferAmount: 2,
        actualAmount: 8,
        bufferActualAmount: 5,
      }),
    ]
    expect(calcAiUsageMemberAllocationTotal(allocations).isOverBudget).toBe(
      true,
    )
  })

  // 反証: bufferActualAmountが未設定（旧データ由来でundefined）でもクラッシュしないか
  it('bufferActualAmountが未設定の配分は0として扱う', () => {
    const allocations = [
      // biome-ignore lint/suspicious/noExplicitAny: 後方互換テストのため意図的に型を緩める
      { ...createAllocation(), bufferActualAmount: undefined } as any,
    ]
    const result = calcAiUsageMemberAllocationTotal(allocations)
    expect(result.bufferActualTotal).toBe(0)
  })

  it('配分が空配列の場合はすべて0で超過なしを返す', () => {
    const result = calcAiUsageMemberAllocationTotal([])
    expect(result).toEqual({
      budgetTotal: 0,
      bufferTotal: 0,
      actualTotal: 0,
      bufferActualTotal: 0,
      isOverBudget: false,
    })
  })
})

describe('calcSaasActualTotal（shared/utils/budget-utils.tsからのリエクスポート）', () => {
  it('対象年度の実績合計を返す', () => {
    const contract = createContract({
      monthlyActuals: { '2025-04': 90, '2025-05': 100 },
    })
    expect(calcSaasActualTotal(contract, monthKeys)).toBe(190)
  })

  it('monthlyActuals未設定の場合は0を返す', () => {
    const contract = createContract()
    expect(calcSaasActualTotal(contract, monthKeys)).toBe(0)
  })

  it('calcRemainingSaasBudgetの内部計算と整合する（リファクタ後の回帰確認）', () => {
    const contract = createContract({
      amount: 1200,
      paymentCycle: 'annual',
      monthlyActuals: { '2025-04': 90 },
    })
    const actualTotal = calcSaasActualTotal(contract, monthKeys)
    expect(calcRemainingSaasBudget(contract, monthKeys)).toBe(
      1200 - actualTotal,
    )
  })
})

describe('calcRemainingContractEffort', () => {
  it('残予算を概算単価で割って人月換算する', () => {
    // 残予算1000万円 ÷ 概算単価100万円 = 10人月
    expect(calcRemainingContractEffort(1000, 100)).toBe(10)
  })

  it('割り切れない場合は小数のまま返す（丸めない）', () => {
    expect(calcRemainingContractEffort(150, 100)).toBe(1.5)
  })

  it('概算単価が0の場合はゼロ除算せず0を返す', () => {
    expect(calcRemainingContractEffort(1000, 0)).toBe(0)
  })

  it('概算単価が負の場合も0を返す（ガード）', () => {
    expect(calcRemainingContractEffort(1000, -10)).toBe(0)
  })

  it('残予算が負の場合（予算超過）は負の工数を返す', () => {
    expect(calcRemainingContractEffort(-200, 100)).toBe(-2)
  })

  it('残予算が0の場合は0を返す', () => {
    expect(calcRemainingContractEffort(0, 100)).toBe(0)
  })
})

describe('calcAssignedEffortMonths', () => {
  it('対象案件のアサイン月次値（全月合計）を人月として合算する', () => {
    const assignments = [
      {
        projectId: 'p1',
        monthlyValues: { '2025-04': 0.5, '2025-05': 1.0 },
      },
    ]
    expect(calcAssignedEffortMonths('p1', assignments)).toBe(1.5)
  })

  it('複数のアサイン（タスク別）を横断して合算する', () => {
    const assignments: {
      projectId: string
      monthlyValues: Record<string, number>
    }[] = [
      { projectId: 'p1', monthlyValues: { '2025-04': 0.5 } },
      { projectId: 'p1', monthlyValues: { '2025-04': 0.3, '2025-05': 0.2 } },
    ]
    expect(calcAssignedEffortMonths('p1', assignments)).toBeCloseTo(1.0)
  })

  it('反証: 他案件のアサインは合算対象外', () => {
    const assignments = [
      { projectId: 'p1', monthlyValues: { '2025-04': 0.5 } },
      { projectId: 'p2', monthlyValues: { '2025-04': 999 } },
    ]
    expect(calcAssignedEffortMonths('p1', assignments)).toBe(0.5)
  })

  it('反証: 該当するアサインが1件も無い場合は0を返す', () => {
    expect(calcAssignedEffortMonths('p1', [])).toBe(0)
  })
})

describe('calcProjectRowsTotal', () => {
  it('複数案件の総工数・概算予算額をそれぞれ合計する', () => {
    const result = calcProjectRowsTotal([
      {
        totalEffort: 10,
        estimateBudget: 1000,
        assignedEffort: 4,
        assignedBudget: 400,
        unassignedEffort: 6,
        unassignedBudget: 600,
      },
      {
        totalEffort: 5.5,
        estimateBudget: 550,
        assignedEffort: 2,
        assignedBudget: 200,
        unassignedEffort: 3.5,
        unassignedBudget: 350,
      },
    ])
    expect(result.totalEffort).toBe(15.5)
    expect(result.estimateBudget).toBe(1550)
    expect(result.assignedEffort).toBe(6)
    expect(result.assignedBudget).toBe(600)
    expect(result.unassignedEffort).toBe(9.5)
    expect(result.unassignedBudget).toBe(950)
  })

  it('案件が0件の場合は0を返す', () => {
    expect(calcProjectRowsTotal([])).toEqual({
      totalEffort: 0,
      estimateBudget: 0,
      assignedEffort: 0,
      assignedBudget: 0,
      unassignedEffort: 0,
      unassignedBudget: 0,
    })
  })

  it('案件が1件のみの場合はその値をそのまま返す', () => {
    const result = calcProjectRowsTotal([
      {
        totalEffort: 3,
        estimateBudget: 300,
        assignedEffort: 1,
        assignedBudget: 100,
        unassignedEffort: 2,
        unassignedBudget: 200,
      },
    ])
    expect(result).toEqual({
      totalEffort: 3,
      estimateBudget: 300,
      assignedEffort: 1,
      assignedBudget: 100,
      unassignedEffort: 2,
      unassignedBudget: 200,
    })
  })
})

const PROFITABILITY_PROJECT_ID = 'proj-profitability-1'
const OTHER_PROFITABILITY_PROJECT_ID = 'proj-profitability-other'

function makeProfitabilityAssignment(
  overrides: Partial<AssignmentEntry> = {},
): AssignmentEntry {
  return {
    id: 'a-1',
    projectId: PROFITABILITY_PROJECT_ID,
    taskId: 'task-1',
    memberId: 'm-1',
    monthlyValues: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeProfitabilityMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'm-1',
    name: 'テスト担当者',
    sectionId: null,
    role: 'エンジニア',
    isActive: true,
    startDate: null,
    endDate: null,
    unitPriceHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('calcProjectProfitability（人・モノ・金の三位一体強化: 案件別損益）', () => {
  // 2025-05-18時点を基準日とする。2025-04は完全に経過済みの月として100%計上される
  const REFERENCE_DATE = new Date(2025, 4, 18)

  it('受注金額と実コスト（実人件費＋実付帯費用）から粗利・利益率を算出する', () => {
    const assignments = [
      makeProfitabilityAssignment({ monthlyValues: { '2025-04': 1.0 } }),
    ]
    const members = [
      makeProfitabilityMember({
        contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
      }),
    ]
    const breakdowns = [
      createBreakdown({
        projectId: PROFITABILITY_PROJECT_ID,
        actualRecords: [
          {
            id: 'r1',
            purchasedAt: '2025-04-10',
            itemLabel: '経費',
            amount: 20,
          },
        ],
      }),
    ]

    const result = calcProjectProfitability(
      { id: PROFITABILITY_PROJECT_ID, contractAmount: 200 },
      assignments,
      members,
      breakdowns,
      REFERENCE_DATE,
    )

    expect(result.contractAmount).toBe(200)
    expect(result.actualPersonnelCost).toBe(100)
    expect(result.actualExpenseCost).toBe(20)
    expect(result.actualCostTotal).toBe(120)
    expect(result.grossProfit).toBe(80)
    expect(result.profitMarginRate).toBeCloseTo(40)
  })

  it('contractAmountが未設定（null）の場合は0として扱い、利益率はnull（算出不能）', () => {
    const result = calcProjectProfitability(
      { id: PROFITABILITY_PROJECT_ID, contractAmount: null },
      [],
      [],
      [],
      REFERENCE_DATE,
    )

    expect(result.contractAmount).toBe(0)
    expect(result.actualCostTotal).toBe(0)
    expect(result.profitMarginRate).toBeNull()
  })

  it('実コストが受注金額を超える場合、grossProfitは負の値になる', () => {
    const assignments = [
      makeProfitabilityAssignment({ monthlyValues: { '2025-04': 1.0 } }),
    ]
    const members = [
      makeProfitabilityMember({
        contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 300 }],
      }),
    ]

    const result = calcProjectProfitability(
      { id: PROFITABILITY_PROJECT_ID, contractAmount: 200 },
      assignments,
      members,
      [],
      REFERENCE_DATE,
    )

    expect(result.actualCostTotal).toBe(300)
    expect(result.grossProfit).toBe(-100)
    expect(result.profitMarginRate).toBeCloseTo(-50)
  })

  // 反証: 他案件のアサイン・内訳が対象案件の損益に混入しないか
  it('反証: 他案件のアサイン・BudgetBreakdownは集計対象外', () => {
    const assignments = [
      makeProfitabilityAssignment({ monthlyValues: { '2025-04': 1.0 } }),
      makeProfitabilityAssignment({
        id: 'a-other',
        projectId: OTHER_PROFITABILITY_PROJECT_ID,
        monthlyValues: { '2025-04': 1.0 },
      }),
    ]
    const members = [
      makeProfitabilityMember({
        contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
      }),
    ]
    const breakdowns = [
      createBreakdown({
        projectId: PROFITABILITY_PROJECT_ID,
        actualRecords: [
          {
            id: 'r1',
            purchasedAt: '2025-04-10',
            itemLabel: '経費',
            amount: 20,
          },
        ],
      }),
      createBreakdown({
        id: 'b-other',
        projectId: OTHER_PROFITABILITY_PROJECT_ID,
        actualRecords: [
          {
            id: 'r2',
            purchasedAt: '2025-04-10',
            itemLabel: '経費',
            amount: 999,
          },
        ],
      }),
    ]

    const result = calcProjectProfitability(
      { id: PROFITABILITY_PROJECT_ID, contractAmount: 200 },
      assignments,
      members,
      breakdowns,
      REFERENCE_DATE,
    )

    expect(result.actualPersonnelCost).toBe(100)
    expect(result.actualExpenseCost).toBe(20)
  })

  // 反証: 該当するアサイン・内訳が1件も無い場合、実コストは0になるか
  it('反証: 該当するアサイン・内訳が1件も無い場合、実コストは0', () => {
    const result = calcProjectProfitability(
      { id: PROFITABILITY_PROJECT_ID, contractAmount: 500 },
      [],
      [],
      [],
      REFERENCE_DATE,
    )

    expect(result.actualPersonnelCost).toBe(0)
    expect(result.actualExpenseCost).toBe(0)
    expect(result.actualCostTotal).toBe(0)
    expect(result.grossProfit).toBe(500)
    expect(result.profitMarginRate).toBe(100)
  })
})

describe('isProjectBudgetOverrun（人・モノ・金の三位一体強化: 予算超過アラート）', () => {
  it('消化率がデフォルトしきい値（80%）以上の場合trueを返す', () => {
    expect(
      isProjectBudgetOverrun({ contractAmount: 100, actualCostTotal: 80 }),
    ).toBe(true)
  })

  it('消化率がデフォルトしきい値未満の場合falseを返す', () => {
    expect(
      isProjectBudgetOverrun({ contractAmount: 100, actualCostTotal: 79 }),
    ).toBe(false)
  })

  it('カスタムしきい値を指定できる', () => {
    expect(
      isProjectBudgetOverrun({ contractAmount: 100, actualCostTotal: 50 }, 50),
    ).toBe(true)
  })

  it('消化率が100%を超えた場合（予算超過）もtrueを返す', () => {
    expect(
      isProjectBudgetOverrun({ contractAmount: 100, actualCostTotal: 150 }),
    ).toBe(true)
  })

  // 反証: 受注金額が未設定（0以下）の場合、判定不能としてfalseを返すか
  it('反証: contractAmountが0以下（未設定）の場合は判定不能としてfalseを返す', () => {
    expect(
      isProjectBudgetOverrun({ contractAmount: 0, actualCostTotal: 999 }),
    ).toBe(false)
  })
})
