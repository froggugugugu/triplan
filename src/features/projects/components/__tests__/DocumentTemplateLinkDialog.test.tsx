import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DocumentTemplate } from '@/shared/types/document-template'
import type { EditorNode } from '../../utils/wbs-template-editor-utils'
import { DocumentTemplateLinkDialog } from '../DocumentTemplateLinkDialog'

function buildDocTemplate(
  overrides: Partial<DocumentTemplate> = {},
): DocumentTemplate {
  return {
    id: crypto.randomUUID(),
    name: '要件定義書',
    phase: '要件定義',
    description: null,
    content: '---\ntype: document\n---\n\n## 目的\n',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
    ...overrides,
  }
}

function buildNode(documentTemplateIds: string[]): EditorNode {
  return {
    id: crypto.randomUUID(),
    name: '業務要件定義書',
    documentTemplateIds,
    children: [],
  }
}

describe('DocumentTemplateLinkDialog', () => {
  it('ノードの紐づけ済みテンプレートが選択済みとして表示され、保存でonSaveが呼ばれる', () => {
    const doc = buildDocTemplate()
    const node = buildNode([doc.id])
    const onSave = vi.fn()

    render(
      <DocumentTemplateLinkDialog
        node={node}
        documentTemplates={[doc]}
        onClose={() => {}}
        onSave={onSave}
      />,
    )

    // 選択済みチップとして表示される
    expect(screen.getByText('【要件定義】要件定義書')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(onSave).toHaveBeenCalledWith(node.id, [doc.id])
  })

  // 反証: 削除済みテンプレートへの参照（dangling id）は保存時に自動除去される
  it('反証: 存在しないドキュメントテンプレートidは保存時に除去される', () => {
    const doc = buildDocTemplate()
    const danglingId = crypto.randomUUID()
    const node = buildNode([doc.id, danglingId])
    const onSave = vi.fn()

    render(
      <DocumentTemplateLinkDialog
        node={node}
        documentTemplates={[doc]}
        onClose={() => {}}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(onSave).toHaveBeenCalledWith(node.id, [doc.id])
  })

  it('テンプレート0件時は案内メッセージを表示する', () => {
    render(
      <DocumentTemplateLinkDialog
        node={buildNode([])}
        documentTemplates={[]}
        onClose={() => {}}
        onSave={vi.fn()}
      />,
    )
    expect(
      screen.getByText(/ドキュメントテンプレートが登録されていません/),
    ).toBeDefined()
  })

  it('node=nullではダイアログを描画しない（クラッシュしない）', () => {
    render(
      <DocumentTemplateLinkDialog
        node={null}
        documentTemplates={[buildDocTemplate()]}
        onClose={() => {}}
        onSave={vi.fn()}
      />,
    )
    expect(screen.queryByText('ドキュメントテンプレートの紐づけ')).toBeNull()
  })
})
