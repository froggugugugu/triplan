import type { ProjectTreeNode } from '@/shared/types'

/**
 * ツリーをフラット化（表示順を維持）
 */
export function flattenTree(nodes: ProjectTreeNode[]): ProjectTreeNode[] {
  const result: ProjectTreeNode[] = []
  for (const node of nodes) {
    result.push(node)
    if (node.children.length > 0) {
      result.push(...flattenTree(node.children))
    }
  }
  return result
}

/**
 * ツリーからノードを検索
 */
export function findNodeById(
  nodes: ProjectTreeNode[],
  id: string,
): ProjectTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findNodeById(node.children, id)
    if (found) return found
  }
  return undefined
}

/**
 * ノードの子孫IDをすべて取得
 */
export function getDescendantIds(node: ProjectTreeNode): string[] {
  const ids: string[] = []
  for (const child of node.children) {
    ids.push(child.id)
    ids.push(...getDescendantIds(child))
  }
  return ids
}
