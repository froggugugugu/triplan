import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type { EffortEntry } from '@/shared/types/effort'
import type { Project, ProjectTreeNode } from '@/shared/types/project'
import {
  createDefaultWbsSettings,
  type WbsSettings,
} from '@/shared/types/wbs-settings'
import {
  useAppStore,
  useAssignmentStore,
  useBudgetStore,
  useCompaniesStore,
  useEffortsStore,
  useMembersStore,
  useProjectsStore,
  useWbsSettingsStore,
} from '@/stores'
import { ProjectBudgetView } from '../ProjectBudgetView'

vi.mock('@/stores', () => ({
  useBudgetStore: vi.fn(),
  useProjectsStore: vi.fn(),
  useEffortsStore: vi.fn(),
  useWbsSettingsStore: vi.fn(),
  useAssignmentStore: vi.fn(),
  useMembersStore: vi.fn(),
  useCompaniesStore: vi.fn(),
  useAppStore: vi.fn(),
}))

afterEach(() => cleanup())

function createProject(overrides: Partial<Project> = {}): Project {
  return {
    id: crypto.randomUUID(),
    code: 'P001',
    name: '案件A',
    parentId: null,
    level: 0,
    status: 'active',
    confidence: null,
    completed: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function createSettings(
  enabledColumnIds: string[] = ['effort-1'],
): WbsSettings {
  return {
    effortColumns: Array.from({ length: 10 }, (_, i) => ({
      id: `effort-${i + 1}`,
      displayName: `工数${i + 1}`,
      enabled: enabledColumnIds.includes(`effort-${i + 1}`),
      order: i,
    })),
    lastModified: '2025-01-01T00:00:00.000Z',
  }
}

// 注記: 本コンポーネントはAG Grid化されており、jsdom環境ではAG Gridのセル内容が
// レンダリングされない（ResizeObserver等のブラウザAPI依存のため、他のAG Grid採用
// コンポーネント（AiUsageGrid等）と同様に component-level のセル内容検証は行わない）。
// セル値の算出ロジックはexpense-budget-utils.test.tsの
// calcProjectEstimateBudget/calcProjectEstimateBudgetsで検証済み。
// AG Gridの実際のレンダリング・インライン編集操作はE2E（department-budget.spec.ts）で検証する。
describe('ProjectBudgetView', () => {
  let projects: Project[]
  let efforts: EffortEntry[]
  let settingsMap: Record<string, WbsSettings>
  let assignments: AssignmentEntry[]

  beforeEach(() => {
    projects = []
    efforts = []
    settingsMap = {}
    assignments = []

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useAssignmentStore).mockImplementation((selector: any) =>
      selector({ assignments }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useProjectsStore).mockImplementation((selector: any) =>
      selector({
        projects,
        getProjectTree: (): ProjectTreeNode[] => {
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
        },
      }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useEffortsStore).mockImplementation((selector: any) =>
      selector({ efforts, loadEfforts: vi.fn() }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useWbsSettingsStore).mockImplementation((selector: any) =>
      selector({
        entries: [],
        getSettings: (projectId: string) =>
          settingsMap[projectId] ?? createDefaultWbsSettings(),
      }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useBudgetStore).mockImplementation((selector: any) =>
      selector({
        estimatedUnitPrice: 100,
        defaultCoefficient: 1,
        projectCoefficients: {},
        getProjectCoefficient: () => 1,
        setProjectCoefficient: vi.fn(),
        budgetBreakdowns: [],
        divisionBudgets: [],
        saasContracts: [],
        aiUsageEntries: [],
        exchangeRateHistory: [],
      }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useMembersStore).mockImplementation((selector: any) =>
      selector({ members: [] }),
    )

    // 原価4区分の入力ストア
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useCompaniesStore).mockImplementation((selector: any) =>
      selector({ companies: [] }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useAppStore).mockImplementation((selector: any) =>
      selector({ fiscalYear: 2025, fiscalYearStartMonth: 4 }),
    )
  })

  it('案件が存在しない場合は空状態メッセージを表示する', () => {
    projects = []
    render(<ProjectBudgetView />)
    expect(screen.getByText(/プロジェクトがありません/)).toBeInTheDocument()
  })

  it('案件が存在する場合はクラッシュせずAG Gridを描画する', () => {
    const project = createProject({ id: 'p1', code: 'P001', name: '案件A' })
    projects = [project]
    efforts = [{ id: 'e1', projectId: 'p1', columnId: 'effort-1', value: 5 }]
    settingsMap = { p1: createSettings(['effort-1']) }

    expect(() => render(<ProjectBudgetView />)).not.toThrow()
    expect(
      screen.queryByText(/プロジェクトがありません/),
    ).not.toBeInTheDocument()
  })

  // 反証: wbsSettingsが未設定の案件（settingsMapにエントリなし）でもクラッシュせず、
  // デフォルト設定（先頭3列有効）にフォールバックするか
  it('WBS設定が未登録の案件でもデフォルト設定でクラッシュしない', () => {
    const project = createProject({ id: 'p1', code: 'P001', name: '案件A' })
    projects = [project]
    efforts = [{ id: 'e1', projectId: 'p1', columnId: 'effort-1', value: 1 }]
    settingsMap = {}

    expect(() => render(<ProjectBudgetView />)).not.toThrow()
  })

  it('getProjectCoefficientが未取得（storeメソッド呼び出し失敗）でもクラッシュしない', () => {
    const project = createProject({ id: 'p1', code: 'P001', name: '案件A' })
    projects = [project]
    settingsMap = { p1: createSettings() }

    expect(() => render(<ProjectBudgetView />)).not.toThrow()
  })

  // 反証: 合計行（pinnedBottomRowData）追加後も複数案件でクラッシュしないか
  // （セル内容自体はjsdomで検証不可のため、合計値の算出ロジックはexpense-budget-utils.test.tsの
  // calcProjectRowsTotalで別途検証済み）
  it('複数案件がある場合も合計行の算出でクラッシュしない', () => {
    projects = [
      createProject({ id: 'p1', code: 'P001', name: '案件A' }),
      createProject({ id: 'p2', code: 'P002', name: '案件B' }),
    ]
    efforts = [
      { id: 'e1', projectId: 'p1', columnId: 'effort-1', value: 5 },
      { id: 'e2', projectId: 'p2', columnId: 'effort-1', value: 3 },
    ]
    settingsMap = {
      p1: createSettings(['effort-1']),
      p2: createSettings(['effort-1']),
    }

    expect(() => render(<ProjectBudgetView />)).not.toThrow()
  })

  // : divisionIdによる絞り込み
  describe('divisionId絞り込み', () => {
    const DIVISION_A = 'div-a'
    const DIVISION_B = 'div-b'

    it('divisionIdを指定すると、一致しない部門の案件のみの場合は空状態表示になる', () => {
      projects = [
        createProject({
          id: 'p1',
          code: 'P001',
          name: '案件A',
          divisionId: DIVISION_B,
        }),
      ]
      settingsMap = { p1: createSettings() }

      render(<ProjectBudgetView divisionId={DIVISION_A} />)
      expect(screen.getByText(/プロジェクトがありません/)).toBeInTheDocument()
    })

    it('divisionIdが一致する案件が1件でもあれば空状態表示にならない', () => {
      projects = [
        createProject({
          id: 'p1',
          code: 'P001',
          name: '案件A',
          divisionId: DIVISION_A,
        }),
        createProject({
          id: 'p2',
          code: 'P002',
          name: '案件B',
          divisionId: DIVISION_B,
        }),
      ]
      settingsMap = { p1: createSettings(), p2: createSettings() }

      render(<ProjectBudgetView divisionId={DIVISION_A} />)
      expect(
        screen.queryByText(/プロジェクトがありません/),
      ).not.toBeInTheDocument()
    })

    // 反証: divisionIdをnull（全部門）にすると、部門に関わらず全案件が対象になる
    it('反証: divisionId=null（全部門）の場合は部門に関わらず全案件が対象になる', () => {
      projects = [
        createProject({
          id: 'p1',
          code: 'P001',
          name: '案件A',
          divisionId: DIVISION_A,
        }),
        createProject({
          id: 'p2',
          code: 'P002',
          name: '案件B',
          divisionId: DIVISION_B,
        }),
      ]
      settingsMap = { p1: createSettings(), p2: createSettings() }

      render(<ProjectBudgetView divisionId={null} />)
      expect(
        screen.queryByText(/プロジェクトがありません/),
      ).not.toBeInTheDocument()
    })

    it('divisionId未指定（propなし）の場合も従来通り全案件が対象になる（後方互換）', () => {
      projects = [
        createProject({
          id: 'p1',
          code: 'P001',
          name: '案件A',
          divisionId: DIVISION_A,
        }),
      ]
      settingsMap = { p1: createSettings() }

      render(<ProjectBudgetView />)
      expect(
        screen.queryByText(/プロジェクトがありません/),
      ).not.toBeInTheDocument()
    })
  })

  // 反証: アサインが1件も無い案件でも割当済/未割当工数の算出でクラッシュしない
  it('反証: アサインが1件も無い案件でも割当済/未割当工数の算出でクラッシュしない', () => {
    projects = [createProject({ id: 'p1', code: 'P001', name: '案件A' })]
    efforts = [{ id: 'e1', projectId: 'p1', columnId: 'effort-1', value: 5 }]
    settingsMap = { p1: createSettings(['effort-1']) }
    assignments = []

    expect(() => render(<ProjectBudgetView />)).not.toThrow()
  })

  // 反証: 案件別損益（受注金額・実コスト・予算超過判定）の算出経路がフル稼働する
  // ケース（人・モノ・金の三位一体強化、ENHANCEMENT-ROADMAP §4）でもクラッシュしない
  it('反証: contractAmount・アサイン・BudgetBreakdownが揃った状態でも損益算出でクラッシュしない', () => {
    projects = [
      createProject({
        id: 'p1',
        code: 'P001',
        name: '案件A',
        contractAmount: 100,
      }),
    ]
    settingsMap = { p1: createSettings() }
    assignments = [
      {
        id: 'a1',
        projectId: 'p1',
        taskId: 'p1',
        memberId: 'm1',
        monthlyValues: { '2025-04': 1.0 },
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ]

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useMembersStore).mockImplementation((selector: any) =>
      selector({
        members: [
          {
            id: 'm1',
            name: 'テスト担当者',
            sectionId: null,
            role: 'エンジニア',
            isActive: true,
            startDate: null,
            endDate: null,
            unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 300 }],
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
      }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useBudgetStore).mockImplementation((selector: any) =>
      selector({
        estimatedUnitPrice: 100,
        defaultCoefficient: 1,
        projectCoefficients: {},
        getProjectCoefficient: () => 1,
        setProjectCoefficient: vi.fn(),
        divisionBudgets: [],
        saasContracts: [],
        aiUsageEntries: [],
        exchangeRateHistory: [],
        budgetBreakdowns: [
          {
            id: 'b1',
            budgetId: 'budget-1',
            category: 'project_expense',
            label: '案件A経費',
            amount: 50,
            recordedAt: '2025-04-01',
            createdAt: '2025-01-01T00:00:00.000Z',
            projectId: 'p1',
            actualRecords: [
              {
                id: 'r1',
                purchasedAt: '2025-04-10',
                itemLabel: '経費',
                amount: 10,
              },
            ],
          },
        ],
      }),
    )

    expect(() => render(<ProjectBudgetView />)).not.toThrow()
  })
})
