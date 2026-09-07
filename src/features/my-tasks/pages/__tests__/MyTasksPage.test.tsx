import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MyTasksPage } from '../MyTasksPage'

/**
 * 自分の担当タスク。
 * 協力会社（partner）の担当者にも開ける画面のため、**金額を一切出さない**ことが要件。
 */

// biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
let mockCurrentUser: any = null
// biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
let mockProjects: any[] = []
// biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
let mockAssignments: any[] = []
// biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
let mockScheduleEntries: any[] = []

vi.mock('@/stores', () => ({
  // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定
  useAuthStore: (selector: any) => selector({ currentUser: mockCurrentUser }),
  // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定
  useAppStore: (selector: any) => selector({ fiscalYear: 2026 }),
  // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定
  useProjectsStore: (selector: any) =>
    selector({ projects: mockProjects, loadProjects: vi.fn() }),
  // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定
  useAssignmentStore: (selector: any) =>
    selector({ assignments: mockAssignments, loadAssignments: vi.fn() }),
  // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定
  useScheduleStore: (selector: any) =>
    selector({ entries: mockScheduleEntries, loadSchedule: vi.fn() }),
}))

const ME = '00000000-0000-4000-8000-0000000000m1'.replace(/m/g, 'a')

function setup() {
  mockCurrentUser = {
    id: 'u1',
    email: 'me@example.com',
    name: '私',
    role: 'partner',
    memberId: ME,
  }
  mockProjects = [
    { id: 'r1', code: 'P100', name: '会員基盤', parentId: null, level: 0 },
    {
      id: 'ph1',
      code: 'P100-01',
      name: '基本設計',
      parentId: 'r1',
      level: 1,
      phaseKey: 'phase-2',
    },
    {
      id: 't1',
      code: 'P100-01-01',
      name: '画面設計',
      parentId: 'ph1',
      level: 2,
    },
    {
      id: 't2',
      code: 'P100-01-02',
      name: 'DB設計',
      parentId: 'ph1',
      level: 2,
      completed: true,
    },
  ]
  mockAssignments = [
    {
      id: 'a1',
      projectId: 'r1',
      taskId: 't1',
      memberId: ME,
      monthlyValues: { '2026-04': 0.5 },
    },
    {
      id: 'a2',
      projectId: 'r1',
      taskId: 't2',
      memberId: ME,
      monthlyValues: { '2026-04': 0.25 },
    },
  ]
  mockScheduleEntries = [
    {
      id: 's1',
      projectId: 'r1',
      phaseKey: 'phase-2',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
    },
  ]
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MyTasksPage />
    </MemoryRouter>,
  )
}

describe('MyTasksPage', () => {
  beforeEach(setup)
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('自分に配分のあるタスクを期日つきで表示する', () => {
    renderPage()
    expect(screen.getByText('画面設計')).toBeInTheDocument()
    expect(screen.getByText('P100-01-01')).toBeInTheDocument()
    // 所属工程（基本設計）の終了日が期日になる
    expect(screen.getAllByText('2026-06-30').length).toBeGreaterThan(0)
  })

  it('完了済みタスクは完了として区別して表示する', () => {
    renderPage()
    expect(screen.getByText('DB設計')).toBeInTheDocument()
    expect(screen.getByText('完了')).toBeInTheDocument()
    expect(screen.getByText('進行中')).toBeInTheDocument()
  })

  it('未完了件数と全件数を示す', () => {
    const { container } = renderPage()
    // JSX補間でテキストノードが分割されるため、結合済みテキストで確認する
    expect(container.textContent).toContain('未完了 1件')
    expect(container.textContent).toContain('全2件')
  })

  it('反証: 担当者が紐づいていないユーザーには案内を出す（空表を出さない）', () => {
    mockCurrentUser = { ...mockCurrentUser, memberId: null }
    renderPage()
    expect(screen.getByText(/担当者が紐づいていないため/)).toBeInTheDocument()
    expect(screen.queryByText('画面設計')).not.toBeInTheDocument()
  })

  it('反証: 他人のアサインは表示しない', () => {
    mockAssignments = [
      {
        id: 'a9',
        projectId: 'r1',
        taskId: 't1',
        memberId: 'someone-else',
        monthlyValues: { '2026-04': 0.5 },
      },
    ]
    renderPage()
    expect(screen.queryByText('画面設計')).not.toBeInTheDocument()
    expect(
      screen.getByText('今年度に配分されたタスクはありません'),
    ).toBeInTheDocument()
  })

  it('反証: 金額に類する情報を一切表示しない（partnerが開く画面のため）', () => {
    const { container } = renderPage()
    const text = container.textContent ?? ''
    for (const word of ['万円', '単価', '金額', '予算', '¥', '原価']) {
      expect(text, `「${word}」が表示されている`).not.toContain(word)
    }
  })
})
