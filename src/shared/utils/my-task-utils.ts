import {
  findRootProjectId,
  type PhaseLinkNode,
  type PhaseScheduleEntry,
  resolveTaskDueDate,
} from './task-phase-utils'

/**
 * 「自分の担当タスク」の行モデル。純関数。
 *
 * 本ツールは全画面が組織・案件の視点で作られており、担当者個人が自分の担当を
 * 見る場所が無かった。ここでは**金額を一切扱わない**（協力会社等のpartnerロールが
 * 主な受益者で、金額はそもそも見せられないため）。
 *
 * `task-creation-core.ts`と同じく外部型に依存しない最小インターフェースで受ける。
 */

/** 行の組み立てに必要なプロジェクト情報 */
export interface MyTaskProject extends PhaseLinkNode {
  code: string
  name: string
  level: number
  completed?: boolean
}

/** 行の組み立てに必要なアサイン情報 */
export interface MyTaskAssignment {
  taskId: string
  memberId: string
  monthlyValues: Record<string, number>
}

export interface MyTaskRow {
  taskId: string
  taskCode: string
  taskName: string
  /** ルート案件の名前（どの案件の作業か分かるように） */
  projectName: string
  projectId: string | null
  /** 所属工程の終了日。工程未設定・スケジュール未登録ならnull */
  dueDate: string | null
  /** 対象月レンジ内の配分合計（人月） */
  allocation: number
  completed: boolean
}

export interface BuildMyTaskRowsInput {
  /** ログインユーザーに紐づく担当者id。未紐づけならnull */
  memberId: string | null
  projects: readonly MyTaskProject[]
  assignments: readonly MyTaskAssignment[]
  scheduleEntries: readonly PhaseScheduleEntry[]
  /** 集計対象の月キー（"YYYY-MM"）。通常は表示年度の12ヶ月 */
  monthKeys: readonly string[]
}

/**
 * 自分に配分があるタスクを、期日の近い順（期日なしは末尾）で返す。
 *
 * 対象月レンジ内の配分が全て0のアサインは行にしない（過去に外れた担当が
 * 残り続けると「自分の担当」の意味が薄れるため）。
 */
export function buildMyTaskRows({
  memberId,
  projects,
  assignments,
  scheduleEntries,
  monthKeys,
}: BuildMyTaskRowsInput): MyTaskRow[] {
  if (!memberId) return []

  const byId = new Map(projects.map((p) => [p.id, p]))
  const months = new Set(monthKeys)

  /** taskId → 対象月の配分合計（同一タスクへの複数アサインは合算する） */
  const allocationByTask = new Map<string, number>()
  for (const assignment of assignments) {
    if (assignment.memberId !== memberId) continue
    let sum = 0
    for (const [month, value] of Object.entries(assignment.monthlyValues)) {
      if (months.has(month)) sum += value
    }
    if (sum <= 0) continue
    allocationByTask.set(
      assignment.taskId,
      (allocationByTask.get(assignment.taskId) ?? 0) + sum,
    )
  }

  const rows: MyTaskRow[] = []
  for (const [taskId, allocation] of allocationByTask) {
    const task = byId.get(taskId)
    // 削除済みタスクを参照するアサインは行にしない（存在しない行を出さない）
    if (!task) continue
    const rootId = findRootProjectId(taskId, projects)
    const root = rootId ? byId.get(rootId) : undefined
    rows.push({
      taskId,
      taskCode: task.code,
      taskName: task.name,
      projectName: root?.name ?? '',
      projectId: rootId,
      dueDate: resolveTaskDueDate(taskId, projects, scheduleEntries),
      allocation,
      completed: task.completed ?? false,
    })
  }

  // 締切から目を離さない並び: 期日の近い順。期日なしは末尾（同着はコード順で決定論的に）
  rows.sort((a, b) => {
    if (a.dueDate !== b.dueDate) {
      if (!a.dueDate) return 1
      if (!b.dueDate) return -1
      return a.dueDate < b.dueDate ? -1 : 1
    }
    return a.taskCode.localeCompare(b.taskCode)
  })
  return rows
}
