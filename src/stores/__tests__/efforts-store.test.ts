import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EffortEntry } from '@/shared/types/effort'
import { useEffortsStore } from '@/stores/efforts-store'

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

describe('useEffortsStore', () => {
  beforeEach(async () => {
    useEffortsStore.setState({ efforts: [] })
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
    mockCreate.mockImplementation(
      async (
        _entity: string,
        data: Omit<EffortEntry, 'id'>,
        options?: { id?: string },
      ) => ({
        ...data,
        id: options?.id ?? crypto.randomUUID(),
      }),
    )
    mockUpdate.mockImplementation(
      async (_entity: string, id: string, patch: Partial<EffortEntry>) => ({
        id,
        ...patch,
      }),
    )
    mockRemove.mockResolvedValue(undefined)
    const { toast } = await import('@/shared/hooks/use-toast')
    vi.mocked(toast).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('loadEfforts', () => {
    it('DataAdapterから読み込んだ工数エントリをセットする', async () => {
      mockList.mockResolvedValueOnce([
        {
          id: crypto.randomUUID(),
          projectId: PROJECT_ID,
          columnId: 'effort-1',
          value: 5,
        },
      ])
      useEffortsStore.getState().loadEfforts()
      await flushMicrotasks()
      expect(useEffortsStore.getState().efforts).toHaveLength(1)
    })

    it('読み込みがDataAdapterで失敗した場合はトースト表示される', async () => {
      mockList.mockRejectedValueOnce(new Error('network error'))
      useEffortsStore.getState().loadEfforts()
      await flushMicrotasks()
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })
  })

  describe('upsertEffort', () => {
    it('該当エントリが無い場合は新規作成する（楽観的に即座へ反映される）', () => {
      useEffortsStore
        .getState()
        .upsertEffort({ projectId: PROJECT_ID, columnId: 'effort-1', value: 3 })

      const efforts = useEffortsStore.getState().efforts
      expect(efforts).toHaveLength(1)
      expect(efforts[0]?.value).toBe(3)
      expect(mockCreate).toHaveBeenCalledWith(
        'efforts',
        { projectId: PROJECT_ID, columnId: 'effort-1', value: 3 },
        { id: efforts[0]?.id },
      )
    })

    it('DataAdapter確定後もidは変わらず安定している', async () => {
      useEffortsStore
        .getState()
        .upsertEffort({ projectId: PROJECT_ID, columnId: 'effort-1', value: 3 })
      const optimisticId = useEffortsStore.getState().efforts[0]?.id
      await flushMicrotasks()
      expect(useEffortsStore.getState().efforts[0]?.id).toBe(optimisticId)
    })

    it('既存エントリがある場合はvalueのみ更新する（update()が呼ばれる）', () => {
      useEffortsStore
        .getState()
        .upsertEffort({ projectId: PROJECT_ID, columnId: 'effort-1', value: 3 })
      useEffortsStore
        .getState()
        .upsertEffort({ projectId: PROJECT_ID, columnId: 'effort-1', value: 8 })

      const efforts = useEffortsStore.getState().efforts
      expect(efforts).toHaveLength(1)
      expect(efforts[0]?.value).toBe(8)
      expect(mockUpdate).toHaveBeenCalledWith('efforts', efforts[0]?.id, {
        value: 8,
      })
    })

    it('別列・別プロジェクトのエントリには影響しない', () => {
      useEffortsStore
        .getState()
        .upsertEffort({ projectId: PROJECT_ID, columnId: 'effort-1', value: 3 })
      useEffortsStore
        .getState()
        .upsertEffort({ projectId: PROJECT_ID, columnId: 'effort-2', value: 4 })
      useEffortsStore.getState().upsertEffort({
        projectId: OTHER_PROJECT_ID,
        columnId: 'effort-1',
        value: 9,
      })

      expect(useEffortsStore.getState().efforts).toHaveLength(3)
    })

    it('新規作成がDataAdapterで失敗した場合はロールバックされ、トースト表示される', async () => {
      mockCreate.mockRejectedValueOnce(new Error('network error'))
      useEffortsStore
        .getState()
        .upsertEffort({ projectId: PROJECT_ID, columnId: 'effort-1', value: 3 })
      await flushMicrotasks()
      expect(useEffortsStore.getState().efforts).toHaveLength(0)
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })

    it('更新がDataAdapterで失敗した場合はロールバックされる', async () => {
      useEffortsStore
        .getState()
        .upsertEffort({ projectId: PROJECT_ID, columnId: 'effort-1', value: 3 })
      mockUpdate.mockRejectedValueOnce(new Error('network error'))
      useEffortsStore
        .getState()
        .upsertEffort({ projectId: PROJECT_ID, columnId: 'effort-1', value: 8 })
      expect(useEffortsStore.getState().efforts[0]?.value).toBe(8)
      await flushMicrotasks()
      expect(useEffortsStore.getState().efforts[0]?.value).toBe(3)
    })
  })

  describe('deleteEffort', () => {
    it('該当エントリを削除する', () => {
      useEffortsStore
        .getState()
        .upsertEffort({ projectId: PROJECT_ID, columnId: 'effort-1', value: 3 })
      useEffortsStore.getState().deleteEffort(PROJECT_ID, 'effort-1')
      expect(useEffortsStore.getState().efforts).toHaveLength(0)
    })

    it('該当エントリが無い場合は何もしない（DataAdapterも呼ばれない）', () => {
      useEffortsStore.getState().deleteEffort(PROJECT_ID, 'effort-1')
      expect(useEffortsStore.getState().efforts).toHaveLength(0)
      expect(mockRemove).not.toHaveBeenCalled()
    })

    it('削除がDataAdapterで失敗した場合はロールバックされる', async () => {
      useEffortsStore
        .getState()
        .upsertEffort({ projectId: PROJECT_ID, columnId: 'effort-1', value: 3 })
      mockRemove.mockRejectedValueOnce(new Error('network error'))
      useEffortsStore.getState().deleteEffort(PROJECT_ID, 'effort-1')
      expect(useEffortsStore.getState().efforts).toHaveLength(0)
      await flushMicrotasks()
      expect(useEffortsStore.getState().efforts).toHaveLength(1)
    })
  })

  describe('deleteByProject', () => {
    it('指定プロジェクトの全エントリを削除する（他プロジェクトは影響しない）', () => {
      useEffortsStore
        .getState()
        .upsertEffort({ projectId: PROJECT_ID, columnId: 'effort-1', value: 3 })
      useEffortsStore
        .getState()
        .upsertEffort({ projectId: PROJECT_ID, columnId: 'effort-2', value: 4 })
      useEffortsStore.getState().upsertEffort({
        projectId: OTHER_PROJECT_ID,
        columnId: 'effort-1',
        value: 9,
      })

      useEffortsStore.getState().deleteByProject(PROJECT_ID)

      const efforts = useEffortsStore.getState().efforts
      expect(efforts).toHaveLength(1)
      expect(efforts[0]?.projectId).toBe(OTHER_PROJECT_ID)
    })

    it('対象が無い場合は何もしない（DataAdapterも呼ばれない）', () => {
      useEffortsStore.getState().deleteByProject(PROJECT_ID)
      expect(mockRemove).not.toHaveBeenCalled()
    })

    it('削除がDataAdapterで失敗した場合はロールバックされる', async () => {
      useEffortsStore
        .getState()
        .upsertEffort({ projectId: PROJECT_ID, columnId: 'effort-1', value: 3 })
      mockRemove.mockRejectedValueOnce(new Error('network error'))
      useEffortsStore.getState().deleteByProject(PROJECT_ID)
      expect(useEffortsStore.getState().efforts).toHaveLength(0)
      await flushMicrotasks()
      expect(useEffortsStore.getState().efforts).toHaveLength(1)
    })
  })

  describe('Selectors', () => {
    it('getByProjectで指定プロジェクトのエントリのみ返す', () => {
      useEffortsStore
        .getState()
        .upsertEffort({ projectId: PROJECT_ID, columnId: 'effort-1', value: 3 })
      useEffortsStore.getState().upsertEffort({
        projectId: OTHER_PROJECT_ID,
        columnId: 'effort-1',
        value: 9,
      })
      expect(useEffortsStore.getState().getByProject(PROJECT_ID)).toHaveLength(
        1,
      )
    })

    it('getByProjectAndColumnで該当エントリを取得できる', () => {
      useEffortsStore
        .getState()
        .upsertEffort({ projectId: PROJECT_ID, columnId: 'effort-1', value: 3 })
      const found = useEffortsStore
        .getState()
        .getByProjectAndColumn(PROJECT_ID, 'effort-1')
      expect(found?.value).toBe(3)
    })

    it('getByProjectAndColumnで存在しない組み合わせはundefinedを返す', () => {
      expect(
        useEffortsStore
          .getState()
          .getByProjectAndColumn(PROJECT_ID, 'effort-1'),
      ).toBeUndefined()
    })
  })
})
