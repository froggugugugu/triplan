import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WbsTemplate } from '@/shared/types/wbs-template'
import { useWbsTemplateStore } from '@/stores'
import { WbsTemplateDialog } from '../WbsTemplateDialog'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/stores', () => ({
  useWbsTemplateStore: vi.fn(),
}))

afterEach(() => cleanup())

function makeTemplate(overrides: Partial<WbsTemplate> = {}): WbsTemplate {
  return {
    id: crypto.randomUUID(),
    name: '標準テンプレート',
    nodes: [
      { name: '要求整理', completionCriteria: '合意済み' },
      {
        name: 'ITa',
        children: [{ name: 'ITa方針', completionCriteria: '承認済み' }],
      },
    ],
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
    ...overrides,
  }
}

describe('WbsTemplateDialog', () => {
  let templates: WbsTemplate[]
  const mockOnOpenChange = vi.fn()
  const mockOnApply = vi.fn()

  beforeEach(() => {
    templates = [makeTemplate()]
    mockOnOpenChange.mockReset()
    mockOnApply.mockReset()
    mockNavigate.mockReset()

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useWbsTemplateStore).mockImplementation((selector: any) =>
      selector({ wbsTemplates: templates }),
    )
  })

  it('一覧にテンプレート名とタスク数を表示する', () => {
    render(
      <WbsTemplateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onApply={mockOnApply}
      />,
    )
    expect(screen.getByText('標準テンプレート')).toBeInTheDocument()
    // 3ノード（要求整理・ITa・ITa方針）
    expect(screen.getByText('3タスク')).toBeInTheDocument()
  })

  it('テンプレートが0件の場合は案内文を表示する', () => {
    templates = []
    render(
      <WbsTemplateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onApply={mockOnApply}
      />,
    )
    expect(
      screen.getByText(
        'ストックされたテンプレートがありません。「システム設定 → WBSテンプレート」から作成してください。',
      ),
    ).toBeInTheDocument()
  })

  it('未選択時は適用ボタンが無効化される', () => {
    render(
      <WbsTemplateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onApply={mockOnApply}
      />,
    )
    expect(screen.getByRole('button', { name: '適用' })).toBeDisabled()
  })

  it('テンプレートを選択して適用すると、onApplyに選択したテンプレートが渡される', async () => {
    const user = userEvent.setup()
    render(
      <WbsTemplateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onApply={mockOnApply}
      />,
    )
    await user.click(screen.getByText('標準テンプレート'))
    await user.click(screen.getByRole('button', { name: '適用' }))

    expect(mockOnApply).toHaveBeenCalledWith(templates[0])
  })

  it('「テンプレートを管理」を押すとダイアログを閉じて/wbs-templatesへ遷移する', async () => {
    const user = userEvent.setup()
    render(
      <WbsTemplateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onApply={mockOnApply}
      />,
    )
    await user.click(screen.getByRole('button', { name: /テンプレートを管理/ }))

    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
    expect(mockNavigate).toHaveBeenCalledWith('/wbs-templates')
  })

  // 反証: openがfalse→trueに変わっても前回選択が残らず未選択状態にリセットされる
  it('反証: ダイアログを開き直すと前回の選択がリセットされる', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <WbsTemplateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onApply={mockOnApply}
      />,
    )
    await user.click(screen.getByText('標準テンプレート'))
    expect(screen.getByRole('button', { name: '適用' })).toBeEnabled()

    rerender(
      <WbsTemplateDialog
        open={false}
        onOpenChange={mockOnOpenChange}
        onApply={mockOnApply}
      />,
    )
    rerender(
      <WbsTemplateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onApply={mockOnApply}
      />,
    )

    expect(screen.getByRole('button', { name: '適用' })).toBeDisabled()
  })
})
