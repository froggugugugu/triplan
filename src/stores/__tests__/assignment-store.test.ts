import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssignmentEntry } from '@/shared/types/assignment'
import { useActualsStore } from '@/stores/actuals-store'
import { useAssignmentStore } from '@/stores/assignment-store'

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

const PROJECT_ID = '00000000-0000-0000-0000-000000000001'
const TASK_ID = '00000000-0000-0000-0000-000000000002'
const MEMBER_ID = '00000000-0000-0000-0000-000000000003'

describe('useAssignmentStore', () => {
  beforeEach(async () => {
    useAssignmentStore.setState({ assignments: [] })
    useActualsStore.setState({
      monthlyActualsConfirmations: [],
      actualsImportLogs: [],
      monthlyCloseEvents: [],
    })
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
    mockCreate.mockImplementation(
      async (
        _entity: string,
        data: Omit<AssignmentEntry, 'id'>,
        options?: { id?: string },
      ) => ({
        ...data,
        id: options?.id ?? crypto.randomUUID(),
      }),
    )
    mockUpdate.mockImplementation(
      async (_entity: string, id: string, patch: Partial<AssignmentEntry>) => ({
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

  describe('loadAssignments', () => {
    it('loads assignments from DataAdapter', async () => {
      const seeded: AssignmentEntry[] = [
        {
          id: crypto.randomUUID(),
          projectId: PROJECT_ID,
          taskId: TASK_ID,
          memberId: MEMBER_ID,
          monthlyValues: { '2025-04': 0.5 },
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ]
      mockList.mockResolvedValueOnce(seeded)
      useAssignmentStore.getState().loadAssignments()
      await flushMicrotasks()
      expect(useAssignmentStore.getState().assignments).toEqual(seeded)
    })

    it('読み込みがDataAdapterで失敗した場合はトースト表示される', async () => {
      mockList.mockRejectedValueOnce(new Error('network error'))
      useAssignmentStore.getState().loadAssignments()
      await flushMicrotasks()
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })
  })

  describe('upsertAssignment', () => {
    it('creates a new assignment（楽観的に即座へ反映される）', () => {
      const store = useAssignmentStore.getState()
      store.upsertAssignment({
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 0.5 },
      })

      const assignments = useAssignmentStore.getState().assignments
      expect(assignments).toHaveLength(1)
      expect(assignments[0]?.projectId).toBe(PROJECT_ID)
      expect(assignments[0]?.taskId).toBe(TASK_ID)
      expect(assignments[0]?.memberId).toBe(MEMBER_ID)
      expect(assignments[0]?.monthlyValues['2025-04']).toBe(0.5)
      expect(mockCreate).toHaveBeenCalledWith(
        'assignments',
        expect.objectContaining({
          projectId: PROJECT_ID,
          taskId: TASK_ID,
          memberId: MEMBER_ID,
        }),
        { id: assignments[0]?.id },
      )
    })

    it('DataAdapter確定後もidは変わらず安定している', async () => {
      const store = useAssignmentStore.getState()
      store.upsertAssignment({
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 0.5 },
      })
      const optimisticId = useAssignmentStore.getState().assignments[0]?.id
      await flushMicrotasks()
      expect(useAssignmentStore.getState().assignments[0]?.id).toBe(
        optimisticId,
      )
    })

    it('updates existing assignment with same project/task/member（update()が呼ばれる）', () => {
      const store = useAssignmentStore.getState()
      store.upsertAssignment({
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 0.3 },
      })

      store.upsertAssignment({
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 0.7 },
      })

      const assignments = useAssignmentStore.getState().assignments
      expect(assignments).toHaveLength(1)
      expect(assignments[0]?.monthlyValues['2025-04']).toBe(0.7)
      expect(mockUpdate).toHaveBeenCalledWith(
        'assignments',
        assignments[0]?.id,
        expect.objectContaining({ monthlyValues: { '2025-04': 0.7 } }),
        // 楽観ロック: 画面が見ていた版を期待値として送る
        { expectedUpdatedAt: assignments[0]?.updatedAt },
      )
    })

    it('新規作成がDataAdapterで失敗した場合はロールバックされ、トースト表示される', async () => {
      mockCreate.mockRejectedValueOnce(new Error('1.0を超えています'))
      useAssignmentStore.getState().upsertAssignment({
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 0.5 },
      })
      await flushMicrotasks()
      expect(useAssignmentStore.getState().assignments).toHaveLength(0)
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })

    it('更新がDataAdapterで失敗した場合はロールバックされる', async () => {
      const store = useAssignmentStore.getState()
      store.upsertAssignment({
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 0.3 },
      })
      await flushMicrotasks()
      mockUpdate.mockRejectedValueOnce(new Error('network error'))
      store.upsertAssignment({
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 0.7 },
      })
      expect(
        useAssignmentStore.getState().assignments[0]?.monthlyValues['2025-04'],
      ).toBe(0.7)
      await flushMicrotasks()
      expect(
        useAssignmentStore.getState().assignments[0]?.monthlyValues['2025-04'],
      ).toBe(0.3)
    })
  })

  describe('updateActualMonthlyValue（実績の例外入力）', () => {
    function setupAssignment() {
      const store = useAssignmentStore.getState()
      store.upsertAssignment({
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 1.0, '2025-05': 0.5 },
      })
      return useAssignmentStore.getState().assignments[0]?.id ?? ''
    }

    it('計画と異なる値を入力すると該当月のみ実績として記録される', () => {
      const id = setupAssignment()
      useAssignmentStore.getState().updateActualMonthlyValue(id, '2025-04', 0.6)

      const entry = useAssignmentStore.getState().assignments[0]
      expect(entry?.actualMonthlyValues).toEqual({ '2025-04': 0.6 })
      // 計画値は変更しない（計画と実績を分離して保持する）
      expect(entry?.monthlyValues['2025-04']).toBe(1.0)
      expect(mockUpdate).toHaveBeenCalledWith(
        'assignments',
        id,
        expect.objectContaining({ actualMonthlyValues: { '2025-04': 0.6 } }),
        // 楽観ロック
        { expectedUpdatedAt: expect.any(String) },
      )
    })

    // 反証: 計画と同値を入力したのにキーが残ると「明示的に確認した月」と
    // 「無操作の月」が区別できてしまい、無操作＝計画どおりの原則が崩れる
    it('反証: 計画値と同じ値を入力すると該当月のキーを削除する', () => {
      const id = setupAssignment()
      const store = useAssignmentStore.getState()
      store.updateActualMonthlyValue(id, '2025-04', 0.6)
      store.updateActualMonthlyValue(id, '2025-04', 1.0)

      expect(
        useAssignmentStore.getState().assignments[0]?.actualMonthlyValues,
      ).toEqual({})
    })

    it('0を入力した月は実績0として記録される（計画値が0でない限りキーは残る）', () => {
      const id = setupAssignment()
      useAssignmentStore.getState().updateActualMonthlyValue(id, '2025-04', 0)

      expect(
        useAssignmentStore.getState().assignments[0]?.actualMonthlyValues,
      ).toEqual({ '2025-04': 0 })
    })

    it('他の月の実績には影響しない', () => {
      const id = setupAssignment()
      const store = useAssignmentStore.getState()
      store.updateActualMonthlyValue(id, '2025-04', 0.6)
      store.updateActualMonthlyValue(id, '2025-05', 0.2)

      expect(
        useAssignmentStore.getState().assignments[0]?.actualMonthlyValues,
      ).toEqual({ '2025-04': 0.6, '2025-05': 0.2 })
    })

    it('存在しないIDを指定しても例外にならず何も起きない', () => {
      setupAssignment()
      const before = useAssignmentStore.getState().assignments
      expect(() =>
        useAssignmentStore
          .getState()
          .updateActualMonthlyValue(crypto.randomUUID(), '2025-04', 0.5),
      ).not.toThrow()
      expect(useAssignmentStore.getState().assignments).toBe(before)
    })

    it('更新がDataAdapterで失敗した場合はロールバックされる', async () => {
      const id = setupAssignment()
      mockUpdate.mockRejectedValueOnce(new Error('boom'))
      useAssignmentStore.getState().updateActualMonthlyValue(id, '2025-04', 0.6)
      expect(
        useAssignmentStore.getState().assignments[0]?.actualMonthlyValues,
      ).toEqual({ '2025-04': 0.6 })

      await flushMicrotasks()
      expect(
        useAssignmentStore.getState().assignments[0]?.actualMonthlyValues,
      ).toBeUndefined()
    })

    // P1-a: 月次実績画面の「計画どおりに戻す」操作
    it('nullを渡すと該当月の明示入力キーが削除される（計画どおりへ戻す）', () => {
      const id = setupAssignment()
      const store = useAssignmentStore.getState()
      store.updateActualMonthlyValue(id, '2025-04', 0.6)
      store.updateActualMonthlyValue(id, '2025-05', 0.2)
      store.updateActualMonthlyValue(id, '2025-04', null)

      expect(
        useAssignmentStore.getState().assignments[0]?.actualMonthlyValues,
      ).toEqual({ '2025-05': 0.2 })
    })

    it('反証: 明示入力が無い月へのnullクリアでも例外にならない', () => {
      const id = setupAssignment()
      expect(() =>
        useAssignmentStore
          .getState()
          .updateActualMonthlyValue(id, '2025-04', null),
      ).not.toThrow()
      expect(
        useAssignmentStore.getState().assignments[0]?.actualMonthlyValues,
      ).toEqual({})
    })

    it('反証: 実績は1.0人月を超える値も記録できる（事実の記録、上限でブロックしない）', () => {
      const id = setupAssignment()
      useAssignmentStore.getState().updateActualMonthlyValue(id, '2025-04', 1.2)
      expect(
        useAssignmentStore.getState().assignments[0]?.actualMonthlyValues,
      ).toEqual({ '2025-04': 1.2 })
    })
  })

  describe('addActualEntry（計画外の実績追加、P1-a）', () => {
    it('該当のアサインレコードが無い場合、monthlyValues空・実績のみの新規レコードを作る', async () => {
      useAssignmentStore
        .getState()
        .addActualEntry(PROJECT_ID, TASK_ID, MEMBER_ID, '2025-04', 0.3)

      const entry = useAssignmentStore.getState().assignments[0]
      expect(entry?.monthlyValues).toEqual({})
      expect(entry?.actualMonthlyValues).toEqual({ '2025-04': 0.3 })

      await flushMicrotasks()
      // クライアント生成idがcreateへ渡り、確定後もidが変わらない（安定id）
      expect(mockCreate).toHaveBeenCalledWith(
        'assignments',
        expect.objectContaining({
          projectId: PROJECT_ID,
          taskId: TASK_ID,
          memberId: MEMBER_ID,
          monthlyValues: {},
          actualMonthlyValues: { '2025-04': 0.3 },
        }),
        { id: entry?.id },
      )
      expect(useAssignmentStore.getState().assignments[0]?.id).toBe(entry?.id)
    })

    it('反証: 既存レコードがあれば新規作成せず実績の例外入力として積む', async () => {
      const store = useAssignmentStore.getState()
      store.upsertAssignment({
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 0.5 },
      })
      await flushMicrotasks()
      mockCreate.mockClear()

      useAssignmentStore
        .getState()
        .addActualEntry(PROJECT_ID, TASK_ID, MEMBER_ID, '2025-04', 0.7)

      expect(useAssignmentStore.getState().assignments).toHaveLength(1)
      expect(
        useAssignmentStore.getState().assignments[0]?.actualMonthlyValues,
      ).toEqual({ '2025-04': 0.7 })
      expect(mockCreate).not.toHaveBeenCalled()
      // 計画値には影響しない
      expect(
        useAssignmentStore.getState().assignments[0]?.monthlyValues,
      ).toEqual({ '2025-04': 0.5 })
    })

    it('反証: 既存レコードへ計画と同値を積むとキー削除の正規化が同じく効く', async () => {
      const store = useAssignmentStore.getState()
      store.upsertAssignment({
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 0.5 },
      })
      await flushMicrotasks()

      useAssignmentStore
        .getState()
        .addActualEntry(PROJECT_ID, TASK_ID, MEMBER_ID, '2025-04', 0.5)

      expect(
        useAssignmentStore.getState().assignments[0]?.actualMonthlyValues,
      ).toEqual({})
    })

    it('作成がDataAdapterで失敗した場合はロールバックされる', async () => {
      mockCreate.mockRejectedValueOnce(new Error('boom'))
      useAssignmentStore
        .getState()
        .addActualEntry(PROJECT_ID, TASK_ID, MEMBER_ID, '2025-04', 0.3)
      expect(useAssignmentStore.getState().assignments).toHaveLength(1)

      await flushMicrotasks()
      expect(useAssignmentStore.getState().assignments).toHaveLength(0)
    })
  })

  describe('月次締めハードロック（P1-b、非公開の設計文書）', () => {
    const CLOSED_MONTH = '2025-04'

    function closeMonth(month: string) {
      useActualsStore.setState({
        monthlyCloseEvents: [
          {
            id: crypto.randomUUID(),
            month,
            action: 'close',
            reason: null,
            occurredAt: '2025-05-01T09:00:00.000Z',
            actorName: null,
          },
        ],
      })
    }

    function setupAssignment() {
      const store = useAssignmentStore.getState()
      store.upsertAssignment({
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 0.5, '2025-05': 0.3 },
      })
      return useAssignmentStore.getState().assignments[0]?.id ?? ''
    }

    it('締め済み月への実績の変更・クリアは拒否される', async () => {
      const id = setupAssignment()
      await flushMicrotasks()
      closeMonth(CLOSED_MONTH)
      mockUpdate.mockClear()

      const store = useAssignmentStore.getState()
      store.updateActualMonthlyValue(id, CLOSED_MONTH, 0.8)
      store.updateActualMonthlyValue(id, CLOSED_MONTH, null)

      expect(mockUpdate).not.toHaveBeenCalled()
      expect(
        useAssignmentStore.getState().assignments[0]?.actualMonthlyValues,
      ).toBeUndefined()
    })

    it('核心の反証: 締め済み月は計画（monthlyValues）も凍結される', async () => {
      const id = setupAssignment()
      await flushMicrotasks()
      closeMonth(CLOSED_MONTH)
      mockUpdate.mockClear()

      useAssignmentStore.getState().updateMonthlyValue(id, CLOSED_MONTH, 0.9)

      expect(mockUpdate).not.toHaveBeenCalled()
      expect(
        useAssignmentStore.getState().assignments[0]?.monthlyValues[
          CLOSED_MONTH
        ],
      ).toBe(0.5)
    })

    it('反証: 締め済み月以外の月は引き続き編集できる', async () => {
      const id = setupAssignment()
      await flushMicrotasks()
      closeMonth(CLOSED_MONTH)

      useAssignmentStore.getState().updateMonthlyValue(id, '2025-05', 0.7)
      expect(
        useAssignmentStore.getState().assignments[0]?.monthlyValues['2025-05'],
      ).toBe(0.7)
    })

    it('upsertAssignmentの差分判定: 締め月キーが不変なら他月の変更は通り、締め月の値が変わると拒否', async () => {
      setupAssignment()
      await flushMicrotasks()
      closeMonth(CLOSED_MONTH)

      // 締め月0.5は不変・他月のみ変更 → 通る
      useAssignmentStore.getState().upsertAssignment({
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 0.5, '2025-05': 0.9 },
      })
      expect(
        useAssignmentStore.getState().assignments[0]?.monthlyValues['2025-05'],
      ).toBe(0.9)

      // 締め月の値の変更 → 拒否（stateは直前の値のまま）
      useAssignmentStore.getState().upsertAssignment({
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 0.1, '2025-05': 0.9 },
      })
      expect(
        useAssignmentStore.getState().assignments[0]?.monthlyValues[
          CLOSED_MONTH
        ],
      ).toBe(0.5)
    })

    it('反証: 締め済み月に値を持つ新規レコードの作成（upsert/addActualEntry）は拒否される', () => {
      closeMonth(CLOSED_MONTH)

      useAssignmentStore.getState().upsertAssignment({
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { [CLOSED_MONTH]: 0.5 },
      })
      expect(useAssignmentStore.getState().assignments).toHaveLength(0)

      useAssignmentStore
        .getState()
        .addActualEntry(PROJECT_ID, TASK_ID, MEMBER_ID, CLOSED_MONTH, 0.3)
      expect(useAssignmentStore.getState().assignments).toHaveLength(0)
    })

    it('反証: 締め済み月に値を持つレコードの削除（deleteAssignment/deleteByTask）は拒否される', async () => {
      const id = setupAssignment()
      await flushMicrotasks()
      closeMonth(CLOSED_MONTH)
      mockRemove.mockClear()

      useAssignmentStore.getState().deleteAssignment(id)
      expect(useAssignmentStore.getState().assignments).toHaveLength(1)

      useAssignmentStore.getState().deleteByTask(TASK_ID)
      expect(useAssignmentStore.getState().assignments).toHaveLength(1)
      expect(mockRemove).not.toHaveBeenCalled()
    })

    it('締め済み月に値を持たないレコードは削除できる', async () => {
      const store = useAssignmentStore.getState()
      store.upsertAssignment({
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { '2025-05': 0.3 }, // 締め月の値なし
      })
      await flushMicrotasks()
      closeMonth(CLOSED_MONTH)

      const id = useAssignmentStore.getState().assignments[0]?.id ?? ''
      useAssignmentStore.getState().deleteAssignment(id)
      expect(useAssignmentStore.getState().assignments).toHaveLength(0)
    })

    it('反証: 解除後は再び編集できる（永続ロックではない）', async () => {
      const id = setupAssignment()
      await flushMicrotasks()
      useActualsStore.setState({
        monthlyCloseEvents: [
          {
            id: crypto.randomUUID(),
            month: CLOSED_MONTH,
            action: 'close',
            reason: null,
            occurredAt: '2025-05-01T09:00:00.000Z',
            actorName: null,
          },
          {
            id: crypto.randomUUID(),
            month: CLOSED_MONTH,
            action: 'reopen',
            reason: '検収差戻し',
            occurredAt: '2025-05-02T09:00:00.000Z',
            actorName: null,
          },
        ],
      })

      useAssignmentStore
        .getState()
        .updateActualMonthlyValue(id, CLOSED_MONTH, 0.8)
      expect(
        useAssignmentStore.getState().assignments[0]?.actualMonthlyValues,
      ).toEqual({ [CLOSED_MONTH]: 0.8 })
    })
  })

  /**
   * 楽観ロックの回帰テスト（PR #12 セルフレビューMUST-1の水平展開）。
   * アサイングリッドは同じ行の複数月を続けて入力するため、
   * サーバー確定値を反映し損ねると2セル目で必ず412になり行全体がロールバックする。
   */
  describe('楽観ロック: サーバー確定値の反映', () => {
    it('反証: 同じアサインの月次値を連続で2回更新できる（2回目の期待値はサーバー確定値）', async () => {
      const SERVER_TIME = '2099-01-01T00:00:00.000Z'
      mockUpdate.mockImplementation(
        async (
          _entity: string,
          id: string,
          patch: Partial<AssignmentEntry>,
        ) => ({ id, ...patch, updatedAt: SERVER_TIME }),
      )
      useAssignmentStore.getState().upsertAssignment({
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 0.3 },
      })
      await flushMicrotasks()
      const id = useAssignmentStore.getState().assignments[0]?.id ?? ''

      // 1セル目
      useAssignmentStore.getState().updateMonthlyValue(id, '2025-04', 0.5)
      await flushMicrotasks()
      expect(useAssignmentStore.getState().assignments[0]?.updatedAt).toBe(
        SERVER_TIME,
      )

      // 2セル目（同じ行の別の月）。412にならず値が残ること
      mockUpdate.mockClear()
      useAssignmentStore.getState().updateMonthlyValue(id, '2025-05', 0.4)
      await flushMicrotasks()
      expect(mockUpdate.mock.calls.at(-1)?.[3]).toEqual({
        expectedUpdatedAt: SERVER_TIME,
      })
      const entry = useAssignmentStore.getState().assignments[0]
      expect(entry?.monthlyValues['2025-05']).toBe(0.4)
    })
  })

  describe('updateMonthlyValue', () => {
    it('updates a specific month value', () => {
      const store = useAssignmentStore.getState()
      store.upsertAssignment({
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 0.3 },
      })

      const id = useAssignmentStore.getState().assignments[0]?.id ?? ''
      store.updateMonthlyValue(id, '2025-04', 0.5)

      const entry = useAssignmentStore.getState().assignments[0]
      expect(entry?.monthlyValues['2025-04']).toBe(0.5)
      expect(mockUpdate).toHaveBeenCalledWith(
        'assignments',
        id,
        expect.objectContaining({ monthlyValues: { '2025-04': 0.5 } }),
        // 楽観ロック
        { expectedUpdatedAt: expect.any(String) },
      )
    })

    it('removes month key when value is 0', () => {
      const store = useAssignmentStore.getState()
      store.upsertAssignment({
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 0.3, '2025-05': 0.2 },
      })

      const id = useAssignmentStore.getState().assignments[0]?.id ?? ''
      store.updateMonthlyValue(id, '2025-04', 0)

      const entry = useAssignmentStore.getState().assignments[0]
      expect(entry?.monthlyValues['2025-04']).toBeUndefined()
      expect(entry?.monthlyValues['2025-05']).toBe(0.2)
    })

    it('更新がDataAdapterで失敗した場合はロールバックされる', async () => {
      const store = useAssignmentStore.getState()
      store.upsertAssignment({
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 0.3 },
      })
      await flushMicrotasks()
      const id = useAssignmentStore.getState().assignments[0]?.id ?? ''
      mockUpdate.mockRejectedValueOnce(new Error('network error'))
      store.updateMonthlyValue(id, '2025-04', 0.9)
      await flushMicrotasks()
      expect(
        useAssignmentStore.getState().assignments[0]?.monthlyValues['2025-04'],
      ).toBe(0.3)
    })

    // 反証: 存在しないidを指定した場合は何もしない（DataAdapter呼び出しもされない）
    it('反証: 存在しないidを指定した場合は何もしない', () => {
      useAssignmentStore
        .getState()
        .updateMonthlyValue('not-exist', '2025-04', 0.5)
      expect(useAssignmentStore.getState().assignments).toHaveLength(0)
      expect(mockUpdate).not.toHaveBeenCalled()
    })
  })

  describe('deleteAssignment', () => {
    it('removes assignment by id', () => {
      const store = useAssignmentStore.getState()
      store.upsertAssignment({
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 0.5 },
      })

      const id = useAssignmentStore.getState().assignments[0]?.id ?? ''
      store.deleteAssignment(id)
      expect(useAssignmentStore.getState().assignments).toHaveLength(0)
      expect(mockRemove).toHaveBeenCalledWith('assignments', id)
    })

    it('削除がDataAdapterで失敗した場合はロールバックされる', async () => {
      const store = useAssignmentStore.getState()
      store.upsertAssignment({
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 0.5 },
      })
      await flushMicrotasks()
      const id = useAssignmentStore.getState().assignments[0]?.id ?? ''
      mockRemove.mockRejectedValueOnce(new Error('network error'))
      store.deleteAssignment(id)
      expect(useAssignmentStore.getState().assignments).toHaveLength(0)
      await flushMicrotasks()
      expect(useAssignmentStore.getState().assignments).toHaveLength(1)
    })
  })

  describe('deleteByTask', () => {
    it('removes all assignments for a task', () => {
      const store = useAssignmentStore.getState()
      const taskId = TASK_ID

      store.upsertAssignment({
        projectId: PROJECT_ID,
        taskId,
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 0.3 },
      })
      store.upsertAssignment({
        projectId: PROJECT_ID,
        taskId,
        memberId: '00000000-0000-0000-0000-000000000004',
        monthlyValues: { '2025-04': 0.2 },
      })
      store.upsertAssignment({
        projectId: PROJECT_ID,
        taskId: '00000000-0000-0000-0000-000000000099',
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 0.1 },
      })

      store.deleteByTask(taskId)
      const remaining = useAssignmentStore.getState().assignments
      expect(remaining).toHaveLength(1)
      expect(remaining[0]?.taskId).toBe('00000000-0000-0000-0000-000000000099')
      expect(mockRemove).toHaveBeenCalledTimes(2)
    })

    // 反証: 対象なし（該当taskIdの割当が無い）の場合はDataAdapterを呼び出さない
    it('反証: 対象が無い場合はDataAdapterを呼び出さない', () => {
      useAssignmentStore.getState().deleteByTask('not-exist')
      expect(mockRemove).not.toHaveBeenCalled()
    })

    it('削除がDataAdapterで失敗した場合は全件ロールバックされる', async () => {
      const store = useAssignmentStore.getState()
      store.upsertAssignment({
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 0.3 },
      })
      await flushMicrotasks()
      mockRemove.mockRejectedValueOnce(new Error('network error'))
      store.deleteByTask(TASK_ID)
      expect(useAssignmentStore.getState().assignments).toHaveLength(0)
      await flushMicrotasks()
      expect(useAssignmentStore.getState().assignments).toHaveLength(1)
    })
  })

  describe('selectors', () => {
    beforeEach(() => {
      const store = useAssignmentStore.getState()
      store.upsertAssignment({
        projectId: PROJECT_ID,
        taskId: '00000000-0000-0000-0000-000000000010',
        memberId: '00000000-0000-0000-0000-000000000100',
        monthlyValues: { '2025-04': 0.3, '2025-05': 0.2 },
      })
      store.upsertAssignment({
        projectId: PROJECT_ID,
        taskId: '00000000-0000-0000-0000-000000000011',
        memberId: '00000000-0000-0000-0000-000000000100',
        monthlyValues: { '2025-04': 0.4 },
      })
      store.upsertAssignment({
        projectId: '00000000-0000-0000-0000-000000000002',
        taskId: '00000000-0000-0000-0000-000000000020',
        memberId: '00000000-0000-0000-0000-000000000100',
        monthlyValues: { '2025-04': 0.2 },
      })
    })

    it('getByProject returns assignments for a project', () => {
      const store = useAssignmentStore.getState()
      const result = store.getByProject(PROJECT_ID)
      expect(result).toHaveLength(2)
    })

    it('getByTask returns assignments for a task', () => {
      const store = useAssignmentStore.getState()
      const result = store.getByTask('00000000-0000-0000-0000-000000000010')
      expect(result).toHaveLength(1)
    })

    it('getByMember returns all assignments for a member', () => {
      const store = useAssignmentStore.getState()
      const result = store.getByMember('00000000-0000-0000-0000-000000000100')
      expect(result).toHaveLength(3)
    })

    it('getMemberMonthlyTotal sums across all projects', () => {
      const store = useAssignmentStore.getState()
      const total = store.getMemberMonthlyTotal(
        '00000000-0000-0000-0000-000000000100',
        '2025-04',
      )
      expect(total).toBeCloseTo(0.9)
    })

    it('getMemberMonthlyBreakdown returns per-project details', () => {
      const store = useAssignmentStore.getState()
      const breakdown = store.getMemberMonthlyBreakdown(
        '00000000-0000-0000-0000-000000000100',
        '2025-04',
      )
      expect(breakdown).toHaveLength(3)
      const totalFromBreakdown = breakdown.reduce((s, b) => s + b.value, 0)
      expect(totalFromBreakdown).toBeCloseTo(0.9)
    })
  })
})
