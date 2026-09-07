import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOCUMENT_TEMPLATE_MASTER } from '@/shared/data/document-template-master'
import type { DocumentTemplate } from '@/shared/types/document-template'
import {
  resetDocumentTemplateSeedGuardForTesting,
  useDocumentTemplateStore,
} from '@/stores/document-template-store'
import { DocumentTemplatesPage } from '../DocumentTemplatesPage'

const mockList = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockRemove = vi.fn()

vi.mock('@/infrastructure/adapters', () => ({
  getDataAdapter: () => ({
    list: mockList,
    create: mockCreate,
    update: mockUpdate,
    remove: mockRemove,
  }),
}))

describe('DocumentTemplatesPage', () => {
  beforeEach(() => {
    useDocumentTemplateStore.setState({ documentTemplates: [] })
    resetDocumentTemplateSeedGuardForTesting()
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
    mockCreate.mockImplementation(
      async (
        _entity: string,
        data: Omit<DocumentTemplate, 'id'>,
        options?: { id?: string },
      ) => ({
        ...data,
        id: options?.id ?? crypto.randomUUID(),
      }),
    )
    mockUpdate.mockImplementation(
      async (
        _entity: string,
        id: string,
        patch: Partial<DocumentTemplate>,
      ) => ({
        id,
        ...patch,
      }),
    )
    mockRemove.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('マウント時に標準ドキュメントテンプレートがシードされ、先頭のテンプレートが編集表示される', async () => {
    render(<DocumentTemplatesPage />)

    await waitFor(() => {
      expect(
        useDocumentTemplateStore.getState().documentTemplates,
      ).toHaveLength(DOCUMENT_TEMPLATE_MASTER.length)
    })
    const nameInput = await screen.findByLabelText('テンプレート名')
    await waitFor(() => {
      expect((nameInput as HTMLInputElement).value).toBe(
        DOCUMENT_TEMPLATE_MASTER[0]?.name,
      )
    })
    // 本文はOKF準拠（type必須フィールド）
    const contentArea = screen.getByLabelText(
      '本文（マークダウン・OKF準拠）',
    ) as HTMLTextAreaElement
    expect(contentArea.value).toContain('type: document')
  })

  it('新規テンプレート作成でOKF準拠の初期本文を持つテンプレートが追加・選択される', async () => {
    render(<DocumentTemplatesPage />)
    await screen.findByLabelText('テンプレート名')

    fireEvent.click(
      screen.getByRole('button', { name: /新規テンプレート作成/ }),
    )

    await waitFor(() => {
      expect(
        (screen.getByLabelText('テンプレート名') as HTMLInputElement).value,
      ).toBe('新規ドキュメントテンプレート')
    })
    const contentArea = screen.getByLabelText(
      '本文（マークダウン・OKF準拠）',
    ) as HTMLTextAreaElement
    expect(contentArea.value).toContain('type: document')
    expect(mockCreate).toHaveBeenCalledWith(
      'documentTemplates',
      expect.objectContaining({ name: '新規ドキュメントテンプレート' }),
      expect.objectContaining({ id: expect.any(String) }),
    )
  })

  it('本文を編集してフォーカスアウトすると保存される', async () => {
    render(<DocumentTemplatesPage />)
    const contentArea = (await screen.findByLabelText(
      '本文（マークダウン・OKF準拠）',
    )) as HTMLTextAreaElement
    await waitFor(() => expect(contentArea.value).not.toBe(''))

    fireEvent.change(contentArea, {
      target: { value: '---\ntype: document\n---\n\n## 編集済み\n' },
    })
    fireEvent.blur(contentArea)

    const firstId = DOCUMENT_TEMPLATE_MASTER[0]?.id ?? ''
    expect(
      useDocumentTemplateStore.getState().getDocumentTemplateById(firstId)
        ?.content,
    ).toContain('## 編集済み')
    expect(mockUpdate).toHaveBeenCalledWith(
      'documentTemplates',
      firstId,
      expect.objectContaining({
        content: expect.stringContaining('## 編集済み'),
      }),
      // 楽観ロック: 画面が見ていた版を期待値として送る
      { expectedUpdatedAt: expect.any(String) },
    )
  })

  // 反証: 空のテンプレート名は保存されず元の名前へ戻る
  it('反証: テンプレート名を空にしてフォーカスアウトしても保存されない', async () => {
    render(<DocumentTemplatesPage />)
    const nameInput = (await screen.findByLabelText(
      'テンプレート名',
    )) as HTMLInputElement
    await waitFor(() => expect(nameInput.value).not.toBe(''))
    const originalName = nameInput.value

    fireEvent.change(nameInput, { target: { value: '   ' } })
    fireEvent.blur(nameInput)

    expect(nameInput.value).toBe(originalName)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('削除ボタン→確認ダイアログで選択中テンプレートが削除される', async () => {
    render(<DocumentTemplatesPage />)
    await screen.findByLabelText('テンプレート名')
    const before = useDocumentTemplateStore.getState().documentTemplates.length

    fireEvent.click(screen.getByRole('button', { name: '削除' }))
    const confirmButton = await screen.findByRole('button', {
      name: '削除',
      hidden: false,
    })
    // ダイアログ内の削除ボタン（destructive）をクリック
    const dialogButtons = screen.getAllByRole('button', { name: '削除' })
    fireEvent.click(dialogButtons[dialogButtons.length - 1] as HTMLElement)

    await waitFor(() => {
      expect(useDocumentTemplateStore.getState().documentTemplates.length).toBe(
        before - 1,
      )
    })
    expect(mockRemove).toHaveBeenCalledWith(
      'documentTemplates',
      DOCUMENT_TEMPLATE_MASTER[0]?.id,
    )
    expect(confirmButton).toBeDefined()
  })
})
