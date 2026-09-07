import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BillingMilestone } from '@/shared/types'
import { useBillingMilestoneStore } from '@/stores/billing-milestone-store'

const mockList = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockRemove = vi.fn()

vi.mock('@/infrastructure/adapters', () => ({
  getDataAdapter: () => ({
    list: mockList,
    create: mockCreate,
    update: mockUpdate,
    remove: mockRemove,
  }),
}))

vi.mock('@/shared/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

const PROJECT_ID = crypto.randomUUID()

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    projectId: PROJECT_ID,
    label: '中間金',
    amount: 300,
    plannedAcceptanceDate: '2025-09-30',
    status: 'planned' as const,
    ...overrides,
  }
}

describe('useBillingMilestoneStore', () => {
  beforeEach(() => {
    useBillingMilestoneStore.setState({ billingMilestones: [] })
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
    mockCreate.mockImplementation(
      async (
        _entity: string,
        data: Omit<BillingMilestone, 'id'>,
        options?: { id?: string },
      ) => ({ ...data, id: options?.id ?? crypto.randomUUID() }),
    )
    mockUpdate.mockImplementation(
      async (
        _entity: string,
        id: string,
        patch: Partial<BillingMilestone>,
      ) => ({ id, ...patch }),
    )
    mockRemove.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('追加時にクライアント生成idが維持される（楽観的更新）', async () => {
    useBillingMilestoneStore.getState().addBillingMilestone(createInput())
    const optimisticId = useBillingMilestoneStore.getState()
      .billingMilestones[0]?.id as string
    await flushMicrotasks()
    expect(useBillingMilestoneStore.getState().billingMilestones[0]?.id).toBe(
      optimisticId,
    )
    expect(mockCreate).toHaveBeenCalledWith(
      'billingMilestones',
      expect.objectContaining({ label: '中間金', amount: 300 }),
      { id: optimisticId },
    )
  })

  it('反証: 追加失敗時はロールバックする', async () => {
    mockCreate.mockRejectedValueOnce(new Error('boom'))
    useBillingMilestoneStore.getState().addBillingMilestone(createInput())
    expect(useBillingMilestoneStore.getState().billingMilestones).toHaveLength(
      1,
    )
    await flushMicrotasks()
    expect(useBillingMilestoneStore.getState().billingMilestones).toHaveLength(
      0,
    )
  })

  it('ステータスを検収済→請求済→入金済と進められる', async () => {
    useBillingMilestoneStore.getState().addBillingMilestone(createInput())
    await flushMicrotasks()
    const id = useBillingMilestoneStore.getState().billingMilestones[0]
      ?.id as string

    for (const status of ['accepted', 'invoiced', 'paid'] as const) {
      useBillingMilestoneStore
        .getState()
        .updateBillingMilestoneStatus(id, status)
      await flushMicrotasks()
      expect(
        useBillingMilestoneStore.getState().billingMilestones[0]?.status,
      ).toBe(status)
    }
  })

  it('反証: ステータス更新失敗時はロールバックする', async () => {
    useBillingMilestoneStore.getState().addBillingMilestone(createInput())
    await flushMicrotasks()
    const id = useBillingMilestoneStore.getState().billingMilestones[0]
      ?.id as string
    mockUpdate.mockRejectedValueOnce(new Error('boom'))
    useBillingMilestoneStore
      .getState()
      .updateBillingMilestoneStatus(id, 'accepted')
    await flushMicrotasks()
    expect(
      useBillingMilestoneStore.getState().billingMilestones[0]?.status,
    ).toBe('planned')
  })

  it('getByProjectは対象案件のみを検収予定日昇順で返す', async () => {
    const store = useBillingMilestoneStore.getState()
    store.addBillingMilestone(
      createInput({ label: '後', plannedAcceptanceDate: '2025-12-31' }),
    )
    store.addBillingMilestone(
      createInput({ label: '先', plannedAcceptanceDate: '2025-06-30' }),
    )
    store.addBillingMilestone(
      createInput({ projectId: crypto.randomUUID(), label: '他案件' }),
    )
    await flushMicrotasks()

    const list = useBillingMilestoneStore.getState().getByProject(PROJECT_ID)
    expect(list.map((m) => m.label)).toEqual(['先', '後'])
  })
})
