/**
 * API起票の対象抽出コア（非公開の設計文書・§6.2）。
 * クライアントのドライランとサーバーの再検証が**同じ関数**を使うことで、
 * 「画面に出た件数」と「実際に起票される件数」が食い違わないことを保証する
 * （alert-utils.tsをサーバーの日次ダイジェストが再利用しているのと同じ整理）。
 *
 * すべて純関数。HTTP呼び出し・DB書込みは呼び出し側の責務。
 */

import type { PhaseScheduleEntry } from './task-phase-utils'
import { resolveTaskDueDate } from './task-phase-utils'

/** 起票対象の判定に必要なプロジェクト情報（Projectから必要フィールドだけを抜いた形） */
export interface TaskCreationCandidate {
  id: string
  code: string
  name: string
  parentId: string | null
  completionCriteria?: string | null
  externalSource?: string | null
  externalTaskId?: string | null
  /** 所属工程。期日の導出に使う。未設定は祖先から継承する */
  phaseKey?: string | null
}

export interface TaskCreationTarget {
  id: string
  code: string
  name: string
  completionCriteria: string | null
  /** 直近親の`[コード] 名前`。ルート直下のリーフはnull */
  group: string | null
  /**
   * 期日（`YYYY-MM-DD`）。所属工程のスケジュール終了日から導出する。
   * 工程が未設定・スケジュール未登録ならnull＝外部ツールへ期日を送らない
   */
  dueDate: string | null
}

export interface TaskCreationSkip {
  id: string
  code: string | null
  reason: string
}

export interface TaskCreationPlan {
  targets: TaskCreationTarget[]
  skips: TaskCreationSkip[]
}

/** 起票実行の結果（サーバーAPIのレスポンス形） */
export interface TaskCreationResult {
  created: Array<{ id: string; code: string; externalId: string }>
  skipped: TaskCreationSkip[]
  failed: Array<{ id: string; code: string; reason: string }>
}

/**
 * 起票対象を決める。指定ルート配下・リーフ・未起票のみが対象で、
 * それ以外は理由つきskip（誤起票・二重起票を構造的に防ぐ）。
 * 起票順序はタスクコード昇順（決定論・再現可能）。
 */
export function buildTaskCreationPlan(
  projects: TaskCreationCandidate[],
  rootProjectId: string,
  taskIds: string[],
  /**
   * 工程のスケジュール。期日の導出に使う。
   * 省略時は期日なしで起票する（既存の呼び出し元との後方互換）
   */
  scheduleEntries: readonly PhaseScheduleEntry[] = [],
): TaskCreationPlan {
  const byId = new Map(projects.map((p) => [p.id, p]))
  const parentIds = new Set(
    projects.map((p) => p.parentId).filter((id): id is string => id !== null),
  )

  // 指定ルート配下のid集合（ルート自身を含む）
  const inTree = new Set<string>()
  const collect = (id: string) => {
    inTree.add(id)
    for (const p of projects) {
      if (p.parentId === id) collect(p.id)
    }
  }
  collect(rootProjectId)

  const targets: TaskCreationTarget[] = []
  const skips: TaskCreationSkip[] = []

  for (const taskId of taskIds) {
    const task = byId.get(taskId)
    if (!task) {
      skips.push({
        id: taskId,
        code: null,
        reason: 'タスクが見つかりません（削除済みの可能性があります）',
      })
      continue
    }
    if (!inTree.has(taskId)) {
      skips.push({
        id: taskId,
        code: task.code,
        reason: '選択中プロジェクトの配下ではありません',
      })
      continue
    }
    if (parentIds.has(taskId)) {
      skips.push({
        id: taskId,
        code: task.code,
        reason: 'リーフタスクではありません（起票はリーフのみ対象）',
      })
      continue
    }
    if (task.externalTaskId) {
      // 別ツールで学習済みの場合も対象外（1タスク1外部ツールの原則。上書きすると
      // 完了同期の受け皿が黙って切り替わる）
      skips.push({
        id: taskId,
        code: task.code,
        reason: `起票済みです（${task.externalSource ?? '外部ツール'}: ${task.externalTaskId}）`,
      })
      continue
    }
    const parent = task.parentId ? byId.get(task.parentId) : undefined
    targets.push({
      id: task.id,
      code: task.code,
      name: task.name,
      completionCriteria: task.completionCriteria ?? null,
      group:
        parent && parent.id !== rootProjectId
          ? `[${parent.code}] ${parent.name}`
          : null,
      dueDate: resolveTaskDueDate(task.id, projects, scheduleEntries),
    })
  }

  targets.sort((a, b) => a.code.localeCompare(b.code))
  return { targets, skips }
}
