import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PersonnelPlanEntry } from '@/shared/types/personnel-plan'
import {
  useAssignmentStore,
  useBudgetStore,
  useCompaniesStore,
  useEffortsStore,
  useMembersStore,
  usePersonnelPlanStore,
  useProjectsStore,
  useTeamStore,
  useWbsSettingsStore,
} from '@/stores'
import { PersonnelPlanPanel } from '../PersonnelPlanPanel'

vi.mock('@/stores', () => ({
  useBudgetStore: vi.fn(),
  usePersonnelPlanStore: vi.fn(),
  useProjectsStore: vi.fn(),
  useEffortsStore: vi.fn(),
  useWbsSettingsStore: vi.fn(),
  useTeamStore: vi.fn(),
  useMembersStore: vi.fn(),
  useCompaniesStore: vi.fn(),
  useAssignmentStore: vi.fn(),
}))

afterEach(() => cleanup())

const DIVISION_ID = crypto.randomUUID()

function createPlan(
  overrides: Partial<PersonnelPlanEntry> = {},
): PersonnelPlanEntry {
  return {
    id: crypto.randomUUID(),
    divisionId: DIVISION_ID,
    fiscalYear: 2025,
    category: 'personnel_internal',
    monthlyHeadcount: {},
    monthlyRealizedHeadcount: {},
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const ALL_CATEGORIES = [
  'personnel_internal',
  'personnel_external',
  'planned_internal',
  'planned_external',
] as const

function createAllPlans(): PersonnelPlanEntry[] {
  return ALL_CATEGORIES.map((category) => createPlan({ category }))
}

// 区分ラベルのセル（rowSpan=2）から「予定人数」行・「実績人数」行を取得する
// （T13でカード構成から4区分×12ヶ月の単一表に再構成したことに伴うクエリヘルパー）
function getCategoryRows(label: string): {
  plannedRow: HTMLElement
  actualRow: HTMLElement
} {
  const cell = screen.getByText(label)
  const plannedRow = cell.closest('tr') as HTMLElement
  const actualRow = plannedRow.nextElementSibling as HTMLElement
  return { plannedRow, actualRow }
}

describe('PersonnelPlanPanel', () => {
  let plans: PersonnelPlanEntry[]
  const mockGetOrCreateAllCategories = vi.fn()
  const mockUpdatePersonnelPlanEntry = vi.fn()
  const mockGetActiveHeadcountForCategory = vi.fn(
    (
      _divisionId: string,
      _fiscalYear: number,
      _category: string,
      _startMonth: number,
    ) => ({}) as Record<string, number>,
  )
  const mockGetRevenueBudgetForCategory = vi.fn(
    (
      _divisionId: string,
      _fiscalYear: number,
      _category: string,
      _startMonth: number,
    ) => ({}) as Record<string, number>,
  )

  beforeEach(() => {
    plans = createAllPlans()
    mockGetOrCreateAllCategories.mockReset()
    mockUpdatePersonnelPlanEntry.mockReset()
    mockGetActiveHeadcountForCategory.mockReset()
    mockGetActiveHeadcountForCategory.mockReturnValue({})
    mockGetRevenueBudgetForCategory.mockReset()
    mockGetRevenueBudgetForCategory.mockReturnValue({})

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useBudgetStore).mockImplementation((selector: any) =>
      selector({ estimatedUnitPrice: 100 }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useProjectsStore).mockImplementation((selector: any) =>
      selector({ projects: [], getProjectTree: () => [] }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useEffortsStore).mockImplementation((selector: any) =>
      selector({ efforts: [] }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useWbsSettingsStore).mockImplementation((selector: any) =>
      selector({ settingsMap: {} }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useTeamStore).mockImplementation((selector: any) =>
      selector({ sections: [] }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useMembersStore).mockImplementation((selector: any) =>
      selector({ members: [] }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useCompaniesStore).mockImplementation((selector: any) =>
      selector({ companies: [] }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useAssignmentStore).mockImplementation((selector: any) =>
      selector({ assignments: [], getMemberMonthlyTotal: () => 0 }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(usePersonnelPlanStore).mockImplementation((selector: any) =>
      selector({
        personnelPlans: plans,
        getOrCreateAllCategories: mockGetOrCreateAllCategories,
        getPersonnelPlansByDivision: () => plans,
        getPersonnelPlanByCategory: (
          _d: string,
          _y: number,
          category: string,
        ) => plans.find((p) => p.category === category),
        updatePersonnelPlanEntry: mockUpdatePersonnelPlanEntry,
        getActiveHeadcountForCategory: mockGetActiveHeadcountForCategory,
        getRevenueBudgetForCategory: mockGetRevenueBudgetForCategory,
      }),
    )
  })

  it('マウント時にgetOrCreateAllCategoriesを呼び出す（4区分の自動生成保証）', () => {
    render(
      <PersonnelPlanPanel
        divisionId={DIVISION_ID}
        fiscalYear={2025}
        startMonth={4}
      />,
    )
    expect(mockGetOrCreateAllCategories).toHaveBeenCalledWith(DIVISION_ID, 2025)
  })

  it('4区分すべてのラベルを表示する', () => {
    render(
      <PersonnelPlanPanel
        divisionId={DIVISION_ID}
        fiscalYear={2025}
        startMonth={4}
      />,
    )
    expect(screen.getByText('人数（内部リソース）')).toBeInTheDocument()
    expect(screen.getByText('人数（外部リソース）')).toBeInTheDocument()
    expect(screen.getByText('追加予定（内部リソース）')).toBeInTheDocument()
    expect(screen.getByText('追加予定（外部リソース）')).toBeInTheDocument()
  })

  it('4区分＋合計行が単一の表（10行×12列）にまとめて表示される', () => {
    render(
      <PersonnelPlanPanel
        divisionId={DIVISION_ID}
        fiscalYear={2025}
        startMonth={4}
      />,
    )
    // テーブルは1つのみ（区分ごとにカード分割されていない）
    expect(screen.getAllByRole('table')).toHaveLength(1)
    // 各区分「予定人数」「実績人数」の2行×4区分=8データ行＋末尾の合計行2行＋ヘッダー1行
    expect(screen.getAllByRole('row')).toHaveLength(11)
  })

  it('Grid下部に「合計」行を追加し、月別の合計人数（予定・実績）を表示する', () => {
    plans = [
      createPlan({
        category: 'personnel_internal',
        monthlyHeadcount: { '2025-04': 2 },
      }),
      createPlan({
        category: 'personnel_external',
        monthlyHeadcount: { '2025-04': 1 },
      }),
      createPlan({
        category: 'planned_internal',
        monthlyHeadcount: { '2025-04': 3 },
        monthlyRealizedHeadcount: { '2025-04': 1 },
      }),
      createPlan({
        category: 'planned_external',
        monthlyHeadcount: { '2025-04': 0 },
      }),
    ]
    mockGetActiveHeadcountForCategory.mockImplementation(
      (_d: string, _y: number, category: string): Record<string, number> => {
        if (category === 'personnel_internal') return { '2025-04': 2 }
        if (category === 'personnel_external') return { '2025-04': 1 }
        return {}
      },
    )

    render(
      <PersonnelPlanPanel
        divisionId={DIVISION_ID}
        fiscalYear={2025}
        startMonth={4}
      />,
    )

    const { plannedRow, actualRow } = getCategoryRows('合計')
    // 予定人数合計: 2+1+3+0=6
    expect(within(plannedRow).getByText('6')).toBeInTheDocument()
    // 実績人数合計: 2(自動)+1(自動)+1(手入力)+0=4
    expect(within(actualRow).getByText('4')).toBeInTheDocument()
  })

  it('予定人数はNumericInputで編集でき、変更するとupdatePersonnelPlanEntryが呼ばれる', async () => {
    const user = userEvent.setup()
    render(
      <PersonnelPlanPanel
        divisionId={DIVISION_ID}
        fiscalYear={2025}
        startMonth={4}
      />,
    )
    const { plannedRow } = getCategoryRows('人数（内部リソース）')
    const plannedInput = within(plannedRow).getAllByRole('textbox')[0]
    await user.clear(plannedInput as HTMLElement)
    await user.type(plannedInput as HTMLElement, '3')

    expect(mockUpdatePersonnelPlanEntry).toHaveBeenCalled()
    const lastCall =
      mockUpdatePersonnelPlanEntry.mock.calls[
        mockUpdatePersonnelPlanEntry.mock.calls.length - 1
      ]?.[0]
    expect(lastCall.id).toBe(
      plans.find((p) => p.category === 'personnel_internal')?.id,
    )
  })

  it('人件費区分の実績人数は読み取り専用で表示される（入力不可）', () => {
    mockGetActiveHeadcountForCategory.mockImplementation(
      (_d: string, _y: number, category: string): Record<string, number> => {
        if (category === 'personnel_internal') return { '2025-04': 3 }
        return {}
      },
    )
    render(
      <PersonnelPlanPanel
        divisionId={DIVISION_ID}
        fiscalYear={2025}
        startMonth={4}
      />,
    )
    const { actualRow } = getCategoryRows('人数（内部リソース）')
    expect(within(actualRow).getByText('3')).toBeInTheDocument()
    // 実績人数側の入力欄は存在しない（表示のみ）
    expect(within(actualRow).queryAllByRole('textbox')).toHaveLength(0)
  })

  it('追加予定区分の実績人数（実現人数）はNumericInputで手入力できる', async () => {
    const user = userEvent.setup()
    render(
      <PersonnelPlanPanel
        divisionId={DIVISION_ID}
        fiscalYear={2025}
        startMonth={4}
      />,
    )
    const { actualRow } = getCategoryRows('追加予定（内部リソース）')
    const inputs = within(actualRow).getAllByRole('textbox')
    // 追加予定区分は実績人数（実現人数）欄も編集可能
    expect(inputs.length).toBe(12)
    const realizedInput = inputs[0] as HTMLElement
    await user.clear(realizedInput)
    await user.type(realizedInput, '1')
    expect(mockUpdatePersonnelPlanEntry).toHaveBeenCalled()
  })

  // 反証: ある区分の予定人数を更新しても、他区分の更新呼び出しに巻き込まれないか
  it('1区分の更新は他区分のIDに影響しない', async () => {
    const user = userEvent.setup()
    render(
      <PersonnelPlanPanel
        divisionId={DIVISION_ID}
        fiscalYear={2025}
        startMonth={4}
      />,
    )
    const { plannedRow } = getCategoryRows('人数（外部リソース）')
    const input = within(plannedRow).getAllByRole('textbox')[0]
    await user.clear(input as HTMLElement)
    await user.type(input as HTMLElement, '2')

    const updatedIds = new Set(
      mockUpdatePersonnelPlanEntry.mock.calls.map((c) => c[0].id),
    )
    expect(updatedIds.size).toBe(1)
    expect(
      updatedIds.has(
        plans.find((p) => p.category === 'personnel_external')?.id,
      ),
    ).toBe(true)
  })

  it('人件費予算カード（PersonnelCostSummary）が表示される', () => {
    render(
      <PersonnelPlanPanel
        divisionId={DIVISION_ID}
        fiscalYear={2025}
        startMonth={4}
      />,
    )
    expect(screen.getByText('人件費予算')).toBeInTheDocument()
  })
})
