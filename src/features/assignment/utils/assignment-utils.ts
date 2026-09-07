import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Project } from '@/shared/types/project'
import type { ScheduleEntry } from '@/shared/types/schedule'
import { parseAllocationInput } from '@/shared/utils/allocation-input-utils'

/**
 * リエクスポート: 実体は shared/utils/budget-utils.ts（features間依存を避けるため）
 * （features/team からも参照するためshared化）
 */
export { isMonthWithinContractRange } from '@/shared/utils/budget-utils'
export { filterMembersByOrganization } from '@/shared/utils/member-filter'
/**
 * リエクスポート: 実体は shared/utils/（features間依存を避けるため）
 */
export { formatProjectNameWithConfidence } from '@/shared/utils/project-display'

/**
 * アサイン値を2桁ゼロパディングでフォーマット (例: 0.50)
 */
/** 稼働率上限の比較で浮動小数点の丸め誤差を吸収する許容値（development-patterns.md §3.2） */
const CAPACITY_EPSILON = 1e-9

/**
 * 月次アサイン合計がメンバーの稼働率上限（`Member.capacityRatio`、既定1.0）を超えているか。
 * 時短勤務・兼務・部分参画のメンバーは1.0未満の上限を持つため、固定値1.0で判定しない。
 */
export function isOverCapacity(
  total: number,
  capacityRatio: number | undefined,
): boolean {
  return total > (capacityRatio ?? 1) + CAPACITY_EPSILON
}

export function formatAssignmentValue(value: number): string {
  return value.toFixed(2)
}

/**
 * 全角数字・ピリオドを半角に変換してパースする
 * 無効な入力はnull、空は0を返す。計画値は上限1.0（人月）。
 * コアは`shared/utils/allocation-input-utils.ts`（P1-aで抽出。実績側は上限なしで使う）
 */
export function parseAssignmentInput(input: string): number | null {
  return parseAllocationInput(input, { max: 1 })
}

/**
 * 年度とスケジュール情報から月範囲を生成
 * fiscalYear: 年度（例: 2025 → 2025年4月〜2026年3月）
 * startMonth: 年度開始月（デフォルト: 4 = 4月始まり）
 * 戻り値: "YYYY-MM" 形式の配列
 */
export function getScheduleMonthRange(
  fiscalYear: number,
  startMonth = 4,
): string[] {
  const months: string[] = []
  for (let i = 0; i < 12; i++) {
    const calendarMonth = ((i + startMonth - 1) % 12) + 1
    const year = calendarMonth >= startMonth ? fiscalYear : fiscalYear + 1
    months.push(`${year}-${String(calendarMonth).padStart(2, '0')}`)
  }
  return months
}

/**
 * 担当者の月次合計を全アサインから計算
 */
export function calculateMemberMonthlyTotal(
  assignments: AssignmentEntry[],
  memberId: string,
  monthKey: string,
): number {
  return assignments
    .filter((a) => a.memberId === memberId)
    .reduce((sum, a) => sum + (a.monthlyValues[monthKey] ?? 0), 0)
}

/**
 * "YYYY-MM" から表示用月ラベルを取得 (例: "4月", "12月")
 */
export function getMonthLabel(monthKey: string): string {
  const parts = monthKey.split('-')
  const month = Number.parseInt(parts[1] ?? '0', 10)
  return `${month}月`
}

/**
 * "YYYY-MM" から年付き月ラベルを取得 (例: "25/4月", "26/1月")
 */
export function getMonthLabelWithYear(monthKey: string): string {
  const parts = monthKey.split('-')
  const year = Number.parseInt(parts[0] ?? '0', 10) % 100
  const month = Number.parseInt(parts[1] ?? '0', 10)
  return `${year}/${month}月`
}

/**
 * スケジュールエントリから月範囲を計算
 * 日程の最早開始月〜最遅終了月の範囲で "YYYY-MM" 配列を返す
 * エントリがない場合は空配列を返す
 */
export function getMonthRangeFromSchedule(entries: ScheduleEntry[]): string[] {
  if (entries.length === 0) return []

  let minDate = entries[0]?.startDate ?? ''
  let maxDate = entries[0]?.endDate ?? ''

  for (const entry of entries) {
    if (entry.startDate < minDate) minDate = entry.startDate
    if (entry.endDate > maxDate) maxDate = entry.endDate
  }

  // Extract YYYY-MM from YYYY-MM-DD
  const startYear = Number.parseInt(minDate.substring(0, 4), 10)
  const startMonth = Number.parseInt(minDate.substring(5, 7), 10)
  const endYear = Number.parseInt(maxDate.substring(0, 4), 10)
  const endMonth = Number.parseInt(maxDate.substring(5, 7), 10)

  const months: string[] = []
  let year = startYear
  let month = startMonth

  while (year < endYear || (year === endYear && month <= endMonth)) {
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
 * アサインを案件確度でフィルタリング
 * selectedConfidences に含まれる確度の案件に紐づくアサインのみ返す
 * null確度は '__null__' キーで表現
 * prebuiltProjectMap を渡すと再構築をスキップできる
 */
export function filterAssignmentsByConfidence(
  assignments: AssignmentEntry[],
  projects: Project[],
  selectedConfidences: Set<string>,
  prebuiltProjectMap?: Map<string, Project>,
): AssignmentEntry[] {
  const projectMap =
    prebuiltProjectMap ?? new Map(projects.map((p) => [p.id, p]))

  return assignments.filter((a) => {
    const project = projectMap.get(a.projectId)
    if (!project) return false
    const key = project.confidence ?? '__null__'
    return selectedConfidences.has(key)
  })
}
