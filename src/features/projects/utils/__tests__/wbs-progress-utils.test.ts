import { describe, expect, it } from 'vitest'
import type { ProjectTreeNode } from '@/shared/types/project'
import {
  getIncompleteVisibleIds,
  getMatchingVisibleIds,
} from '../wbs-progress-utils'

// 進捗率算出（calcWbsProgress / calcWbsProgressWeighted / calcWbsProgressAtDate）のテストは
// 実体の配置先である src/shared/utils/__tests__/wbs-progress-utils.test.ts にある。
// 本ファイルは features 層固有のUIフィルタ（getIncompleteVisibleIds）のみを対象とする。

function makeNode(overrides: Partial<ProjectTreeNode> = {}): ProjectTreeNode {
  return {
    id: crypto.randomUUID(),
    code: 'P001',
    name: 'テスト',
    parentId: null,
    level: 0,
    status: 'active',
    confidence: null,
    completed: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    children: [],
    depth: 0,
    ...overrides,
  }
}

describe('getIncompleteVisibleIds', () => {
  it('未完了の最下層タスクのIDを含む', () => {
    const leaf = makeNode({ completed: false, children: [] })
    const visible = getIncompleteVisibleIds([leaf])
    expect(visible.has(leaf.id)).toBe(true)
  })

  it('完了済みの最下層タスクのIDは含まない', () => {
    const leaf = makeNode({ completed: true, children: [] })
    const visible = getIncompleteVisibleIds([leaf])
    expect(visible.has(leaf.id)).toBe(false)
  })

  it('未完了の子を持つ祖先（level0/level1）は表示対象に含める', () => {
    const child = makeNode({ level: 2, completed: false, children: [] })
    const parent = makeNode({ level: 1, children: [child] })
    const root = makeNode({ level: 0, children: [parent] })
    const visible = getIncompleteVisibleIds([root])
    expect(visible.has(root.id)).toBe(true)
    expect(visible.has(parent.id)).toBe(true)
    expect(visible.has(child.id)).toBe(true)
  })

  // 反証: 配下の最下層タスクが全て完了しているブランチは、祖先を含め非表示になる
  it('反証: 配下が全て完了済みのブランチは祖先ごと表示対象から除外される', () => {
    const child1 = makeNode({ level: 2, completed: true, children: [] })
    const child2 = makeNode({ level: 2, completed: true, children: [] })
    const completedBranch = makeNode({ level: 1, children: [child1, child2] })
    const root = makeNode({ level: 0, children: [completedBranch] })
    const visible = getIncompleteVisibleIds([root])
    expect(visible.has(completedBranch.id)).toBe(false)
    expect(visible.has(child1.id)).toBe(false)
    expect(visible.has(child2.id)).toBe(false)
    expect(visible.has(root.id)).toBe(false)
  })

  it('兄弟ブランチの一方が完了済み・他方が未完了の場合、未完了側のみ表示対象に残る', () => {
    const doneChild = makeNode({ level: 2, completed: true, children: [] })
    const doneBranch = makeNode({ level: 1, children: [doneChild] })
    const pendingChild = makeNode({ level: 2, completed: false, children: [] })
    const pendingBranch = makeNode({ level: 1, children: [pendingChild] })
    const root = makeNode({ level: 0, children: [doneBranch, pendingBranch] })
    const visible = getIncompleteVisibleIds([root])
    expect(visible.has(doneBranch.id)).toBe(false)
    expect(visible.has(doneChild.id)).toBe(false)
    expect(visible.has(pendingBranch.id)).toBe(true)
    expect(visible.has(pendingChild.id)).toBe(true)
    expect(visible.has(root.id)).toBe(true)
  })

  // 反証: 空配列（プロジェクトが1件も無い）の場合も例外を投げず空集合を返す
  it('反証: 空配列を渡しても例外にならず空集合を返す', () => {
    expect(() => getIncompleteVisibleIds([])).not.toThrow()
    expect(getIncompleteVisibleIds([]).size).toBe(0)
  })
})

describe('getMatchingVisibleIds（ツリー内絞り込み）', () => {
  const leafHit = makeNode({
    level: 2,
    code: 'P001-01-01',
    name: '画面設計',
    children: [],
  })
  const leafMiss = makeNode({
    level: 2,
    code: 'P001-01-02',
    name: 'DB設計',
    children: [],
  })
  const phase = makeNode({
    level: 1,
    code: 'P001-01',
    name: '基本設計',
    children: [leafHit, leafMiss],
  })
  const root = makeNode({
    level: 0,
    code: 'P001',
    name: '会員基盤',
    children: [phase],
  })

  it('名前が一致したノードと、その祖先を表示対象にする', () => {
    const visible = getMatchingVisibleIds([root], '画面')
    expect(visible.has(leafHit.id)).toBe(true)
    expect(visible.has(phase.id)).toBe(true)
    expect(visible.has(root.id)).toBe(true)
  })

  it('反証: 一致しない兄弟は表示対象に含めない', () => {
    const visible = getMatchingVisibleIds([root], '画面')
    expect(visible.has(leafMiss.id)).toBe(false)
  })

  it('コードでも一致する（英字の大文字小文字を区別しない）', () => {
    expect(getMatchingVisibleIds([root], 'p001-01-02').has(leafMiss.id)).toBe(
      true,
    )
  })

  it('反証: 空クエリ・空白のみでは空集合（呼び出し側でフィルタを無効にする前提）', () => {
    expect(getMatchingVisibleIds([root], '').size).toBe(0)
    expect(getMatchingVisibleIds([root], '   ').size).toBe(0)
  })

  it('反証: どこにも一致しなければ空集合（全件表示へフォールバックしない）', () => {
    expect(getMatchingVisibleIds([root], '存在しない語').size).toBe(0)
  })

  it('親が一致した場合はその配下も表示される（工程名で絞ると中身が見える）', () => {
    const visible = getMatchingVisibleIds([root], '基本設計')
    expect(visible.has(phase.id)).toBe(true)
    // 配下は「祖先が一致した」だけでは含めない＝一致したノードまでを出す方針
    expect(visible.has(leafHit.id)).toBe(false)
  })

  it('「未完了のみ表示」と積集合で併用できる形（IDの集合）を返す', () => {
    const matching = getMatchingVisibleIds([root], '設計')
    const incomplete = getIncompleteVisibleIds([root])
    const intersection = [...matching].filter((id) => incomplete.has(id))
    // どちらの条件も満たす行だけが残る
    expect(intersection).toContain(leafHit.id)
  })
})
