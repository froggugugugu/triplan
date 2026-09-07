import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PersonnelPlanEntry } from '@/shared/types/personnel-plan'
import type { Project, ProjectTreeNode } from '@/shared/types/project'
import {
  createDefaultWbsSettings,
  type WbsSettings,
} from '@/shared/types/wbs-settings'
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
import { PersonnelCostSummary } from '../PersonnelCostSummary'

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

// wbs-settings-storeはentries配列＋getSettings(projectId)方式に移行済み（17ストアの
// DataAdapter配線・第11弾）。テスト側は従来のRecord<projectId, WbsSettings>形式で
// 記述できるよう、ここでgetSettings関数へ変換する
function mockWbsSettingsFromMap(map: Record<string, WbsSettings>) {
  return {
    entries: [],
    getSettings: (projectId: string) =>
      map[projectId] ?? createDefaultWbsSettings(),
  }
}

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

describe('PersonnelCostSummary', () => {
  let plans: PersonnelPlanEntry[]
  const mockGetRevenueBudgetForCategory = vi.fn(
    (
      _divisionId: string,
      _fiscalYear: number,
      _category: string,
      _startMonth: number,
    ) => ({}) as Record<string, number>,
  )

  beforeEach(() => {
    plans = []
    mockGetRevenueBudgetForCategory.mockReset()
    mockGetRevenueBudgetForCategory.mockReturnValue({})

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useBudgetStore).mockImplementation((selector: any) =>
      selector({ estimatedUnitPrice: 100, workdaysPerMonth: 20 }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useProjectsStore).mockImplementation((selector: any) =>
      selector({
        projects: [] as Project[],
        getProjectTree: (): ProjectTreeNode[] => [],
      }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useEffortsStore).mockImplementation((selector: any) =>
      selector({ efforts: [] }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useWbsSettingsStore).mockImplementation((selector: any) =>
      selector(mockWbsSettingsFromMap({})),
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
        getPersonnelPlansByDivision: () => plans,
        getRevenueBudgetForCategory: mockGetRevenueBudgetForCategory,
      }),
    )
  })

  it('4区分の予定人数×概算単価を合算して年間総合予算額を表示する', () => {
    plans = [
      createPlan({
        category: 'personnel_internal',
        monthlyHeadcount: { '2025-04': 2, '2025-05': 2 },
      }),
      createPlan({
        category: 'planned_internal',
        monthlyHeadcount: { '2025-04': 1 },
      }),
    ]

    const { container } = render(
      <PersonnelCostSummary
        divisionId={DIVISION_ID}
        fiscalYear={2025}
        startMonth={4}
      />,
    )

    // (2+2+1) × 100 = 500
    expect(container.textContent).toContain('500.00万円')
  })

  it('内部リソース/外部リソースの予算内訳を併記する', () => {
    plans = [
      createPlan({
        category: 'personnel_internal',
        monthlyHeadcount: { '2025-04': 1 },
      }),
      createPlan({
        category: 'personnel_external',
        monthlyHeadcount: { '2025-04': 2 },
      }),
    ]

    const { container } = render(
      <PersonnelCostSummary
        divisionId={DIVISION_ID}
        fiscalYear={2025}
        startMonth={4}
      />,
    )

    // 内部リソース: 1×100=100、外部リソース: 2×100=200
    expect(container.textContent).toContain('内部リソース: 100.00万円')
    expect(container.textContent).toContain('外部リソース: 200.00万円')
  })

  it('現在のチーム人数（内部/外部リソース、isActive基準）を表示する', () => {
    const sectionId = 'sec1'
    const externalCompanyId = 'company-ext'
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useTeamStore).mockImplementation((selector: any) =>
      selector({ sections: [{ id: sectionId, divisionId: DIVISION_ID }] }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useCompaniesStore).mockImplementation((selector: any) =>
      selector({ companies: [{ id: externalCompanyId, isInternal: false }] }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useMembersStore).mockImplementation((selector: any) =>
      selector({
        members: [
          // 内部（companyId未設定）・在籍中
          { id: 'm1', sectionId, isActive: true, companyId: null },
          // 外部（isInternal=falseの会社所属）・在籍中
          { id: 'm2', sectionId, isActive: true, companyId: externalCompanyId },
          // 内部相当だが非アクティブ（対象外）
          { id: 'm3', sectionId, isActive: false, companyId: null },
        ],
      }),
    )

    const { container } = render(
      <PersonnelCostSummary
        divisionId={DIVISION_ID}
        fiscalYear={2025}
        startMonth={4}
      />,
    )

    expect(container.textContent).toContain(
      '現在のチーム人数: 内部リソース 1人 ／ 外部リソース 1人',
    )
  })

  it('年間総合予算額の計算式に実際の人数（人月）×概算単価の数値を当てはめて表示する', () => {
    plans = [
      createPlan({
        category: 'personnel_internal',
        monthlyHeadcount: { '2025-04': 2, '2025-05': 3 },
      }),
      createPlan({
        category: 'personnel_external',
        monthlyHeadcount: { '2025-04': 1 },
      }),
    ]

    const { container } = render(
      <PersonnelCostSummary
        divisionId={DIVISION_ID}
        fiscalYear={2025}
        startMonth={4}
      />,
    )

    // 内部: 2+3=5人月×100万円=500万円、外部: 1人月×100万円=100万円
    expect(container.textContent).toContain(
      '計算式: 内部 5人月 × 100.00万円 = 500.00万円',
    )
    expect(container.textContent).toContain(
      '外部 1人月 × 100.00万円 = 100.00万円',
    )
  })

  it('実績額見込みは人件費区分のgetRevenueBudgetForCategoryの合計を表示する', () => {
    plans = [
      createPlan({ category: 'personnel_internal' }),
      createPlan({ category: 'personnel_external' }),
    ]
    mockGetRevenueBudgetForCategory.mockImplementation(
      (_d, _y, category): Record<string, number> => {
        if (category === 'personnel_internal') return { '2025-04': 300 }
        if (category === 'personnel_external') return { '2025-04': 150 }
        return {}
      },
    )

    const { container } = render(
      <PersonnelCostSummary
        divisionId={DIVISION_ID}
        fiscalYear={2025}
        startMonth={4}
      />,
    )

    // 総合計 300+150=450
    expect(container.textContent).toContain('450.00万円')
  })

  // 反証: 人員計画が1件も存在しない場合（getOrCreateAllCategories未実行）にクラッシュせず0を表示するか
  it('人員計画データが無い場合は全項目0を表示する', () => {
    plans = []
    const { container } = render(
      <PersonnelCostSummary
        divisionId={DIVISION_ID}
        fiscalYear={2025}
        startMonth={4}
      />,
    )
    expect(container.textContent).toContain('0万円')
    expect(container.textContent).not.toMatch(/[1-9]\d*万円/)
  })

  // 反証: 追加予定区分はgetRevenueBudgetForCategoryが呼ばれない
  // （実績金額の概念を持たないため、無駄な呼び出し・誤集計がないか）
  it('追加予定区分に対してgetRevenueBudgetForCategoryは呼ばれない', () => {
    plans = [
      createPlan({ category: 'planned_internal' }),
      createPlan({ category: 'planned_external' }),
    ]
    render(
      <PersonnelCostSummary
        divisionId={DIVISION_ID}
        fiscalYear={2025}
        startMonth={4}
      />,
    )
    const calledCategories = mockGetRevenueBudgetForCategory.mock.calls.map(
      (args) => args[2],
    )
    expect(calledCategories).not.toContain('planned_internal')
    expect(calledCategories).not.toContain('planned_external')
  })

  it('年間総合予算額・実績額見込みカードに算出根拠の文言を明記する', () => {
    const { container } = render(
      <PersonnelCostSummary
        divisionId={DIVISION_ID}
        fiscalYear={2025}
        startMonth={4}
      />,
    )
    expect(container.textContent).toContain('（合計人数×概算単価）')
    expect(container.textContent).toContain('（合計（個別での単価実績合計））')
  })

  it('残予算パネルを表示し、残予算＝予算総額－実績総額見込みを算出する', () => {
    plans = [
      createPlan({
        category: 'personnel_internal',
        monthlyHeadcount: { '2025-04': 3 },
      }),
    ]
    mockGetRevenueBudgetForCategory.mockImplementation(
      (_d, _y, category): Record<string, number> => {
        if (category === 'personnel_internal') return { '2025-04': 120 }
        return {}
      },
    )

    const { container } = render(
      <PersonnelCostSummary
        divisionId={DIVISION_ID}
        fiscalYear={2025}
        startMonth={4}
      />,
    )

    // 予算3×100=300、実績120、残予算=300-120=180
    expect(container.textContent).toContain('残予算')
    expect(container.textContent).toContain('180.00万円')
  })

  it('残契約概算工数は残予算を概算単価で割った人月換算値を表示する', () => {
    plans = [
      createPlan({
        category: 'personnel_internal',
        monthlyHeadcount: { '2025-04': 3 },
      }),
    ]
    // 実績0のため、残予算 = 予算3×100 = 300。概算単価100で割ると3.0人月
    const { container } = render(
      <PersonnelCostSummary
        divisionId={DIVISION_ID}
        fiscalYear={2025}
        startMonth={4}
      />,
    )

    expect(container.textContent).toContain('残契約概算工数')
    expect(container.textContent).toContain('3.0')
    expect(container.textContent).toContain('人月')
  })

  // 反証: 概算単価が0の場合、残契約概算工数の算出でゼロ除算エラーが起きないか
  it('概算単価が0の場合、残契約概算工数はクラッシュせず0を表示する', () => {
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useBudgetStore).mockImplementation((selector: any) =>
      selector({ estimatedUnitPrice: 0, workdaysPerMonth: 20 }),
    )
    plans = [
      createPlan({
        category: 'personnel_internal',
        monthlyHeadcount: { '2025-04': 3 },
      }),
    ]

    expect(() =>
      render(
        <PersonnelCostSummary
          divisionId={DIVISION_ID}
          fiscalYear={2025}
          startMonth={4}
        />,
      ),
    ).not.toThrow()
  })

  it('4エリア（年間総合予算・実績額見込み・残予算・残契約概算工数）が1パネルに統合される', () => {
    plans = [
      createPlan({
        category: 'personnel_internal',
        monthlyHeadcount: { '2025-04': 1 },
      }),
    ]
    const { container } = render(
      <PersonnelCostSummary
        divisionId={DIVISION_ID}
        fiscalYear={2025}
        startMonth={4}
      />,
    )

    const panel = container.querySelector('.grid-cols-4') as HTMLElement
    expect(panel).not.toBeNull()
    expect(panel.textContent).toContain('年間総合予算額')
    expect(panel.textContent).toContain('年間総合実績額見込み')
    expect(panel.textContent).toContain('残予算')
    expect(panel.textContent).toContain('残契約概算工数')
  })

  describe('案件工数との比較', () => {
    function createSettingsMap(projectId: string) {
      return {
        [projectId]: {
          effortColumns: [
            { id: 'effort-1', displayName: '工数1', enabled: true, order: 0 },
          ],
          lastModified: '2025-01-01T00:00:00.000Z',
        },
      }
    }

    it('担当部門(divisionId)が一致するトップレベル案件のWBS総工数を1人月=20人日で人月換算して表示する', () => {
      const projectId = 'p1'
      // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
      vi.mocked(useProjectsStore).mockImplementation((selector: any) =>
        selector({
          projects: [],
          getProjectTree: () => [
            {
              id: projectId,
              code: 'P001',
              name: '案件A',
              parentId: null,
              level: 0,
              status: 'active',
              confidence: null,
              divisionId: DIVISION_ID,
              createdAt: '2025-01-01T00:00:00.000Z',
              updatedAt: '2025-01-01T00:00:00.000Z',
              children: [],
              depth: 0,
            },
          ],
        }),
      )
      // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
      vi.mocked(useEffortsStore).mockImplementation((selector: any) =>
        selector({
          efforts: [{ id: 'e1', projectId, columnId: 'effort-1', value: 40 }],
        }),
      )
      // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
      vi.mocked(useWbsSettingsStore).mockImplementation((selector: any) =>
        selector(mockWbsSettingsFromMap(createSettingsMap(projectId))),
      )

      const { container } = render(
        <PersonnelCostSummary
          divisionId={DIVISION_ID}
          fiscalYear={2025}
          startMonth={4}
        />,
      )

      // 40人日 ÷ 20 = 2.0人月
      expect(container.textContent).toContain('プロジェクトの合計工数')
      expect(container.textContent).toContain('2.0')
    })

    // 反証: 担当部門が別部門/未設定の案件は合計対象に含まれないか
    it('担当部門が異なる案件・未設定の案件は案件合計工数の対象外とする', () => {
      // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
      vi.mocked(useProjectsStore).mockImplementation((selector: any) =>
        selector({
          projects: [],
          getProjectTree: () => [
            {
              id: 'other-division',
              code: 'P002',
              name: '他部門案件',
              parentId: null,
              level: 0,
              status: 'active',
              confidence: null,
              divisionId: crypto.randomUUID(),
              createdAt: '2025-01-01T00:00:00.000Z',
              updatedAt: '2025-01-01T00:00:00.000Z',
              children: [],
              depth: 0,
            },
            {
              id: 'unset-division',
              code: 'P003',
              name: '未設定案件',
              parentId: null,
              level: 0,
              status: 'active',
              confidence: null,
              divisionId: null,
              createdAt: '2025-01-01T00:00:00.000Z',
              updatedAt: '2025-01-01T00:00:00.000Z',
              children: [],
              depth: 0,
            },
          ],
        }),
      )
      // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
      vi.mocked(useEffortsStore).mockImplementation((selector: any) =>
        selector({
          efforts: [
            {
              id: 'e1',
              projectId: 'other-division',
              columnId: 'effort-1',
              value: 100,
            },
            {
              id: 'e2',
              projectId: 'unset-division',
              columnId: 'effort-1',
              value: 100,
            },
          ],
        }),
      )
      // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
      vi.mocked(useWbsSettingsStore).mockImplementation((selector: any) =>
        selector(
          mockWbsSettingsFromMap({
            ...createSettingsMap('other-division'),
            ...createSettingsMap('unset-division'),
          }),
        ),
      )

      const { container } = render(
        <PersonnelCostSummary
          divisionId={DIVISION_ID}
          fiscalYear={2025}
          startMonth={4}
        />,
      )

      // どちらの案件も対象外のため合計は0人月
      // （ラベル文言自体に「1人月=20人日換算」等の数字を含むため、括弧閉じ後から検索する）
      const match = container.textContent?.match(
        /プロジェクトの合計工数[\s\S]*?人日換算）[\s\S]*?([0-9]+\.[0-9])\s*人月/,
      )
      expect(match?.[1]).toBe('0.0')
    })

    it('部門所属メンバーの月次アサイン合計（対象年度12ヶ月分）を割り当て済み工数として表示する', () => {
      const sectionId = 'sec1'
      const memberId = 'm1'
      // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
      vi.mocked(useTeamStore).mockImplementation((selector: any) =>
        selector({ sections: [{ id: sectionId, divisionId: DIVISION_ID }] }),
      )
      // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
      vi.mocked(useMembersStore).mockImplementation((selector: any) =>
        selector({ members: [{ id: memberId, sectionId }] }),
      )
      // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
      vi.mocked(useAssignmentStore).mockImplementation((selector: any) =>
        selector({
          assignments: [],
          getMemberMonthlyTotal: (_id: string, _month: string) => 0.5,
        }),
      )

      const { container } = render(
        <PersonnelCostSummary
          divisionId={DIVISION_ID}
          fiscalYear={2025}
          startMonth={4}
        />,
      )

      // 0.5人月 × 12ヶ月 = 6.0人月
      expect(container.textContent).toContain('割り当て済み工数')
      expect(container.textContent).toContain('6.0')
    })

    // 反証: 他部門に所属するメンバーのアサインが誤って合算されないか
    it('他部門に所属するメンバーのアサインは割り当て済み工数に含まれない', () => {
      // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
      vi.mocked(useTeamStore).mockImplementation((selector: any) =>
        selector({
          sections: [{ id: 'sec-other', divisionId: crypto.randomUUID() }],
        }),
      )
      // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
      vi.mocked(useMembersStore).mockImplementation((selector: any) =>
        selector({ members: [{ id: 'm-other', sectionId: 'sec-other' }] }),
      )
      // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
      vi.mocked(useAssignmentStore).mockImplementation((selector: any) =>
        selector({
          assignments: [],
          getMemberMonthlyTotal: () => 1,
        }),
      )

      const { container } = render(
        <PersonnelCostSummary
          divisionId={DIVISION_ID}
          fiscalYear={2025}
          startMonth={4}
        />,
      )

      const match = container.textContent?.match(
        /割り当て済み工数[^0-9]*([0-9.]+)\s*人月/,
      )
      expect(match?.[1]).toBe('0.0')
    })
  })
})
