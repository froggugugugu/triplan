import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EstimateSnapshot } from '@/shared/types'
import { useEstimateStore } from '@/stores/estimate-store'

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

const basis = {
  estimatedUnitPrice: 100,
  coefficient: 1,
  workdaysPerMonth: 20,
  hoursPerDay: 8,
  hoursPerFunctionPoint: 10,
}

function manualInput(projectId = PROJECT_ID) {
  return {
    projectId,
    stage: 'product_definition' as const,
    method: 'manual' as const,
    label: '協力会社の見積',
    effortDays: 100,
    amount: 500,
    basis,
  }
}

function makeSnapshot(
  overrides: Partial<EstimateSnapshot> = {},
): EstimateSnapshot {
  return {
    id: crypto.randomUUID(),
    projectId: PROJECT_ID,
    version: 1,
    stage: 'product_definition',
    method: 'manual',
    label: 'v1',
    takenAt: '2026-09-01T00:00:00.000Z',
    effortDays: 100,
    amount: 500,
    basis,
    changeRequestId: null,
    authorName: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('useEstimateStore', () => {
  beforeEach(async () => {
    useEstimateStore.setState({ estimateSnapshots: [] })
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
    mockCreate.mockImplementation(
      async (
        _entity: string,
        data: Omit<EstimateSnapshot, 'id'>,
        options?: { id?: string },
      ) => ({ ...data, id: options?.id ?? crypto.randomUUID() }),
    )
    mockRemove.mockResolvedValue(undefined)
    const { toast } = await import('@/shared/hooks/use-toast')
    vi.mocked(toast).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('loadEstimateSnapshots', () => {
    it('DataAdapterから読み込んだ記録をセットする', async () => {
      const stored = [makeSnapshot()]
      mockList.mockResolvedValueOnce(stored)
      useEstimateStore.getState().loadEstimateSnapshots()
      await flushMicrotasks()
      expect(mockList).toHaveBeenCalledWith('estimateSnapshots')
      expect(useEstimateStore.getState().estimateSnapshots).toEqual(stored)
    })

    it('読み込み失敗時はトーストで通知する', async () => {
      mockList.mockRejectedValueOnce(new Error('network'))
      useEstimateStore.getState().loadEstimateSnapshots()
      await flushMicrotasks()
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })
  })

  describe('recordEstimate', () => {
    it('versionが1から始まり、記録のたびに1つ増える', async () => {
      const { recordEstimate } = useEstimateStore.getState()
      recordEstimate(manualInput())
      await flushMicrotasks()
      recordEstimate({ ...manualInput(), label: 'v2' })
      await flushMicrotasks()
      expect(
        useEstimateStore.getState().estimateSnapshots.map((s) => s.version),
      ).toEqual([1, 2])
    })

    it('反証: versionは案件ごとに独立して採番される', async () => {
      const { recordEstimate } = useEstimateStore.getState()
      recordEstimate(manualInput())
      recordEstimate(manualInput(OTHER_PROJECT_ID))
      await flushMicrotasks()
      const versions = useEstimateStore
        .getState()
        .estimateSnapshots.map((s) => [s.projectId, s.version])
      expect(versions).toEqual([
        [PROJECT_ID, 1],
        [OTHER_PROJECT_ID, 1],
      ])
    })

    it('クライアント生成idをDataAdapter.createへ渡し、確定後もidが変わらない', async () => {
      const created = useEstimateStore.getState().recordEstimate(manualInput())
      expect(created).not.toBeNull()
      await flushMicrotasks()
      expect(mockCreate).toHaveBeenCalledWith(
        'estimateSnapshots',
        expect.objectContaining({ version: 1, label: '協力会社の見積' }),
        { id: created?.id },
      )
      expect(useEstimateStore.getState().estimateSnapshots[0]?.id).toBe(
        created?.id,
      )
    })

    it('FP法の記録は根拠（項目・totalFp・人時/FP）をそのまま凍結する', async () => {
      const created = useEstimateStore.getState().recordEstimate({
        ...manualInput(),
        method: 'function_point',
        fp: {
          method: 'nesma_indicative',
          items: [{ name: '顧客', type: 'ILF', count: 2 }],
          totalFp: 70,
        },
      })
      await flushMicrotasks()
      expect(created?.fp?.totalFp).toBe(70)
      expect(created?.basis.hoursPerFunctionPoint).toBe(10)
      expect(created?.authorName).toBeNull()
      expect(created?.changeRequestId).toBeNull()
    })

    it('takenAtを省略すると現在時刻が入る', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-09-05T03:00:00.000Z'))
      const created = useEstimateStore.getState().recordEstimate(manualInput())
      expect(created?.takenAt).toBe('2026-09-05T03:00:00.000Z')
      vi.useRealTimers()
    })

    it('反証: 整合しない入力（完了以外の実績）は何も書かずnullを返し通知する', async () => {
      const created = useEstimateStore.getState().recordEstimate({
        ...manualInput(),
        method: 'actual',
        stage: 'requirements_complete',
      })
      await flushMicrotasks()
      expect(created).toBeNull()
      expect(useEstimateStore.getState().estimateSnapshots).toHaveLength(0)
      expect(mockCreate).not.toHaveBeenCalled()
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ title: '見積を記録できません' }),
      )
    })

    it('反証: 作成失敗時は楽観的に追加した版をロールバックする', async () => {
      mockCreate.mockRejectedValueOnce(new Error('boom'))
      useEstimateStore.getState().recordEstimate(manualInput())
      expect(useEstimateStore.getState().estimateSnapshots).toHaveLength(1)
      await flushMicrotasks()
      expect(useEstimateStore.getState().estimateSnapshots).toHaveLength(0)
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })

    it('サーバー確定値（authorNameのスタンプ）をローカルへ反映する', async () => {
      mockCreate.mockImplementationOnce(
        async (
          _entity: string,
          data: Omit<EstimateSnapshot, 'id'>,
          options?: { id?: string },
        ) => ({ ...data, id: options?.id, authorName: '佐々木' }),
      )
      useEstimateStore.getState().recordEstimate(manualInput())
      await flushMicrotasks()
      expect(useEstimateStore.getState().estimateSnapshots[0]?.authorName).toBe(
        '佐々木',
      )
    })
  })

  describe('revokeLatestEstimate（最新版のみの取り消し）', () => {
    it('最新版のみが削除され、過去の版は残る', async () => {
      const v1 = makeSnapshot({ version: 1 })
      const v2 = makeSnapshot({ version: 2 })
      useEstimateStore.setState({ estimateSnapshots: [v2, v1] })
      useEstimateStore.getState().revokeLatestEstimate(PROJECT_ID)
      await flushMicrotasks()
      expect(mockRemove).toHaveBeenCalledWith('estimateSnapshots', v2.id)
      expect(useEstimateStore.getState().estimateSnapshots).toEqual([v1])
    })

    it('反証: 他案件の記録には影響しない', async () => {
      const mine = makeSnapshot({ version: 1 })
      const other = makeSnapshot({ version: 3, projectId: OTHER_PROJECT_ID })
      useEstimateStore.setState({ estimateSnapshots: [mine, other] })
      useEstimateStore.getState().revokeLatestEstimate(PROJECT_ID)
      await flushMicrotasks()
      expect(useEstimateStore.getState().estimateSnapshots).toEqual([other])
    })

    it('記録が1件も無い案件では何も起きない', () => {
      useEstimateStore.getState().revokeLatestEstimate(PROJECT_ID)
      expect(mockRemove).not.toHaveBeenCalled()
    })

    it('反証: 削除失敗時はロールバックしてトーストで通知する', async () => {
      mockRemove.mockRejectedValueOnce(new Error('boom'))
      const v1 = makeSnapshot({ version: 1 })
      useEstimateStore.setState({ estimateSnapshots: [v1] })
      useEstimateStore.getState().revokeLatestEstimate(PROJECT_ID)
      await flushMicrotasks()
      expect(useEstimateStore.getState().estimateSnapshots).toEqual([v1])
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })
  })

  describe('セレクタ', () => {
    it('getEstimateHistoryはversion昇順、getLatestEstimateは最大version', () => {
      const v1 = makeSnapshot({ version: 1 })
      const v2 = makeSnapshot({ version: 2 })
      const other = makeSnapshot({ version: 9, projectId: OTHER_PROJECT_ID })
      useEstimateStore.setState({ estimateSnapshots: [v2, other, v1] })
      const { getEstimateHistory, getLatestEstimate } =
        useEstimateStore.getState()
      expect(getEstimateHistory(PROJECT_ID).map((s) => s.version)).toEqual([
        1, 2,
      ])
      expect(getLatestEstimate(PROJECT_ID)?.version).toBe(2)
      expect(getLatestEstimate(crypto.randomUUID())).toBeUndefined()
    })
  })
})
