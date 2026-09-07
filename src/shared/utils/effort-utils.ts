import type { EffortEntry } from '@/shared/types/effort'
import type { ProjectTreeNode } from '@/shared/types/project'

/**
 * 0.05刻みに丸める（nearest half-up）
 */
export function roundToHalf(value: number): number {
  return Math.round(value * 20) / 20
}

/**
 * 工数値（人日）を整数表示にフォーマット
 */
export function formatEffort(value: number): string {
  return value.toFixed(2)
}

/**
 * 入力文字列をパースして工数値に変換
 * - 空文字列 → 0
 * - 負の値 → null（無効）
 * - 有効な数値 → 0.05刻みに丸め
 */
export function parseEffortInput(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed === '') return 0
  const num = Number(trimmed)
  if (Number.isNaN(num)) return null
  if (num < 0) return null
  return roundToHalf(num)
}

/**
 * EffortEntryの配列からprojectId×columnIdで値を引くMap
 */
function buildEffortMap(efforts: EffortEntry[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const e of efforts) {
    map.set(`${e.projectId}:${e.columnId}`, e.value)
  }
  return map
}

/**
 * ロールアップ後の表示値を計算
 * Returns: Map<`${projectId}:${columnId}`, displayValue>
 *
 * - leaf行: effortsから直接取得（own value）
 * - non-leaf行: 子のdisplayValueの合計（読み取り専用）
 */
export function computeEffortDisplayValues(
  tree: ProjectTreeNode[],
  columnIds: string[],
  efforts: EffortEntry[],
): Map<string, number> {
  const effortMap = buildEffortMap(efforts)
  const result = new Map<string, number>()

  function walk(node: ProjectTreeNode): void {
    const isLeaf = node.children.length === 0

    for (const colId of columnIds) {
      if (isLeaf) {
        const val = effortMap.get(`${node.id}:${colId}`) ?? 0
        result.set(`${node.id}:${colId}`, val)
      } else {
        // 先に子を処理
        let sum = 0
        for (const child of node.children) {
          sum += result.get(`${child.id}:${colId}`) ?? 0
        }
        result.set(`${node.id}:${colId}`, roundToHalf(sum))
      }
    }
  }

  // post-order traversal: 子を先に処理してから親
  function postOrder(nodes: ProjectTreeNode[]): void {
    for (const node of nodes) {
      postOrder(node.children)
      walk(node)
    }
  }

  postOrder(tree)
  return result
}

/**
 * 案件（トップレベルの各ノード）ごとに、WBS工数列を横断した総工数を算出する。
 * Returns: Map<projectId, 総工数（人日）>
 */
export function computeProjectTotalEffort(
  tree: ProjectTreeNode[],
  columnIds: string[],
  efforts: EffortEntry[],
): Map<string, number> {
  const displayValues = computeEffortDisplayValues(tree, columnIds, efforts)
  const result = new Map<string, number>()

  for (const node of tree) {
    let total = 0
    for (const colId of columnIds) {
      total += displayValues.get(`${node.id}:${colId}`) ?? 0
    }
    result.set(node.id, roundToHalf(total))
  }

  return result
}

/**
 * What-ifシミュレーション（人・モノ・金の三位一体強化、ENHANCEMENT-ROADMAP §4）: 指定タスク
 * （とその配下）を除外した場合の総工数（人日）を試算する。excludedTaskIdsに含まれるノードの
 * 配下（自身含む）のEffortEntryを集計から除外し、computeProjectTotalEffortを再利用して
 * 再集計する（ロールアップロジックの重複を避ける）。実データ（efforts配列）は変更しない。
 */
export function calcWhatIfTotalEffort(
  root: ProjectTreeNode,
  columnIds: string[],
  efforts: EffortEntry[],
  excludedTaskIds: Set<string>,
): number {
  if (excludedTaskIds.size === 0) {
    return (
      computeProjectTotalEffort([root], columnIds, efforts).get(root.id) ?? 0
    )
  }

  const excludedIds = new Set<string>()
  function collect(node: ProjectTreeNode, ancestorExcluded: boolean): void {
    const isExcluded = ancestorExcluded || excludedTaskIds.has(node.id)
    if (isExcluded) excludedIds.add(node.id)
    for (const child of node.children) {
      collect(child, isExcluded)
    }
  }
  collect(root, false)

  const filteredEfforts = efforts.filter((e) => !excludedIds.has(e.projectId))
  return (
    computeProjectTotalEffort([root], columnIds, filteredEfforts).get(
      root.id,
    ) ?? 0
  )
}
