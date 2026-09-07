import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChangeRequest, Project } from '@/shared/types'
import { useChangeRequestStore } from '@/stores/change-request-store'
import { useProjectsStore } from '@/stores/projects-store'

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

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    code: 'P001',
    name: 'テスト案件',
    parentId: null,
    level: 0,
    status: 'active',
    confidence: null,
    completed: false,
    contractAmount: 1000,
    masterDueDate: '2026-03-31',
    createdAt: '2025-04-01T00:00:00.000Z',
    updatedAt: '2025-04-01T00:00:00.000Z',
    ...overrides,
  }
}

function addInput(overrides: Record<string, unknown> = {}) {
  return {
    projectId: PROJECT_ID,
    title: 'CR#1 追加開発分',
    requestedAt: '2025-07-01',
    contractAmountDelta: 300,
    contractAmountDeltaType: 'increase' as const,
    effortDeltaDays: 60,
    effortDeltaType: 'increase' as const,
    newDueDate: null,
    ...overrides,
  }
}

describe('useChangeRequestStore', () => {
  beforeEach(() => {
    useChangeRequestStore.setState({ changeRequests: [] })
    useProjectsStore.setState({ projects: [makeProject()] })
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
    mockCreate.mockImplementation(
      async (
        _entity: string,
        data: Omit<ChangeRequest, 'id'>,
        options?: { id?: string },
      ) => ({ ...data, id: options?.id ?? crypto.randomUUID() }),
    )
    mockUpdate.mockImplementation(
      async (_entity: string, id: string, patch: Partial<ChangeRequest>) => ({
        id,
        ...patch,
      }),
    )
    mockRemove.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('addChangeRequest', () => {
    it('pending状態・decidedAt=nullで追加され、クライアント生成idが維持される', async () => {
      useChangeRequestStore.getState().addChangeRequest(addInput())
      const optimisticId = useChangeRequestStore.getState().changeRequests[0]
        ?.id as string
      await flushMicrotasks()

      const created = useChangeRequestStore.getState().changeRequests[0]
      expect(created?.status).toBe('pending')
      expect(created?.decidedAt).toBeNull()
      expect(created?.id).toBe(optimisticId)
      expect(mockCreate).toHaveBeenCalledWith(
        'changeRequests',
        expect.objectContaining({ title: 'CR#1 追加開発分' }),
        { id: optimisticId },
      )
    })

    it('反証: 追加失敗時はロールバックする', async () => {
      mockCreate.mockRejectedValueOnce(new Error('boom'))
      useChangeRequestStore.getState().addChangeRequest(addInput())
      expect(useChangeRequestStore.getState().changeRequests).toHaveLength(1)
      await flushMicrotasks()
      expect(useChangeRequestStore.getState().changeRequests).toHaveLength(0)
    })
  })

  describe('approveChangeRequest', () => {
    async function addAndGetId(overrides: Record<string, unknown> = {}) {
      useChangeRequestStore.getState().addChangeRequest(addInput(overrides))
      await flushMicrotasks()
      return useChangeRequestStore.getState().changeRequests[0]?.id as string
    }

    it('承認でstatus/decidedAtが更新され、受注額差分がProjectへ反映される', async () => {
      const id = await addAndGetId({ contractAmountDelta: 300 })
      useChangeRequestStore.getState().approveChangeRequest(id)
      await flushMicrotasks()

      const approved = useChangeRequestStore.getState().changeRequests[0]
      expect(approved?.status).toBe('approved')
      expect(approved?.decidedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      // 受注額 1000 + 300 = 1300
      expect(useProjectsStore.getState().projects[0]?.contractAmount).toBe(1300)
    })

    it('減額の変更を承認すると受注額が減る（0未満にはならない）', async () => {
      const id = await addAndGetId({
        contractAmountDelta: 1500,
        contractAmountDeltaType: 'decrease',
      })
      useChangeRequestStore.getState().approveChangeRequest(id)
      await flushMicrotasks()
      expect(useProjectsStore.getState().projects[0]?.contractAmount).toBe(0)
    })

    it('新納期付きの変更を承認するとmasterDueDateが更新される', async () => {
      const id = await addAndGetId({
        contractAmountDelta: 0,
        newDueDate: '2026-06-30',
      })
      useChangeRequestStore.getState().approveChangeRequest(id)
      await flushMicrotasks()
      expect(useProjectsStore.getState().projects[0]?.masterDueDate).toBe(
        '2026-06-30',
      )
    })

    // 反証: 工数差分は自動反映しない（WBSのどのタスクへ積むか自動では決められない）
    it('反証: 工数差分だけのCRを承認してもProjectは変更されない', async () => {
      const before = useProjectsStore.getState().projects[0]
      const id = await addAndGetId({
        contractAmountDelta: 0,
        effortDeltaDays: 100,
        newDueDate: null,
      })
      useChangeRequestStore.getState().approveChangeRequest(id)
      await flushMicrotasks()
      expect(useProjectsStore.getState().projects[0]).toEqual(before)
    })

    // 反証: 承認済みCRを再承認すると受注額が二重に加算される
    it('反証: pending以外のCRは承認できない（二重反映を防ぐ）', async () => {
      const id = await addAndGetId({ contractAmountDelta: 300 })
      useChangeRequestStore.getState().approveChangeRequest(id)
      await flushMicrotasks()
      useChangeRequestStore.getState().approveChangeRequest(id)
      await flushMicrotasks()
      expect(useProjectsStore.getState().projects[0]?.contractAmount).toBe(1300)
    })
  })

  describe('rejectChangeRequest', () => {
    it('却下でstatusが更新され、Projectへは何も反映されない', async () => {
      useChangeRequestStore.getState().addChangeRequest(addInput())
      await flushMicrotasks()
      const id = useChangeRequestStore.getState().changeRequests[0]
        ?.id as string
      useChangeRequestStore.getState().rejectChangeRequest(id)
      await flushMicrotasks()

      expect(useChangeRequestStore.getState().changeRequests[0]?.status).toBe(
        'rejected',
      )
      expect(useProjectsStore.getState().projects[0]?.contractAmount).toBe(1000)
    })
  })

  describe('deleteChangeRequest', () => {
    it('pendingのCRは削除できる', async () => {
      useChangeRequestStore.getState().addChangeRequest(addInput())
      await flushMicrotasks()
      const id = useChangeRequestStore.getState().changeRequests[0]
        ?.id as string
      useChangeRequestStore.getState().deleteChangeRequest(id)
      await flushMicrotasks()
      expect(useChangeRequestStore.getState().changeRequests).toHaveLength(0)
    })

    // 反証: 承認済みCRは「なぜ着地が動いたか」の記録であり、消せると追跡性が失われる
    it('反証: 承認済みのCRは削除できない', async () => {
      useChangeRequestStore.getState().addChangeRequest(addInput())
      await flushMicrotasks()
      const id = useChangeRequestStore.getState().changeRequests[0]
        ?.id as string
      useChangeRequestStore.getState().approveChangeRequest(id)
      await flushMicrotasks()
      useChangeRequestStore.getState().deleteChangeRequest(id)
      await flushMicrotasks()
      expect(useChangeRequestStore.getState().changeRequests).toHaveLength(1)
      expect(mockRemove).not.toHaveBeenCalled()
    })
  })

  describe('getByProject', () => {
    it('対象案件のCRのみをrequestedAt降順で返す', async () => {
      const store = useChangeRequestStore.getState()
      store.addChangeRequest(
        addInput({ requestedAt: '2025-05-01', title: 'A' }),
      )
      store.addChangeRequest(
        addInput({ requestedAt: '2025-08-01', title: 'B' }),
      )
      store.addChangeRequest(
        addInput({ projectId: crypto.randomUUID(), title: '他案件' }),
      )
      await flushMicrotasks()

      const list = useChangeRequestStore.getState().getByProject(PROJECT_ID)
      expect(list.map((c) => c.title)).toEqual(['B', 'A'])
    })
  })
})
