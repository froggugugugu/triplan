import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ActualsImportLog,
  CreateActualsImportLog,
  MonthlyActualsConfirmation,
} from '@/shared/types/actuals'
import { useActualsStore } from '@/stores/actuals-store'

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

function buildImportLog(
  overrides: Partial<CreateActualsImportLog> = {},
): CreateActualsImportLog {
  return {
    importedAt: '2025-05-01T09:00:00.000Z',
    fileName: 'timesheet.csv',
    targetMonths: ['2025-04'],
    appliedCount: 10,
    skippedCount: 0,
    skippedReasons: [],
    note: null,
    ...overrides,
  }
}

describe('useActualsStore', () => {
  beforeEach(async () => {
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
        data: Record<string, unknown>,
        options?: { id?: string },
      ) => ({
        ...data,
        id: options?.id ?? crypto.randomUUID(),
      }),
    )
    mockUpdate.mockImplementation(
      async (_entity: string, id: string, patch: Record<string, unknown>) => ({
        id,
        ...patch,
      }),
    )
    const { toast } = await import('@/shared/hooks/use-toast')
    vi.mocked(toast).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('loadActualsData', () => {
    it('DataAdapterから確定マークと取込履歴を読み込む', async () => {
      const confirmation: MonthlyActualsConfirmation = {
        id: crypto.randomUUID(),
        month: '2025-04',
        confirmedAt: '2025-05-01T09:00:00.000Z',
      }
      const log: ActualsImportLog = {
        id: crypto.randomUUID(),
        ...buildImportLog(),
      }
      mockList.mockImplementation(async (entity: string) => {
        if (entity === 'monthlyActualsConfirmations') return [confirmation]
        if (entity === 'actualsImportLogs') return [log]
        return []
      })

      useActualsStore.getState().loadActualsData()
      await flushMicrotasks()

      expect(useActualsStore.getState().monthlyActualsConfirmations).toEqual([
        confirmation,
      ])
      expect(useActualsStore.getState().actualsImportLogs).toEqual([log])
    })

    it('読み込み失敗時はトーストで通知し、stateは空のまま', async () => {
      mockList.mockRejectedValue(new Error('network error'))
      useActualsStore.getState().loadActualsData()
      await flushMicrotasks()

      expect(useActualsStore.getState().monthlyActualsConfirmations).toEqual([])
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(vi.mocked(toast)).toHaveBeenCalled()
    })
  })

  describe('confirmMonth', () => {
    it('未確定の月を確定するとレコードが作成され、クライアント生成idが維持される', async () => {
      useActualsStore.getState().confirmMonth('2025-04')

      const optimistic = useActualsStore.getState().getConfirmation('2025-04')
      expect(optimistic).toBeDefined()
      const optimisticId = optimistic?.id

      await flushMicrotasks()

      expect(mockCreate).toHaveBeenCalledWith(
        'monthlyActualsConfirmations',
        expect.objectContaining({ month: '2025-04' }),
        { id: optimisticId },
      )
      // 確定後もidは変わらない（安定id）
      expect(useActualsStore.getState().getConfirmation('2025-04')?.id).toBe(
        optimisticId,
      )
    })

    it('確定済みの月を再確定するとconfirmedAtのみ更新される（updateで、createは呼ばない）', async () => {
      const existing: MonthlyActualsConfirmation = {
        id: crypto.randomUUID(),
        month: '2025-04',
        confirmedAt: '2025-05-01T09:00:00.000Z',
      }
      useActualsStore.setState({ monthlyActualsConfirmations: [existing] })

      useActualsStore.getState().confirmMonth('2025-04')
      await flushMicrotasks()

      expect(mockCreate).not.toHaveBeenCalled()
      expect(mockUpdate).toHaveBeenCalledWith(
        'monthlyActualsConfirmations',
        existing.id,
        expect.objectContaining({ confirmedAt: expect.any(String) }),
      )
      const updated = useActualsStore.getState().getConfirmation('2025-04')
      expect(updated?.id).toBe(existing.id)
      expect(updated?.confirmedAt).not.toBe(existing.confirmedAt)
      // 反証: 1レコードのまま（重複作成しない）
      expect(
        useActualsStore.getState().monthlyActualsConfirmations,
      ).toHaveLength(1)
    })

    it('反証: 作成失敗時は楽観的レコードがロールバックされトースト通知される', async () => {
      mockCreate.mockRejectedValueOnce(new Error('server error'))

      useActualsStore.getState().confirmMonth('2025-04')
      expect(
        useActualsStore.getState().getConfirmation('2025-04'),
      ).toBeDefined()

      await flushMicrotasks()

      expect(
        useActualsStore.getState().getConfirmation('2025-04'),
      ).toBeUndefined()
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })

    it('反証: 再確定の更新失敗時は元のconfirmedAtへロールバックされる', async () => {
      const existing: MonthlyActualsConfirmation = {
        id: crypto.randomUUID(),
        month: '2025-04',
        confirmedAt: '2025-05-01T09:00:00.000Z',
      }
      useActualsStore.setState({ monthlyActualsConfirmations: [existing] })
      mockUpdate.mockRejectedValueOnce(new Error('server error'))

      useActualsStore.getState().confirmMonth('2025-04')
      await flushMicrotasks()

      expect(
        useActualsStore.getState().getConfirmation('2025-04')?.confirmedAt,
      ).toBe(existing.confirmedAt)
    })

    it('別の月の確定は既存の確定マークに干渉しない', async () => {
      useActualsStore.getState().confirmMonth('2025-04')
      useActualsStore.getState().confirmMonth('2025-05')
      await flushMicrotasks()

      expect(
        useActualsStore.getState().monthlyActualsConfirmations,
      ).toHaveLength(2)
      expect(
        useActualsStore.getState().getConfirmation('2025-04'),
      ).toBeDefined()
      expect(
        useActualsStore.getState().getConfirmation('2025-05'),
      ).toBeDefined()
    })
  })

  describe('addImportLog', () => {
    it('取込履歴を追記し、戻り値のidが確定後も維持される', async () => {
      const record = useActualsStore.getState().addImportLog(buildImportLog())

      expect(useActualsStore.getState().actualsImportLogs).toHaveLength(1)
      await flushMicrotasks()

      expect(mockCreate).toHaveBeenCalledWith(
        'actualsImportLogs',
        expect.objectContaining({ fileName: 'timesheet.csv' }),
        { id: record.id },
      )
      expect(useActualsStore.getState().actualsImportLogs[0]?.id).toBe(
        record.id,
      )
    })

    it('反証: 作成失敗時はロールバックされトースト通知される', async () => {
      mockCreate.mockRejectedValueOnce(new Error('server error'))

      useActualsStore.getState().addImportLog(buildImportLog())
      expect(useActualsStore.getState().actualsImportLogs).toHaveLength(1)

      await flushMicrotasks()

      expect(useActualsStore.getState().actualsImportLogs).toHaveLength(0)
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })
  })

  describe('closeMonth / reopenMonth / isMonthClosed（P1-b月次締め）', () => {
    it('締めるとイベントが追記され、isMonthClosedがtrueになる（idの安定性含む）', async () => {
      useActualsStore.getState().closeMonth('2025-09')

      expect(useActualsStore.getState().isMonthClosed('2025-09')).toBe(true)
      const optimisticId = useActualsStore.getState().monthlyCloseEvents[0]?.id

      await flushMicrotasks()
      expect(mockCreate).toHaveBeenCalledWith(
        'monthlyCloseEvents',
        expect.objectContaining({ month: '2025-09', action: 'close' }),
        { id: optimisticId },
      )
      expect(useActualsStore.getState().monthlyCloseEvents[0]?.id).toBe(
        optimisticId,
      )
    })

    it('反証: 既に締め済みの月を再度closeMonthしてもイベントは増えない', async () => {
      useActualsStore.getState().closeMonth('2025-09')
      useActualsStore.getState().closeMonth('2025-09')
      await flushMicrotasks()
      expect(useActualsStore.getState().monthlyCloseEvents).toHaveLength(1)
    })

    it('解除（理由あり）でisMonthClosedがfalseへ戻り、履歴は消えない（追記専用）', async () => {
      const store = useActualsStore.getState()
      store.closeMonth('2025-09')
      useActualsStore.getState().reopenMonth('2025-09', '検収差戻しのため')
      await flushMicrotasks()

      expect(useActualsStore.getState().isMonthClosed('2025-09')).toBe(false)
      expect(useActualsStore.getState().monthlyCloseEvents).toHaveLength(2)
      expect(useActualsStore.getState().monthlyCloseEvents[1]).toMatchObject({
        action: 'reopen',
        reason: '検収差戻しのため',
      })
    })

    it('反証: 理由が空白のみでは解除できない（トースト通知のみ）', async () => {
      useActualsStore.getState().closeMonth('2025-09')
      useActualsStore.getState().reopenMonth('2025-09', '   ')
      await flushMicrotasks()

      expect(useActualsStore.getState().isMonthClosed('2025-09')).toBe(true)
      expect(useActualsStore.getState().monthlyCloseEvents).toHaveLength(1)
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })

    it('反証: 締まっていない月のreopenMonthは何もしない', async () => {
      useActualsStore.getState().reopenMonth('2025-09', '理由あり')
      await flushMicrotasks()
      expect(useActualsStore.getState().monthlyCloseEvents).toHaveLength(0)
    })

    it('close→reopen→closeの履歴から現況（締め済み）が正しく導出される', async () => {
      useActualsStore.getState().closeMonth('2025-09')
      await flushMicrotasks()
      useActualsStore.getState().reopenMonth('2025-09', '一時解除')
      await flushMicrotasks()
      useActualsStore.getState().closeMonth('2025-09', '再締め')
      await flushMicrotasks()

      expect(useActualsStore.getState().isMonthClosed('2025-09')).toBe(true)
      expect(useActualsStore.getState().monthlyCloseEvents).toHaveLength(3)
    })

    it('別の月の締め状態には干渉しない', () => {
      useActualsStore.getState().closeMonth('2025-09')
      expect(useActualsStore.getState().isMonthClosed('2025-10')).toBe(false)
    })

    it('反証: 締めの作成失敗時はロールバックされ締め状態も戻る', async () => {
      mockCreate.mockRejectedValueOnce(new Error('server error'))
      useActualsStore.getState().closeMonth('2025-09')
      expect(useActualsStore.getState().isMonthClosed('2025-09')).toBe(true)

      await flushMicrotasks()
      expect(useActualsStore.getState().isMonthClosed('2025-09')).toBe(false)
      expect(useActualsStore.getState().monthlyCloseEvents).toHaveLength(0)
    })

    it('反証: 締め済み月への確定（confirmMonth）は拒否される', async () => {
      useActualsStore.getState().closeMonth('2025-09')
      await flushMicrotasks()
      mockCreate.mockClear()

      useActualsStore.getState().confirmMonth('2025-09')
      await flushMicrotasks()

      expect(mockCreate).not.toHaveBeenCalled()
      expect(
        useActualsStore.getState().getConfirmation('2025-09'),
      ).toBeUndefined()
    })
  })

  describe('getConfirmation', () => {
    it('未確定の月はundefinedを返す', () => {
      expect(
        useActualsStore.getState().getConfirmation('2030-01'),
      ).toBeUndefined()
    })
  })
})
