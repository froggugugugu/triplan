import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useAppStore,
  useAuthStore,
  useBudgetStore,
  useScheduleSettingsStore,
  useWbsSettingsStore,
} from '@/stores'
import { Layout } from '../Layout'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/stores', () => ({
  useAppStore: vi.fn(),
  useAuthStore: vi.fn(),
  useBudgetStore: vi.fn(),
  useScheduleSettingsStore: vi.fn(),
  useWbsSettingsStore: vi.fn(),
  // 横断検索パレットが参照する。Layoutのテスト対象ではないため空データ
  // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
  useProjectsStore: (selector: any) => selector({ projects: [] }),
  // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
  useMembersStore: (selector: any) => selector({ members: [] }),
}))

afterEach(() => cleanup())

describe('Layout', () => {
  const mockSetTheme = vi.fn()
  const mockSetFiscalYearStartMonth = vi.fn()
  const mockToggleSidebar = vi.fn()
  const mockSetEstimatedUnitPrice = vi.fn()
  const mockSetDefaultCoefficient = vi.fn()
  const mockSetExchangeRate = vi.fn()
  const mockLoadBudgetData = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useAppStore).mockImplementation((selector: any) =>
      selector({
        theme: 'light',
        setTheme: mockSetTheme,
        fiscalYearStartMonth: 4,
        setFiscalYearStartMonth: mockSetFiscalYearStartMonth,
        isSidebarCollapsed: false,
        toggleSidebar: mockToggleSidebar,
      }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useBudgetStore).mockImplementation((selector: any) =>
      selector({
        estimatedUnitPrice: 80,
        setEstimatedUnitPrice: mockSetEstimatedUnitPrice,
        defaultCoefficient: 1,
        setDefaultCoefficient: mockSetDefaultCoefficient,
        exchangeRateHistory: [],
        setExchangeRate: mockSetExchangeRate,
        getApplicableExchangeRate: () => 0,
        loadBudgetData: mockLoadBudgetData,
      }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useAuthStore).mockImplementation((selector: any) =>
      selector({
        currentUser: null,
      }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useScheduleSettingsStore).mockImplementation((selector: any) =>
      selector({ loadScheduleSettings: vi.fn() }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useWbsSettingsStore).mockImplementation((selector: any) =>
      selector({ loadWbsSettings: vi.fn() }),
    )
  })

  function renderLayout() {
    return render(
      <MemoryRouter>
        <Layout>
          <div>content</div>
        </Layout>
      </MemoryRouter>,
    )
  }

  // 反証: /budget未訪問のまま概算単価を変更すると、budget-storeの他フィールド
  // （divisionBudgets等、未ロードで空配列）がpersistBudgetStateで上書き保存され
  // 既存データが消えるバグを防ぐため、マウント時にloadBudgetDataが必ず呼ばれるか
  it('マウント時にloadBudgetDataを呼び、budget-storeを事前にハイドレートする', () => {
    renderLayout()
    expect(mockLoadBudgetData).toHaveBeenCalled()
  })

  // 全社設定（概算単価・為替レート等）はポップオーバーから管理画面へ移設した。
  // 値の編集そのもののテストはSystemSettingsPage.test.tsxが担い、ここでは入口だけを見る
  it('管理画面への入口があり、クリックで/admin/settingsへ遷移する', async () => {
    const user = userEvent.setup()
    renderLayout()
    const button = screen.getByLabelText('管理画面を開く')
    expect(button).toBeInTheDocument()
    await user.click(button)
    expect(mockNavigate).toHaveBeenCalledWith('/admin/settings')
  })

  it('反証: 設定値を直接編集する入力欄はもう置かない（管理画面へ集約した）', () => {
    renderLayout()
    expect(screen.queryByLabelText('概算単価（万円）')).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText('為替レート（円/＄）'),
    ).not.toBeInTheDocument()
  })
})
