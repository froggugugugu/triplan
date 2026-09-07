import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RiskEntry } from '@/shared/types'
import { useRiskStore } from '@/stores/risk-store'

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
  await Promise.resolve()
}

const PRJ = '00000000-0000-4000-8000-0000000000a1'
/** サーバー時計のupdatedAt（クライアントが送る値と必ず区別できる値にする） */
const SERVER_UPDATED_AT = '2099-01-01T00:00:00.000Z'

function seedRisk(overrides: Partial<RiskEntry> = {}): RiskEntry {
  return {
    id: '00000000-0000-4000-8000-0000000000b1',
    projectId: PRJ,
    title: '既存リスク',
    probability: 'medium',
    impact: 'medium',
    status: 'open',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('useRiskStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
    mockCreate.mockImplementation(
      async (
        _entity: string,
        data: Record<string, unknown>,
        opts?: { id?: string },
      ) => ({
        id: opts?.id ?? 'server-id',
        ...data,
        updatedAt: SERVER_UPDATED_AT,
      }),
    )
    mockUpdate.mockImplementation(
      async (_entity: string, id: string, patch: Record<string, unknown>) => ({
        ...seedRisk(),
        id,
        ...patch,
        updatedAt: SERVER_UPDATED_AT,
      }),
    )
    mockRemove.mockResolvedValue(undefined)
    useRiskStore.setState({ riskEntries: [] })
  })

  it('追加は楽観的に即時反映され、クライアント生成idが確定後も変わらない', async () => {
    useRiskStore.getState().addRiskEntry({
      projectId: PRJ,
      title: '新規リスク',
      probability: 'high',
      impact: 'high',
      ownerMemberId: null,
      dueDate: null,
      response: '',
    })
    const optimistic = useRiskStore.getState().riskEntries
    expect(optimistic).toHaveLength(1)
    const id = optimistic[0]?.id
    expect(optimistic[0]?.status).toBe('open')

    await flushMicrotasks()
    const [entity, _data, opts] = mockCreate.mock.calls[0] as [
      string,
      Record<string, unknown>,
      { id?: string },
    ]
    expect(entity).toBe('riskEntries')
    expect(opts.id).toBe(id)
    expect(useRiskStore.getState().riskEntries[0]?.id).toBe(id)
  })

  it('追加失敗時はロールバックする（反証）', async () => {
    mockCreate.mockRejectedValue(new Error('server down'))
    useRiskStore.getState().addRiskEntry({
      projectId: PRJ,
      title: '失敗するリスク',
      probability: 'low',
      impact: 'low',
      ownerMemberId: null,
      dueDate: null,
      response: '',
    })
    expect(useRiskStore.getState().riskEntries).toHaveLength(1)
    await flushMicrotasks()
    expect(useRiskStore.getState().riskEntries).toHaveLength(0)
  })

  it('更新は画面が見ていた版のupdatedAtを楽観ロック期待値として送り、サーバー確定値を反映する', async () => {
    const existing = seedRisk()
    useRiskStore.setState({ riskEntries: [existing] })

    useRiskStore
      .getState()
      .updateRiskEntry({ id: existing.id, status: 'closed' })
    await flushMicrotasks()

    const [, id1, , opts1] = mockUpdate.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
      { expectedUpdatedAt?: string },
    ]
    expect(id1).toBe(existing.id)
    expect(opts1.expectedUpdatedAt).toBe(existing.updatedAt)
    // サーバー確定行が反映されている
    expect(useRiskStore.getState().riskEntries[0]?.updatedAt).toBe(
      SERVER_UPDATED_AT,
    )

    // 2回目の更新: 期待値がサーバー確定値になっている（単独ユーザー412の回帰反証）
    useRiskStore
      .getState()
      .updateRiskEntry({ id: existing.id, title: '再更新' })
    await flushMicrotasks()
    const [, , , opts2] = mockUpdate.mock.calls[1] as [
      string,
      string,
      Record<string, unknown>,
      { expectedUpdatedAt?: string },
    ]
    expect(opts2.expectedUpdatedAt).toBe(SERVER_UPDATED_AT)
  })

  it('更新失敗時はロールバックする（反証）', async () => {
    const existing = seedRisk()
    useRiskStore.setState({ riskEntries: [existing] })
    mockUpdate.mockRejectedValue(new Error('conflict'))

    useRiskStore
      .getState()
      .updateRiskEntry({ id: existing.id, title: '巻き戻るはず' })
    expect(useRiskStore.getState().riskEntries[0]?.title).toBe('巻き戻るはず')
    await flushMicrotasks()
    expect(useRiskStore.getState().riskEntries[0]?.title).toBe('既存リスク')
    expect(useRiskStore.getState().riskEntries[0]?.updatedAt).toBe(
      existing.updatedAt,
    )
  })

  it('存在しないidの更新は何もしない（他レコードの版を掴まない反証）', async () => {
    useRiskStore.setState({ riskEntries: [seedRisk()] })
    useRiskStore.getState().updateRiskEntry({
      id: '00000000-0000-4000-8000-00000000dead',
      title: 'x',
    })
    await flushMicrotasks()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('削除失敗時はロールバックする（反証）', async () => {
    const existing = seedRisk()
    useRiskStore.setState({ riskEntries: [existing] })
    mockRemove.mockRejectedValue(new Error('server down'))

    useRiskStore.getState().deleteRiskEntry(existing.id)
    expect(useRiskStore.getState().riskEntries).toHaveLength(0)
    await flushMicrotasks()
    expect(useRiskStore.getState().riskEntries).toHaveLength(1)
  })

  it('getRisksForProjectは他案件のリスクを混ぜない（反証）', () => {
    const mine = seedRisk()
    const others = seedRisk({
      id: '00000000-0000-4000-8000-0000000000b2',
      projectId: '00000000-0000-4000-8000-0000000000a2',
    })
    useRiskStore.setState({ riskEntries: [mine, others] })
    const result = useRiskStore.getState().getRisksForProject(PRJ)
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe(mine.id)
  })
})
