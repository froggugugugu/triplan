import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Member } from '@/shared/types/member'

/**
 * 対象月にメンバーが在籍しているか（`startDate`の月 ≤ 対象月 ≤ `endDate`の月）。
 * `isActive=false` のメンバーは在籍期間に関わらず供給に数えない。
 */
export function isMemberActiveInMonth(member: Member, month: string): boolean {
  if (!member.isActive) return false
  const start = member.startDate ? member.startDate.slice(0, 7) : null
  const end = member.endDate ? member.endDate.slice(0, 7) : null
  if (start && month < start) return false
  if (end && month > end) return false
  return true
}

export interface ResourceHistogramPoint {
  month: string
  /** 月次アサイン合計（人月）＝要員需要 */
  demand: number
  /** 在籍メンバーの稼働率上限の合計（人月）＝供給キャパシティ */
  supply: number
}

/**
 * 月ごとの要員需要（アサイン合計）と供給キャパシティ（在籍メンバーの稼働率上限合計）を
 * 算出する（非公開の設計文書）。「来期、人が足りるのか」を判断するための
 * 山積みグラフのデータソース。
 *
 * 需要側は`members`に含まれるメンバーのアサインのみを集計する（部門で絞り込んだ
 * メンバー配列を渡せば、その部門の需要と供給が対応する）。
 */
export function calcResourceHistogram(
  monthKeys: string[],
  members: Member[],
  assignments: AssignmentEntry[],
): ResourceHistogramPoint[] {
  const memberIds = new Set(members.map((m) => m.id))
  return monthKeys.map((month) => {
    let demand = 0
    for (const assignment of assignments) {
      if (!memberIds.has(assignment.memberId)) continue
      demand += assignment.monthlyValues[month] ?? 0
    }
    let supply = 0
    for (const member of members) {
      if (!isMemberActiveInMonth(member, month)) continue
      supply += member.capacityRatio ?? 1
    }
    return {
      month,
      demand: Math.round(demand * 100) / 100,
      supply: Math.round(supply * 100) / 100,
    }
  })
}

export interface ProjectMemberHistogramResult {
  /** Rechartsの積み上げ棒に渡す行データ（`{ month, [memberId]: 配分率 }`） */
  points: Record<string, string | number>[]
  /** 実際に配分のあるメンバーIDのみ（配分が全月0のメンバーは含めない） */
  memberIds: string[]
}

/**
 * 1案件について、月×メンバーのアサイン配分を積み上げ表示するためのデータを構築する
 * （非公開の設計文書）。案件の立ち上がり・ピーク・収束の形が見え、
 * ベースラインのPV曲線と同じデータの別表現になる。
 *
 * 同一メンバーが同一案件の複数タスクにアサインされている場合は月ごとに合算する。
 */
export function calcProjectMemberHistogram(
  monthKeys: string[],
  projectId: string,
  assignments: AssignmentEntry[],
): ProjectMemberHistogramResult {
  const totalsByMember = new Map<string, Map<string, number>>()

  for (const assignment of assignments) {
    if (assignment.projectId !== projectId) continue
    for (const [month, ratio] of Object.entries(assignment.monthlyValues)) {
      if (ratio <= 0) continue
      const byMonth = totalsByMember.get(assignment.memberId) ?? new Map()
      byMonth.set(month, (byMonth.get(month) ?? 0) + ratio)
      totalsByMember.set(assignment.memberId, byMonth)
    }
  }

  // 表示対象の月に1件も配分が無いメンバーは凡例に出さない
  const memberIds = [...totalsByMember.entries()]
    .filter(([, byMonth]) =>
      monthKeys.some((month) => (byMonth.get(month) ?? 0) > 0),
    )
    .map(([memberId]) => memberId)

  const points = monthKeys.map((month) => {
    const row: Record<string, string | number> = { month }
    for (const memberId of memberIds) {
      const value = totalsByMember.get(memberId)?.get(month) ?? 0
      row[memberId] = Math.round(value * 100) / 100
    }
    return row
  })

  return { points, memberIds }
}
