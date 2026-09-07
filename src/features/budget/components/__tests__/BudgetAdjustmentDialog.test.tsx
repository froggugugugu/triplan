import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBudgetStore } from '@/stores'
import { BudgetAdjustmentDialog } from '../BudgetAdjustmentDialog'

vi.mock('@/stores', () => ({
  useBudgetStore: vi.fn(),
}))

vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

afterEach(() => cleanup())

const BUDGET_ID = crypto.randomUUID()

describe('BudgetAdjustmentDialog', () => {
  const mockAddBudgetAdjustment = vi.fn()
  let budgetAdjustments: {
    id: string
    budgetId: string
    amount: number
    adjustmentType: 'increase' | 'decrease'
    reason: string
    adjustedAt: string
    createdAt: string
  }[]

  beforeEach(() => {
    mockAddBudgetAdjustment.mockReset()
    budgetAdjustments = []

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useBudgetStore).mockImplementation((selector: any) =>
      selector({
        addBudgetAdjustment: mockAddBudgetAdjustment,
        get budgetAdjustments() {
          return budgetAdjustments
        },
      }),
    )
  })

  function renderDialog() {
    return render(
      <BudgetAdjustmentDialog
        open={true}
        onOpenChange={() => {}}
        budgetId={BUDGET_ID}
        divisionName="開発部"
      />,
    )
  }

  it('タイトルが「その他予算変更」になる', () => {
    renderDialog()
    expect(
      screen.getByRole('heading', { name: 'その他予算変更' }),
    ).toBeInTheDocument()
  })

  it('金額はtype="text"のNumericInputとしてレンダリングされる', () => {
    renderDialog()
    expect(
      (screen.getByLabelText('金額（万円）') as HTMLInputElement).type,
    ).toBe('text')
  })

  it('区分の初期値は増額で、金額・理由を入力して記録するとadjustmentType=increaseで登録される', async () => {
    const user = userEvent.setup()
    renderDialog()

    const amountInput = screen.getByLabelText('金額（万円）')
    await user.clear(amountInput)
    await user.type(amountInput, '1000')
    await user.type(screen.getByLabelText('理由'), '期中受注')
    await user.click(screen.getByRole('button', { name: '変更を記録' }))

    expect(mockAddBudgetAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        budgetId: BUDGET_ID,
        amount: 1000,
        adjustmentType: 'increase',
        reason: '期中受注',
      }),
    )
  })

  it('区分を減額に切り替えて記録するとadjustmentType=decreaseで登録される', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.selectOptions(screen.getByLabelText('区分'), '減額')
    const amountInput = screen.getByLabelText('金額（万円）')
    await user.clear(amountInput)
    await user.type(amountInput, '300')
    await user.type(screen.getByLabelText('理由'), '契約内容見直し')
    await user.click(screen.getByRole('button', { name: '変更を記録' }))

    expect(mockAddBudgetAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 300, adjustmentType: 'decrease' }),
    )
  })

  // 反証: 全角数字での金額入力もフォーカスアウトで正しく半角化・登録されるか
  it('全角数字で金額を入力してもフォーカスアウト後は正しい数値で登録される', async () => {
    const user = userEvent.setup()
    renderDialog()

    const amountInput = screen.getByLabelText(
      '金額（万円）',
    ) as HTMLInputElement
    await user.clear(amountInput)
    await user.type(amountInput, '５００')
    await user.tab()
    expect(amountInput.value).toBe('500')

    await user.type(screen.getByLabelText('理由'), '全角テスト')
    await user.click(screen.getByRole('button', { name: '変更を記録' }))

    expect(mockAddBudgetAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 500 }),
    )
  })

  it('金額が0のままだとバリデーションエラーで記録されない', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.type(screen.getByLabelText('理由'), '理由あり')
    await user.click(screen.getByRole('button', { name: '変更を記録' }))
    expect(mockAddBudgetAdjustment).not.toHaveBeenCalled()
  })

  it('理由が未入力だとバリデーションエラーで記録されない', async () => {
    const user = userEvent.setup()
    renderDialog()
    const amountInput = screen.getByLabelText('金額（万円）')
    await user.clear(amountInput)
    await user.type(amountInput, '100')
    await user.click(screen.getByRole('button', { name: '変更を記録' }))
    expect(mockAddBudgetAdjustment).not.toHaveBeenCalled()
  })

  it('増額・減額それぞれの履歴が符号付きで表示される', () => {
    budgetAdjustments = [
      {
        id: 'a1',
        budgetId: BUDGET_ID,
        amount: 1000,
        adjustmentType: 'increase',
        reason: '期中受注',
        adjustedAt: '2025-07-01',
        createdAt: '2025-07-01T00:00:00.000Z',
      },
      {
        id: 'a2',
        budgetId: BUDGET_ID,
        amount: 300,
        adjustmentType: 'decrease',
        reason: '契約内容見直し',
        adjustedAt: '2025-08-01',
        createdAt: '2025-08-01T00:00:00.000Z',
      },
    ]
    renderDialog()

    expect(screen.getByText('+1,000.00万円')).toBeInTheDocument()
    expect(screen.getByText('-300.00万円')).toBeInTheDocument()
  })
})
