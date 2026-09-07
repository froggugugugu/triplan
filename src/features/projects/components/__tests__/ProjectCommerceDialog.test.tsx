import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BillingMilestone, ChangeRequest, Project } from '@/shared/types'
import {
  useBillingMilestoneStore,
  useChangeRequestStore,
  useProjectsStore,
} from '@/stores'
import { ProjectCommerceDialog } from '../ProjectCommerceDialog'

// 実ストア＋モックDataAdapterでテストする（tech-tag-category.test.tsと同じ方針）。
// ストアのアクション・セレクタは専用テストで検証済みのため、ここでは表示と操作の配線を確認する
vi.mock('@/infrastructure/adapters', () => ({
  getDataAdapter: () => ({
    list: vi.fn().mockResolvedValue([]),
    create: vi
      .fn()
      .mockImplementation(
        async (
          _entity: string,
          data: Record<string, unknown>,
          options?: { id?: string },
        ) => ({ ...data, id: options?.id ?? crypto.randomUUID() }),
      ),
    update: vi
      .fn()
      .mockImplementation(
        async (
          _entity: string,
          id: string,
          patch: Record<string, unknown>,
        ) => ({
          id,
          ...patch,
        }),
      ),
    remove: vi.fn().mockResolvedValue(undefined),
  }),
}))

afterEach(() => cleanup())

const PROJECT_ID = crypto.randomUUID()

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    code: 'P001',
    name: '商流テスト案件',
    parentId: null,
    level: 0,
    status: 'active',
    confidence: null,
    completed: false,
    contractAmount: 1000,
    contractType: '請負',
    masterDueDate: '2026-03-31',
    createdAt: '2025-04-01T00:00:00.000Z',
    updatedAt: '2025-04-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeMilestone(
  overrides: Partial<BillingMilestone> = {},
): BillingMilestone {
  return {
    id: crypto.randomUUID(),
    projectId: PROJECT_ID,
    label: '中間金',
    amount: 400,
    plannedAcceptanceDate: '2025-09-30',
    status: 'accepted',
    createdAt: '2025-04-01T00:00:00.000Z',
    updatedAt: '2025-04-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeChangeRequest(
  overrides: Partial<ChangeRequest> = {},
): ChangeRequest {
  return {
    id: crypto.randomUUID(),
    projectId: PROJECT_ID,
    title: 'CR#1 追加開発分',
    requestedAt: '2025-07-01',
    status: 'pending',
    contractAmountDelta: 300,
    contractAmountDeltaType: 'increase',
    effortDeltaDays: 60,
    effortDeltaType: 'increase',
    newDueDate: null,
    decidedAt: null,
    createdAt: '2025-07-01T00:00:00.000Z',
    updatedAt: '2025-07-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('ProjectCommerceDialog', () => {
  beforeEach(() => {
    useProjectsStore.setState({ projects: [makeProject()] })
    useBillingMilestoneStore.setState({ billingMilestones: [] })
    useChangeRequestStore.setState({ changeRequests: [] })
  })

  it('受注情報サマリー（受注金額・契約形態・マスター納期・受注残）を表示する', () => {
    useBillingMilestoneStore.setState({
      billingMilestones: [makeMilestone({ amount: 400, status: 'accepted' })],
    })
    render(
      <ProjectCommerceDialog
        open
        onOpenChange={vi.fn()}
        projectId={PROJECT_ID}
      />,
    )
    expect(screen.getByText(/商流管理 — 商流テスト案件/)).toBeInTheDocument()
    expect(screen.getByText('請負')).toBeInTheDocument()
    expect(screen.getByText('2026-03-31')).toBeInTheDocument()
    // 受注残 = 1000 - 400(検収済) = 600
    expect(screen.getByText('600.00 万円')).toBeInTheDocument()
  })

  it('配分合計が受注額と一致しない場合は未配分の警告を表示する', () => {
    useBillingMilestoneStore.setState({
      billingMilestones: [makeMilestone({ amount: 400 })],
    })
    render(
      <ProjectCommerceDialog
        open
        onOpenChange={vi.fn()}
        projectId={PROJECT_ID}
      />,
    )
    expect(screen.getByText(/600\.00 万円が未配分/)).toBeInTheDocument()
  })

  // 反証: 受注額が未設定の案件で「未配分」警告を出すと誤報になる
  it('反証: 受注額未設定の案件では配分警告を表示しない', () => {
    useProjectsStore.setState({
      projects: [makeProject({ contractAmount: null })],
    })
    useBillingMilestoneStore.setState({
      billingMilestones: [makeMilestone({ amount: 400 })],
    })
    render(
      <ProjectCommerceDialog
        open
        onOpenChange={vi.fn()}
        projectId={PROJECT_ID}
      />,
    )
    expect(screen.queryByText(/未配分/)).not.toBeInTheDocument()
    expect(screen.queryByText(/配分超過/)).not.toBeInTheDocument()
  })

  it('変更管理タブで申請中CRの承認ボタンを押すと受注額へ反映される', async () => {
    const user = userEvent.setup()
    useChangeRequestStore.setState({
      changeRequests: [makeChangeRequest()],
    })
    render(
      <ProjectCommerceDialog
        open
        onOpenChange={vi.fn()}
        projectId={PROJECT_ID}
      />,
    )
    await user.click(screen.getByRole('tab', { name: '変更管理' }))
    expect(screen.getByText('CR#1 追加開発分')).toBeInTheDocument()
    expect(screen.getByText('申請中')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '承認' }))
    // 受注額 1000 + 300 = 1300 がProjectへ反映される
    expect(useProjectsStore.getState().projects[0]?.contractAmount).toBe(1300)
    expect(useChangeRequestStore.getState().changeRequests[0]?.status).toBe(
      'approved',
    )
  })

  // 反証: 承認済みCRに承認/却下/削除ボタンが残ると二重反映の入口になる
  it('反証: 承認済みのCRには操作ボタンを表示しない', async () => {
    const user = userEvent.setup()
    useChangeRequestStore.setState({
      changeRequests: [
        makeChangeRequest({ status: 'approved', decidedAt: '2025-07-15' }),
      ],
    })
    render(
      <ProjectCommerceDialog
        open
        onOpenChange={vi.fn()}
        projectId={PROJECT_ID}
      />,
    )
    await user.click(screen.getByRole('tab', { name: '変更管理' }))
    expect(screen.getByText('承認済')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '承認' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '却下' }),
    ).not.toBeInTheDocument()
  })

  it('請求マイルストンの追加フォームからストアへ追加される', async () => {
    const user = userEvent.setup()
    render(
      <ProjectCommerceDialog
        open
        onOpenChange={vi.fn()}
        projectId={PROJECT_ID}
      />,
    )
    await user.type(screen.getByLabelText('名称'), '検収時')
    // 日付入力（type=date）はfireEventよりtypeが安定
    await user.type(screen.getByLabelText('検収予定日'), '2026-03-31')
    await user.click(screen.getByRole('button', { name: '追加' }))

    const stored = useBillingMilestoneStore.getState().billingMilestones
    expect(stored).toHaveLength(1)
    expect(stored[0]?.label).toBe('検収時')
    expect(stored[0]?.status).toBe('planned')
  })
})
