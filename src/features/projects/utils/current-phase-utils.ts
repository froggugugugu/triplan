import type { PhaseDefinition, ScheduleEntry } from '@/shared/types/schedule'

/**
 * 指定日付を含む工程（ScheduleEntry）を決定論的に1件選択する。
 * 複数の工程が該当する場合はPhaseDefinition.sortOrderが最小のものを採用する。
 * 該当する工程が無い場合（未開始・完了後・スケジュール未設定）はnullを返す。
 * projectIdによる絞り込みは呼び出し側の責務とする（本関数は渡された配列全体を対象にする）。
 */
export function getCurrentPhase(
  scheduleEntries: ScheduleEntry[],
  phases: PhaseDefinition[],
  today: string,
): ScheduleEntry | null {
  const candidates = scheduleEntries.filter(
    (e) => e.startDate <= today && today <= e.endDate,
  )
  if (candidates.length === 0) return null

  const sortOrderByPhaseKey = new Map(
    phases.map((p) => [p.phaseKey, p.sortOrder]),
  )

  return candidates.reduce((best, current) => {
    const bestOrder =
      sortOrderByPhaseKey.get(best.phaseKey) ?? Number.MAX_SAFE_INTEGER
    const currentOrder =
      sortOrderByPhaseKey.get(current.phaseKey) ?? Number.MAX_SAFE_INTEGER
    return currentOrder < bestOrder ? current : best
  })
}
