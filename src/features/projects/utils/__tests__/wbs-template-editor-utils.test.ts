import { describe, expect, it } from 'vitest'
import type { WbsTemplateNode } from '@/shared/types/wbs-template'
import {
  addChildEditorNode,
  addRootEditorNode,
  addSiblingAfterEditorNode,
  countTemplateNodes,
  demoteEditorNode,
  type EditorNode,
  fromEditorNodes,
  isDescendantEditorNode,
  moveEditorNode,
  promoteEditorNode,
  removeEditorNode,
  toEditorNodes,
  updateEditorNode,
} from '../wbs-template-editor-utils'

function sampleWbsTree(): WbsTemplateNode[] {
  return [
    { name: '要求整理', completionCriteria: '合意済み' },
    {
      name: 'ITa',
      children: [
        { name: 'ITa方針', completionCriteria: '承認済み' },
        { name: 'ITa報告', completionCriteria: '提出済み' },
      ],
    },
  ]
}

function sampleEditorTree(): EditorNode[] {
  return toEditorNodes(sampleWbsTree())
}

describe('toEditorNodes / fromEditorNodes', () => {
  it('往復変換で内容（name/completionCriteria/構造）が保持される', () => {
    const original = sampleWbsTree()
    const roundTripped = fromEditorNodes(toEditorNodes(original))
    expect(roundTripped).toEqual(original)
  })

  it('各ノードに一意なidが付与される', () => {
    const editorNodes = sampleEditorTree()
    const ids = [
      editorNodes[0]?.id,
      editorNodes[1]?.id,
      editorNodes[1]?.children[0]?.id,
      editorNodes[1]?.children[1]?.id,
    ]
    expect(new Set(ids).size).toBe(4)
  })

  it('子を持たないノードはfromEditorNodesでchildrenキー自体を持たない', () => {
    const [node] = fromEditorNodes(toEditorNodes([{ name: '単独工程' }]))
    expect(node && 'children' in node).toBe(false)
  })

  // 反証: ドキュメントテンプレート紐づけが往復変換で失われない
  it('反証: documentTemplateIdsが往復変換で保持される（孫階層含む）', () => {
    const docId1 = crypto.randomUUID()
    const docId2 = crypto.randomUUID()
    const original: WbsTemplateNode[] = [
      {
        name: '要件定義',
        documentTemplateIds: [docId1, docId2],
        children: [{ name: '業務要件定義書', documentTemplateIds: [docId1] }],
      },
    ]
    const roundTripped = fromEditorNodes(toEditorNodes(original))
    expect(roundTripped).toEqual(original)
  })

  it('紐づけが空のノードはfromEditorNodesでdocumentTemplateIdsキー自体を持たない', () => {
    const [node] = fromEditorNodes(toEditorNodes([{ name: '単独工程' }]))
    expect(node && 'documentTemplateIds' in node).toBe(false)
  })

  it('documentTemplateIds未指定の既存データはtoEditorNodesで空配列に正規化される', () => {
    const [node] = toEditorNodes([{ name: '既存工程' }])
    expect(node?.documentTemplateIds).toEqual([])
  })
})

describe('updateEditorNode（documentTemplateIds）', () => {
  it('指定ノードの紐づけのみ更新され、他ノードは影響を受けない', () => {
    const tree = sampleEditorTree()
    const targetId = tree[1]?.children[0]?.id ?? ''
    const docId = crypto.randomUUID()

    const updated = updateEditorNode(tree, targetId, {
      documentTemplateIds: [docId],
    })

    expect(updated[1]?.children[0]?.documentTemplateIds).toEqual([docId])
    expect(updated[0]?.documentTemplateIds).toEqual([])
    expect(updated[1]?.children[1]?.documentTemplateIds).toEqual([])
  })
})

describe('countTemplateNodes', () => {
  it('全ノード数（親+子）を再帰的に数える', () => {
    expect(countTemplateNodes(sampleWbsTree())).toBe(4)
  })

  it('空配列は0を返す', () => {
    expect(countTemplateNodes([])).toBe(0)
  })
})

describe('updateEditorNode', () => {
  it('指定idのname/completionCriteriaを更新する', () => {
    const editorNodes = sampleEditorTree()
    const targetId = editorNodes[0]?.id as string
    const updated = updateEditorNode(editorNodes, targetId, {
      name: '要求整理（改）',
    })
    expect(updated[0]?.name).toBe('要求整理（改）')
    // 未指定フィールドは保持される
    expect(updated[0]?.completionCriteria).toBe('合意済み')
  })

  it('孫ノードも更新できる', () => {
    const editorNodes = sampleEditorTree()
    const grandchildId = editorNodes[1]?.children[0]?.id as string
    const updated = updateEditorNode(editorNodes, grandchildId, {
      completionCriteria: '再承認済み',
    })
    expect(updated[1]?.children[0]?.completionCriteria).toBe('再承認済み')
  })

  // 反証: 存在しないidを指定しても例外を投げず、元のツリーと同一内容を維持する
  it('反証: 存在しないidを指定しても例外にならずツリー内容を維持する', () => {
    const editorNodes = sampleEditorTree()
    expect(() =>
      updateEditorNode(editorNodes, 'not-exist', { name: '不正' }),
    ).not.toThrow()
    const result = updateEditorNode(editorNodes, 'not-exist', { name: '不正' })
    expect(fromEditorNodes(result)).toEqual(sampleWbsTree())
  })
})

describe('addRootEditorNode / addChildEditorNode', () => {
  it('ルート直下に新規ノードを追加する', () => {
    const nodes = addRootEditorNode(sampleEditorTree(), '新工程')
    expect(nodes).toHaveLength(3)
    expect(nodes[2]?.name).toBe('新工程')
    expect(nodes[2]?.children).toEqual([])
  })

  it('指定idノードの子として追加する', () => {
    const editorNodes = sampleEditorTree()
    const itaId = editorNodes[1]?.id as string
    const updated = addChildEditorNode(editorNodes, itaId, 'ITa計画')
    expect(updated[1]?.children).toHaveLength(3)
    expect(updated[1]?.children[2]?.name).toBe('ITa計画')
  })

  it('兄弟ノードは変更されない', () => {
    const editorNodes = sampleEditorTree()
    const itaId = editorNodes[1]?.id as string
    const updated = addChildEditorNode(editorNodes, itaId, 'ITa計画')
    expect(updated[0]?.name).toBe('要求整理')
  })
})

describe('removeEditorNode', () => {
  it('指定idノードを削除する（配下の子ごと）', () => {
    const editorNodes = sampleEditorTree()
    const itaId = editorNodes[1]?.id as string
    const updated = removeEditorNode(editorNodes, itaId)
    expect(updated).toHaveLength(1)
    expect(updated[0]?.name).toBe('要求整理')
  })

  it('孫ノードのみを削除し、親・兄弟には影響しない', () => {
    const editorNodes = sampleEditorTree()
    const grandchildId = editorNodes[1]?.children[0]?.id as string
    const updated = removeEditorNode(editorNodes, grandchildId)
    expect(updated[1]?.children).toHaveLength(1)
    expect(updated[1]?.children[0]?.name).toBe('ITa報告')
  })
})

describe('isDescendantEditorNode / moveEditorNode', () => {
  it('isDescendantEditorNode: 子孫を正しく判定する', () => {
    const editorNodes = sampleEditorTree()
    const itaId = editorNodes[1]?.id as string
    const grandchildId = editorNodes[1]?.children[0]?.id as string
    const requirementId = editorNodes[0]?.id as string
    expect(isDescendantEditorNode(editorNodes, itaId, grandchildId)).toBe(true)
    expect(isDescendantEditorNode(editorNodes, itaId, requirementId)).toBe(
      false,
    )
  })

  it('moveEditorNode: 指定ノードを別ノードの子として移動する', () => {
    const editorNodes = sampleEditorTree()
    const requirementId = editorNodes[0]?.id as string
    const itaId = editorNodes[1]?.id as string
    const moved = moveEditorNode(editorNodes, requirementId, itaId)
    // ルートには「ITa」のみが残る
    expect(moved.map((n) => n.name)).toEqual(['ITa'])
    // ITaの子（末尾）に「要求整理」が追加される
    const itaNode = moved.find((n) => n.id === itaId)
    expect(itaNode?.children.map((c) => c.name)).toEqual([
      'ITa方針',
      'ITa報告',
      '要求整理',
    ])
  })

  // 反証: 自分自身へのドロップは何も変更しない
  it('反証: 自分自身へのドロップは何も変更しない', () => {
    const editorNodes = sampleEditorTree()
    const itaId = editorNodes[1]?.id as string
    const result = moveEditorNode(editorNodes, itaId, itaId)
    expect(result).toEqual(editorNodes)
  })

  // 反証: 自分の子孫へのドロップは何も変更しない（循環防止）
  it('反証: 自分の子孫へのドロップは何も変更しない（循環防止）', () => {
    const editorNodes = sampleEditorTree()
    const itaId = editorNodes[1]?.id as string
    const grandchildId = editorNodes[1]?.children[0]?.id as string
    const result = moveEditorNode(editorNodes, itaId, grandchildId)
    expect(result).toEqual(editorNodes)
  })
})

// WBS画面（ProjectTreeGrid）のキーボードショートカットと同じ操作体系
// （Shift+Enter: 下位層追加 / Alt+Enter: 同階層追加 / Alt+←: 階層上げ / Alt+→: 階層下げ）
describe('addSiblingAfterEditorNode（Alt+Enter: 同階層追加）', () => {
  it('ルート階層のノードの直後に、同じ階層の新規ノードを追加する', () => {
    const editorNodes = sampleEditorTree()
    const requirementId = editorNodes[0]?.id as string
    const updated = addSiblingAfterEditorNode(
      editorNodes,
      requirementId,
      '新規工程',
    )
    expect(updated.map((n) => n.name)).toEqual(['要求整理', '新規工程', 'ITa'])
  })

  it('孫階層のノードの直後にも、同じ階層の新規ノードを追加する', () => {
    const editorNodes = sampleEditorTree()
    const policyId = editorNodes[1]?.children[0]?.id as string
    const updated = addSiblingAfterEditorNode(
      editorNodes,
      policyId,
      '新規タスク',
    )
    expect(updated[1]?.children.map((c) => c.name)).toEqual([
      'ITa方針',
      '新規タスク',
      'ITa報告',
    ])
  })
})

describe('promoteEditorNode（Alt+←: 階層上げ）', () => {
  it('親ノードの直後・1つ上の階層へ移動する', () => {
    const editorNodes = sampleEditorTree()
    const itaId = editorNodes[1]?.id as string
    const policyId = editorNodes[1]?.children[0]?.id as string
    const updated = promoteEditorNode(editorNodes, policyId)
    // ルートは 要求整理 → ITa → ITa方針(昇格) の順
    expect(updated.map((n) => n.name)).toEqual(['要求整理', 'ITa', 'ITa方針'])
    // ITaの子はITa報告のみが残る
    const itaNode = updated.find((n) => n.id === itaId)
    expect(itaNode?.children.map((c) => c.name)).toEqual(['ITa報告'])
  })

  // 反証: 既にルート階層のノードを昇格しようとしても何も変更しない
  it('反証: 既にルート階層のノードは階層を上げられず元のツリーを維持する', () => {
    const editorNodes = sampleEditorTree()
    const requirementId = editorNodes[0]?.id as string
    const result = promoteEditorNode(editorNodes, requirementId)
    expect(result).toEqual(editorNodes)
  })
})

describe('demoteEditorNode（Alt+→: 階層下げ）', () => {
  it('直前の兄弟ノードの末尾の子として1つ下の階層へ移動する', () => {
    const editorNodes = sampleEditorTree()
    const policyId = editorNodes[1]?.children[0]?.id as string
    const reportId = editorNodes[1]?.children[1]?.id as string
    const updated = demoteEditorNode(editorNodes, reportId)
    expect(updated[1]?.children.map((c) => c.name)).toEqual(['ITa方針'])
    const policyNode = updated[1]?.children.find((c) => c.id === policyId)
    expect(policyNode?.children.map((c) => c.name)).toEqual(['ITa報告'])
  })

  // 反証: 直前の兄弟が存在しない（先頭の兄弟）場合は何も変更しない
  it('反証: 先頭の兄弟ノードは階層を下げられず元のツリーを維持する（ルート直下）', () => {
    const editorNodes = sampleEditorTree()
    const requirementId = editorNodes[0]?.id as string
    const result = demoteEditorNode(editorNodes, requirementId)
    expect(result).toEqual(editorNodes)
  })

  it('反証: 先頭の兄弟ノードは階層を下げられず元のツリーを維持する（孫階層）', () => {
    const editorNodes = sampleEditorTree()
    const policyId = editorNodes[1]?.children[0]?.id as string
    const result = demoteEditorNode(editorNodes, policyId)
    expect(result).toEqual(editorNodes)
  })
})
