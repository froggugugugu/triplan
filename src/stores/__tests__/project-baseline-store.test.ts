import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectBaseline } from '@/shared/types'
import type { BaselineSnapshot } from '@/shared/utils/evm-utils'
import { useProjectBaselineStore } from '@/stores/project-baseline-store'

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
const MEMBER_ID = crypto.randomUUID()

const snapshot: BaselineSnapshot = {
  monthlyPlannedCost: { '2025-04': 300, '2025-05': 150 },
  plannedAllocations: [
    { memberId: MEMBER_ID, monthlyValues: { '2025-04': 1, '2025-05': 0.5 } },
  ],
}

function makeBaseline(
  overrides: Partial<ProjectBaseline> = {},
): ProjectBaseline {
  return {
    id: crypto.randomUUID(),
    projectId: PROJECT_ID,
    version: 1,
    approvedAt: '2025-04-01',
    reason: '当初計画',
    bacAmount: 1000,
    monthlyPlannedCost: snapshot.monthlyPlannedCost,
    plannedAllocations: snapshot.plannedAllocations,
    createdAt: '2025-04-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('useProjectBaselineStore', () => {
  beforeEach(async () => {
    useProjectBaselineStore.setState({ projectBaselines: [] })
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
    mockCreate.mockImplementation(
      async (
        _entity: string,
        data: Omit<ProjectBaseline, 'id'>,
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

  describe('loadProjectBaselines', () => {
    it('DataAdapterから読み込んだベースラインをセットする', async () => {
      const existing = makeBaseline()
      mockList.mockResolvedValueOnce([existing])
      useProjectBaselineStore.getState().loadProjectBaselines()
      await flushMicrotasks()
      expect(useProjectBaselineStore.getState().projectBaselines).toEqual([
        existing,
      ])
    })

    it('読み込み失敗時はトーストで通知する', async () => {
      mockList.mockRejectedValueOnce(new Error('boom'))
      useProjectBaselineStore.getState().loadProjectBaselines()
      await flushMicrotasks()
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })
  })

  describe('freezeBaseline', () => {
    it('versionが1から始まり、凍結のたびに1つ増える', async () => {
      const { freezeBaseline } = useProjectBaselineStore.getState()
      freezeBaseline({
        projectId: PROJECT_ID,
        reason: '当初計画',
        bacAmount: 1000,
        snapshot,
      })
      await flushMicrotasks()
      freezeBaseline({
        projectId: PROJECT_ID,
        reason: 'CR#1 追加開発分',
        bacAmount: 1300,
        snapshot,
      })
      await flushMicrotasks()

      const versions = useProjectBaselineStore
        .getState()
        .projectBaselines.map((b) => b.version)
      expect(versions).toEqual([1, 2])
    })

    // 反証: 版番号は案件ごとに独立していなければ、他案件の凍結でversionが飛ぶ
    it('反証: versionは案件ごとに独立して採番される', async () => {
      const { freezeBaseline } = useProjectBaselineStore.getState()
      freezeBaseline({
        projectId: PROJECT_ID,
        reason: '当初計画',
        bacAmount: 1000,
        snapshot,
      })
      await flushMicrotasks()
      freezeBaseline({
        projectId: OTHER_PROJECT_ID,
        reason: '当初計画',
        bacAmount: 500,
        snapshot,
      })
      await flushMicrotasks()

      const other = useProjectBaselineStore
        .getState()
        .projectBaselines.find((b) => b.projectId === OTHER_PROJECT_ID)
      expect(other?.version).toBe(1)
    })

    it('クライアント生成idをDataAdapter.createへ渡し、確定後もidが変わらない', async () => {
      useProjectBaselineStore.getState().freezeBaseline({
        projectId: PROJECT_ID,
        reason: '当初計画',
        bacAmount: 1000,
        snapshot,
      })
      const optimisticId = useProjectBaselineStore.getState()
        .projectBaselines[0]?.id as string
      await flushMicrotasks()

      expect(mockCreate).toHaveBeenCalledWith(
        'projectBaselines',
        expect.objectContaining({ projectId: PROJECT_ID, version: 1 }),
        { id: optimisticId },
      )
      expect(useProjectBaselineStore.getState().projectBaselines[0]?.id).toBe(
        optimisticId,
      )
    })

    it('スナップショットの月次計画コストと配分率をそのまま保持する', async () => {
      useProjectBaselineStore.getState().freezeBaseline({
        projectId: PROJECT_ID,
        reason: '当初計画',
        bacAmount: 1000,
        snapshot,
      })
      await flushMicrotasks()
      const created = useProjectBaselineStore.getState().projectBaselines[0]
      expect(created?.monthlyPlannedCost).toEqual(snapshot.monthlyPlannedCost)
      expect(created?.plannedAllocations).toEqual(snapshot.plannedAllocations)
      expect(created?.bacAmount).toBe(1000)
    })

    it('approvedAtを省略すると当日の日付が入る', async () => {
      useProjectBaselineStore.getState().freezeBaseline({
        projectId: PROJECT_ID,
        reason: '当初計画',
        bacAmount: 1000,
        snapshot,
      })
      await flushMicrotasks()
      expect(
        useProjectBaselineStore.getState().projectBaselines[0]?.approvedAt,
      ).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    // 反証: 永続化に失敗した版がローカルに残ると、次回の採番がずれ二重の版が生まれる
    it('反証: 作成失敗時は楽観的に追加した版をロールバックする', async () => {
      mockCreate.mockRejectedValueOnce(new Error('boom'))
      useProjectBaselineStore.getState().freezeBaseline({
        projectId: PROJECT_ID,
        reason: '当初計画',
        bacAmount: 1000,
        snapshot,
      })
      expect(useProjectBaselineStore.getState().projectBaselines).toHaveLength(
        1,
      )
      await flushMicrotasks()
      expect(useProjectBaselineStore.getState().projectBaselines).toHaveLength(
        0,
      )
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })
  })

  describe('revokeLatestBaseline（最新版のみの取り消し）', () => {
    it('最新版のみが削除され、過去の版は残る', async () => {
      const v1 = makeBaseline({ version: 1 })
      const v2 = makeBaseline({ version: 2, reason: 'CR#1' })
      useProjectBaselineStore.setState({ projectBaselines: [v1, v2] })

      useProjectBaselineStore.getState().revokeLatestBaseline(PROJECT_ID)
      await flushMicrotasks()

      const remaining = useProjectBaselineStore.getState().projectBaselines
      expect(remaining).toHaveLength(1)
      expect(remaining[0]?.version).toBe(1)
      expect(mockRemove).toHaveBeenCalledWith('projectBaselines', v2.id)
    })

    it('v1まで取り消すと未凍結状態へ戻る', async () => {
      useProjectBaselineStore.setState({
        projectBaselines: [makeBaseline({ version: 1 })],
      })
      useProjectBaselineStore.getState().revokeLatestBaseline(PROJECT_ID)
      await flushMicrotasks()
      expect(useProjectBaselineStore.getState().projectBaselines).toHaveLength(
        0,
      )
      expect(
        useProjectBaselineStore.getState().getActiveBaseline(PROJECT_ID),
      ).toBeUndefined()
    })

    // 反証: 他案件の版を巻き込んで消してはいけない
    it('反証: 他案件のベースラインには影響しない', async () => {
      const mine = makeBaseline({ version: 1 })
      const other = makeBaseline({
        projectId: OTHER_PROJECT_ID,
        version: 3,
      })
      useProjectBaselineStore.setState({ projectBaselines: [mine, other] })

      useProjectBaselineStore.getState().revokeLatestBaseline(PROJECT_ID)
      await flushMicrotasks()

      const remaining = useProjectBaselineStore.getState().projectBaselines
      expect(remaining).toHaveLength(1)
      expect(remaining[0]?.projectId).toBe(OTHER_PROJECT_ID)
    })

    it('ベースラインが1件も無い案件では何も起きない', async () => {
      useProjectBaselineStore.getState().revokeLatestBaseline(PROJECT_ID)
      await flushMicrotasks()
      expect(mockRemove).not.toHaveBeenCalled()
    })

    // 反証: 永続化失敗時にローカルだけ消えたままだと、リロードで版が復活して見え齟齬が出る
    it('反証: 削除失敗時はロールバックしてトーストで通知する', async () => {
      const v1 = makeBaseline({ version: 1 })
      useProjectBaselineStore.setState({ projectBaselines: [v1] })
      mockRemove.mockRejectedValueOnce(new Error('boom'))

      useProjectBaselineStore.getState().revokeLatestBaseline(PROJECT_ID)
      expect(useProjectBaselineStore.getState().projectBaselines).toHaveLength(
        0,
      )
      await flushMicrotasks()
      expect(useProjectBaselineStore.getState().projectBaselines).toEqual([v1])
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })
  })

  describe('セレクタ', () => {
    it('getActiveBaselineは最大versionのレコードを返す', () => {
      useProjectBaselineStore.setState({
        projectBaselines: [
          makeBaseline({ version: 1 }),
          makeBaseline({ version: 3, reason: 'CR#2' }),
          makeBaseline({ version: 2, reason: 'CR#1' }),
        ],
      })
      expect(
        useProjectBaselineStore.getState().getActiveBaseline(PROJECT_ID)
          ?.version,
      ).toBe(3)
    })

    // 反証: 他案件の版を拾うとPVが別案件の計画で引かれてしまう
    it('反証: 他案件のベースラインは返さない', () => {
      useProjectBaselineStore.setState({
        projectBaselines: [
          makeBaseline({ projectId: OTHER_PROJECT_ID, version: 5 }),
        ],
      })
      expect(
        useProjectBaselineStore.getState().getActiveBaseline(PROJECT_ID),
      ).toBeUndefined()
    })

    it('getBaselineHistoryはversion昇順で返す', () => {
      useProjectBaselineStore.setState({
        projectBaselines: [
          makeBaseline({ version: 3 }),
          makeBaseline({ version: 1 }),
          makeBaseline({ version: 2 }),
        ],
      })
      expect(
        useProjectBaselineStore
          .getState()
          .getBaselineHistory(PROJECT_ID)
          .map((b) => b.version),
      ).toEqual([1, 2, 3])
    })
  })
})
