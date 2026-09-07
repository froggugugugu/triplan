import type { EffortEntry } from '@/shared/types/effort'
import type { ProjectTreeNode } from '@/shared/types/project'
import { computeEffortDisplayValues } from '@/shared/utils/effort-utils'

interface LeafStats {
  completedLeaves: number
  totalLeaves: number
}

function collectLeafStats(node: ProjectTreeNode): LeafStats {
  if (node.children.length === 0) {
    return { completedLeaves: node.completed ? 1 : 0, totalLeaves: 1 }
  }
  return node.children.reduce<LeafStats>(
    (acc, child) => {
      const stats = collectLeafStats(child)
      return {
        completedLeaves: acc.completedLeaves + stats.completedLeaves,
        totalLeaves: acc.totalLeaves + stats.totalLeaves,
      }
    },
    { completedLeaves: 0, totalLeaves: 0 },
  )
}

/**
 * WBSタスクの進捗率（0.0〜1.0）をタスク数ベースで算出する（* `effort-utils.ts`の工数集計とは別軸のロールアップ）。最下層（子を持たないノード）は自身の
 * `completed`フラグをそのまま進捗率（0 or 1）とする。親・最上位（level0含む）は配下の
 * 最下層タスクの完了数/総数から算出する（ボトムアップ集計）。子が0件のノードは常に
 * 「自身が最下層」として扱われるため0除算は発生しない。
 *
 * 工数で重み付けした進捗率が必要な場合は `calcWbsProgressWeighted` を使う。
 */
export function calcWbsProgress(node: ProjectTreeNode): number {
  const { completedLeaves, totalLeaves } = collectLeafStats(node)
  if (totalLeaves === 0) return 0
  return completedLeaves / totalLeaves
}

interface WeightedStats extends LeafStats {
  completedEffort: number
  totalEffort: number
}

function collectWeightedStats(
  node: ProjectTreeNode,
  effortOf: (nodeId: string) => number,
  isDone: (node: ProjectTreeNode) => boolean,
): WeightedStats {
  if (node.children.length === 0) {
    const effort = effortOf(node.id)
    const done = isDone(node)
    return {
      completedEffort: done ? effort : 0,
      totalEffort: effort,
      completedLeaves: done ? 1 : 0,
      totalLeaves: 1,
    }
  }
  return node.children.reduce<WeightedStats>(
    (acc, child) => {
      const stats = collectWeightedStats(child, effortOf, isDone)
      return {
        completedEffort: acc.completedEffort + stats.completedEffort,
        totalEffort: acc.totalEffort + stats.totalEffort,
        completedLeaves: acc.completedLeaves + stats.completedLeaves,
        totalLeaves: acc.totalLeaves + stats.totalLeaves,
      }
    },
    { completedEffort: 0, totalEffort: 0, completedLeaves: 0, totalLeaves: 0 },
  )
}

/**
 * 指定した基準日時点のWBS進捗率（0.0〜1.0）を工数加重で算出する
 * （非公開の設計文書）。最下層タスクの工数（有効な工数列の合計）を重みとし、
 * 「完了済み工数の合計 / 全工数の合計」を返す。`calcWbsProgress`（タスク数ベース）と異なり、
 * 重いタスクと軽いタスクが同価値にならない。
 *
 * - `asOfDate`（`YYYY-MM-DD`）を指定すると、その日以前に完了した（`completedAt <= asOfDate`）
 *   タスクのみを完了として扱う。`null` の場合は日付を無視して現在の完了状況で算出する
 * - `completed=true` だが `completedAt` を持たない既存データは「日付不明」として常に完了扱いにする
 *   （未完了扱いにするとマイグレーション漏れの案件で現在の進捗率が過小評価されるため）
 * - 全タスクの工数が0（工数未入力の案件）の場合は工数加重が成立しないため、
 *   `calcWbsProgress` と同じタスク数ベースの集計へフォールバックする
 */
export function calcWbsProgressAtDate(
  node: ProjectTreeNode,
  columnIds: string[],
  efforts: EffortEntry[],
  asOfDate: string | null,
): number {
  const displayValues = computeEffortDisplayValues([node], columnIds, efforts)
  const effortOf = (nodeId: string): number => {
    let sum = 0
    for (const columnId of columnIds) {
      sum += displayValues.get(`${nodeId}:${columnId}`) ?? 0
    }
    return sum
  }
  const isDone = (target: ProjectTreeNode): boolean => {
    if (!(target.completed ?? false)) return false
    if (asOfDate === null) return true
    if (!target.completedAt) return true
    return target.completedAt <= asOfDate
  }

  const stats = collectWeightedStats(node, effortOf, isDone)
  if (stats.totalEffort > 0) {
    return stats.completedEffort / stats.totalEffort
  }
  if (stats.totalLeaves === 0) return 0
  return stats.completedLeaves / stats.totalLeaves
}

/**
 * 現在のWBS進捗率（0.0〜1.0）を工数加重で算出する。
 * `calcWbsProgressAtDate` に `asOfDate: null` を渡した場合と同義。
 */
export function calcWbsProgressWeighted(
  node: ProjectTreeNode,
  columnIds: string[],
  efforts: EffortEntry[],
): number {
  return calcWbsProgressAtDate(node, columnIds, efforts, null)
}

/**
 * 配下（自身を含む）に完了チェック済みのタスクが1件以上あるかを返す。
 * EVMチャートの表示条件判定（週次の手入力が無くてもWBSからEVを導出できるか）に使う。
 */
export function hasAnyCompletedTask(node: ProjectTreeNode): boolean {
  if (node.completed ?? false) return true
  return node.children.some(hasAnyCompletedTask)
}
