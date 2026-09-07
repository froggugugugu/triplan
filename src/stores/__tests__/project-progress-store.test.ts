import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectProgressEntry } from '@/shared/types'
import { useProjectProgressStore } from '@/stores/project-progress-store'

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
const OTHER_PROJECT_ID = crypto.randomUUID()

describe('useProjectProgressStore', () => {
  beforeEach(async () => {
    useProjectProgressStore.setState({ projectProgressEntries: [] })
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
    mockCreate.mockImplementation(
      async (
        _entity: string,
        data: Omit<ProjectProgressEntry, 'id'>,
        options?: { id?: string },
      ) => ({
        ...data,
        id: options?.id ?? crypto.randomUUID(),
      }),
    )
    mockUpdate.mockImplementation(
      async (
        _entity: string,
        id: string,
        patch: Partial<ProjectProgressEntry>,
      ) => ({ id, ...patch }),
    )
    mockRemove.mockResolvedValue(undefined)
    const { toast } = await import('@/shared/hooks/use-toast')
    vi.mocked(toast).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('loadProjectProgress', () => {
    it('DataAdapterから読み込んだ進捗スナップショットをセットする', async () => {
      mockList.mockResolvedValueOnce([
        {
          id: crypto.randomUUID(),
          projectId: PROJECT_ID,
          weeklyProgress: { '2025-W15': 0.5 },
          createdAt: '2025-04-01T00:00:00.000Z',
          updatedAt: '2025-04-01T00:00:00.000Z',
        },
      ])
      useProjectProgressStore.getState().loadProjectProgress()
      await flushMicrotasks()
      expect(
        useProjectProgressStore.getState().projectProgressEntries,
      ).toHaveLength(1)
    })

    it('読み込みが空配列の場合は空配列になる', async () => {
      mockList.mockResolvedValueOnce([])
      useProjectProgressStore.getState().loadProjectProgress()
      await flushMicrotasks()
      expect(useProjectProgressStore.getState().projectProgressEntries).toEqual(
        [],
      )
    })

    it('読み込みがDataAdapterで失敗した場合はトースト表示される', async () => {
      mockList.mockRejectedValueOnce(new Error('network error'))
      useProjectProgressStore.getState().loadProjectProgress()
      await flushMicrotasks()
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })
  })

  describe('setWeeklyProgress', () => {
    it('該当案件のレコードが無い場合は新規作成する（楽観的に即座へ反映される）', () => {
      useProjectProgressStore
        .getState()
        .setWeeklyProgress(PROJECT_ID, '2025-W15', 0.3)

      const entries = useProjectProgressStore.getState().projectProgressEntries
      expect(entries).toHaveLength(1)
      expect(entries[0]?.projectId).toBe(PROJECT_ID)
      expect(entries[0]?.weeklyProgress).toEqual({ '2025-W15': 0.3 })
      expect(mockCreate).toHaveBeenCalledWith(
        'projectProgressEntries',
        expect.objectContaining({
          projectId: PROJECT_ID,
          weeklyProgress: { '2025-W15': 0.3 },
        }),
        { id: entries[0]?.id },
      )
    })

    it('DataAdapter確定後もidは変わらず安定している', async () => {
      useProjectProgressStore
        .getState()
        .setWeeklyProgress(PROJECT_ID, '2025-W15', 0.3)
      const optimisticId =
        useProjectProgressStore.getState().projectProgressEntries[0]?.id
      expect(optimisticId).toBeDefined()
      await flushMicrotasks()
      expect(
        useProjectProgressStore.getState().projectProgressEntries[0]?.id,
      ).toBe(optimisticId)
    })

    it('既存レコードがある場合は該当週のみをupsertし、他の週は保持する', () => {
      useProjectProgressStore
        .getState()
        .setWeeklyProgress(PROJECT_ID, '2025-W15', 0.3)
      // 楽観ロックの期待値は「読んだ時点のupdatedAt」＝1回目の作成時刻。2回目の呼び出しが
      // updatedAtを進めるため、後から読むと1ms境界をまたいだときに食い違う（CIで実際に
      // 1ms差で落ちたフレーク）。ここで捕まえておく
      const createdUpdatedAt =
        useProjectProgressStore.getState().projectProgressEntries[0]?.updatedAt
      useProjectProgressStore
        .getState()
        .setWeeklyProgress(PROJECT_ID, '2025-W16', 0.5)

      const entries = useProjectProgressStore.getState().projectProgressEntries
      expect(entries).toHaveLength(1)
      expect(entries[0]?.weeklyProgress).toEqual({
        '2025-W15': 0.3,
        '2025-W16': 0.5,
      })
      // 2回目はupdate()（新規create()ではない）で呼ばれる
      expect(mockUpdate).toHaveBeenCalledWith(
        'projectProgressEntries',
        entries[0]?.id,
        expect.objectContaining({
          weeklyProgress: { '2025-W15': 0.3, '2025-W16': 0.5 },
        }),
        // 楽観ロック
        { expectedUpdatedAt: createdUpdatedAt },
      )
    })

    it('同一週への再入力は上書きされる（追記ではなく最新値で置換）', () => {
      useProjectProgressStore
        .getState()
        .setWeeklyProgress(PROJECT_ID, '2025-W15', 0.3)
      useProjectProgressStore
        .getState()
        .setWeeklyProgress(PROJECT_ID, '2025-W15', 0.8)

      const entries = useProjectProgressStore.getState().projectProgressEntries
      expect(entries).toHaveLength(1)
      expect(entries[0]?.weeklyProgress).toEqual({ '2025-W15': 0.8 })
    })

    it('別案件のレコードには影響しない', () => {
      useProjectProgressStore
        .getState()
        .setWeeklyProgress(PROJECT_ID, '2025-W15', 0.3)
      useProjectProgressStore
        .getState()
        .setWeeklyProgress(OTHER_PROJECT_ID, '2025-W15', 0.9)

      const entries = useProjectProgressStore.getState().projectProgressEntries
      expect(entries).toHaveLength(2)
      const own = entries.find((e) => e.projectId === PROJECT_ID)
      const other = entries.find((e) => e.projectId === OTHER_PROJECT_ID)
      expect(own?.weeklyProgress).toEqual({ '2025-W15': 0.3 })
      expect(other?.weeklyProgress).toEqual({ '2025-W15': 0.9 })
    })

    it('新規作成がDataAdapterで失敗した場合はロールバックされ、トースト表示される', async () => {
      mockCreate.mockRejectedValueOnce(new Error('network error'))
      useProjectProgressStore
        .getState()
        .setWeeklyProgress(PROJECT_ID, '2025-W15', 0.3)
      await flushMicrotasks()
      expect(
        useProjectProgressStore.getState().projectProgressEntries,
      ).toHaveLength(0)
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })

    it('更新がDataAdapterで失敗した場合はロールバックされる', async () => {
      useProjectProgressStore
        .getState()
        .setWeeklyProgress(PROJECT_ID, '2025-W15', 0.3)
      mockUpdate.mockRejectedValueOnce(new Error('network error'))
      useProjectProgressStore
        .getState()
        .setWeeklyProgress(PROJECT_ID, '2025-W16', 0.5)
      // 楽観的更新は即座に反映される
      expect(
        useProjectProgressStore.getState().projectProgressEntries[0]
          ?.weeklyProgress,
      ).toEqual({ '2025-W15': 0.3, '2025-W16': 0.5 })
      await flushMicrotasks()
      // 失敗後は該当週追加前の状態へロールバックされる
      expect(
        useProjectProgressStore.getState().projectProgressEntries[0]
          ?.weeklyProgress,
      ).toEqual({ '2025-W15': 0.3 })
    })
  })

  describe('getProjectProgressEntry', () => {
    it('指定案件のレコードを返す', () => {
      useProjectProgressStore
        .getState()
        .setWeeklyProgress(PROJECT_ID, '2025-W15', 0.3)
      const entry = useProjectProgressStore
        .getState()
        .getProjectProgressEntry(PROJECT_ID)
      expect(entry?.projectId).toBe(PROJECT_ID)
    })

    it('レコードが無い場合はundefinedを返す', () => {
      expect(
        useProjectProgressStore.getState().getProjectProgressEntry(PROJECT_ID),
      ).toBeUndefined()
    })
  })
})
