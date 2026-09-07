import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BudgetBreakdown, SaasContract } from '@/shared/types/budget'
import type { Division } from '@/shared/types/division'
import type { Project, ProjectTreeNode } from '@/shared/types/project'
import { createDefaultWbsSettings } from '@/shared/types/wbs-settings'
import {
  useBudgetStore,
  useEffortsStore,
  useProjectsStore,
  useTeamStore,
  useWbsSettingsStore,
} from '@/stores'
import { DivisionBudgetPanel } from '../DivisionBudgetPanel'

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
const BUDGET_ID = crypto.randomUUID()

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

function createBudgetBreakdown(
  overrides: Partial<BudgetBreakdown> = {},
): BudgetBreakdown {
  return {
    id: crypto.randomUUID(),
    budgetId: BUDGET_ID,
    category: 'general_expense',
    label: '一般経費',
    amount: 100,
    recordedAt: '2025-04-01',
    createdAt: '2025-04-01T00:00:00.000Z',
    ...overrides,
  }
}

function createSaasContract(
  overrides: Partial<SaasContract> = {},
): SaasContract {
  return {
    id: crypto.randomUUID(),
    name: 'Test SaaS',
    divisionId: DIVISION_A,
    contractType: 'annual',
    amount: 100,
    paymentCycle: 'annual',
    contractStartDate: '2025-04-01',
    nextRenewalDate: '2026-03-31',
    note: null,
    createdAt: '2025-04-01T00:00:00.000Z',
    updatedAt: '2025-04-01T00:00:00.000Z',
    ...overrides,
  }
}

function buildTree(projects: Project[]): ProjectTreeNode[] {
  const nodeMap = new Map<string, ProjectTreeNode>(
    projects.map((p) => [p.id, { ...p, children: [], depth: p.level }]),
  )
  const roots: ProjectTreeNode[] = []
  for (const p of projects) {
    const node = nodeMap.get(p.id)
    if (!node) continue
    if (p.parentId) {
      const parent = nodeMap.get(p.parentId)
      if (parent) parent.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

describe('DivisionBudgetPanel', () => {
  let divisions: Division[]
  let budgetBreakdowns: BudgetBreakdown[]
  let saasContracts: SaasContract[]
  const mockGetOverview = vi.fn()
  const mockGetOrCreateDivisionBudget = vi.fn()
  const mockGetDivisionBudget = vi.fn()
  const mockGetAiUsageTotal = vi.fn(() => 0)

  const emptyOverview = {
    projectPersonnelTotal: 0,
    projectExpenseTotal: 0,
    generalExpenseTotal: 0,
    aiUsageBudgetTotal: 0,
    saasCostTotal: 0,
    personnelPlanBudgetTotal: 0,
    projectWbsEstimateTotal: 0,
    grandTotal: 0,
  }

  beforeEach(() => {
    divisions = [createDivision()]
    budgetBreakdowns = []
    saasContracts = []
    mockGetOverview.mockReset()
    mockGetOverview.mockReturnValue(emptyOverview)
    mockGetOrCreateDivisionBudget.mockReset()
    mockGetOrCreateDivisionBudget.mockReturnValue({
      id: BUDGET_ID,
      divisionId: DIVISION_A,
      fiscalYear: 2025,
      initialAmount: 0,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    })
    mockGetDivisionBudget.mockReset()
    mockGetDivisionBudget.mockReturnValue(undefined)
    mockGetAiUsageTotal.mockReset()
    mockGetAiUsageTotal.mockReturnValue(0)

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useTeamStore).mockImplementation((selector: any) =>
      selector({ divisions }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useBudgetStore).mockImplementation((selector: any) =>
      selector({
        divisionBudgets: [],
        aiUsageEntries: [],
        exchangeRateHistory: [],
        workdaysPerMonth: 20,
        get budgetBreakdowns() {
          return budgetBreakdowns
        },
        get saasContracts() {
          return saasContracts
        },
        estimatedUnitPrice: 100,
        defaultCoefficient: 1,
        projectCoefficients: {},
        getBudgetOverview: mockGetOverview,
        getOrCreateDivisionBudget: mockGetOrCreateDivisionBudget,
        getDivisionBudget: mockGetDivisionBudget,
        getAiUsageTotal: mockGetAiUsageTotal,
      }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useProjectsStore).mockImplementation((selector: any) =>
      selector({ projects: [], getProjectTree: () => buildTree([]) }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useEffortsStore).mockImplementation((selector: any) =>
      selector({ efforts: [] }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useWbsSettingsStore).mockImplementation((selector: any) =>
      selector({
        entries: [],
        getSettings: () => createDefaultWbsSettings(),
      }),
    )
  })

  function renderPanel() {
    return render(<DivisionBudgetPanel fiscalYear={2025} startMonth={4} />)
  }

  function getDataCells(divisionName: string) {
    const row = screen.getByText(divisionName).closest('tr') as HTMLElement
    return within(row).getAllByRole('cell')
  }

  it('案件予算列は1行目=予算合計・2行目=人件費予算合計・3行目=残予算合計の3行構成になる', () => {
    mockGetOverview.mockReturnValue({
      ...emptyOverview,
      projectPersonnelTotal: 1000,
      projectExpenseTotal: 200,
      personnelPlanBudgetTotal: 400,
    })
    renderPanel()
    const cells = getDataCells('開発部')
    // cells[0]=部門名, cells[1]=案件予算
    const projectCell = cells[1] as HTMLElement
    // 予算合計 1000+200=1200、人件費予算合計 400、残 1200-400=800
    expect(projectCell.textContent).toContain('1,200')
    expect(projectCell.textContent).toContain('400')
    expect(projectCell.textContent).toContain('800')
  })

  // 反証: 担当部門一致案件のWBS概算予算額（projectWbsEstimateTotal）が
  // 案件予算列の予算合計に正しく合算されるか
  it('担当部門一致案件のWBS概算予算額を案件予算列の予算合計に合算する', () => {
    mockGetOverview.mockReturnValue({
      ...emptyOverview,
      projectPersonnelTotal: 500,
      projectWbsEstimateTotal: 700,
    })
    renderPanel()
    const cells = getDataCells('開発部')
    // 案件予算の予算合計 = 500(手動計上) + 700(WBS概算) = 1200
    expect((cells[1] as HTMLElement).textContent).toContain('1,200')
  })

  it('その他費用列は予算額(generalExpenseTotal)・実績明細合計・残額の3行構成になる', () => {
    mockGetDivisionBudget.mockReturnValue({
      id: BUDGET_ID,
      divisionId: DIVISION_A,
      fiscalYear: 2025,
      initialAmount: 0,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    })
    budgetBreakdowns = [
      createBudgetBreakdown({
        category: 'general_expense',
        actualRecords: [
          {
            id: 'r1',
            purchasedAt: '2025-04-10',
            itemLabel: '書籍代',
            amount: 30,
          },
        ],
      }),
      // 他部門の予算枠は集計対象外
      createBudgetBreakdown({
        budgetId: crypto.randomUUID(),
        category: 'general_expense',
        actualRecords: [
          {
            id: 'r2',
            purchasedAt: '2025-04-10',
            itemLabel: '他部門',
            amount: 999,
          },
        ],
      }),
      // project_personnel区分は「その他費用」実績に含めない
      createBudgetBreakdown({
        category: 'project_personnel',
        actualRecords: [
          {
            id: 'r3',
            purchasedAt: '2025-04-10',
            itemLabel: '案件',
            amount: 999,
          },
        ],
      }),
    ]
    mockGetOverview.mockReturnValue({
      ...emptyOverview,
      generalExpenseTotal: 100,
    })
    renderPanel()
    const cells = getDataCells('開発部')
    const otherExpenseCell = cells[2] as HTMLElement
    // 予算合計100、実績合計30(自部門general_expenseのみ)、残70
    expect(otherExpenseCell.textContent).toContain('100')
    expect(otherExpenseCell.textContent).toContain('30')
    expect(otherExpenseCell.textContent).toContain('70')
  })

  it('AI利用費列は予算額(aiUsageBudgetTotal)・getAiUsageTotal(実績)・残額の3行構成になる', () => {
    mockGetOverview.mockReturnValue({
      ...emptyOverview,
      aiUsageBudgetTotal: 50,
    })
    mockGetAiUsageTotal.mockReturnValue(20)
    renderPanel()
    const cells = getDataCells('開発部')
    const aiUsageCell = cells[3] as HTMLElement
    expect(aiUsageCell.textContent).toContain('50')
    expect(aiUsageCell.textContent).toContain('20')
    expect(aiUsageCell.textContent).toContain('30')
  })

  it('SaaS費用列は予算額(saasCostTotal)・部門内契約の月次実績合計・残額の3行構成になる', () => {
    saasContracts = [
      createSaasContract({
        divisionId: DIVISION_A,
        monthlyActuals: { '2025-04': 40 },
      }),
      // 他部門の契約は集計対象外
      createSaasContract({
        divisionId: DIVISION_B,
        monthlyActuals: { '2025-04': 999 },
      }),
    ]
    mockGetOverview.mockReturnValue({
      ...emptyOverview,
      saasCostTotal: 120,
    })
    renderPanel()
    const cells = getDataCells('開発部')
    const saasCell = cells[4] as HTMLElement
    expect(saasCell.textContent).toContain('120')
    expect(saasCell.textContent).toContain('40')
    expect(saasCell.textContent).toContain('80')
  })

  it('総合計列は案件予算・その他費用・AI利用費・SaaS費用の4列合計になる（予算追加は含まない）', () => {
    mockGetOverview.mockReturnValue({
      ...emptyOverview,
      projectPersonnelTotal: 1000,
      generalExpenseTotal: 50,
      aiUsageBudgetTotal: 30,
      saasCostTotal: 120,
      personnelPlanBudgetTotal: 400,
    })
    renderPanel()
    const cells = getDataCells('開発部')
    // 予算合計: 1000+50+30+120=1200
    const totalCell = cells[5] as HTMLElement
    expect(totalCell.textContent).toContain('1,200')
  })

  it('全部門の総合計を合算した総計行を表示する', () => {
    divisions = [
      createDivision({ id: DIVISION_A, name: '開発部' }),
      createDivision({ id: DIVISION_B, name: '営業部' }),
    ]
    mockGetOverview.mockImplementation((divisionId: string) =>
      divisionId === DIVISION_A
        ? { ...emptyOverview, generalExpenseTotal: 1000 }
        : { ...emptyOverview, generalExpenseTotal: 500 },
    )
    renderPanel()
    expect(screen.getByText('全部門合計')).toBeInTheDocument()
    const totalRow = screen.getByText('全部門合計').closest('tr') as HTMLElement
    expect(within(totalRow).getAllByText(/1,500/).length).toBeGreaterThan(0)
  })

  it('案件タブの概算予算（全社ベース・WBS）をサマリーカードとして表示する', () => {
    const project: Project = {
      id: 'p1',
      code: 'P001',
      name: '案件A',
      parentId: null,
      level: 0,
      status: 'active',
      confidence: null,
      completed: false,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    }
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useProjectsStore).mockImplementation((selector: any) =>
      selector({
        projects: [project],
        getProjectTree: () => buildTree([project]),
      }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useEffortsStore).mockImplementation((selector: any) =>
      selector({
        efforts: [
          { id: 'e1', projectId: 'p1', columnId: 'effort-1', value: 40 },
        ],
      }),
    )
    renderPanel()
    // 40人日 ÷ 20(人月換算) = 2人月 × 100(概算単価) = 200万円（是正後）
    expect(screen.getByText(/プロジェクトタブの概算予算/)).toBeInTheDocument()
    expect(screen.getByText(/200/)).toBeInTheDocument()
  })

  // 反証: 他部門の俯瞰値が混入して当該部門の行を歪めていないか
  it('各部門の俯瞰行は他部門の値と独立している', () => {
    divisions = [
      createDivision({ id: DIVISION_A, name: '開発部' }),
      createDivision({ id: DIVISION_B, name: '営業部' }),
    ]
    mockGetOverview.mockImplementation((divisionId: string) =>
      divisionId === DIVISION_A
        ? { ...emptyOverview, generalExpenseTotal: 111 }
        : { ...emptyOverview, generalExpenseTotal: 222 },
    )
    renderPanel()
    const cellsA = getDataCells('開発部')
    const cellsB = getDataCells('営業部')
    expect((cellsA[2] as HTMLElement).textContent).toContain('111')
    expect((cellsB[2] as HTMLElement).textContent).toContain('222')
  })

  it('「その他のPJ予算」「その他予算変更」ボタンが表示される（内訳・追加履歴からの改称）', () => {
    renderPanel()
    expect(screen.getByTitle('その他のPJ予算')).toBeInTheDocument()
    expect(
      screen.getByTitle('先にその他のPJ予算を登録してください'),
    ).toBeInTheDocument()
  })

  it('予算未登録部門では「その他予算変更」ボタンが無効化される', () => {
    mockGetDivisionBudget.mockReturnValue(undefined)
    renderPanel()
    const button = screen.getByTitle('先にその他のPJ予算を登録してください')
    expect(button).toBeDisabled()
  })

  it('部門が登録されていない場合は空状態メッセージを表示する', () => {
    divisions = []
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useTeamStore).mockImplementation((selector: any) =>
      selector({ divisions: [] }),
    )
    renderPanel()
    expect(screen.getByText(/部門が登録されていません/)).toBeInTheDocument()
  })
})
