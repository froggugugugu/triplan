import type { AssignmentEntry } from '@/shared/types/assignment'
import type { EffortEntry } from '@/shared/types/effort'
import type { Member } from '@/shared/types/member'
import type { Project, ProjectTreeNode } from '@/shared/types/project'
import type {
  BaselineAllocation,
  ProjectBaseline,
} from '@/shared/types/project-baseline'
import type { ProjectProgressEntry } from '@/shared/types/project-progress'
import type { ScheduleEntry } from '@/shared/types/schedule'
import { getApplicableUnitPrice } from '@/shared/utils/budget-utils'
import {
  formatDateOnly,
  getIsoWeekMonday,
  getIsoWeekSunday,
  getIsoWeeksInRange,
} from '@/shared/utils/iso-week-utils'
import { calcWbsProgressAtDate } from '@/shared/utils/wbs-progress-utils'

const MS_PER_DAY = 24 * 60 * 60 * 1000

function daysBetween(dateStrA: string, dateStrB: string): number {
  const [ay, am, ad] = dateStrA.split('-').map(Number) as [
    number,
    number,
    number,
  ]
  const [by, bm, bd] = dateStrB.split('-').map(Number) as [
    number,
    number,
    number,
  ]
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / MS_PER_DAY,
  )
}

function getMonthKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function daysInMonth(monthKey: string): number {
  const [year, month] = monthKey.split('-').map(Number) as [number, number]
  return new Date(year, month, 0).getDate()
}

/**
 * 対象月が、週の基準日（日曜日）時点でどれだけ経過済みかの割合を返す（月内日数按分）。
 * 基準日の月より前の月は1（全額経過）、後の月は0（未到来）、基準日と同月は
 * 「基準日の日 / その月の日数」で按分する。
 */
function getMonthEarnedRatio(month: string, referenceDate: Date): number {
  const currentMonth = getMonthKey(referenceDate)
  if (month < currentMonth) return 1
  if (month > currentMonth) return 0
  return referenceDate.getDate() / daysInMonth(month)
}

/**
 * メンバーの対象月の人件費単価を返す。契約単価履歴（実際の支払い用）を優先し、
 * 未設定（空配列）の場合は通常の単価履歴にフォールバックする
 * （内部リソース等、契約単価を持たないメンバーのACが不当に0近くまで下振れするのを防ぐため）。
 */
function getApplicableLaborUnitPrice(member: Member, month: string): number {
  const history =
    member.contractUnitPriceHistory &&
    member.contractUnitPriceHistory.length > 0
      ? member.contractUnitPriceHistory
      : member.unitPriceHistory
  return getApplicableUnitPrice(history, month)
}

/**
 * 年度の週次キー一覧（ISO週番号、年度開始月から翌年度開始月前日まで）を昇順で生成する。
 * 週の月曜日が年度期間内に収まる週のみを対象とする（隣接年度と重複しないため）。
 *
 * @param fiscalYear - 対象年度
 * @param startMonth - 年度開始月（デフォルト: 4 = 4月始まり）
 */
export function getFiscalYearWeekKeys(
  fiscalYear: number,
  startMonth = 4,
): string[] {
  const fyStartYear = fiscalYear
  const fyEndYear = startMonth === 1 ? fiscalYear : fiscalYear + 1
  const fyEndMonth = startMonth === 1 ? 12 : startMonth - 1
  const fyEndDay = new Date(fyEndYear, fyEndMonth, 0).getDate()

  const startDate = `${fyStartYear}-${String(startMonth).padStart(2, '0')}-01`
  const endDate = `${fyEndYear}-${String(fyEndMonth).padStart(2, '0')}-${String(fyEndDay).padStart(2, '0')}`

  const candidateWeeks = getIsoWeeksInRange(startDate, endDate)

  return candidateWeeks.filter((weekKey) => {
    const monday = formatDateOnly(getIsoWeekMonday(weekKey))
    return monday >= startDate && monday <= endDate
  })
}

function getOverallScheduleRange(
  scheduleEntries: ScheduleEntry[],
): { start: string; end: string } | null {
  if (scheduleEntries.length === 0) return null
  let start = scheduleEntries[0]?.startDate as string
  let end = scheduleEntries[0]?.endDate as string
  for (const entry of scheduleEntries) {
    if (entry.startDate < start) start = entry.startDate
    if (entry.endDate > end) end = entry.endDate
  }
  return { start, end }
}

/**
 * 週時点の累積PV（計画値）を算出する（直線按分モデル）。
 * ScheduleEntryが1件も無い場合は0を返す（EVM対象外の案件からの防御的な呼び出しを想定）。
 */
export function calcPvAtWeek(
  weekKey: string,
  scheduleEntries: ScheduleEntry[],
  budgetTotal: number,
): number {
  const range = getOverallScheduleRange(scheduleEntries)
  if (!range) return 0

  const sundayDateStr = formatDateOnly(getIsoWeekSunday(weekKey))
  if (sundayDateStr < range.start) return 0
  if (sundayDateStr >= range.end) return Math.round(budgetTotal)

  const totalDays = daysBetween(range.start, range.end) + 1
  const elapsedDays = daysBetween(range.start, sundayDateStr) + 1
  return Math.round(budgetTotal * (elapsedDays / totalDays))
}

/**
 * ベースラインの月次計画コストから、週時点の累積PV（計画値）を算出する
 * （非公開の設計文書）。月内日数按分は`calcAcAtWeek`と同じ
 * `getMonthEarnedRatio`（週の基準日＝日曜日）を用いるため、PVとACで按分方法が揃う。
 *
 * アサイン計画は時期に応じて配分が変わるため、その累積は自然に曲線（立ち上がり・ピーク・
 * 収束）を描く。スケジュール期間の均等按分（`calcPvAtWeek`）と異なり、実際のコスト発生の
 * 山をそのまま表現できる。
 *
 * **月次計画コストは「配分の形」としてのみ使い、総額はBACに一致させる。**
 * BAC（WBS工数×概算単価×係数）とアサイン計画の総額は必ずしも一致しない（体制が
 * 組みきれていない案件ではアサイン側が小さくなる）が、PVの終点がBACと食い違うと
 * 「計画どおり完了してもPVがBACに届かない」状態になりEVMが破綻する。そのため
 * 月次の比率のみを採用してBACへスケールする。
 *
 * アサイン計画が1件も無い（総額0）場合はPVを算出できないため0を返す。
 * 呼び出し元（`calcEvmSeries`）はこの場合スケジュール期間の均等按分へフォールバックする。
 */
export function calcPvFromBaseline(
  weekKey: string,
  monthlyPlannedCost: Record<string, number>,
  bacAmount: number,
): number {
  let totalPlanned = 0
  for (const cost of Object.values(monthlyPlannedCost)) {
    totalPlanned += cost
  }
  if (totalPlanned <= 0) return 0

  const referenceDate = getIsoWeekSunday(weekKey)
  let earned = 0
  for (const [month, cost] of Object.entries(monthlyPlannedCost)) {
    earned += cost * getMonthEarnedRatio(month, referenceDate)
  }
  return Math.round(bacAmount * (earned / totalPlanned))
}

/** ベースラインがPV曲線の根拠として使えるか（月次計画コストが1円以上あるか）を判定する */
export function hasPlannedCost(baseline: ProjectBaseline): boolean {
  return Object.values(baseline.monthlyPlannedCost).some((cost) => cost > 0)
}

/**
 * 凍結時の配分率スナップショットと**最新の単価**から月次計画コストを再構築する
 * （`Project.evmUnitPriceMode='latest'`用、非公開の設計文書）。
 *
 * BP単価の一斉改定など、プロジェクトの巧拙と無関係な外部要因による変動を
 * コスト差異（CV）として扱いたくない場合に使う。PVもACも同じ最新単価を参照するため、
 * CVには純粋な稼働量の差だけが残る。
 */
export function rebuildPlannedCostWithLatestPrices(
  plannedAllocations: BaselineAllocation[],
  members: Member[],
): Record<string, number> {
  const memberMap = new Map(members.map((m) => [m.id, m]))
  const monthlyPlannedCost: Record<string, number> = {}
  for (const allocation of plannedAllocations) {
    const member = memberMap.get(allocation.memberId)
    if (!member) continue
    for (const [month, ratio] of Object.entries(allocation.monthlyValues)) {
      if (ratio <= 0) continue
      monthlyPlannedCost[month] =
        (monthlyPlannedCost[month] ?? 0) +
        ratio * getApplicableLaborUnitPrice(member, month)
    }
  }
  for (const month of Object.keys(monthlyPlannedCost)) {
    monthlyPlannedCost[month] = Math.round(monthlyPlannedCost[month] as number)
  }
  return monthlyPlannedCost
}

/**
 * 単価モードに応じたPV算出用の月次計画コストを返す。
 * `latest`モードで配分率スナップショットが空（旧データ等）の場合は、
 * 凍結時の金額（`monthlyPlannedCost`）にフォールバックする。
 */
export function resolvePlannedCost(
  baseline: ProjectBaseline,
  unitPriceMode: 'frozen' | 'latest' | undefined,
  members: Member[],
): Record<string, number> {
  if (unitPriceMode !== 'latest') return baseline.monthlyPlannedCost
  if (baseline.plannedAllocations.length === 0) {
    return baseline.monthlyPlannedCost
  }
  const rebuilt = rebuildPlannedCostWithLatestPrices(
    baseline.plannedAllocations,
    members,
  )
  return Object.keys(rebuilt).length > 0 ? rebuilt : baseline.monthlyPlannedCost
}

/** 再ベースラインを促す既定のしきい値（現行BACとベースラインBACの乖離率、±10%） */
export const BASELINE_STALE_THRESHOLD = 0.1

// ── プロジェクトサマリー統合ビューの判定閾値（非公開の設計文書）。
// 判定ロジック本体はfeatures/projects/utils/project-summary-utils.tsだが、既定値は
// 全社設定（appSettings）のフォールバックとしてstores/budget-storeからも参照するため、
// stores→features依存禁止に従いBASELINE_STALE_THRESHOLDと同じくshared層に置く ──
/** R4 予算先行: 予算消化率−進捗率がこの比率を超えたら警告（0.15=15pt） */
export const SUMMARY_BUDGET_PROGRESS_GAP_THRESHOLD = 0.15
/** R5 SPI低下: 直近週のSPI（EV/PV）がこの値未満なら警告 */
export const SUMMARY_SPI_WARNING_THRESHOLD = 0.9

/**
 * 有効なベースラインが現況から乖離しており、再ベースラインすべきかを判定する
 * （非公開の設計文書）。
 *
 * BACはWBS工数から自動追従するため、要件が増えると現行BACだけが増え、
 * PVのベースラインが取り残される。この状態を放置するとEVがPVを常に上回り
 * SPIが実態を示さなくなるため、乖離を検知して凍結し直すよう促す。
 *
 * ベースライン未凍結（null）の場合はfalse（凍結自体を促すのは別のUIの役割）。
 */
export function isBaselineStale(
  currentBac: number,
  baseline: ProjectBaseline | null | undefined,
  thresholdRatio = BASELINE_STALE_THRESHOLD,
): boolean {
  if (!baseline) return false
  // 凍結時のBACが0（工数未入力で凍結した等）の場合は、現行BACが付いた時点で乖離とみなす
  if (baseline.bacAmount <= 0) return currentBac > 0
  const diffRatio =
    Math.abs(currentBac - baseline.bacAmount) / baseline.bacAmount
  return diffRatio > thresholdRatio
}

/**
 * 有効なベースライン（対象案件で最大のversionを持つレコード）を返す。
 * 1件も無い場合はnull（`getCurrentSkillLevel`等と同じ「履歴から現況を導出する」パターン）。
 */
export function getActiveBaseline(
  baselines: ProjectBaseline[],
  projectId: string,
): ProjectBaseline | null {
  let active: ProjectBaseline | null = null
  for (const baseline of baselines) {
    if (baseline.projectId !== projectId) continue
    if (!active || baseline.version > active.version) active = baseline
  }
  return active
}

export interface BaselineSnapshot {
  monthlyPlannedCost: Record<string, number>
  plannedAllocations: BaselineAllocation[]
}

/**
 * 現在のアサイン計画から、ベースラインへ凍結する月次計画コストと配分率を構築する。
 * 単価は`calcAcAtWeek`と同一の解決（契約単価優先・通常単価フォールバック）を使うため、
 * 計画どおりに動いた場合はPVとACが一致する。
 *
 * 同一メンバーが同一案件の複数タスクにアサインされている場合、配分率は月ごとに合算する。
 */
export function buildBaselineSnapshot(
  projectId: string,
  assignments: AssignmentEntry[],
  members: Member[],
): BaselineSnapshot {
  const memberMap = new Map(members.map((m) => [m.id, m]))
  const monthlyPlannedCost: Record<string, number> = {}
  const allocationByMember = new Map<string, Record<string, number>>()

  for (const assignment of assignments) {
    if (assignment.projectId !== projectId) continue
    const member = memberMap.get(assignment.memberId)
    if (!member) continue
    for (const [month, ratio] of Object.entries(assignment.monthlyValues)) {
      if (ratio <= 0) continue
      const unitPrice = getApplicableLaborUnitPrice(member, month)
      monthlyPlannedCost[month] =
        (monthlyPlannedCost[month] ?? 0) + ratio * unitPrice

      const monthlyValues = allocationByMember.get(assignment.memberId) ?? {}
      monthlyValues[month] = (monthlyValues[month] ?? 0) + ratio
      allocationByMember.set(assignment.memberId, monthlyValues)
    }
  }

  for (const month of Object.keys(monthlyPlannedCost)) {
    monthlyPlannedCost[month] = Math.round(monthlyPlannedCost[month] as number)
  }

  return {
    monthlyPlannedCost,
    plannedAllocations: [...allocationByMember.entries()].map(
      ([memberId, monthlyValues]) => ({ memberId, monthlyValues }),
    ),
  }
}

/**
 * 指定週以下で最新の進捗率エントリを返す（getApplicableUnitPrice等と同じ探索パターン）。
 * 該当エントリが1件も無い場合はnull（「未記録」を0%と区別するため）。
 */
export function getProgressRateAtWeekOrNull(
  weekKey: string,
  weeklyProgress: Record<string, number>,
): number | null {
  const entries = Object.entries(weeklyProgress).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )
  let applicable: number | null = null
  for (const [key, value] of entries) {
    if (key <= weekKey) {
      applicable = value
    } else {
      break
    }
  }
  return applicable
}

/**
 * 指定週以下で最新の進捗率エントリを返す。該当エントリが無い場合は0。
 */
export function getProgressRateAtWeek(
  weekKey: string,
  weeklyProgress: Record<string, number>,
): number {
  return getProgressRateAtWeekOrNull(weekKey, weeklyProgress) ?? 0
}

/**
 * WBSの完了チェックから進捗率を導出するための入力（非公開の設計文書）。
 */
export interface WbsProgressSource {
  /** 対象案件のツリーノード（配下のタスクを含む） */
  node: ProjectTreeNode
  /** 有効な工数列のID一覧 */
  columnIds: string[]
  efforts: EffortEntry[]
}

/**
 * 週時点の進捗率を決定する。週次の手入力（`ProjectProgressEntry`）に該当週以下の記録が
 * あればそれを優先し、無ければWBSの完了チェック（`Project.completedAt`）から工数加重で
 * 導出する。手入力は「明示的に上書きした」ことを意味するため優先する
 * （無操作なら自動算出が効く、という入力負担の設計原則。非公開の設計文書）。
 * どちらも無い場合は0。
 */
export function resolveProgressRateAtWeek(
  weekKey: string,
  weeklyProgress: Record<string, number>,
  wbsSource?: WbsProgressSource | null,
): number {
  const manual = getProgressRateAtWeekOrNull(weekKey, weeklyProgress)
  if (manual !== null) return manual
  if (!wbsSource) return 0
  return calcWbsProgressAtDate(
    wbsSource.node,
    wbsSource.columnIds,
    wbsSource.efforts,
    formatDateOnly(getIsoWeekSunday(weekKey)),
  )
}

/**
 * 週時点の累積EV（出来高）を算出する（進捗率×予算総額）。
 * `wbsSource`を渡すと、週次の手入力が無い週はWBS完了チェックからの工数加重進捗率で補う。
 */
export function calcEvAtWeek(
  weekKey: string,
  weeklyProgress: Record<string, number>,
  budgetTotal: number,
  wbsSource?: WbsProgressSource | null,
): number {
  return Math.round(
    budgetTotal * resolveProgressRateAtWeek(weekKey, weeklyProgress, wbsSource),
  )
}

/**
 * 週時点の累積AC（実コスト）を算出する。対象案件のAssignmentEntry（月次アサイン率）×
 * メンバーの人件費単価（契約単価優先、未設定時は通常単価にフォールバック）を、
 * 月内日数按分（週の基準日=日曜日）で週次に変換して合算する（人件費のみ。PVと算出基盤を揃える設計判断）。
 */
export function calcAcAtWeek(
  weekKey: string,
  assignments: AssignmentEntry[],
  members: Member[],
  projectId: string,
): number {
  const referenceDate = getIsoWeekSunday(weekKey)
  const memberMap = new Map(members.map((m) => [m.id, m]))
  let total = 0
  for (const assignment of assignments) {
    if (assignment.projectId !== projectId) continue
    const member = memberMap.get(assignment.memberId)
    if (!member) continue
    // 計画に無い月へ実績だけが入力されるケース（計画外の稼働）も拾うため和集合で回す
    const months = new Set([
      ...Object.keys(assignment.monthlyValues),
      ...Object.keys(assignment.actualMonthlyValues ?? {}),
    ])
    for (const month of months) {
      const earnedRatio = getMonthEarnedRatio(month, referenceDate)
      if (earnedRatio <= 0) continue
      // 実績の例外入力があればそれを、無ければ計画値を使う（無操作＝計画どおり、
      // 非公開の設計文書）。未入力を0として扱わないことが要点
      const ratio =
        assignment.actualMonthlyValues?.[month] ??
        assignment.monthlyValues[month] ??
        0
      const unitPrice = getApplicableLaborUnitPrice(member, month)
      total += ratio * earnedRatio * unitPrice
    }
  }
  return Math.round(total)
}

type EligibleProject = Pick<Project, 'id' | 'level' | 'divisionId'>

/**
 * 週次進捗率入力の対象案件かどうかを判定する。
 * ①トップレベル案件、②divisionIdが選択中部門と一致、③ScheduleEntryが1件以上存在
 */
export function isEvmInputEligible(
  project: EligibleProject,
  scheduleEntries: ScheduleEntry[],
  selectedDivisionId: string,
): boolean {
  if (project.level !== 0) return false
  if (project.divisionId !== selectedDivisionId) return false
  return scheduleEntries.some((e) => e.projectId === project.id)
}

/**
 * PV/EV/ACチャート表示の対象案件かどうかを判定する。
 * isEvmInputEligibleの条件に加え、④EVが算出できること
 * （`ProjectProgressEntry`が1件以上存在＝週次の手入力済み、**または**
 * WBSに完了チェック済みのタスクが1件以上ある＝工数加重で自動導出できる）。
 *
 * `wbsProgressAvailable`には`hasAnyCompletedTask(node)`の結果を渡す。省略時はfalse
 * （週次手入力のみを条件とする従来動作）。
 */
export function isEvmChartEligible(
  project: EligibleProject,
  scheduleEntries: ScheduleEntry[],
  progressEntries: ProjectProgressEntry[],
  selectedDivisionId: string,
  wbsProgressAvailable = false,
): boolean {
  if (!isEvmInputEligible(project, scheduleEntries, selectedDivisionId)) {
    return false
  }
  if (progressEntries.some((e) => e.projectId === project.id)) return true
  return wbsProgressAvailable
}

export interface EvmWeekPoint {
  week: string
  pv: number
  ev: number
  ac: number
}

export interface CalcEvmSeriesInput {
  weekKeys: string[]
  projectId: string
  scheduleEntries: ScheduleEntry[]
  /** 週次の手入力進捗率（記録のある週のみ。無ければwbsSourceで補う） */
  weeklyProgress: Record<string, number>
  assignments: AssignmentEntry[]
  members: Member[]
  /**
   * 現行の完成時総予算（BAC）。ベースラインが無い場合のPV/EVの基準額として使う。
   * ベースラインがある場合はそちらの`bacAmount`が優先される
   */
  budgetTotal: number
  /** WBS完了チェックからEVを自動導出するための入力（省略時は手入力のみで算出） */
  wbsSource?: WbsProgressSource | null
  /**
   * 有効なベースライン。指定するとPVを凍結時の月次計画コストから引き（曲線になる）、
   * EVの基準額も`bacAmount`になる。未指定（＝未凍結の案件）はスケジュール期間の
   * 均等按分（従来動作）にフォールバックする
   */
  baseline?: ProjectBaseline | null
  /**
   * PV算出時の単価の扱い（`Project.evmUnitPriceMode`）。
   * 'latest'指定時はベースラインの配分率スナップショットへ最新単価を適用し直す。
   * 省略時は'frozen'（凍結時の金額をそのまま使う）
   */
  unitPriceMode?: 'frozen' | 'latest' | undefined
}

/**
 * 週配列に対してPV/EV/ACをまとめて算出する（EvmPanelのチャート用データソース）。
 * 引数が多く今後も増えるため、オブジェクト引数で受け取る。
 */
export function calcEvmSeries(input: CalcEvmSeriesInput): EvmWeekPoint[] {
  const {
    weekKeys,
    projectId,
    scheduleEntries,
    weeklyProgress,
    assignments,
    members,
    budgetTotal,
    wbsSource,
    baseline,
    unitPriceMode,
  } = input
  const projectSchedule = scheduleEntries.filter(
    (e) => e.projectId === projectId,
  )
  // PVとEVは同一のベースラインを基準にしなければSPIが意味を失うため、BACもベースライン側を優先する
  const effectiveBac = baseline ? baseline.bacAmount : budgetTotal
  const plannedCost = baseline
    ? resolvePlannedCost(baseline, unitPriceMode, members)
    : {}
  // 凍結済みでもアサイン計画が空だとPV曲線を引けないため、その場合は従来の均等按分に戻す
  const usesBaselineCurve = Object.values(plannedCost).some((cost) => cost > 0)
  return weekKeys.map((week) => ({
    week,
    pv: usesBaselineCurve
      ? calcPvFromBaseline(week, plannedCost, effectiveBac)
      : calcPvAtWeek(week, projectSchedule, effectiveBac),
    ev: calcEvAtWeek(week, weeklyProgress, effectiveBac, wbsSource),
    ac: calcAcAtWeek(week, assignments, members, projectId),
  }))
}
