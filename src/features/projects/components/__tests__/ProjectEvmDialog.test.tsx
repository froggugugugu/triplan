import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type { EffortEntry } from '@/shared/types/effort'
import type { Member } from '@/shared/types/member'
import type { ProjectTreeNode } from '@/shared/types/project'
import type { ProjectProgressEntry } from '@/shared/types/project-progress'
import type { ScheduleEntry } from '@/shared/types/schedule'
import { ProjectEvmDialog } from '../ProjectEvmDialog'

afterEach(() => cleanup())

const PROJECT_ID = crypto.randomUUID()

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
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    children: [],
    depth: 0,
    ...overrides,
  }
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    open: true,
    onOpenChange: vi.fn(),
    project: createProject(),
    scheduleEntries: [] as ScheduleEntry[],
    progressEntries: [] as ProjectProgressEntry[],
    assignments: [] as AssignmentEntry[],
    members: [] as Member[],
    efforts: [] as EffortEntry[],
    settingsMap: {},
    estimatedUnitPrice: 100,
    coefficient: 1,
    fiscalYear: 2025,
    startMonth: 4,
    ...overrides,
  }
}

describe('ProjectEvmDialog', () => {
  it('ScheduleEntryが1件も無い場合はEVM対象外の案内を表示する', () => {
    render(<ProjectEvmDialog {...baseProps()} />)
    expect(
      screen.getByText(/スケジュールが未設定のためEVM対象外です/),
    ).toBeInTheDocument()
  })

  it('ScheduleEntryはあるが進捗の記録源（週次入力・完了チェック）が両方無い場合は案内を表示する', () => {
    render(
      <ProjectEvmDialog
        {...baseProps({
          scheduleEntries: [
            {
              id: crypto.randomUUID(),
              projectId: PROJECT_ID,
              phaseKey: 'phase-1',
              startDate: '2025-04-01',
              endDate: '2025-04-30',
            },
          ],
        })}
      />,
    )
    expect(screen.getByText(/進捗がまだ記録されていません/)).toBeInTheDocument()
  })

  // 反証: 週次の手入力（ProjectProgressEntry）が無くても、WBSに完了チェック済みのタスクが
  // あればEVを工数加重で導出できるためチャートを描画する（非公開の設計文書）
  it('反証: ProjectProgressEntryが無くてもWBSに完了チェックがあればチャートを描画する', () => {
    const completedTask = createProject({
      id: crypto.randomUUID(),
      level: 1,
      completed: true,
      completedAt: '2025-04-15',
      children: [],
    })
    render(
      <ProjectEvmDialog
        {...baseProps({
          project: createProject({ children: [completedTask] }),
          scheduleEntries: [
            {
              id: crypto.randomUUID(),
              projectId: PROJECT_ID,
              phaseKey: 'phase-1',
              startDate: '2025-04-01',
              endDate: '2025-04-30',
            },
          ],
        })}
      />,
    )
    expect(
      screen.queryByText(/進捗がまだ記録されていません/),
    ).not.toBeInTheDocument()
    expect(
      document.querySelector('.recharts-responsive-container'),
    ).toBeInTheDocument()
  })

  it('ScheduleEntry・ProjectProgressEntryが両方ある場合はチャートを描画する（案内メッセージは表示されない）', () => {
    render(
      <ProjectEvmDialog
        {...baseProps({
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
              createdAt: '2025-01-01T00:00:00.000Z',
              updatedAt: '2025-01-01T00:00:00.000Z',
            },
          ],
        })}
      />,
    )
    expect(
      screen.queryByText(/スケジュールが未設定のためEVM対象外です/),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/進捗率がまだ記録されていません/),
    ).not.toBeInTheDocument()
  })

  it('プロジェクト名をタイトルに表示する', () => {
    render(
      <ProjectEvmDialog
        {...baseProps({ project: createProject({ name: '基幹刷新PJ' }) })}
      />,
    )
    expect(screen.getByText(/基幹刷新PJ/)).toBeInTheDocument()
  })

  // 反証: project=nullの場合でもクラッシュしない（ダイアログを開く前の初期状態を想定）
  it('反証: project=nullでもクラッシュしない', () => {
    expect(() =>
      render(<ProjectEvmDialog {...baseProps({ project: null })} />),
    ).not.toThrow()
  })

  // 反証: 他案件のScheduleEntry/ProjectProgressEntryは対象外判定に混入しない
  it('反証: 他案件のScheduleEntryは対象プロジェクトの判定に影響しない', () => {
    render(
      <ProjectEvmDialog
        {...baseProps({
          scheduleEntries: [
            {
              id: crypto.randomUUID(),
              projectId: 'other-project',
              phaseKey: 'phase-1',
              startDate: '2025-04-01',
              endDate: '2025-04-30',
            },
          ],
        })}
      />,
    )
    expect(
      screen.getByText(/スケジュールが未設定のためEVM対象外です/),
    ).toBeInTheDocument()
  })
})
