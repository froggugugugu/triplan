import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PhaseSettingsEntry } from '@/shared/types'
import { createDefaultPhaseSettings } from '@/shared/types/schedule'
import {
  resetScheduleSettingsMigrationGuardForTesting,
  useScheduleSettingsStore,
} from '@/stores/schedule-settings-store'

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

const PROJECT_ID = crypto.randomUUID()
const OTHER_PROJECT_ID = crypto.randomUUID()
const LEGACY_KEY = 'schedule-settings-storage'

describe('useScheduleSettingsStore', () => {
  beforeEach(async () => {
    useScheduleSettingsStore.setState({ entries: [] })
    resetScheduleSettingsMigrationGuardForTesting()
    localStorage.clear()
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
    mockCreate.mockImplementation(
      async (
        _entity: string,
        data: Omit<PhaseSettingsEntry, 'id'>,
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
        patch: Partial<PhaseSettingsEntry>,
      ) => ({ id, ...patch }),
    )
    mockRemove.mockResolvedValue(undefined)
    const { toast } = await import('@/shared/hooks/use-toast')
    vi.mocked(toast).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  describe('loadScheduleSettings', () => {
    it('DataAdapterから読み込んだ工程設定をセットする', async () => {
      const seeded: PhaseSettingsEntry[] = [
        {
          id: crypto.randomUUID(),
          projectId: PROJECT_ID,
          phases: createDefaultPhaseSettings().phases,
          lastModified: '2026-01-01T00:00:00.000Z',
        },
      ]
      mockList.mockResolvedValueOnce(seeded)

      useScheduleSettingsStore.getState().loadScheduleSettings()
      await flushMicrotasks()

      expect(useScheduleSettingsStore.getState().entries).toEqual(seeded)
    })

    it('読み込みがDataAdapterで失敗した場合はトースト表示される', async () => {
      mockList.mockRejectedValueOnce(new Error('network error'))
      useScheduleSettingsStore.getState().loadScheduleSettings()
      await flushMicrotasks()
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })

    describe('レガシーpersistキーからの移行', () => {
      it('DataAdapter側が0件かつレガシーキーにデータがある場合、移行してDataAdapter.create()を呼ぶ', async () => {
        const legacyPhases = createDefaultPhaseSettings().phases
        localStorage.setItem(
          LEGACY_KEY,
          JSON.stringify({
            state: {
              settingsMap: {
                [PROJECT_ID]: {
                  phases: legacyPhases,
                  lastModified: '2025-06-01T00:00:00.000Z',
                },
              },
            },
          }),
        )
        mockList.mockResolvedValue([])

        useScheduleSettingsStore.getState().loadScheduleSettings()
        await flushMicrotasks()

        const entries = useScheduleSettingsStore.getState().entries
        expect(entries).toHaveLength(1)
        expect(entries[0]?.projectId).toBe(PROJECT_ID)
        expect(entries[0]?.phases).toEqual(legacyPhases)
        expect(mockCreate).toHaveBeenCalledWith(
          'scheduleSettingsEntries',
          expect.objectContaining({ projectId: PROJECT_ID }),
          { id: entries[0]?.id },
        )
      })

      it('レガシーキーが複数案件分ある場合、全案件分を移行する', async () => {
        localStorage.setItem(
          LEGACY_KEY,
          JSON.stringify({
            state: {
              settingsMap: {
                [PROJECT_ID]: createDefaultPhaseSettings(),
                [OTHER_PROJECT_ID]: createDefaultPhaseSettings(),
              },
            },
          }),
        )
        mockList.mockResolvedValue([])

        useScheduleSettingsStore.getState().loadScheduleSettings()
        await flushMicrotasks()

        expect(useScheduleSettingsStore.getState().entries).toHaveLength(2)
        expect(mockCreate).toHaveBeenCalledTimes(2)
      })

      // 反証: DataAdapter側に既にデータがある場合は移行しない（二重作成防止）
      it('反証: DataAdapter側に既にデータがある場合はレガシーキーがあっても移行しない', async () => {
        const existing: PhaseSettingsEntry[] = [
          {
            id: crypto.randomUUID(),
            projectId: PROJECT_ID,
            phases: createDefaultPhaseSettings().phases,
            lastModified: '2026-01-01T00:00:00.000Z',
          },
        ]
        mockList.mockResolvedValue(existing)
        localStorage.setItem(
          LEGACY_KEY,
          JSON.stringify({
            state: {
              settingsMap: { [OTHER_PROJECT_ID]: createDefaultPhaseSettings() },
            },
          }),
        )

        useScheduleSettingsStore.getState().loadScheduleSettings()
        await flushMicrotasks()

        expect(useScheduleSettingsStore.getState().entries).toEqual(existing)
        expect(mockCreate).not.toHaveBeenCalled()
      })

      it('反証: レガシーキーが存在しない場合は移行を試みず空のまま', async () => {
        mockList.mockResolvedValue([])
        useScheduleSettingsStore.getState().loadScheduleSettings()
        await flushMicrotasks()

        expect(useScheduleSettingsStore.getState().entries).toEqual([])
        expect(mockCreate).not.toHaveBeenCalled()
      })

      it('反証: 不正なJSON形式のレガシーキーでも例外を投げず空のまま扱う', async () => {
        localStorage.setItem(LEGACY_KEY, '{不正なJSON')
        mockList.mockResolvedValue([])

        useScheduleSettingsStore.getState().loadScheduleSettings()
        await flushMicrotasks()

        expect(useScheduleSettingsStore.getState().entries).toEqual([])
        expect(mockCreate).not.toHaveBeenCalled()
      })

      // React StrictMode二重発火対策: 同一tick内でloadScheduleSettings()が2回
      // 呼ばれても移行は1回のみ実行される（のwbs-template-storeと同型の反証）
      it('反証: 同一tick内で2回呼ばれても移行は1回だけ実行される（StrictMode二重発火対策）', async () => {
        localStorage.setItem(
          LEGACY_KEY,
          JSON.stringify({
            state: {
              settingsMap: { [PROJECT_ID]: createDefaultPhaseSettings() },
            },
          }),
        )
        mockList.mockResolvedValue([])

        useScheduleSettingsStore.getState().loadScheduleSettings()
        useScheduleSettingsStore.getState().loadScheduleSettings()
        await flushMicrotasks()

        expect(mockCreate).toHaveBeenCalledTimes(1)
        expect(useScheduleSettingsStore.getState().entries).toHaveLength(1)
      })

      it('移行のDataAdapter.create()が失敗した場合はロールバックしトースト表示される', async () => {
        localStorage.setItem(
          LEGACY_KEY,
          JSON.stringify({
            state: {
              settingsMap: { [PROJECT_ID]: createDefaultPhaseSettings() },
            },
          }),
        )
        mockList.mockResolvedValue([])
        mockCreate.mockRejectedValueOnce(new Error('network error'))

        useScheduleSettingsStore.getState().loadScheduleSettings()
        await flushMicrotasks()

        expect(useScheduleSettingsStore.getState().entries).toEqual([])
        const { toast } = await import('@/shared/hooks/use-toast')
        expect(toast).toHaveBeenCalledWith(
          expect.objectContaining({ variant: 'destructive' }),
        )
      })
    })
  })

  describe('getSettings', () => {
    it('該当案件のレコードが無い場合はデフォルト設定を返す', () => {
      const settings = useScheduleSettingsStore
        .getState()
        .getSettings(PROJECT_ID)
      expect(settings.phases).toHaveLength(15)
    })

    it('該当案件のレコードがある場合はその内容を返す', () => {
      useScheduleSettingsStore
        .getState()
        .updatePhaseName(PROJECT_ID, 'phase-1', 'カスタム工程名')
      const settings = useScheduleSettingsStore
        .getState()
        .getSettings(PROJECT_ID)
      expect(settings.phases.find((p) => p.phaseKey === 'phase-1')?.name).toBe(
        'カスタム工程名',
      )
    })
  })

  describe('updatePhaseName', () => {
    it('レコードが無い場合はデフォルト設定を土台に新規作成する（楽観的に即座へ反映される）', () => {
      useScheduleSettingsStore
        .getState()
        .updatePhaseName(PROJECT_ID, 'phase-1', '新名称')

      const entries = useScheduleSettingsStore.getState().entries
      expect(entries).toHaveLength(1)
      expect(
        entries[0]?.phases.find((p) => p.phaseKey === 'phase-1')?.name,
      ).toBe('新名称')
      expect(mockCreate).toHaveBeenCalledWith(
        'scheduleSettingsEntries',
        expect.objectContaining({ projectId: PROJECT_ID }),
        { id: entries[0]?.id },
      )
    })

    it('既存レコードがある場合は該当工程のみ更新し、他の工程は保持する', () => {
      useScheduleSettingsStore
        .getState()
        .updatePhaseName(PROJECT_ID, 'phase-1', '1回目')
      useScheduleSettingsStore
        .getState()
        .updatePhaseName(PROJECT_ID, 'phase-2', '2回目')

      const entries = useScheduleSettingsStore.getState().entries
      expect(entries).toHaveLength(1)
      const phases = entries[0]?.phases ?? []
      expect(phases.find((p) => p.phaseKey === 'phase-1')?.name).toBe('1回目')
      expect(phases.find((p) => p.phaseKey === 'phase-2')?.name).toBe('2回目')
      expect(mockUpdate).toHaveBeenCalledWith(
        'scheduleSettingsEntries',
        entries[0]?.id,
        expect.objectContaining({}),
      )
    })

    it('別案件のレコードには影響しない', () => {
      useScheduleSettingsStore
        .getState()
        .updatePhaseName(PROJECT_ID, 'phase-1', '自案件')
      useScheduleSettingsStore
        .getState()
        .updatePhaseName(OTHER_PROJECT_ID, 'phase-1', '他案件')

      const entries = useScheduleSettingsStore.getState().entries
      expect(entries).toHaveLength(2)
      const own = entries.find((e) => e.projectId === PROJECT_ID)
      const other = entries.find((e) => e.projectId === OTHER_PROJECT_ID)
      expect(own?.phases.find((p) => p.phaseKey === 'phase-1')?.name).toBe(
        '自案件',
      )
      expect(other?.phases.find((p) => p.phaseKey === 'phase-1')?.name).toBe(
        '他案件',
      )
    })

    it('新規作成がDataAdapterで失敗した場合はロールバックされ、トースト表示される', async () => {
      mockCreate.mockRejectedValueOnce(new Error('network error'))
      useScheduleSettingsStore
        .getState()
        .updatePhaseName(PROJECT_ID, 'phase-1', '新名称')
      await flushMicrotasks()
      expect(useScheduleSettingsStore.getState().entries).toHaveLength(0)
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })

    it('更新がDataAdapterで失敗した場合はロールバックされる', async () => {
      useScheduleSettingsStore
        .getState()
        .updatePhaseName(PROJECT_ID, 'phase-1', '1回目')
      await flushMicrotasks()
      mockUpdate.mockRejectedValueOnce(new Error('network error'))
      useScheduleSettingsStore
        .getState()
        .updatePhaseName(PROJECT_ID, 'phase-1', '2回目')
      expect(
        useScheduleSettingsStore
          .getState()
          .entries[0]?.phases.find((p) => p.phaseKey === 'phase-1')?.name,
      ).toBe('2回目')
      await flushMicrotasks()
      expect(
        useScheduleSettingsStore
          .getState()
          .entries[0]?.phases.find((p) => p.phaseKey === 'phase-1')?.name,
      ).toBe('1回目')
    })
  })

  describe('togglePhaseEnabled', () => {
    it('指定工程のenabledを反転する', () => {
      const before = useScheduleSettingsStore
        .getState()
        .getSettings(PROJECT_ID)
        .phases.find((p) => p.phaseKey === 'phase-1')?.enabled
      useScheduleSettingsStore
        .getState()
        .togglePhaseEnabled(PROJECT_ID, 'phase-1')
      const after = useScheduleSettingsStore
        .getState()
        .getSettings(PROJECT_ID)
        .phases.find((p) => p.phaseKey === 'phase-1')?.enabled
      expect(after).toBe(!before)
    })
  })

  describe('reorderPhase', () => {
    it('2つの工程のsortOrderを入れ替える', () => {
      useScheduleSettingsStore
        .getState()
        .reorderPhase(PROJECT_ID, 'phase-1', 'phase-2')
      const phases = useScheduleSettingsStore
        .getState()
        .getSettings(PROJECT_ID).phases
      const phase1 = phases.find((p) => p.phaseKey === 'phase-1')
      const phase2 = phases.find((p) => p.phaseKey === 'phase-2')
      expect(phase1?.sortOrder).toBe(1)
      expect(phase2?.sortOrder).toBe(0)
    })

    // 反証: 存在しない工程キーを指定した場合は何も変更せず、レコードも新規作成しない
    it('反証: 存在しない工程キーを指定した場合は何も変更しない（レコードも作成されない）', () => {
      useScheduleSettingsStore
        .getState()
        .reorderPhase(PROJECT_ID, 'phase-1', 'not-exist')
      expect(useScheduleSettingsStore.getState().entries).toHaveLength(0)
      expect(mockCreate).not.toHaveBeenCalled()
    })
  })
})
