import type { ProjectTreeNode } from '@/shared/types/project'

// 進捗率の算出コアは shared/utils へ配置している（EV算出に使う evm-utils が shared 層にあり、
// shared → features の依存が禁止されているため。effort-utils と同じリエクスポート構成）
export {
  calcWbsProgress,
  calcWbsProgressAtDate,
  calcWbsProgressWeighted,
} from '@/shared/utils/wbs-progress-utils'

function collectIncompleteVisible(
  node: ProjectTreeNode,
  visible: Set<string>,
): boolean {
  if (node.children.length === 0) {
    if (!(node.completed ?? false)) {
      visible.add(node.id)
      return true
    }
    return false
  }
  let anyVisible = false
  for (const child of node.children) {
    if (collectIncompleteVisible(child, visible)) {
      anyVisible = true
    }
  }
  if (anyVisible) {
    visible.add(node.id)
  }
  return anyVisible
}

/**
 * 「未完了のみ表示」フィルタ（WBSグリッド）用の表示対象ID集合を算出する。
 * 未完了の最下層タスクと、その祖先（上位レベルの行）を表示対象に含める。
 * 配下の最下層タスクがすべて完了しているノード（枝ごと完了済み）は集合から除外される。
 * 木構造自体は変更せず、進捗率算出（calcWbsProgress）には影響しない
 * （flattenTree側で本集合をIDフィルタとしてのみ使用する）。
 */
export function getIncompleteVisibleIds(nodes: ProjectTreeNode[]): Set<string> {
  const visible = new Set<string>()
  for (const node of nodes) {
    collectIncompleteVisible(node, visible)
  }
  return visible
}

function collectMatchingVisible(
  node: ProjectTreeNode,
  needle: string,
  visible: Set<string>,
): boolean {
  const matched =
    node.name.toLowerCase().includes(needle) ||
    node.code.toLowerCase().includes(needle)
  let anyVisible = false
  for (const child of node.children) {
    if (collectMatchingVisible(child, needle, visible)) {
      anyVisible = true
    }
  }
  if (matched || anyVisible) {
    visible.add(node.id)
    return true
  }
  return false
}

/**
 * WBSグリッドのツリー内絞り込み用の表示対象ID集合を算出する。
 * 検索語（名前・コードの部分一致）にマッチしたノードと、**その祖先**を表示対象に含める。
 *
 * AG Gridの列フィルタを使わないのは、本グリッドが`flattenTree`でツリーを平坦化した行を
 * 渡しており、行を独立に絞ると親が消えて階層が壊れるため。`getIncompleteVisibleIds`と
 * 同じ流儀（マッチ＋祖先を残す）に揃えることで、両フィルタを積集合として併用できる。
 *
 * 空クエリは空集合を返す（呼び出し側でフィルタ自体を無効にする想定）。
 */
export function getMatchingVisibleIds(
  nodes: ProjectTreeNode[],
  query: string,
): Set<string> {
  const visible = new Set<string>()
  const needle = query.trim().toLowerCase()
  if (!needle) return visible
  for (const node of nodes) {
    collectMatchingVisible(node, needle, visible)
  }
  return visible
}
