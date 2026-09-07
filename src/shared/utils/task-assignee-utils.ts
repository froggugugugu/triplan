/**
 * WBSタスクの担当者表示を導出する純関数。
 *
 * アサインは「タスク×担当者×月」の配分率として持っており、タスク自身は
 * 担当者フィールドを持たない。WBS画面で「このタスクは誰の仕事か」を知るために、
 * **表示中の期間の配分率からの派生値**として担当者名を求める（データ追加はしない）。
 *
 * 主担当＝対象期間の配分合計が最大のメンバー。同率のときは氏名順で決める
 * （実行のたびに表示が入れ替わらないよう、並びを決定論的にする）。
 */

/** 担当者の解決に必要な最小形（`AssignmentEntry`をそのまま渡せる） */
export interface TaskAssigneeAssignment {
  taskId: string
  memberId: string
  monthlyValues: Record<string, number>
  actualMonthlyValues?: Record<string, number>
}

/** 担当者の解決に必要な最小形（`Member`をそのまま渡せる） */
export interface TaskAssigneeMember {
  id: string
  name: string
}

export interface TaskAssignee {
  /** 主担当の氏名 */
  primaryName: string
  /** 主担当以外の人数。0なら単独 */
  otherCount: number
}

/**
 * タスクid → 担当者表示 のマップを作る。
 *
 * 呼び出し側（WbsPage）が一度だけ作ってグリッドへ渡す前提。
 * 行ごとに呼ぶとO(タスク数 × アサイン数)になるため、まとめて1回で構築する。
 *
 * @param monthKeys 集計対象の月（"YYYY-MM"）。通常は表示年度の12ヶ月
 */
export function buildTaskAssigneeMap(
  assignments: readonly TaskAssigneeAssignment[],
  members: readonly TaskAssigneeMember[],
  monthKeys: readonly string[],
): Map<string, TaskAssignee> {
  const memberById = new Map(members.map((m) => [m.id, m]))
  // taskId → (memberId → 配分合計)
  const totals = new Map<string, Map<string, number>>()

  for (const assignment of assignments) {
    // 退職等でメンバーが消えたアサインは表示しない（存在しない名前を出さない）
    if (!memberById.has(assignment.memberId)) continue

    let total = 0
    for (const month of monthKeys) {
      // 実績の例外入力がある月はそれを、無ければ計画値を見る（AC解決と同じ規則）
      total +=
        assignment.actualMonthlyValues?.[month] ??
        assignment.monthlyValues[month] ??
        0
    }
    // 対象期間に配分が無いアサインは担当扱いしない
    // （過去に外れた担当がいつまでも表示されるのを防ぐ）
    if (total <= 0) continue

    const byMember = totals.get(assignment.taskId) ?? new Map<string, number>()
    byMember.set(
      assignment.memberId,
      (byMember.get(assignment.memberId) ?? 0) + total,
    )
    totals.set(assignment.taskId, byMember)
  }

  const result = new Map<string, TaskAssignee>()
  for (const [taskId, byMember] of totals) {
    const ranked = [...byMember.entries()]
      .map(([memberId, value]) => ({
        name: memberById.get(memberId)?.name ?? '',
        value,
      }))
      .sort((a, b) =>
        // 配分の多い順。同率は氏名順で決定論的に
        b.value !== a.value ? b.value - a.value : a.name.localeCompare(b.name),
      )
    const primary = ranked[0]
    if (!primary) continue
    result.set(taskId, {
      primaryName: primary.name,
      otherCount: ranked.length - 1,
    })
  }
  return result
}

/** グリッド表示用の文字列（「山田太郎 他2名」）。担当なしは空文字 */
export function formatTaskAssignee(assignee: TaskAssignee | undefined): string {
  if (!assignee) return ''
  return assignee.otherCount > 0
    ? `${assignee.primaryName} 他${assignee.otherCount}名`
    : assignee.primaryName
}
