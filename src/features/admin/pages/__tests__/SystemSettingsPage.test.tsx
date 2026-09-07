import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SystemSettingsPage } from '../SystemSettingsPage'

/**
 * 全社設定。旧Layoutのポップオーバーから移設した項目のテスト。
 * 移設で検証が薄くならないよう、値の初期表示と保存アクションの呼び出しを固定する。
 */

const mockSetEstimatedUnitPrice = vi.fn()
const mockSetExchangeRate = vi.fn()
const mockSetWorkdaysPerMonth = vi.fn()
const mockSetBaselineStaleThreshold = vi.fn()
const mockSetFiscalYearStartMonth = vi.fn()
const mockLoadBudgetData = vi.fn()

const budgetState = {
  loadBudgetData: mockLoadBudgetData,
  estimatedUnitPrice: 80,
  setEstimatedUnitPrice: mockSetEstimatedUnitPrice,
  defaultCoefficient: 1.2,
  setDefaultCoefficient: vi.fn(),
  // 2つの履歴を持たせ、対象月に適用されるレートが選ばれることを見る
  exchangeRateHistory: [
    { effectiveFrom: '2020-01', rate: 100 },
    { effectiveFrom: '2020-02', rate: 155 },
  ],
  setExchangeRate: mockSetExchangeRate,
  workdaysPerMonth: 20,
  setWorkdaysPerMonth: mockSetWorkdaysPerMonth,
  hoursPerDay: 8,
  setHoursPerDay: vi.fn(),
  skillReviewCycleMonths: 3,
  setSkillReviewCycleMonths: vi.fn(),
  baselineStaleThreshold: 0.1,
  setBaselineStaleThreshold: mockSetBaselineStaleThreshold,
  summaryBudgetProgressGapThreshold: 0.15,
  setSummaryBudgetProgressGapThreshold: vi.fn(),
  summarySpiWarningThreshold: 0.9,
  setSummarySpiWarningThreshold: vi.fn(),
}

const mockToggleShowFinancials = vi.fn()
const mockOpenSetupWizard = vi.fn()
const appState = {
  fiscalYearStartMonth: 4,
  setFiscalYearStartMonth: mockSetFiscalYearStartMonth,
  showFinancials: true,
  toggleShowFinancials: mockToggleShowFinancials,
  openSetupWizard: mockOpenSetupWizard,
}

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/stores', () => ({
  // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
  useBudgetStore: (selector: any) => selector(budgetState),
  // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
  useAppStore: (selector: any) => selector(appState),
}))

afterEach(() => cleanup())
beforeEach(() => vi.clearAllMocks())

describe('SystemSettingsPage', () => {
  it('マウント時にloadBudgetDataを呼ぶ（未ロードのまま保存すると他フィールドを空で上書きするため）', () => {
    render(<SystemSettingsPage />)
    expect(mockLoadBudgetData).toHaveBeenCalled()
  })

  it('3つのカードに分かれて表示される', () => {
    render(<SystemSettingsPage />)
    expect(screen.getByText('基本')).toBeInTheDocument()
    expect(screen.getByText('見積・単価')).toBeInTheDocument()
    expect(screen.getByText('警告のしきい値')).toBeInTheDocument()
  })

  it('概算単価の現在値を表示し、変更するとストアへ渡す', async () => {
    const user = userEvent.setup()
    render(<SystemSettingsPage />)
    const input = screen.getByLabelText('概算単価')
    expect(input).toHaveValue('80')

    await user.clear(input)
    await user.type(input, '90')
    await user.tab()
    expect(mockSetEstimatedUnitPrice).toHaveBeenCalledWith(90)
  })

  it('反証: 為替レートは履歴の最新ではなく「対象月に適用される値」を出す', () => {
    render(<SystemSettingsPage />)
    // 2020-02以降は155。現在月は両方より後なので155が適用される
    expect(screen.getByLabelText('為替レート（＄→円）')).toHaveValue('155')
  })

  it('反証: しきい値は%表示だが、ストアへは比率（0〜1）で渡す', async () => {
    const user = userEvent.setup()
    render(<SystemSettingsPage />)
    const input = screen.getByLabelText('ベースライン乖離')
    expect(input).toHaveValue('10')

    await user.clear(input)
    await user.type(input, '20')
    await user.tab()
    expect(mockSetBaselineStaleThreshold).toHaveBeenCalledWith(0.2)
  })

  it('年度開始月を選ぶとストアへ数値で渡す', async () => {
    const user = userEvent.setup()
    render(<SystemSettingsPage />)
    await user.selectOptions(screen.getByLabelText('年度開始月'), '1')
    expect(mockSetFiscalYearStartMonth).toHaveBeenCalledWith(1)
  })

  describe('ポップオーバーから移設した導線', () => {
    it('金額の表示トグルは押下状態をaria-pressedで示す', async () => {
      const user = userEvent.setup()
      render(<SystemSettingsPage />)
      const toggle = screen.getByRole('button', { name: '金額の表示' })
      // ボタン文言（表示中/非表示）はラベルに隠れてアクセシブルネームにならないため、
      // 状態はaria-pressedで読み取れる必要がある
      expect(toggle).toHaveAttribute('aria-pressed', 'true')

      await user.click(toggle)
      expect(mockToggleShowFinancials).toHaveBeenCalled()
    })

    it('初期設定ウィザードは開く指示を出してからダッシュボードへ移動する', async () => {
      const user = userEvent.setup()
      render(<SystemSettingsPage />)
      await user.click(
        screen.getByRole('button', { name: '初期設定ウィザードを開く' }),
      )
      // ウィザード本体はDashboardPageがマウントするため、
      // 開くだけでは何も表示されず遷移が要る
      expect(mockOpenSetupWizard).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })
  })
})
