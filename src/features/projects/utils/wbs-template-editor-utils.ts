import type { WbsTemplateNode } from '@/shared/types/wbs-template'

/**
 * WBSテンプレート編集画面（`WbsTemplateTreeGrid`）専用の編集中ノード型。
 * 永続化される`WbsTemplateNode`は安定したID・行識別子を持たない（プレーンな入れ子構造）ため、
 * AG Gridの行識別（getRowId）・展開状態管理・ドラッグ&ドロップの移動先判定に使う
 * クライアント側限定の`id`を付与する。`children`は常に配列（`WbsTemplateNode`はoptional）にして
 * 編集ロジックを単純化する。保存時は`fromEditorNodes`で`id`を除去し元の永続化形式へ戻す。
 */
export interface EditorNode {
  id: string
  name: string
  completionCriteria?: string
  /** 紐づけたドキュメントテンプレートのid。childrenと同様、編集中は常に配列 */
  documentTemplateIds: string[]
  children: EditorNode[]
}

/** 永続化済みツリーを編集用ツリーへ変換する（idを新規採番） */
export function toEditorNodes(nodes: WbsTemplateNode[]): EditorNode[] {
  return nodes.map((n) => ({
    id: crypto.randomUUID(),
    name: n.name,
    completionCriteria: n.completionCriteria,
    documentTemplateIds: n.documentTemplateIds ?? [],
    children: toEditorNodes(n.children ?? []),
  }))
}

/** 編集用ツリーを永続化形式へ変換する（idを除去。空配列のchildren/紐づけはキー自体を省略） */
export function fromEditorNodes(nodes: EditorNode[]): WbsTemplateNode[] {
  return nodes.map((n) => {
    const node: WbsTemplateNode = { name: n.name }
    if (n.completionCriteria) node.completionCriteria = n.completionCriteria
    if (n.documentTemplateIds.length > 0)
      node.documentTemplateIds = [...n.documentTemplateIds]
    if (n.children.length > 0) node.children = fromEditorNodes(n.children)
    return node
  })
}

/** ツリー全体のノード総数を再帰的に数える（一覧表示のタスク数バッジ等に使用） */
export function countTemplateNodes(nodes: WbsTemplateNode[]): number {
  return nodes.reduce(
    (sum, n) => sum + 1 + countTemplateNodes(n.children ?? []),
    0,
  )
}

function findEditorNode(
  nodes: EditorNode[],
  id: string,
): EditorNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    const found = findEditorNode(n.children, id)
    if (found) return found
  }
  return undefined
}

function mapNode(
  nodes: EditorNode[],
  id: string,
  fn: (n: EditorNode) => EditorNode,
): EditorNode[] {
  return nodes.map((n) => {
    if (n.id === id) return fn(n)
    return { ...n, children: mapNode(n.children, id, fn) }
  })
}

/** 指定idノードのname/completionCriteria/documentTemplateIdsを更新する */
export function updateEditorNode(
  nodes: EditorNode[],
  id: string,
  updates: Partial<
    Pick<EditorNode, 'name' | 'completionCriteria' | 'documentTemplateIds'>
  >,
): EditorNode[] {
  return mapNode(nodes, id, (n) => ({ ...n, ...updates }))
}

/** ルート直下に新しい工程ノードを追加する */
export function addRootEditorNode(
  nodes: EditorNode[],
  name = '新規工程',
): EditorNode[] {
  return [
    ...nodes,
    { id: crypto.randomUUID(), name, documentTemplateIds: [], children: [] },
  ]
}

/** 指定idノードの子として新しいタスクノードを追加する */
export function addChildEditorNode(
  nodes: EditorNode[],
  parentId: string,
  name = '新規タスク',
): EditorNode[] {
  return mapNode(nodes, parentId, (n) => ({
    ...n,
    children: [
      ...n.children,
      { id: crypto.randomUUID(), name, documentTemplateIds: [], children: [] },
    ],
  }))
}

/** 指定idノード（配下の子を含む）を削除する */
export function removeEditorNode(
  nodes: EditorNode[],
  id: string,
): EditorNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: removeEditorNode(n.children, id) }))
}

/** targetIdがancestorIdの子孫かどうかを判定する（ドラッグ時の自己/子孫ドロップ防止に使用） */
export function isDescendantEditorNode(
  nodes: EditorNode[],
  ancestorId: string,
  targetId: string,
): boolean {
  const ancestor = findEditorNode(nodes, ancestorId)
  if (!ancestor) return false
  function walk(n: EditorNode): boolean {
    return n.children.some((c) => c.id === targetId || walk(c))
  }
  return walk(ancestor)
}

/**
 * ドラッグ&ドロップ用: movingIdのノード（配下ごと）を、overIdのノードの末尾の子として移動する。
 * 自分自身・自分の子孫へのドロップは何もせず元のツリーをそのまま返す（安全側フォールバック）。
 */
export function moveEditorNode(
  nodes: EditorNode[],
  movingId: string,
  overId: string,
): EditorNode[] {
  if (movingId === overId) return nodes
  if (isDescendantEditorNode(nodes, movingId, overId)) return nodes
  const moving = findEditorNode(nodes, movingId)
  if (!moving) return nodes
  const withoutMoving = removeEditorNode(nodes, movingId)
  return mapNode(withoutMoving, overId, (n) => ({
    ...n,
    children: [...n.children, moving],
  }))
}

interface EditorNodeLocation {
  /** 兄弟配列（ルート配列 or 親のchildren配列）。所属先の実体をそのまま指す */
  siblings: EditorNode[]
  /** siblings内でのインデックス */
  index: number
  /** 親ノードのid。ルート直下の場合はnull */
  parentId: string | null
}

function locateEditorNode(
  nodes: EditorNode[],
  id: string,
  parentId: string | null = null,
): EditorNodeLocation | undefined {
  const index = nodes.findIndex((n) => n.id === id)
  if (index !== -1) return { siblings: nodes, index, parentId }
  for (const n of nodes) {
    const found = locateEditorNode(n.children, id, n.id)
    if (found) return found
  }
  return undefined
}

/** afterIdノードの直後（同じ配列内）に既存のノードオブジェクトを挿入する */
function insertAfter(
  nodes: EditorNode[],
  afterId: string,
  nodeToInsert: EditorNode,
): EditorNode[] {
  const index = nodes.findIndex((n) => n.id === afterId)
  if (index !== -1) {
    const next = [...nodes]
    next.splice(index + 1, 0, nodeToInsert)
    return next
  }
  return nodes.map((n) => ({
    ...n,
    children: insertAfter(n.children, afterId, nodeToInsert),
  }))
}

/**
 * WBS画面（Alt+Enter: 同階層追加）と同じ操作: afterIdノードの直後・同じ階層に
 * 新しい兄弟ノードを追加する。
 */
export function addSiblingAfterEditorNode(
  nodes: EditorNode[],
  afterId: string,
  name = '新規工程',
): EditorNode[] {
  return insertAfter(nodes, afterId, {
    id: crypto.randomUUID(),
    name,
    documentTemplateIds: [],
    children: [],
  })
}

/**
 * WBS画面（Alt+←: 階層上げ）と同じ操作: 指定idノードを、現在の親ノードの直後・
 * 1つ上の階層（祖父ノードの子、またはルート）へ移動する。
 * 既にルート直下（親を持たない）の場合は何も変更せず元のツリーを返す（呼び出し側でトースト表示する）。
 */
export function promoteEditorNode(
  nodes: EditorNode[],
  id: string,
): EditorNode[] {
  const location = locateEditorNode(nodes, id)
  if (!location || location.parentId === null) return nodes
  const node = findEditorNode(nodes, id)
  if (!node) return nodes
  const withoutNode = removeEditorNode(nodes, id)
  return insertAfter(withoutNode, location.parentId, node)
}

/**
 * WBS画面（Alt+→: 階層下げ）と同じ操作: 指定idノードを、直前の兄弟ノードの
 * 末尾の子として1つ下の階層へ移動する。
 * 直前の兄弟が存在しない（先頭の兄弟である）場合は何も変更せず元のツリーを返す
 * （呼び出し側でトースト表示する）。
 */
export function demoteEditorNode(
  nodes: EditorNode[],
  id: string,
): EditorNode[] {
  const location = locateEditorNode(nodes, id)
  if (!location || location.index === 0) return nodes
  const prevSiblingId = location.siblings[location.index - 1]?.id
  if (!prevSiblingId) return nodes
  const node = findEditorNode(nodes, id)
  if (!node) return nodes
  const withoutNode = removeEditorNode(nodes, id)
  return mapNode(withoutNode, prevSiblingId, (n) => ({
    ...n,
    children: [...n.children, node],
  }))
}
