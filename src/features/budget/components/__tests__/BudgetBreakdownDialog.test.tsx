import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BudgetBreakdown } from '@/shared/types/budget'
import { useBudgetStore, useProjectsStore, useTeamStore } from '@/stores'
import { BudgetBreakdownDialog } from '../BudgetBreakdownDialog'

vi.mock('@/stores', () => ({
  useBudgetStore: vi.fn(),
  useProjectsStore: vi.fn(),
  useTeamStore: vi.fn(),
}))

vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

afterEach(() => cleanup())

const BUDGET_ID = crypto.randomUUID()
const DIVISION_ID = crypto.randomUUID()
const OTHER_DIVISION_ID = crypto.randomUUID()

function createBreakdown(
  overrides: Partial<BudgetBreakdown> = {},
): BudgetBreakdown {
  return {
    id: crypto.randomUUID(),
    budgetId: BUDGET_ID,
    category: 'project_personnel',
    label: '案件A',
    amount: 1000,
    recordedAt: '2025-04-01',
    createdAt: '2025-04-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('BudgetBreakdownDialog', () => {
  let breakdowns: BudgetBreakdown[]
  const mockAddBudgetBreakdown = vi.fn()
  const mockUpdateBudgetBreakdown = vi.fn()
  const mockDeleteBudgetBreakdown = vi.fn()

  beforeEach(() => {
    breakdowns = []
    mockAddBudgetBreakdown.mockReset()
    mockUpdateBudgetBreakdown.mockReset()
    mockDeleteBudgetBreakdown.mockReset()

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useBudgetStore).mockImplementation((selector: any) =>
      selector({
        addBudgetBreakdown: mockAddBudgetBreakdown,
        updateBudgetBreakdown: mockUpdateBudgetBreakdown,
        deleteBudgetBreakdown: mockDeleteBudgetBreakdown,
        budgetBreakdowns: breakdowns,
        getAiUsageBudgetTotal: () => 0,
        getSaasAnnualCostTotal: () => 0,
      }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useProjectsStore).mockImplementation((selector: any) =>
      selector({ projects: [] }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useTeamStore).mockImplementation((selector: any) =>
      selector({
        divisions: [
          { id: DIVISION_ID, name: '開発部' },
          { id: OTHER_DIVISION_ID, name: '営業部' },
        ],
      }),
    )
  })

  function renderDialog() {
    return render(
      <BudgetBreakdownDialog
        open={true}
        onOpenChange={() => {}}
        budgetId={BUDGET_ID}
        divisionId={DIVISION_ID}
        fiscalYear={2025}
        startMonth={4}
        divisionName="開発部"
      />,
    )
  }

  it('内訳一覧に編集・削除ボタンが表示される', () => {
    breakdowns = [createBreakdown()]
    renderDialog()
    expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument()
  })

  it('削除ボタンを押すとdeleteBudgetBreakdownが呼ばれる', async () => {
    const user = userEvent.setup()
    const breakdown = createBreakdown()
    breakdowns = [breakdown]
    renderDialog()

    await user.click(screen.getByRole('button', { name: '削除' }))
    expect(mockDeleteBudgetBreakdown).toHaveBeenCalledWith(breakdown.id)
  })

  it('編集ボタンを押すとフォームに既存値が読み込まれ、ボタンラベルが更新用に変わる', async () => {
    const user = userEvent.setup()
    const breakdown = createBreakdown({ label: '案件B', amount: 2000 })
    breakdowns = [breakdown]
    renderDialog()

    await user.click(screen.getByRole('button', { name: '編集' }))

    const labelInput = screen.getByLabelText(
      'ラベル（プロジェクト名等）',
    ) as HTMLInputElement
    expect(labelInput.value).toBe('案件B')
    expect(
      screen.getByRole('button', { name: '内訳を更新' }),
    ).toBeInTheDocument()
  })

  describe('担当部門の連動ヒント', () => {
    const PROJECT_ID_SAME_DIVISION = crypto.randomUUID()
    const PROJECT_ID_OTHER_DIVISION = crypto.randomUUID()

    beforeEach(() => {
      // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
      vi.mocked(useProjectsStore).mockImplementation((selector: any) =>
        selector({
          projects: [
            {
              id: PROJECT_ID_SAME_DIVISION,
              code: 'P001',
              name: '自部門案件',
              divisionId: DIVISION_ID,
              confidence: null,
            },
            {
              id: PROJECT_ID_OTHER_DIVISION,
              code: 'P002',
              name: '他部門案件',
              divisionId: OTHER_DIVISION_ID,
              confidence: null,
            },
          ],
        }),
      )
    })

    it('選択案件の担当部門が計上先と一致する場合、担当部門名を通知する', async () => {
      const user = userEvent.setup()
      const breakdown = createBreakdown({
        projectId: PROJECT_ID_SAME_DIVISION,
      })
      breakdowns = [breakdown]
      renderDialog()

      await user.click(screen.getByRole('button', { name: '編集' }))

      expect(
        screen.getByText(/担当部門「開発部」の予算として計上します/),
      ).toBeInTheDocument()
    })

    // 反証: 案件の担当部門と、現在計上先として開いている部門が異なる場合に
    // 気付けるよう警告表示になるか（自動でDivisionBudgetを切り替えることはしない）
    it('選択案件の担当部門が計上先と異なる場合、警告文言を表示する', async () => {
      const user = userEvent.setup()
      const breakdown = createBreakdown({
        projectId: PROJECT_ID_OTHER_DIVISION,
      })
      breakdowns = [breakdown]
      renderDialog()

      await user.click(screen.getByRole('button', { name: '編集' }))

      expect(
        screen.getByText(
          /このプロジェクトの担当部門は「営業部」です。現在計上先の部門「開発部」と異なります。/,
        ),
      ).toBeInTheDocument()
    })

    it('担当部門が未設定の案件を選択した場合はヒントを表示しない', async () => {
      const user = userEvent.setup()
      const breakdown = createBreakdown({ projectId: null })
      breakdowns = [breakdown]
      renderDialog()

      await user.click(screen.getByRole('button', { name: '編集' }))

      expect(screen.queryByText(/担当部門/)).not.toBeInTheDocument()
    })
  })

  it('編集モードで更新ボタンを押すとupdateBudgetBreakdownが呼ばれ、addBudgetBreakdownは呼ばれない', async () => {
    const user = userEvent.setup()
    const breakdown = createBreakdown({ label: '案件B', amount: 2000 })
    breakdowns = [breakdown]
    renderDialog()

    await user.click(screen.getByRole('button', { name: '編集' }))
    const labelInput = screen.getByLabelText('ラベル（プロジェクト名等）')
    await user.clear(labelInput)
    await user.type(labelInput, '案件B（修正）')
    await user.click(screen.getByRole('button', { name: '内訳を更新' }))

    expect(mockUpdateBudgetBreakdown).toHaveBeenCalledWith(
      expect.objectContaining({ id: breakdown.id, label: '案件B（修正）' }),
    )
    expect(mockAddBudgetBreakdown).not.toHaveBeenCalled()
  })

  it('編集モードでキャンセルを押すとフォームがクリアされ新規追加モードに戻る', async () => {
    const user = userEvent.setup()
    const breakdown = createBreakdown({ label: '案件B' })
    breakdowns = [breakdown]
    renderDialog()

    await user.click(screen.getByRole('button', { name: '編集' }))
    await user.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(
      screen.getByRole('button', { name: '内訳を追加' }),
    ).toBeInTheDocument()
    const labelInput = screen.getByLabelText(
      'ラベル（プロジェクト名等）',
    ) as HTMLInputElement
    expect(labelInput.value).toBe('')
  })

  it('概算額・係数・金額フィールドはNumericInput（type="text"）としてレンダリングされる', () => {
    renderDialog()
    const estimateInput = screen.getByLabelText(
      '概算額（万円・任意）',
    ) as HTMLInputElement
    expect(estimateInput.type).toBe('text')
  })

  it('新規追加時はaddBudgetBreakdownが呼ばれる（既存の追加フローが壊れていない）', async () => {
    const user = userEvent.setup()
    renderDialog()

    const labelInput = screen.getByLabelText('ラベル（プロジェクト名等）')
    await user.type(labelInput, '新規案件')
    const amountInput = screen.getByLabelText('金額（万円）')
    await user.clear(amountInput)
    await user.type(amountInput, '500')

    await user.click(screen.getByRole('button', { name: '内訳を追加' }))

    expect(mockAddBudgetBreakdown).toHaveBeenCalled()
    expect(mockUpdateBudgetBreakdown).not.toHaveBeenCalled()
  })

  // 反証: 削除した内訳を編集中だった場合、削除操作で編集フォームが残留しないか
  it('編集中の内訳を削除すると編集モードが解除される', async () => {
    const user = userEvent.setup()
    const breakdown = createBreakdown({ label: '案件C' })
    breakdowns = [breakdown]
    const { rerender } = renderDialog()

    await user.click(screen.getByRole('button', { name: '編集' }))
    expect(
      screen.getByRole('button', { name: '内訳を更新' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '削除' }))
    expect(mockDeleteBudgetBreakdown).toHaveBeenCalledWith(breakdown.id)

    // ストアから削除された状態を模してrerender
    breakdowns = []
    rerender(
      <BudgetBreakdownDialog
        open={true}
        onOpenChange={() => {}}
        budgetId={BUDGET_ID}
        divisionId={DIVISION_ID}
        fiscalYear={2025}
        startMonth={4}
        divisionName="開発部"
      />,
    )
    expect(
      screen.getByRole('button', { name: '内訳を追加' }),
    ).toBeInTheDocument()
  })

  it('複数の内訳がある場合、それぞれ独立した編集・削除ボタンを持つ', () => {
    breakdowns = [
      createBreakdown({ label: '案件A' }),
      createBreakdown({ label: '案件B' }),
    ]
    renderDialog()
    expect(screen.getAllByRole('button', { name: '編集' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: '削除' })).toHaveLength(2)
  })

  // 反証: 1件を削除しても他の内訳のボタンが誤って反応しないか（idの取り違えがないか）
  it('特定の内訳の削除ボタンは、そのIDのみを対象にdeleteBudgetBreakdownを呼ぶ', async () => {
    const user = userEvent.setup()
    const breakdownA = createBreakdown({ label: '案件A' })
    const breakdownB = createBreakdown({ label: '案件B' })
    breakdowns = [breakdownA, breakdownB]
    renderDialog()

    const rows = screen.getAllByRole('button', { name: '削除' })
    await user.click(rows[1] as HTMLElement)

    expect(mockDeleteBudgetBreakdown).toHaveBeenCalledTimes(1)
    expect(mockDeleteBudgetBreakdown).toHaveBeenCalledWith(breakdownB.id)
  })

  describe('allowedCategoriesが1件指定時（その他費用タブからの再利用）', () => {
    function renderLockedDialog() {
      return render(
        <BudgetBreakdownDialog
          open={true}
          onOpenChange={() => {}}
          budgetId={BUDGET_ID}
          divisionId={DIVISION_ID}
          fiscalYear={2025}
          startMonth={4}
          divisionName="開発部"
          allowedCategories={['general_expense']}
        />,
      )
    }

    it('種別セレクタが表示されず、固定ラベルが表示される', () => {
      renderLockedDialog()
      expect(screen.queryByLabelText('種別')).not.toBeInTheDocument()
      expect(screen.getByText('一般経費')).toBeInTheDocument()
    })

    it('タイトルが「その他費用」になる', () => {
      renderLockedDialog()
      expect(screen.getByText('その他費用')).toBeInTheDocument()
    })

    it('一覧はallowedCategoriesの区分のみに絞り込まれる', () => {
      breakdowns = [
        createBreakdown({ label: '一般経費A', category: 'general_expense' }),
        createBreakdown({
          label: '案件人件費A',
          category: 'project_personnel',
        }),
      ]
      renderLockedDialog()
      expect(screen.getByText('一般経費A')).toBeInTheDocument()
      expect(screen.queryByText('案件人件費A')).not.toBeInTheDocument()
    })

    it('新規追加時、category=general_expenseでaddBudgetBreakdownが呼ばれる', async () => {
      const user = userEvent.setup()
      renderLockedDialog()

      const labelInput = screen.getByLabelText('ラベル（プロジェクト名等）')
      await user.type(labelInput, '書籍代')
      const amountInput = screen.getByLabelText('金額（万円）')
      await user.clear(amountInput)
      await user.type(amountInput, '30')
      await user.click(screen.getByRole('button', { name: '内訳を追加' }))

      expect(mockAddBudgetBreakdown).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'general_expense' }),
      )
    })
  })

  describe('allowedCategoriesが複数指定時（その他のPJ予算）', () => {
    function renderProjectOnlyDialog() {
      return render(
        <BudgetBreakdownDialog
          open={true}
          onOpenChange={() => {}}
          budgetId={BUDGET_ID}
          divisionId={DIVISION_ID}
          fiscalYear={2025}
          startMonth={4}
          divisionName="開発部"
          allowedCategories={['project_personnel', 'project_expense']}
        />,
      )
    }

    it('タイトルが「その他のPJ予算」になる', () => {
      renderProjectOnlyDialog()
      expect(screen.getByText('その他のPJ予算')).toBeInTheDocument()
    })

    it('種別セレクタは表示され、選択肢はallowedCategoriesの2区分のみに絞られる', () => {
      renderProjectOnlyDialog()
      const select = screen.getByLabelText('種別') as HTMLSelectElement
      const optionTexts = Array.from(select.options).map((o) => o.text)
      expect(optionTexts).toEqual([
        'プロジェクト（人件費）',
        'プロジェクト（付帯費用）',
      ])
    })

    it('一覧はallowedCategoriesに含まれる区分のみに絞り込まれ、一般経費は除外される', () => {
      breakdowns = [
        createBreakdown({
          label: '案件人件費A',
          category: 'project_personnel',
        }),
        createBreakdown({ label: '一般経費A', category: 'general_expense' }),
      ]
      renderProjectOnlyDialog()
      expect(screen.getByText('案件人件費A')).toBeInTheDocument()
      expect(screen.queryByText('一般経費A')).not.toBeInTheDocument()
    })
  })

  describe('実績明細ボタン（1:N実績管理）', () => {
    it('内訳一覧の各行に実績明細ボタンが表示される', () => {
      breakdowns = [createBreakdown()]
      renderDialog()
      expect(
        screen.getByRole('button', { name: /実績明細/ }),
      ).toBeInTheDocument()
    })

    it('実績明細ボタンを押すと実績明細ダイアログが開く', async () => {
      const user = userEvent.setup()
      breakdowns = [createBreakdown({ label: '案件A' })]
      renderDialog()

      await user.click(screen.getByRole('button', { name: /実績明細/ }))

      expect(
        screen.getByRole('heading', { name: '実績明細' }),
      ).toBeInTheDocument()
      expect(
        screen.getByText(
          /案件A.*の実績明細（いつ・何を購入したか）を記録します/,
        ),
      ).toBeInTheDocument()
    })

    it('その他のPJ予算（project_personnel区分）でも実績明細ボタンが機能する', async () => {
      const user = userEvent.setup()
      breakdowns = [
        createBreakdown({
          label: '案件人件費A',
          category: 'project_personnel',
        }),
      ]
      render(
        <BudgetBreakdownDialog
          open={true}
          onOpenChange={() => {}}
          budgetId={BUDGET_ID}
          divisionId={DIVISION_ID}
          fiscalYear={2025}
          startMonth={4}
          divisionName="開発部"
          allowedCategories={['project_personnel', 'project_expense']}
        />,
      )

      await user.click(screen.getByRole('button', { name: /実績明細/ }))

      expect(
        screen.getByRole('heading', { name: '実績明細' }),
      ).toBeInTheDocument()
    })
  })
})
