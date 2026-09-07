import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Division } from '@/shared/types/division'
import {
  useBudgetStore,
  useEffortsStore,
  useProjectsStore,
  useTeamStore,
  useWbsSettingsStore,
} from '@/stores'
import { AllDivisionsBudgetSummary } from '../AllDivisionsBudgetSummary'

vi.mock('@/stores', () => ({
  useBudgetStore: vi.fn(),
  useTeamStore: vi.fn(),
  useProjectsStore: vi.fn(),
  useEffortsStore: vi.fn(),
  useWbsSettingsStore: vi.fn(),
}))

afterEach(() => cleanup())

const DIVISION_A = crypto.randomUUID()
const DIVISION_B = crypto.randomUUID()

function createDivision(overrides: Partial<Division> = {}): Division {
  return {
    id: DIVISION_A,
    name: '開発部',
    sortOrder: 0,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('AllDivisionsBudgetSummary', () => {
  let divisions: Division[]
  const mockGetOverviewForDivisions = vi.fn()
  const mockGetAiUsageTotalForDivisions = vi.fn(() => 0)

  beforeEach(() => {
    divisions = [
      createDivision(),
      createDivision({ id: DIVISION_B, name: '営業部', sortOrder: 1 }),
    ]
    mockGetOverviewForDivisions.mockReset()
    mockGetAiUsageTotalForDivisions.mockReset()
    mockGetAiUsageTotalForDivisions.mockReturnValue(0)

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useTeamStore).mockImplementation((selector: any) =>
      selector({ divisions }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useBudgetStore).mockImplementation((selector: any) =>
      selector({
        divisionBudgets: [],
        budgetBreakdowns: [],
        aiUsageEntries: [],
        saasContracts: [],
        exchangeRateHistory: [],
        estimatedUnitPrice: 100,
        defaultCoefficient: 1,
        projectCoefficients: {},
        getBudgetOverviewForDivisions: mockGetOverviewForDivisions,
        getAiUsageTotalForDivisions: mockGetAiUsageTotalForDivisions,
      }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useProjectsStore).mockImplementation((selector: any) =>
      selector({ projects: [] }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useEffortsStore).mockImplementation((selector: any) =>
      selector({ efforts: [] }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useWbsSettingsStore).mockImplementation((selector: any) =>
      selector({ settingsMap: {} }),
    )
  })

  it('全部門の対象部門数を見出しに表示する', () => {
    mockGetOverviewForDivisions.mockReturnValue({
      projectPersonnelTotal: 0,
      projectExpenseTotal: 0,
      generalExpenseTotal: 0,
      aiUsageBudgetTotal: 0,
      saasCostTotal: 0,
      personnelPlanBudgetTotal: 0,
      projectWbsEstimateTotal: 0,
      grandTotal: 0,
    })
    render(<AllDivisionsBudgetSummary fiscalYear={2025} />)
    expect(screen.getByText('全部門サマリー（2部門合計）')).toBeInTheDocument()
  })

  it('getBudgetOverviewForDivisionsに全部門のIDを渡して集計する', () => {
    mockGetOverviewForDivisions.mockReturnValue({
      projectPersonnelTotal: 100,
      projectExpenseTotal: 0,
      generalExpenseTotal: 0,
      aiUsageBudgetTotal: 0,
      saasCostTotal: 0,
      personnelPlanBudgetTotal: 0,
      projectWbsEstimateTotal: 0,
      grandTotal: 100,
    })
    render(<AllDivisionsBudgetSummary fiscalYear={2025} />)
    expect(mockGetOverviewForDivisions).toHaveBeenCalledWith(
      [DIVISION_A, DIVISION_B],
      2025,
    )
  })

  it('総合計（grandTotal）を表示する', () => {
    mockGetOverviewForDivisions.mockReturnValue({
      projectPersonnelTotal: 100,
      projectExpenseTotal: 50,
      generalExpenseTotal: 20,
      aiUsageBudgetTotal: 30,
      saasCostTotal: 60,
      personnelPlanBudgetTotal: 200,
      projectWbsEstimateTotal: 10,
      grandTotal: 470,
    })
    render(<AllDivisionsBudgetSummary fiscalYear={2025} />)
    expect(screen.getByText('470.00 万円')).toBeInTheDocument()
  })

  // 反証: 部門が0件の場合でもクラッシュせず0部門と表示する
  it('反証: 部門が0件の場合でもクラッシュせず0部門と表示する', () => {
    divisions = []
    mockGetOverviewForDivisions.mockReturnValue({
      projectPersonnelTotal: 0,
      projectExpenseTotal: 0,
      generalExpenseTotal: 0,
      aiUsageBudgetTotal: 0,
      saasCostTotal: 0,
      personnelPlanBudgetTotal: 0,
      projectWbsEstimateTotal: 0,
      grandTotal: 0,
    })
    expect(() =>
      render(<AllDivisionsBudgetSummary fiscalYear={2025} />),
    ).not.toThrow()
    expect(screen.getByText('全部門サマリー（0部門合計）')).toBeInTheDocument()
    expect(mockGetOverviewForDivisions).toHaveBeenCalledWith([], 2025)
  })
})
