import type { AssignmentEntry } from '@/shared/types/assignment'
import type { ExchangeRateEntry, SaasContract } from '@/shared/types/budget'
import type { Company } from '@/shared/types/company'
import { fiscalMonthToCalendarMonth } from '@/shared/types/database'
import type { Member, UnitPriceEntry } from '@/shared/types/member'
import type { Section } from '@/shared/types/section'

/**
 * 指定年度内でメンバーがアクティブな月のリストを返す
 *
 * @param startDate - メンバーの開始日 "YYYY-MM-DD"（nullの場合は空配列）
 * @param endDate - メンバーの終了日 "YYYY-MM-DD"（nullの場合は無期限）
 * @param fiscalYear - 対象年度（例: 2025）
 * @param startMonth - 年度開始月（例: 4 = 4月開始）
 * @returns アクティブ月の配列（"YYYY-MM" 形式）
 */
export function getActiveFiscalMonths(
  startDate: string | null,
  endDate: string | null,
  fiscalYear: number,
  startMonth: number,
): string[] {
  if (startDate === null) return []

  // 年度の開始月・終了月を計算
  const fyStartYear = fiscalYear
  const fyStartMonth = startMonth // 1-indexed

  let fyEndYear: number
  let fyEndMonth: number
  if (startMonth === 1) {
    fyEndYear = fiscalYear
    fyEndMonth = 12
  } else {
    fyEndYear = fiscalYear + 1
    fyEndMonth = startMonth - 1
  }

  const fyStart = `${fyStartYear}-${String(fyStartMonth).padStart(2, '0')}`
  const fyEnd = `${fyEndYear}-${String(fyEndMonth).padStart(2, '0')}`

  // メンバーの在籍期間をYYYY-MM形式に変換
  const memberStart = startDate.slice(0, 7) // "YYYY-MM-DD" → "YYYY-MM"
  const memberEnd = endDate ? endDate.slice(0, 7) : '9999-12'

  // 重複範囲の開始・終了を求める
  const overlapStart = fyStart > memberStart ? fyStart : memberStart
  const overlapEnd = fyEnd < memberEnd ? fyEnd : memberEnd

  if (overlapStart > overlapEnd) return []

  // overlapStart ～ overlapEnd の月リストを生成
  const months: string[] = []
  let [year, month] = overlapStart.split('-').map(Number) as [number, number]
  const [endY, endM] = overlapEnd.split('-').map(Number) as [number, number]

  while (year < endY || (year === endY && month <= endM)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`)
    month++
    if (month > 12) {
      month = 1
      year++
    }
  }

  return months
}

/**
 * 対象月に適用される単価を返す
 *
 * @param unitPriceHistory - 単価履歴の配列
 * @param targetMonth - 対象月 "YYYY-MM"
 * @returns 適用単価（エントリがない場合は0）
 */
export function getApplicableUnitPrice(
  unitPriceHistory: UnitPriceEntry[],
  targetMonth: string,
): number {
  if (unitPriceHistory.length === 0) return 0

  // effectiveFrom 昇順にソート
  const sorted = [...unitPriceHistory].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom),
  )

  let applicable = 0
  for (const entry of sorted) {
    if (entry.effectiveFrom <= targetMonth) {
      applicable = entry.amount
    } else {
      break
    }
  }

  return applicable
}

/**
 * メンバーの年間売上予算を計算する（フル稼働前提）
 *
 * @param member - 対象メンバー
 * @param fiscalYear - 対象年度
 * @param startMonth - 年度開始月
 * @returns 売上予算（万円）
 */
export function calcRevenueBudget(
  member: Member,
  fiscalYear: number,
  startMonth: number,
): number {
  const months = getActiveFiscalMonths(
    member.startDate,
    member.endDate,
    fiscalYear,
    startMonth,
  )

  return months.reduce((sum, month) => {
    return sum + getApplicableUnitPrice(member.unitPriceHistory, month)
  }, 0)
}

/**
 * メンバーの年間見込売上を計算する（アサイン率を反映）
 *
 * @param member - 対象メンバー
 * @param getMemberMonthlyTotal - アサイン率取得コールバック (memberId, monthKey) => number
 * @param fiscalYear - 対象年度
 * @param startMonth - 年度開始月
 * @returns 見込売上（万円）
 */
export function calcExpectedRevenue(
  member: Member,
  getMemberMonthlyTotal: (memberId: string, monthKey: string) => number,
  fiscalYear: number,
  startMonth: number,
): number {
  const months = getActiveFiscalMonths(
    member.startDate,
    member.endDate,
    fiscalYear,
    startMonth,
  )

  return months.reduce((sum, month) => {
    const unitPrice = getApplicableUnitPrice(member.unitPriceHistory, month)
    const rate = getMemberMonthlyTotal(member.id, month)
    return sum + unitPrice * rate
  }, 0)
}

/**
 * 課レベルの売上予算を計算する
 */
export function calcSectionBudget(
  members: Member[],
  fiscalYear: number,
  startMonth: number,
): number {
  return members.reduce(
    (sum, member) => sum + calcRevenueBudget(member, fiscalYear, startMonth),
    0,
  )
}

/**
 * 課レベルの見込売上を計算する
 */
export function calcSectionExpectedRevenue(
  members: Member[],
  getMemberMonthlyTotal: (memberId: string, monthKey: string) => number,
  fiscalYear: number,
  startMonth: number,
): number {
  return members.reduce(
    (sum, member) =>
      sum +
      calcExpectedRevenue(
        member,
        getMemberMonthlyTotal,
        fiscalYear,
        startMonth,
      ),
    0,
  )
}

/**
 * 部レベルの売上予算を計算する
 *
 * @param sections - 部門配下の課リスト
 * @param allMembers - 全メンバーリスト（sectionIdでフィルタする）
 * @param fiscalYear - 対象年度
 * @param startMonth - 年度開始月
 */
export function calcDivisionBudget(
  sections: Section[],
  allMembers: Member[],
  fiscalYear: number,
  startMonth: number,
): number {
  const sectionIds = new Set(sections.map((s) => s.id))
  const divisionMembers = allMembers.filter(
    (m) => m.sectionId !== null && sectionIds.has(m.sectionId),
  )
  return calcSectionBudget(divisionMembers, fiscalYear, startMonth)
}

/**
 * 部レベルの見込売上を計算する
 *
 * @param sections - 部門配下の課リスト
 * @param allMembers - 全メンバーリスト（sectionIdでフィルタする）
 * @param getMemberMonthlyTotal - アサイン率取得コールバック
 * @param fiscalYear - 対象年度
 * @param startMonth - 年度開始月
 */
export function calcDivisionExpectedRevenue(
  sections: Section[],
  allMembers: Member[],
  getMemberMonthlyTotal: (memberId: string, monthKey: string) => number,
  fiscalYear: number,
  startMonth: number,
): number {
  const sectionIds = new Set(sections.map((s) => s.id))
  const divisionMembers = allMembers.filter(
    (m) => m.sectionId !== null && sectionIds.has(m.sectionId),
  )
  return calcSectionExpectedRevenue(
    divisionMembers,
    getMemberMonthlyTotal,
    fiscalYear,
    startMonth,
  )
}

/**
 * メンバーがプロパー（自社）扱いかどうかを判定する
 *
 * 所属会社が未設定（companyId=null）の場合はプロパー扱いとする。
 * 所属会社が設定されている場合は、その会社の isInternal フラグに従う。
 *
 * @param member - 対象メンバー
 * @param companies - 所属会社マスタ一覧
 */
export function isProperMember(member: Member, companies: Company[]): boolean {
  if (!member.companyId) return true
  const company = companies.find((c) => c.id === member.companyId)
  return company?.isInternal ?? true
}

/**
 * 部レベルのプロパー人件費（見込み売上）を計算する
 *
 * プロパー社員（所属会社未設定、または isInternal=true の会社に所属）のみを対象とする。
 *
 * @param sections - 部門配下の課リスト
 * @param allMembers - 全メンバーリスト
 * @param companies - 所属会社マスタ一覧
 * @param getMemberMonthlyTotal - アサイン率取得コールバック
 * @param fiscalYear - 対象年度
 * @param startMonth - 年度開始月
 */
export function calcDivisionProperExpectedRevenue(
  sections: Section[],
  allMembers: Member[],
  companies: Company[],
  getMemberMonthlyTotal: (memberId: string, monthKey: string) => number,
  fiscalYear: number,
  startMonth: number,
): number {
  const properMembers = allMembers.filter((m) => isProperMember(m, companies))
  return calcDivisionExpectedRevenue(
    sections,
    properMembers,
    getMemberMonthlyTotal,
    fiscalYear,
    startMonth,
  )
}

/**
 * SaaS契約の年間コストを算出する（日割りなし。月次払いは月額×12ヶ月で計上）
 *
 * @param contract - SaaS契約
 * @returns 年間コスト
 */
export function calcSaasAnnualCost(contract: SaasContract): number {
  return contract.paymentCycle === 'monthly'
    ? contract.amount * 12
    : contract.amount
}

/**
 * 部門のSaaS契約年間コスト合計を算出する
 */
export function calcSaasContractsTotalCost(contracts: SaasContract[]): number {
  return contracts.reduce((sum, c) => sum + calcSaasAnnualCost(c), 0)
}

/**
 * SaaS契約の対象年度における実績合計を算出する（monthlyActualsの年度内合計）。
 *
 * @param contract - 対象のSaaS契約
 * @param monthKeys - 対象年度の月次キー一覧（"YYYY-MM"、getFiscalYearMonthKeysで生成）
 */
export function calcSaasActualTotal(
  contract: SaasContract,
  monthKeys: string[],
): number {
  const monthlyActuals = contract.monthlyActuals ?? {}
  return monthKeys.reduce((sum, month) => sum + (monthlyActuals[month] ?? 0), 0)
}

/**
 * 部門内の複数SaaS契約を横断した、対象年度における実績合計を算出する
 * （部門予算タブのSaaS費用列「実績合計」行に使用）
 */
export function calcSaasContractsActualTotal(
  contracts: SaasContract[],
  monthKeys: string[],
): number {
  return contracts.reduce(
    (sum, c) => sum + calcSaasActualTotal(c, monthKeys),
    0,
  )
}

/**
 * プロパー/プロパー以外のメンバーを月別に集計する。
 * 人員計画「人件費（プロパー/プロパー以外）」区分の実績人数に使用する。
 *
 * @param members - 対象メンバー一覧（部門所属メンバー）
 * @param companies - 所属会社マスタ一覧
 * @param isInternal - true=プロパーのみ、false=プロパー以外のみを集計対象とする
 * @param fiscalYear - 対象年度
 * @param startMonth - 年度開始月
 * @returns 月別実績人数（"YYYY-MM"キー）
 */
export function calcActiveHeadcountByMonth(
  members: Member[],
  companies: Company[],
  isInternal: boolean,
  fiscalYear: number,
  startMonth: number,
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const member of members) {
    if (isProperMember(member, companies) !== isInternal) continue
    const months = getActiveFiscalMonths(
      member.startDate,
      member.endDate,
      fiscalYear,
      startMonth,
    )
    for (const month of months) {
      result[month] = (result[month] ?? 0) + 1
    }
  }
  return result
}

/**
 * メンバーの年間売上予算を月別に算出する（calcRevenueBudgetの月別内訳版）。
 * アサイン率で按分せず、在籍していれば適用単価を全額計上する。
 */
export function calcRevenueBudgetMonthly(
  member: Member,
  fiscalYear: number,
  startMonth: number,
): Record<string, number> {
  const months = getActiveFiscalMonths(
    member.startDate,
    member.endDate,
    fiscalYear,
    startMonth,
  )
  const result: Record<string, number> = {}
  for (const month of months) {
    result[month] = getApplicableUnitPrice(member.unitPriceHistory, month)
  }
  return result
}

/**
 * 複数メンバーの年間売上予算を月別に合算する。
 * 人員計画「人件費（プロパー/プロパー以外）」区分の実績金額に使用する。
 */
export function calcMembersRevenueBudgetMonthly(
  members: Member[],
  fiscalYear: number,
  startMonth: number,
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const member of members) {
    const monthly = calcRevenueBudgetMonthly(member, fiscalYear, startMonth)
    for (const [month, amount] of Object.entries(monthly)) {
      result[month] = (result[month] ?? 0) + amount
    }
  }
  return result
}

/**
 * 概算額に係数をかけて超概算額を算出する（整数・万円に四捨五入）
 *
 * @param estimateAmount - 概算額（万円）
 * @param coefficient - 係数
 * @returns 超概算額（万円、整数）
 */
export function calcEstimateBreakdownAmount(
  estimateAmount: number,
  coefficient: number,
): number {
  return Math.round(estimateAmount * coefficient)
}

/**
 * 1人月あたりの人日数（人日→人月換算基準）。全社共通の固定値として、
 * WBS工数（人日）と月額の概算単価・人員計画の人数を人月ベースで揃える際に使用する。
 * 例: ProjectsPage.tsx の全プロジェクト合計工数表示、案件タブの総工数列・概算予算額算出、
 * 人員計画タブの案件工数比較パネル等で共通して参照する。
 */
export const WORKDAYS_PER_MONTH = 20

/**
 * 1人日あたりの労働時間（時間/人日）の既定値。CSV取込（時間単位の工数実績）の
 * 人日換算に使用する（P1-a）。設定で上書き可能（appSettings.hoursPerDay）
 */
export const HOURS_PER_DAY = 8

/**
 * 簡易FPの人時/FP（1ファンクションポイントあたりの工数、時間）の既定値。
 * ISBSG・IPAソフトウェア開発分析データ集で業務系新規開発の中央値が概ね8〜15人時/FPの
 * 帯にあることから置いた暫定値【仮定】。自社の完了案件から校正する前提
 * （`/estimates`の校正ヒント）。設定で上書き可能（appSettings.hoursPerFunctionPoint）
 */
export const HOURS_PER_FUNCTION_POINT = 10

/**
 * 案件の総工数（人月）×概算単価×係数から概算予算額を算出する（整数・万円に四捨五入）
 *
 * の是正: 概算単価（`estimatedUnitPrice`）は月額単価であるため、
 * 総工数は必ず人月換算（`WORKDAYS_PER_MONTH`で除算）した値を渡すこと。
 * 人日のまま渡すと概算予算額が実態の`WORKDAYS_PER_MONTH`倍過大になる（次元不一致）。
 *
 * @param totalEffortMonths - 案件の総工数（人月）
 * @param estimatedUnitPrice - 概算単価（万円/人月、全社共通）
 * @param coefficient - 係数（省略時は1＝係数なし）
 * @returns 概算予算額（万円、整数）
 */
export function calcProjectEstimateBudget(
  totalEffortMonths: number,
  estimatedUnitPrice: number,
  coefficient = 1,
): number {
  return Math.round(totalEffortMonths * estimatedUnitPrice * coefficient)
}

/**
 * 案件タブ用に、複数案件の概算予算額をまとめて算出する
 *
 * @param totalEffortsMonths - 案件別の総工数（人月、key: projectId）
 * @param estimatedUnitPrice - 概算単価（万円/人月、全社共通）
 * @param coefficients - 案件別の係数（key: projectId、value: 係数。未設定案件はdefaultCoefficientを使用）
 * @param defaultCoefficient - 係数のデフォルト値（省略時は1）
 * @returns 案件別の概算予算額（key: projectId、value: 万円）
 */
export function calcProjectEstimateBudgets(
  totalEffortsMonths: Map<string, number>,
  estimatedUnitPrice: number,
  coefficients: Map<string, number> = new Map(),
  defaultCoefficient = 1,
): Map<string, number> {
  const result = new Map<string, number>()
  for (const [projectId, totalEffortMonths] of totalEffortsMonths) {
    const coefficient = coefficients.get(projectId) ?? defaultCoefficient
    result.set(
      projectId,
      calcProjectEstimateBudget(
        totalEffortMonths,
        estimatedUnitPrice,
        coefficient,
      ),
    )
  }
  return result
}

/**
 * 対象月に適用される為替レート（1ドルあたりの円）を、履歴から求める。
 * effectiveFrom昇順に並べ、targetMonth以下の中で最も新しいエントリの値を採用する
 * （getApplicableUnitPriceと同じ探索ロジック）。
 *
 * @param history - 為替レート履歴（システム設定・全社共通）
 * @param targetMonth - 対象月 "YYYY-MM"
 * @returns 適用レート（円/＄1）。該当エントリが無い場合は0（未設定を表す）
 */
export function getApplicableExchangeRate(
  history: ExchangeRateEntry[],
  targetMonth: string,
): number {
  if (history.length === 0) return 0

  const sorted = [...history].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom),
  )

  let applicable = 0
  for (const entry of sorted) {
    if (entry.effectiveFrom <= targetMonth) {
      applicable = entry.rate
    } else {
      break
    }
  }

  return applicable
}

/**
 * ＄建て金額を、指定の為替レートで万円に換算する。
 * 為替レートは「1ドルあたりの円」のため、＄金額×レートで円、さらに10000で除算して万円にする。
 * 中間値は丸めない（複数月の合算後、表示時に丸める既存の他集計と揃える）。
 *
 * @param usdAmount - ＄建て金額
 * @param exchangeRateJpyPerUsd - 為替レート（円/＄1、getApplicableExchangeRateで取得）
 * @returns 万円換算額（未丸め）
 */
export function convertUsdToManYen(
  usdAmount: number,
  exchangeRateJpyPerUsd: number,
): number {
  return (usdAmount * exchangeRateJpyPerUsd) / 10000
}

/**
 * 予算管理画面で万円建て金額を表示する際の共通フォーマッタ。
 * 小数桁を常に2桁固定（ゼロパディング）で表示する。＄→万円換算(convertUsdToManYen)や
 * 係数計算由来の小数値と整数値が同一列内に混在すると桁が揃わず視認性が悪化するため、
 * 右寄せ・tabular-numsと組み合わせて統一する（docs/development-patterns.md §7.5参照）。
 */
export const manYenFormatter = new Intl.NumberFormat('ja-JP', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * 複数部門を横断して単一部門向け数値集計セレクタの結果を合算する汎用ヘルパー
 * （「全部門」集計）。既存の`divisionId: string`単一値のみ受け付ける
 * セレクタ（`getAiUsageTotal`等）のシグネチャ・ロジックは変更せず、部門ID配列でループして
 * 合算するだけの薄いラッパーとしてstores/budget-store.ts側から利用される。
 *
 * @param divisionIds - 集計対象の部門ID一覧
 * @param getValueForDivision - 単一部門の値を返す既存セレクタ呼び出し（呼び出し元でbind）
 * @returns 合算値。divisionIdsが空の場合は0
 */
export function sumAcrossDivisions(
  divisionIds: string[],
  getValueForDivision: (divisionId: string) => number,
): number {
  return divisionIds.reduce((sum, id) => sum + getValueForDivision(id), 0)
}

/**
 * 対象月がメンバーの契約単価対象範囲内かどうかを判定する。
 * 契約単価履歴（`contractUnitPriceHistory`）が空/未設定（内部リソース等、契約単価の概念が無い）
 * の場合は制約なしとしてtrueを返す。
 * 下限は契約単価履歴の最も古いeffectiveFrom、上限はMember.endDateの月（在籍中=nullなら上限なし）。
 * `features/assignment`（アサイン入力時のブロック型バリデーション）・`features/team`
 * （メンバー編集時の既存アサイン整合性チェック）の両方から参照するためshared化。
 */
export function isMonthWithinContractRange(
  member: Member,
  monthKey: string,
): boolean {
  const history = member.contractUnitPriceHistory
  if (!history || history.length === 0) return true

  const earliestEffectiveFrom = history.reduce(
    (earliest, entry) =>
      entry.effectiveFrom < earliest ? entry.effectiveFrom : earliest,
    history[0]?.effectiveFrom ?? monthKey,
  )
  if (monthKey < earliestEffectiveFrom) return false

  if (member.endDate) {
    const endMonth = member.endDate.slice(0, 7)
    if (monthKey > endMonth) return false
  }

  return true
}

/**
 * メンバー編集（契約単価履歴・endDateの変更）によって、既存アサインの中で
 * 「編集前は契約対象範囲内だったが、編集後は範囲外になる」月のみを検出する。
 * 編集前から既に範囲外だった月（今回の編集と無関係な既存データ不整合）は対象外とする
 * （「今回の編集で新たに範囲外になった分のみ」を確認ダイアログの対象とする設計判断）。
 *
 * @param oldMember - 編集前のメンバー情報
 * @param newMember - 編集後（保存直前）のメンバー情報
 * @param assignments - 全アサイン（呼び出し側でmemberId絞り込み不要、内部でフィルタする）
 * @returns 新たに範囲外になった{assignmentId, monthKey}の一覧
 */
export function getNewlyOutOfRangeAssignmentMonths(
  oldMember: Member,
  newMember: Member,
  assignments: AssignmentEntry[],
): { assignmentId: string; monthKey: string }[] {
  const result: { assignmentId: string; monthKey: string }[] = []
  const memberAssignments = assignments.filter(
    (a) => a.memberId === oldMember.id,
  )
  for (const assignment of memberAssignments) {
    for (const [monthKey, value] of Object.entries(assignment.monthlyValues)) {
      if (!(value > 0)) continue
      const wasValid = isMonthWithinContractRange(oldMember, monthKey)
      const isValidNow = isMonthWithinContractRange(newMember, monthKey)
      if (wasValid && !isValidNow) {
        result.push({ assignmentId: assignment.id, monthKey })
      }
    }
  }
  return result
}

/**
 * 年度の月次キー一覧（"YYYY-MM"形式、年度開始月から12ヶ月分）を生成する。
 * features/budget・features/dashboard・features/projects の複数featureから参照するため
 * shared に配置する（features間の直接依存を避ける）。
 *
 * @param fiscalYear - 対象年度
 * @param startMonth - 年度開始月（デフォルト: 4 = 4月始まり）
 */
export function getFiscalYearMonthKeys(
  fiscalYear: number,
  startMonth = 4,
): string[] {
  const months: string[] = []
  for (let fiscalMonth = 1; fiscalMonth <= 12; fiscalMonth++) {
    const calendarMonth = fiscalMonthToCalendarMonth(fiscalMonth, startMonth)
    const year = calendarMonth >= startMonth ? fiscalYear : fiscalYear + 1
    months.push(`${year}-${String(calendarMonth).padStart(2, '0')}`)
  }
  return months
}

/**
 * 予算消化率を計算する（実績 ÷ 予算 × 100）。予算総額が0以下の場合は0を返す（ゼロ除算ガード）。
 * アラート判定（isProjectBudgetOverrun等）が参照するためshared化
 * （実体は元features/budget/utils/expense-budget-utils.tsから移設、features側にリエクスポートあり）。
 */
export function calcConsumptionRate(
  budgetTotal: number,
  actualTotal: number,
): number {
  if (budgetTotal <= 0) return 0
  return (actualTotal / budgetTotal) * 100
}

/**
 * SaaS契約の次回更新日が警告しきい値以内かを判定する。
 * アラートセンター（features/dashboard）からも参照するためshared化。
 *
 * @param nextRenewalDate - 次回更新日 "YYYY-MM-DD"
 * @param referenceDate - 基準日（通常は現在日時）
 * @param thresholdMonths - 警告しきい値（月数、デフォルト2ヶ月）
 * @returns 基準日からしきい値月数以内（境界含む、更新日超過も含む）ならtrue
 */
export function isContractRenewalWarning(
  nextRenewalDate: string,
  referenceDate: Date,
  thresholdMonths = 2,
): boolean {
  const [year, month, day] = nextRenewalDate.split('-').map(Number) as [
    number,
    number,
    number,
  ]
  const renewal = new Date(year, month - 1, day)

  const threshold = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  )
  threshold.setMonth(threshold.getMonth() + thresholdMonths)

  return renewal <= threshold
}

/**
 * その他費用（BudgetBreakdown）の実績明細合計額を算出する。
 * actualRecordsが未設定または空配列の場合は0を返す。
 */
export function calcOtherExpenseActualTotal(breakdown: {
  actualRecords?: { amount: number }[]
}): number {
  return (breakdown.actualRecords ?? []).reduce(
    (sum, record) => sum + record.amount,
    0,
  )
}

/**
 * 複数のBudgetBreakdownレコードの実績明細合計を合算する。
 * 案件別損益（calcProjectProfitability）の実付帯費用算出が参照するためshared化。
 */
export function calcBudgetBreakdownActualRecordsTotal(
  breakdowns: { actualRecords?: { amount: number }[] }[],
): number {
  return breakdowns.reduce((sum, b) => sum + calcOtherExpenseActualTotal(b), 0)
}
