import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectTreeNode } from '@/shared/types/project'
import type { ProjectBaseline } from '@/shared/types/project-baseline'
import type { ProjectProgressEntry } from '@/shared/types/project-progress'
import type { ScheduleEntry } from '@/shared/types/schedule'
import { createDefaultWbsSettings } from '@/shared/types/wbs-settings'
import {
  useAssignmentStore,
  useBudgetStore,
  useEffortsStore,
  useMembersStore,
  useProjectBaselineStore,
  useProjectProgressStore,
  useProjectsStore,
  useScheduleStore,
  useWbsSettingsStore,
} from '@/stores'
import { EvmPanel } from '../EvmPanel'

vi.mock('@/stores', () => ({
  useProjectsStore: vi.fn(),
  useScheduleStore: vi.fn(),
  useProjectProgressStore: vi.fn(),
  useProjectBaselineStore: vi.fn(),
  useEffortsStore: vi.fn(),
  useWbsSettingsStore: vi.fn(),
  useBudgetStore: vi.fn(),
  useAssignmentStore: vi.fn(),
  useMembersStore: vi.fn(),
}))

vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

afterEach(() => cleanup())

const DIVISION_ID = crypto.randomUUID()
const PROJECT_ID = crypto.randomUUID()
const mockSetWeeklyProgress = vi.fn()
const mockLoadSchedule = vi.fn()
const mockLoadProjectProgress = vi.fn()
const mockLoadProjectBaselines = vi.fn()

function createProject(
  overrides: Partial<ProjectTreeNode> = {},
): ProjectTreeNode {
  return {
    id: PROJECT_ID,
    code: 'P001',
    name: 'テスト案件',
    parentId: null,
    level: 0,
    status: 'active',
    confidence: null,
    completed: false,
    divisionId: DIVISION_ID,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    children: [],
    depth: 0,
    ...overrides,
  }
}

function setupStores(options: {
  projects?: ProjectTreeNode[]
  scheduleEntries?: ScheduleEntry[]
  progressEntries?: ProjectProgressEntry[]
  projectBaselines?: ProjectBaseline[]
}) {
  const {
    projects = [],
    scheduleEntries = [],
    progressEntries = [],
    projectBaselines = [],
  } = options

  // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
  vi.mocked(useProjectBaselineStore).mockImplementation((selector: any) =>
    selector({
      projectBaselines,
      loadProjectBaselines: mockLoadProjectBaselines,
    }),
  )

  // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
  vi.mocked(useProjectsStore).mockImplementation((selector: any) =>
    selector({ projects, getProjectTree: () => projects }),
  )
  // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
  vi.mocked(useScheduleStore).mockImplementation((selector: any) =>
    selector({ entries: scheduleEntries, loadSchedule: mockLoadSchedule }),
  )
  // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
  vi.mocked(useProjectProgressStore).mockImplementation((selector: any) =>
    selector({
      projectProgressEntries: progressEntries,
      loadProjectProgress: mockLoadProjectProgress,
      setWeeklyProgress: mockSetWeeklyProgress,
    }),
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
  // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
  vi.mocked(useBudgetStore).mockImplementation((selector: any) =>
    selector({
      estimatedUnitPrice: 100,
      getProjectCoefficient: () => 1,
      projectCoefficients: {},
      defaultCoefficient: 1,
      // WBS工数が0の案件でBACの供給源として参照する予算枠（L0、非公開の設計文書）
      budgetBreakdowns: [],
    }),
  )
  // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
  vi.mocked(useAssignmentStore).mockImplementation((selector: any) =>
    selector({ assignments: [] }),
  )
  // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
  vi.mocked(useMembersStore).mockImplementation((selector: any) =>
    selector({ members: [] }),
  )
}

describe('EvmPanel', () => {
  beforeEach(() => {
    mockSetWeeklyProgress.mockReset()
    mockLoadSchedule.mockReset()
    mockLoadProjectProgress.mockReset()
  })

  it('反証: 入力対象案件が0件（ScheduleEntryなし）の場合は案内メッセージのみ表示する', () => {
    setupStores({ projects: [createProject()], scheduleEntries: [] })
    render(
      <EvmPanel divisionId={DIVISION_ID} fiscalYear={2025} startMonth={4} />,
    )
    expect(
      screen.getByText(/EVM対象のプロジェクトがありません/),
    ).toBeInTheDocument()
  })

  it('入力対象案件がある場合はフォームと入力担当の注記を表示する', () => {
    setupStores({
      projects: [createProject()],
      scheduleEntries: [
        {
          id: crypto.randomUUID(),
          projectId: PROJECT_ID,
          phaseKey: 'phase-1',
          startDate: '2025-04-01',
          endDate: '2025-04-30',
        },
      ],
    })
    render(
      <EvmPanel divisionId={DIVISION_ID} fiscalYear={2025} startMonth={4} />,
    )
    expect(screen.getByLabelText('対象プロジェクト')).toBeInTheDocument()
    expect(
      screen.getByText('入力担当: プロジェクト責任者相当を想定'),
    ).toBeInTheDocument()
  })

  it('反証: 進捗率が未入力の案件はチャート対象外で案内メッセージが表示される', () => {
    setupStores({
      projects: [createProject()],
      scheduleEntries: [
        {
          id: crypto.randomUUID(),
          projectId: PROJECT_ID,
          phaseKey: 'phase-1',
          startDate: '2025-04-01',
          endDate: '2025-04-30',
        },
      ],
      progressEntries: [],
    })
    render(
      <EvmPanel divisionId={DIVISION_ID} fiscalYear={2025} startMonth={4} />,
    )
    expect(
      screen.getByText(/進捗率が入力されたプロジェクトがまだありません/),
    ).toBeInTheDocument()
  })

  it('チャート対象案件が1件の場合はセレクタを表示せずグラフを表示する', () => {
    setupStores({
      projects: [createProject()],
      scheduleEntries: [
        {
          id: crypto.randomUUID(),
          projectId: PROJECT_ID,
          phaseKey: 'phase-1',
          startDate: '2025-04-01',
          endDate: '2025-04-30',
        },
      ],
      progressEntries: [
        {
          id: crypto.randomUUID(),
          projectId: PROJECT_ID,
          weeklyProgress: { '2025-W15': 0.5 },
          createdAt: '2025-04-01T00:00:00.000Z',
          updatedAt: '2025-04-01T00:00:00.000Z',
        },
      ],
    })
    render(
      <EvmPanel divisionId={DIVISION_ID} fiscalYear={2025} startMonth={4} />,
    )
    expect(screen.queryByLabelText('表示プロジェクト')).not.toBeInTheDocument()
    expect(
      screen.queryByText(/進捗率が入力されたプロジェクトがまだありません/),
    ).not.toBeInTheDocument()
    // Rechartsの ResponsiveContainer はjsdom（レイアウト計算なし）では中身を描画しないため、
    // Legend文言等の内部SVG要素はここでは検証せず、コンテナが生成されていることのみ確認する
    // （実際の描画確認はE2E/Playwrightで行う、development-patterns.mdの既存方針に倣う）
    expect(
      document.querySelector('.recharts-responsive-container'),
    ).toBeInTheDocument()
  })

  it('チャート対象案件が複数の場合は表示案件セレクタを表示する', () => {
    const otherProjectId = crypto.randomUUID()
    setupStores({
      projects: [
        createProject(),
        createProject({ id: otherProjectId, name: '別の案件' }),
      ],
      scheduleEntries: [
        {
          id: crypto.randomUUID(),
          projectId: PROJECT_ID,
          phaseKey: 'phase-1',
          startDate: '2025-04-01',
          endDate: '2025-04-30',
        },
        {
          id: crypto.randomUUID(),
          projectId: otherProjectId,
          phaseKey: 'phase-1',
          startDate: '2025-04-01',
          endDate: '2025-04-30',
        },
      ],
      progressEntries: [
        {
          id: crypto.randomUUID(),
          projectId: PROJECT_ID,
          weeklyProgress: { '2025-W15': 0.5 },
          createdAt: '2025-04-01T00:00:00.000Z',
          updatedAt: '2025-04-01T00:00:00.000Z',
        },
        {
          id: crypto.randomUUID(),
          projectId: otherProjectId,
          weeklyProgress: { '2025-W15': 0.2 },
          createdAt: '2025-04-01T00:00:00.000Z',
          updatedAt: '2025-04-01T00:00:00.000Z',
        },
      ],
    })
    render(
      <EvmPanel divisionId={DIVISION_ID} fiscalYear={2025} startMonth={4} />,
    )
    expect(screen.getByLabelText('表示プロジェクト')).toBeInTheDocument()
  })

  it('週次入力フォームで送信するとsetWeeklyProgressが呼ばれる', async () => {
    const user = userEvent.setup()
    setupStores({
      projects: [createProject()],
      scheduleEntries: [
        {
          id: crypto.randomUUID(),
          projectId: PROJECT_ID,
          phaseKey: 'phase-1',
          startDate: '2025-04-01',
          endDate: '2025-04-30',
        },
      ],
    })
    render(
      <EvmPanel divisionId={DIVISION_ID} fiscalYear={2025} startMonth={4} />,
    )

    await user.selectOptions(
      screen.getByLabelText('対象プロジェクト'),
      'テスト案件',
    )
    const progressInput = screen.getByLabelText('進捗率（%）')
    await user.clear(progressInput)
    await user.type(progressInput, '40')
    await user.click(screen.getByRole('button', { name: '進捗率を記録' }))

    expect(mockSetWeeklyProgress).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.stringMatching(/^\d{4}-W\d{2}$/),
      0.4,
    )
  })

  it('反証: 対象案件を選択しないまま送信するとsetWeeklyProgressは呼ばれない（バリデーションで弾かれる）', async () => {
    const user = userEvent.setup()
    setupStores({
      projects: [createProject()],
      scheduleEntries: [
        {
          id: crypto.randomUUID(),
          projectId: PROJECT_ID,
          phaseKey: 'phase-1',
          startDate: '2025-04-01',
          endDate: '2025-04-30',
        },
      ],
    })
    render(
      <EvmPanel divisionId={DIVISION_ID} fiscalYear={2025} startMonth={4} />,
    )

    await user.click(screen.getByRole('button', { name: '進捗率を記録' }))
    expect(mockSetWeeklyProgress).not.toHaveBeenCalled()
  })
})
