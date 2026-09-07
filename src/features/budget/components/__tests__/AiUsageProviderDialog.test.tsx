import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiUsageProvider } from '@/shared/types/budget'
import { useBudgetStore } from '@/stores'
import { AiUsageProviderDialog } from '../AiUsageProviderDialog'

vi.mock('@/stores', () => ({
  useBudgetStore: vi.fn(),
}))

vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

afterEach(() => cleanup())

const DIVISION_ID = crypto.randomUUID()

describe('AiUsageProviderDialog', () => {
  const mockAddAiUsageProvider = vi.fn()
  const mockUpdateAiUsageProvider = vi.fn()
  const mockOnOpenChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useBudgetStore).mockImplementation((selector: any) =>
      selector({
        addAiUsageProvider: mockAddAiUsageProvider,
        updateAiUsageProvider: mockUpdateAiUsageProvider,
      }),
    )
  })

  it('プロバイダ名・プランを入力して追加すると、addAiUsageProviderに渡される', async () => {
    const user = userEvent.setup()
    render(
      <AiUsageProviderDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        divisionId={DIVISION_ID}
        provider={null}
      />,
    )

    await user.type(screen.getByLabelText('プロバイダ名'), 'Anthropic')
    await user.type(screen.getByLabelText('グレード・プラン（任意）'), 'Team')
    await user.click(screen.getByRole('button', { name: '追加' }))

    await waitFor(() => {
      expect(mockAddAiUsageProvider).toHaveBeenCalledWith(
        DIVISION_ID,
        'Anthropic',
        'Team',
      )
    })
  })

  it('反証: プロバイダ名が未入力の場合、addAiUsageProviderは呼ばれない（バリデーションエラー）', async () => {
    const user = userEvent.setup()
    render(
      <AiUsageProviderDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        divisionId={DIVISION_ID}
        provider={null}
      />,
    )

    await user.click(screen.getByRole('button', { name: '追加' }))

    expect(mockAddAiUsageProvider).not.toHaveBeenCalled()
    expect(
      await screen.findByText('プロバイダ名は必須です'),
    ).toBeInTheDocument()
  })

  it('編集時は既存の値がフォームに反映され、更新するとupdateAiUsageProviderが呼ばれる', async () => {
    const user = userEvent.setup()
    const provider: AiUsageProvider = {
      id: crypto.randomUUID(),
      divisionId: DIVISION_ID,
      name: 'Anthropic',
      plan: 'Team',
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    render(
      <AiUsageProviderDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        divisionId={DIVISION_ID}
        provider={provider}
      />,
    )

    expect(screen.getByDisplayValue('Anthropic')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Team')).toBeInTheDocument()

    const planInput = screen.getByLabelText('グレード・プラン（任意）')
    await user.clear(planInput)
    await user.type(planInput, 'Enterprise')
    await user.click(screen.getByRole('button', { name: '更新' }))

    await waitFor(() => {
      expect(mockUpdateAiUsageProvider).toHaveBeenCalledWith(
        provider.id,
        'Anthropic',
        'Enterprise',
      )
    })
  })
})
