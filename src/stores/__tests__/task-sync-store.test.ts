import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreateTaskSyncLog } from '@/shared/types/task-sync'
import { useTaskSyncStore } from '@/stores/task-sync-store'

const mockList = vi.fn()
const mockCreate = vi.fn()

vi.mock('@/infrastructure/adapters', () => ({
  getDataAdapter: () => ({
    list: mockList,
    create: mockCreate,
  }),
}))

vi.mock('@/shared/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

function buildLog(
  overrides: Partial<CreateTaskSyncLog> = {},
): CreateTaskSyncLog {
  return {
    syncedAt: '2026-10-10T09:00:00.000Z',
    channel: 'csv',
    source: 'backlog',
    fileName: 'portal-issues.csv',
    completedCount: 2,
    reopenedCount: 0,
    unchangedCount: 1,
    skippedCount: 0,
    skippedReasons: [],
    note: null,
    ...overrides,
  }
}

describe('useTaskSyncStore', () => {
  beforeEach(async () => {
    useTaskSyncStore.setState({ taskSyncLogs: [] })
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
    mockCreate.mockImplementation(
      async (
        _entity: string,
        data: Record<string, unknown>,
        options?: { id?: string },
      ) => ({ ...data, id: options?.id ?? crypto.randomUUID() }),
    )
    const { toast } = await import('@/shared/hooks/use-toast')
    vi.mocked(toast).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loadTaskSyncLogsでDataAdapterから読み込む', async () => {
    const log = { id: crypto.randomUUID(), ...buildLog() }
    mockList.mockResolvedValueOnce([log])
    useTaskSyncStore.getState().loadTaskSyncLogs()
    await flushMicrotasks()
    expect(useTaskSyncStore.getState().taskSyncLogs).toEqual([log])
  })

  it('addTaskSyncLogで追記され、クライアント生成idが確定後も維持される', async () => {
    const record = useTaskSyncStore.getState().addTaskSyncLog(buildLog())
    expect(useTaskSyncStore.getState().taskSyncLogs).toHaveLength(1)

    await flushMicrotasks()
    expect(mockCreate).toHaveBeenCalledWith(
      'taskSyncLogs',
      expect.objectContaining({ fileName: 'portal-issues.csv' }),
      { id: record.id },
    )
    expect(useTaskSyncStore.getState().taskSyncLogs[0]?.id).toBe(record.id)
  })

  it('反証: 作成失敗時はロールバックされトースト通知される', async () => {
    mockCreate.mockRejectedValueOnce(new Error('server error'))
    useTaskSyncStore.getState().addTaskSyncLog(buildLog())
    expect(useTaskSyncStore.getState().taskSyncLogs).toHaveLength(1)

    await flushMicrotasks()
    expect(useTaskSyncStore.getState().taskSyncLogs).toHaveLength(0)
    const { toast } = await import('@/shared/hooks/use-toast')
    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' }),
    )
  })
})
