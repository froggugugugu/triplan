import type {
  AiUsageEntry,
  AiUsageMemberAllocation,
  BudgetBreakdown,
  ExchangeRateEntry,
  SaasContract,
} from '@/shared/types/budget'
import {
  calcSaasActualTotal,
  calcSaasAnnualCost,
  convertUsdToManYen,
  getApplicableExchangeRate,
} from '@/shared/utils/budget-utils'

/**
 * リエクスポート: 実体は src/shared/utils/budget-utils.ts（features間依存を避けるため）
 */
// 年度の月次キー生成は features/dashboard・features/projects からも参照するため
// shared/utils へ移設済み（features間の直接依存を避ける）。features配下からの参照用にリエクスポートする
export {
  // 是正に伴い、budget-store.ts（stores層）からも参照できるよう
  // shared/utils/budget-utils.tsへ移動済み（WORKDAYS_PER_MONTHも同様）
  calcProjectEstimateBudget,
  calcProjectEstimateBudgets,
  calcSaasActualTotal,
  calcSaasAnnualCost,
  calcSaasContractsTotalCost,
  getFiscalYearMonthKeys,
  WORKDAYS_PER_MONTH,
} from '@/shared/utils/budget-utils'

/**
 * "YYYY-MM"形式の月次キーから表示用ラベル（例: "4月"）を生成する
 */
export function getCalendarMonthLabel(monthKey: string): string {
  const month = Number.parseInt(monthKey.split('-')[1] ?? '0', 10)
  return `${month}月`
}

// リエクスポート: アラートセンター（features/dashboard）からも参照するためshared化
export {
  calcBudgetBreakdownActualRecordsTotal,
  calcConsumptionRate,
  calcOtherExpenseActualTotal,
  isContractRenewalWarning,
} from '@/shared/utils/budget-utils'
// 案件別損益・予算超過判定はbudget-utilsとevm-utilsの両方に依存するため独立ファイルへ移設
export {
  calcProjectProfitability,
  isProjectBudgetOverrun,
  type ProjectProfitability,
} from '@/shared/utils/profitability-utils'

/**
 * 利用人数×単価からSaaS契約の金額を算出する
 *
 * @param headcount - 利用人数
 * @param unitPrice - 1人あたり単価（万円）
 * @returns 算出金額（万円）
 */
export function calcSaasAmountFromHeadcount(
  headcount: number,
  unitPrice: number,
): number {
  return headcount * unitPrice
}

/**
 * 残予算を算出する（予算総額 − 実績合計）。予算超過時は負の値を返す。
 */
export function calcRemainingBudget(
  budgetTotal: number,
  actualTotal: number,
): number {
  return budgetTotal - actualTotal
}

/**
 * SaaS契約の残り予算を算出する（契約金額の年間換算 − 対象年度の実績合計）。
 * 予算超過時は負の値を返す。
 *
 * @param contract - 対象のSaaS契約
 * @param monthKeys - 対象年度の月次キー一覧（getFiscalYearMonthKeysで生成）
 */
export function calcRemainingSaasBudget(
  contract: SaasContract,
  monthKeys: string[],
): number {
  const annualCost = calcSaasAnnualCost(contract)
  const actualTotal = calcSaasActualTotal(contract, monthKeys)
  return calcRemainingBudget(annualCost, actualTotal)
}

/**
 * 複数のBudgetBreakdownレコードの予算額（amount）を合算する
 * （部門予算タブ・その他費用タブの「予算合計」行に使用）
 */
export function calcBudgetBreakdownAmountTotal(
  breakdowns: BudgetBreakdown[],
): number {
  return breakdowns.reduce((sum, b) => sum + b.amount, 0)
}

export interface AiUsageMemberAllocationTotal {
  // 個人予算合計（monthlyBudget）
  budgetTotal: number
  // バッファ合計（bufferAmount）
  bufferTotal: number
  // 割当合計（actualAmount）
  actualTotal: number
  // バッファ割当合計（bufferActualAmount）
  bufferActualTotal: number
  // 実績（割当+バッファ割当）の合計が、予算（個人予算+バッファ）の合計枠を超えているか
  isOverBudget: boolean
}

/**
 * AI利用費メンバー配分の列合計（個人予算・バッファ・割当・バッファ割当）と予算超過判定を算出する。
 * 超過判定は「(割当合計+バッファ割当合計) > (個人予算合計+バッファ合計)」で行う
 * （ハードバリデーションではなく警告表示用）。
 */
export function calcAiUsageMemberAllocationTotal(
  allocations: AiUsageMemberAllocation[],
): AiUsageMemberAllocationTotal {
  const budgetTotal = allocations.reduce((sum, a) => sum + a.monthlyBudget, 0)
  const bufferTotal = allocations.reduce((sum, a) => sum + a.bufferAmount, 0)
  const actualTotal = allocations.reduce((sum, a) => sum + a.actualAmount, 0)
  const bufferActualTotal = allocations.reduce(
    (sum, a) => sum + (a.bufferActualAmount ?? 0),
    0,
  )
  return {
    budgetTotal,
    bufferTotal,
    actualTotal,
    bufferActualTotal,
    isOverBudget: actualTotal + bufferActualTotal > budgetTotal + bufferTotal,
  }
}

/**
 * BudgetBreakdown/SaasContractの月別実績を、記録済み月は実績額、
 * 未記録月はlump金額の月割り額で補完して合算する（年度末着地予測の内部ヘルパー）。
 * monthlyActualsが未設定または空の場合は月割りせず、lump金額をそのまま返す。
 */
function calcMonthlyDividedForecast(
  monthKeys: string[],
  lumpAmount: number,
  monthlyActuals: Record<string, number> | undefined,
): number {
  if (!monthlyActuals || Object.keys(monthlyActuals).length === 0) {
    return lumpAmount
  }
  const monthlyBudget = lumpAmount / 12
  return monthKeys.reduce(
    (sum, month) => sum + (monthlyActuals[month] ?? monthlyBudget),
    0,
  )
}

/**
 * 年度末着地予測を算出する（予算ベース予測）。
 *
 * - AI利用費: 月ごとに実績が記録済みならその実績額、未記録なら当該月の予算額を合算。
 *   AiUsageEntryは＄建てのため、各月に有効な為替レートで万円換算する
 *   （requirements10）
 * - 案件予算内訳/SaaS契約: monthlyActualsが設定されている場合、記録月は実績・
 *   未記録月はamount（年間コスト）の月割り額で補完。monthlyActualsが未設定の場合は
 *   月割りせず、現状の金額（amount/年間コスト）をそのまま加算する
 *
 * @param monthKeys - 対象年度の月次キー一覧（getFiscalYearMonthKeysで生成）
 * @param aiUsageEntries - 対象部門・年度のAI利用費エントリ
 * @param budgetBreakdowns - 対象予算の案件予算内訳一覧
 * @param saasContracts - 対象部門のSaaS契約一覧
 * @param exchangeRateHistory - 為替レート履歴（AI利用費の＄→万円換算に使用）
 * @returns 年度末時点の着地見込み額（整数に四捨五入）
 */
export function calcYearEndForecast(
  monthKeys: string[],
  aiUsageEntries: AiUsageEntry[],
  budgetBreakdowns: BudgetBreakdown[],
  saasContracts: SaasContract[],
  exchangeRateHistory: ExchangeRateEntry[] = [],
): number {
  const aiUsageByMonth = new Map(aiUsageEntries.map((e) => [e.month, e]))
  const aiUsageTotal = monthKeys.reduce((sum, month) => {
    const entry = aiUsageByMonth.get(month)
    if (!entry) return sum
    const usdAmount = entry.actualAmount ?? entry.budgetAmount
    const rate = getApplicableExchangeRate(exchangeRateHistory, month)
    return sum + convertUsdToManYen(usdAmount, rate)
  }, 0)

  const breakdownTotal = budgetBreakdowns.reduce(
    (sum, b) =>
      sum + calcMonthlyDividedForecast(monthKeys, b.amount, b.monthlyActuals),
    0,
  )

  const saasTotal = saasContracts.reduce(
    (sum, c) =>
      sum +
      calcMonthlyDividedForecast(
        monthKeys,
        calcSaasAnnualCost(c),
        c.monthlyActuals,
      ),
    0,
  )

  return Math.round(aiUsageTotal + breakdownTotal + saasTotal)
}

/**
 * 残予算を概算単価で人月換算し、「残契約概算工数」を算出する。
 * 概算単価が0以下の場合はゼロ除算を避けて0を返す。
 *
 * @param remainingBudget - 残予算（万円、予算総額－実績総額見込み）
 * @param estimatedUnitPrice - 概算単価（万円、全社共通）
 * @returns 残契約概算工数（人月）
 */
export function calcRemainingContractEffort(
  remainingBudget: number,
  estimatedUnitPrice: number,
): number {
  if (estimatedUnitPrice <= 0) return 0
  return remainingBudget / estimatedUnitPrice
}

/**
 * 対象案件（projectId）に紐づくアサインの月次値（全タスク・全月）を人月として合算する
 * （`ProjectsPage.tsx`の`assignedEfforts`算出と同一ロジック）。
 * `AssignmentEntry`型を直接importすると依存方向上不要な結合が生まれるため、
 * 構造的に必要なフィールドのみを受け取る（`features/assignment`への依存を発生させない）。
 */
export function calcAssignedEffortMonths(
  projectId: string,
  assignments: { projectId: string; monthlyValues: Record<string, number> }[],
): number {
  return assignments
    .filter((a) => a.projectId === projectId)
    .reduce(
      (sum, a) =>
        sum + Object.values(a.monthlyValues).reduce((s, v) => s + v, 0),
      0,
    )
}

export interface ProjectBudgetRow {
  totalEffort: number
  estimateBudget: number
  // 割当済/未割当工数とその概算金額
  assignedEffort: number
  assignedBudget: number
  unassignedEffort: number
  unassignedBudget: number
}

export interface ProjectRowsTotal {
  totalEffort: number
  estimateBudget: number
  assignedEffort: number
  assignedBudget: number
  unassignedEffort: number
  unassignedBudget: number
}

/**
 * 案件タブ（ProjectBudgetView）のAG Grid合計行用に、総工数・概算予算額・割当済/未割当
 * 工数とその概算金額の列合計を算出する。コード・案件名・係数は合計対象外
 * （呼び出し側でpinnedBottomRowDataの該当セルを空欄にする）。
 *
 * @param rows - 案件タブの行データ
 */
export function calcProjectRowsTotal(
  rows: ProjectBudgetRow[],
): ProjectRowsTotal {
  return {
    totalEffort: rows.reduce((sum, r) => sum + r.totalEffort, 0),
    estimateBudget: rows.reduce((sum, r) => sum + r.estimateBudget, 0),
    assignedEffort: rows.reduce((sum, r) => sum + r.assignedEffort, 0),
    assignedBudget: rows.reduce((sum, r) => sum + r.assignedBudget, 0),
    unassignedEffort: rows.reduce((sum, r) => sum + r.unassignedEffort, 0),
    unassignedBudget: rows.reduce((sum, r) => sum + r.unassignedBudget, 0),
  }
}

export interface MonthlyTrendPoint {
  month: string
  aiUsageBudget: number
  aiUsageActual: number
  otherActual: number
}

/**
 * 月次推移グラフ用の系列を算出する。
 *
 * AI利用費は部門×年度×月で予算・実績を直接保持するため、月次の予算・実績を
 * そのまま系列化する（唯一、月単位の予算額を持つカテゴリのため）。AiUsageEntryは＄建て
 * のため、各月に有効な為替レートで万円換算する（requirements10）。
 * 案件予算内訳・SaaS契約は月単位の予算を持たないため、月次実績（monthlyActuals）が
 * 記録されている場合のみotherActualとして合算する（未記録月は0として扱う）。
 *
 * @param exchangeRateHistory - 為替レート履歴（AI利用費の＄→万円換算に使用）
 */
export function calcMonthlyTrendSeries(
  monthKeys: string[],
  aiUsageEntries: AiUsageEntry[],
  budgetBreakdowns: BudgetBreakdown[],
  saasContracts: SaasContract[],
  exchangeRateHistory: ExchangeRateEntry[] = [],
): MonthlyTrendPoint[] {
  const aiUsageByMonth = new Map(aiUsageEntries.map((e) => [e.month, e]))

  return monthKeys.map((month) => {
    const aiEntry = aiUsageByMonth.get(month)
    const rate = getApplicableExchangeRate(exchangeRateHistory, month)
    const breakdownActual = budgetBreakdowns.reduce(
      (sum, b) => sum + (b.monthlyActuals?.[month] ?? 0),
      0,
    )
    const saasActual = saasContracts.reduce(
      (sum, c) => sum + (c.monthlyActuals?.[month] ?? 0),
      0,
    )
    return {
      month,
      aiUsageBudget: convertUsdToManYen(aiEntry?.budgetAmount ?? 0, rate),
      aiUsageActual: convertUsdToManYen(aiEntry?.actualAmount ?? 0, rate),
      otherActual: breakdownActual + saasActual,
    }
  })
}
