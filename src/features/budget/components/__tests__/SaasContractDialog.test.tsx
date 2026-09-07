import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBudgetStore, useTeamStore } from '@/stores'
import { SaasContractDialog } from '../SaasContractDialog'

vi.mock('@/stores', () => ({
  useBudgetStore: vi.fn(),
  useTeamStore: vi.fn(),
}))

vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

afterEach(() => cleanup())

const DIVISION_ID = crypto.randomUUID()

describe('SaasContractDialog', () => {
  const mockAddSaasContract = vi.fn()
  const mockUpdateSaasContract = vi.fn()
  const mockOnOpenChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useBudgetStore).mockImplementation((selector: any) =>
      selector({
        addSaasContract: mockAddSaasContract,
        updateSaasContract: mockUpdateSaasContract,
      }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useTeamStore).mockImplementation((selector: any) =>
      selector({
        divisions: [{ id: DIVISION_ID, name: '開発部', sortOrder: 0 }],
      }),
    )
  })

  it('金額・利用人数・単価はtype="text"のNumericInputとしてレンダリングされる', () => {
    render(
      <SaasContractDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        contract={null}
      />,
    )
    expect(
      (screen.getByLabelText('金額（万円）') as HTMLInputElement).type,
    ).toBe('text')
    expect((screen.getByLabelText('利用人数') as HTMLInputElement).type).toBe(
      'text',
    )
    expect(
      (screen.getByLabelText('単価（万円/人）') as HTMLInputElement).type,
    ).toBe('text')
  })

  it('金額を入力して登録すると、入力値がaddSaasContractに渡される', async () => {
    const user = userEvent.setup()
    render(
      <SaasContractDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        contract={null}
      />,
    )

    await user.type(screen.getByLabelText('サービス名'), 'GitHub Copilot')
    await user.click(screen.getByText('部門を選択してください'))
    await user.click(screen.getByText('開発部'))

    const amountInput = screen.getByLabelText('金額（万円）')
    await user.clear(amountInput)
    await user.type(amountInput, '150')

    await user.type(screen.getByLabelText('契約開始日'), '2025-04-01')
    await user.type(screen.getByLabelText('次回更新日'), '2026-03-31')

    await user.click(screen.getByRole('button', { name: '登録' }))

    await waitFor(() => {
      expect(mockAddSaasContract).toHaveBeenCalled()
    })
    const payload = mockAddSaasContract.mock.calls[0]?.[0]
    expect(payload.amount).toBe(150)
  })

  it('利用人数×単価から金額に反映できる（NumericInput経由でも既存ロジックが動く）', async () => {
    const user = userEvent.setup()
    render(
      <SaasContractDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        contract={null}
      />,
    )

    const headcountInput = screen.getByLabelText('利用人数')
    await user.clear(headcountInput)
    await user.type(headcountInput, '5')
    const unitPriceInput = screen.getByLabelText('単価（万円/人）')
    await user.clear(unitPriceInput)
    await user.type(unitPriceInput, '10')

    await user.click(screen.getByRole('button', { name: '金額に反映' }))

    const amountInput = screen.getByLabelText(
      '金額（万円）',
    ) as HTMLInputElement
    expect(amountInput.value).toBe('50')
  })

  // 反証: 利用人数を空にした場合、内部的にnullへフォールバックし
  // 「金額に反映」ボタンが再び無効化されるか（0人数のまま有効化され続けないか）
  it('利用人数を空にすると金額に反映ボタンが再び無効化される', async () => {
    const user = userEvent.setup()
    render(
      <SaasContractDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        contract={null}
      />,
    )

    const headcountInput = screen.getByLabelText('利用人数')
    await user.clear(headcountInput)
    await user.type(headcountInput, '5')
    const unitPriceInput = screen.getByLabelText('単価（万円/人）')
    await user.clear(unitPriceInput)
    await user.type(unitPriceInput, '10')

    const applyButton = screen.getByRole('button', { name: '金額に反映' })
    expect(applyButton).toBeEnabled()

    await user.clear(headcountInput)
    await user.tab()
    expect(applyButton).toBeDisabled()
  })

  it('グレード・プラン（plan）を入力して登録すると、入力値がaddSaasContractに渡される', async () => {
    const user = userEvent.setup()
    render(
      <SaasContractDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        contract={null}
      />,
    )

    await user.type(screen.getByLabelText('サービス名'), 'Notion')
    await user.type(
      screen.getByLabelText('グレード・プラン（任意）'),
      'Business',
    )
    await user.click(screen.getByText('部門を選択してください'))
    await user.click(screen.getByText('開発部'))
    await user.type(screen.getByLabelText('契約開始日'), '2025-04-01')
    await user.type(screen.getByLabelText('次回更新日'), '2026-03-31')

    await user.click(screen.getByRole('button', { name: '登録' }))

    await waitFor(() => {
      expect(mockAddSaasContract).toHaveBeenCalled()
    })
    const payload = mockAddSaasContract.mock.calls[0]?.[0]
    expect(payload.plan).toBe('Business')
  })

  it('反証: グレード・プランを未入力のまま登録しても、nullとして送信されエラーにならない', async () => {
    const user = userEvent.setup()
    render(
      <SaasContractDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        contract={null}
      />,
    )

    await user.type(screen.getByLabelText('サービス名'), 'Notion')
    await user.click(screen.getByText('部門を選択してください'))
    await user.click(screen.getByText('開発部'))
    await user.type(screen.getByLabelText('契約開始日'), '2025-04-01')
    await user.type(screen.getByLabelText('次回更新日'), '2026-03-31')

    await user.click(screen.getByRole('button', { name: '登録' }))

    await waitFor(() => {
      expect(mockAddSaasContract).toHaveBeenCalled()
    })
    const payload = mockAddSaasContract.mock.calls[0]?.[0]
    expect(payload.plan).toBeFalsy()
  })
})
