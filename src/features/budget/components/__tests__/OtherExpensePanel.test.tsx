import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BudgetBreakdown, DivisionBudget } from '@/shared/types/budget'
import {
  useAppStore,
  useBudgetStore,
  useProjectsStore,
  useTeamStore,
} from '@/stores'
import { OtherExpensePanel } from '../OtherExpensePanel'

vi.mock('@/stores', () => ({
  useAppStore: vi.fn(),
  useBudgetStore: vi.fn(),
  useTeamStore: vi.fn(),
  useProjectsStore: vi.fn(),
}))

vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

afterEach(() => cleanup())

const DIVISION_ID = crypto.randomUUID()
const BUDGET_ID = crypto.randomUUID()

function createBudget(overrides: Partial<DivisionBudget> = {}): DivisionBudget {
  return {
    id: BUDGET_ID,
    divisionId: DIVISION_ID,
    fiscalYear: 2025,
    initialAmount: 0,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function createExpense(
  overrides: Partial<BudgetBreakdown> = {},
): BudgetBreakdown {
  return {
    id: crypto.randomUUID(),
    budgetId: BUDGET_ID,
    category: 'general_expense',
    label: '交通費',
    amount: 100,
    recordedAt: '2025-04-01',
    createdAt: '2025-04-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('OtherExpensePanel', () => {
  let breakdowns: BudgetBreakdown[]
  const mockGetOrCreateDivisionBudget = vi.fn()

  beforeEach(() => {
    breakdowns = []
    mockGetOrCreateDivisionBudget.mockReset()
    mockGetOrCreateDivisionBudget.mockReturnValue(createBudget())

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useAppStore).mockImplementation((selector: any) =>
      selector({ fiscalYearStartMonth: 4 }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useTeamStore).mockImplementation((selector: any) =>
      selector({
        divisions: [
          {
            id: DIVISION_ID,
            name: '開発部',
            sortOrder: 0,
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
      }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useProjectsStore).mockImplementation((selector: any) =>
      selector({ projects: [] }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useBudgetStore).mockImplementation((selector: any) =>
      selector({
        budgetBreakdowns: breakdowns,
        getOrCreateDivisionBudget: mockGetOrCreateDivisionBudget,
        addBudgetBreakdown: vi.fn(),
        updateBudgetBreakdown: vi.fn(),
        deleteBudgetBreakdown: vi.fn(),
        addBudgetBreakdownActualRecord: vi.fn(),
        updateBudgetBreakdownActualRecord: vi.fn(),
        deleteBudgetBreakdownActualRecord: vi.fn(),
        getAiUsageBudgetTotal: () => 0,
        getSaasAnnualCostTotal: () => 0,
      }),
    )
  })

  function renderPanel() {
    return render(
      <OtherExpensePanel divisionId={DIVISION_ID} fiscalYear={2025} />,
    )
  }

  it('一般経費（general_expense）区分の内訳のみを一覧表示する', () => {
    breakdowns = [
      createExpense({ label: '交通費' }),
      createExpense({ label: '案件費用', category: 'project_personnel' }),
    ]
    renderPanel()
    expect(screen.getByText('交通費')).toBeInTheDocument()
    expect(screen.queryByText('案件費用')).not.toBeInTheDocument()
  })

  it('他部門の内訳は表示しない', () => {
    const otherBudget = createBudget({
      id: 'other-budget',
      divisionId: 'other-division',
    })
    mockGetOrCreateDivisionBudget.mockImplementation((divisionId: string) =>
      divisionId === DIVISION_ID ? createBudget() : otherBudget,
    )
    breakdowns = [
      createExpense({ budgetId: 'other-budget', label: '他部門経費' }),
    ]
    renderPanel()
    expect(screen.queryByText('他部門経費')).not.toBeInTheDocument()
  })

  it('予算額・実績合計・残額を一覧に表示する', () => {
    breakdowns = [
      createExpense({
        label: '書籍代',
        amount: 100,
        actualRecords: [
          {
            id: 'r1',
            purchasedAt: '2025-04-10',
            itemLabel: '本',
            amount: 30,
          },
        ],
      }),
    ]
    renderPanel()
    const row = screen.getByText('書籍代').closest('tr') as HTMLElement
    expect(within(row).getByText('100.00')).toBeInTheDocument() // 予算額
    expect(within(row).getByText('30.00')).toBeInTheDocument() // 実績合計
    expect(within(row).getByText('70.00')).toBeInTheDocument() // 残額
  })

  it('実績明細が未登録の場合、実績合計0・残額は予算額と同額を表示する', () => {
    breakdowns = [createExpense({ label: '書籍代', amount: 100 })]
    renderPanel()
    const row = screen.getByText('書籍代').closest('tr') as HTMLElement
    const cells = within(row).getAllByText('100.00')
    // 予算額(100)と残額(100=100-0)の2箇所に表示される
    expect(cells.length).toBeGreaterThanOrEqual(2)
  })

  it('合計行に予算合計・実績合計・残予算合計を表示する', () => {
    breakdowns = [
      createExpense({
        label: '書籍代',
        amount: 100,
        actualRecords: [
          { id: 'r1', purchasedAt: '2025-04-10', itemLabel: '本', amount: 30 },
        ],
      }),
      createExpense({
        label: 'セミナー参加費',
        amount: 200,
        actualRecords: [
          {
            id: 'r2',
            purchasedAt: '2025-05-01',
            itemLabel: 'セミナー',
            amount: 150,
          },
        ],
      }),
    ]
    renderPanel()
    const footerRow = screen.getByText('合計').closest('tr') as HTMLElement
    // 予算合計 100+200=300, 実績合計 30+150=180, 残予算合計 300-180=120
    expect(within(footerRow).getByText('300.00')).toBeInTheDocument()
    expect(within(footerRow).getByText('180.00')).toBeInTheDocument()
    expect(within(footerRow).getByText('120.00')).toBeInTheDocument()
  })

  it('他部門の内訳は合計行に含めない', () => {
    const otherBudget = createBudget({
      id: 'other-budget',
      divisionId: 'other-division',
    })
    mockGetOrCreateDivisionBudget.mockImplementation((divisionId: string) =>
      divisionId === DIVISION_ID ? createBudget() : otherBudget,
    )
    breakdowns = [
      createExpense({ label: '自部門経費', amount: 100 }),
      createExpense({
        budgetId: 'other-budget',
        label: '他部門経費',
        amount: 9999,
      }),
    ]
    renderPanel()
    const footerRow = screen.getByText('合計').closest('tr') as HTMLElement
    expect(within(footerRow).queryByText('9999')).not.toBeInTheDocument()
    expect(within(footerRow).getAllByText('100.00').length).toBeGreaterThan(0)
  })

  it('内訳がない場合は空状態メッセージを表示する', () => {
    renderPanel()
    expect(screen.getByText(/その他費用はまだありません/)).toBeInTheDocument()
  })

  it('「その他費用を管理」ボタンでBudgetBreakdownDialog（その他費用固定モード）が開く', async () => {
    const user = userEvent.setup()
    renderPanel()

    expect(screen.queryByText('その他費用')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /その他費用を管理/ }))
    expect(screen.getByText('その他費用')).toBeInTheDocument()
  })

  it('「実績明細」ボタンでOtherExpenseActualDialogが開く', async () => {
    const user = userEvent.setup()
    breakdowns = [createExpense({ label: '書籍代' })]
    renderPanel()

    await user.click(screen.getByRole('button', { name: '実績明細' }))
    expect(
      screen.getByText(/の実績明細（いつ・何を購入したか）を記録します/),
    ).toBeInTheDocument()
  })
})
