import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WbsSettingsEntry } from '@/shared/types'
import { createDefaultWbsSettings } from '@/shared/types/wbs-settings'
import {
  resetWbsSettingsMigrationGuardForTesting,
  useWbsSettingsStore,
} from '@/stores/wbs-settings-store'

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
const LEGACY_KEY = 'wbs-settings-storage'

describe('useWbsSettingsStore', () => {
  beforeEach(async () => {
    useWbsSettingsStore.setState({ entries: [] })
    resetWbsSettingsMigrationGuardForTesting()
    localStorage.clear()
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
    mockCreate.mockImplementation(
      async (
        _entity: string,
        data: Omit<WbsSettingsEntry, 'id'>,
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
        patch: Partial<WbsSettingsEntry>,
      ) => ({
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
    localStorage.clear()
  })

  describe('loadWbsSettings', () => {
    it('DataAdapterから読み込んだWBS列設定をセットする', async () => {
      const seeded: WbsSettingsEntry[] = [
        {
          id: crypto.randomUUID(),
          projectId: PROJECT_ID,
          effortColumns: createDefaultWbsSettings().effortColumns,
          lastModified: '2026-01-01T00:00:00.000Z',
        },
      ]
      mockList.mockResolvedValueOnce(seeded)

      useWbsSettingsStore.getState().loadWbsSettings()
      await flushMicrotasks()

      expect(useWbsSettingsStore.getState().entries).toEqual(seeded)
    })

    it('読み込みがDataAdapterで失敗した場合はトースト表示される', async () => {
      mockList.mockRejectedValueOnce(new Error('network error'))
      useWbsSettingsStore.getState().loadWbsSettings()
      await flushMicrotasks()
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })

    describe('レガシーpersistキーからの移行', () => {
      it('DataAdapter側が0件かつレガシーキーにデータがある場合、移行してDataAdapter.create()を呼ぶ', async () => {
        const legacyColumns = createDefaultWbsSettings().effortColumns
        localStorage.setItem(
          LEGACY_KEY,
          JSON.stringify({
            state: {
              settingsMap: {
                [PROJECT_ID]: {
                  effortColumns: legacyColumns,
                  lastModified: '2025-06-01T00:00:00.000Z',
                },
              },
            },
          }),
        )
        mockList.mockResolvedValue([])

        useWbsSettingsStore.getState().loadWbsSettings()
        await flushMicrotasks()

        const entries = useWbsSettingsStore.getState().entries
        expect(entries).toHaveLength(1)
        expect(entries[0]?.projectId).toBe(PROJECT_ID)
        expect(entries[0]?.effortColumns).toEqual(legacyColumns)
        expect(mockCreate).toHaveBeenCalledWith(
          'wbsColumnSettingsEntries',
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
                [PROJECT_ID]: createDefaultWbsSettings(),
                [OTHER_PROJECT_ID]: createDefaultWbsSettings(),
              },
            },
          }),
        )
        mockList.mockResolvedValue([])

        useWbsSettingsStore.getState().loadWbsSettings()
        await flushMicrotasks()

        expect(useWbsSettingsStore.getState().entries).toHaveLength(2)
        expect(mockCreate).toHaveBeenCalledTimes(2)
      })

      // 反証: DataAdapter側に既にデータがある場合は移行しない（二重作成防止）
      it('反証: DataAdapter側に既にデータがある場合はレガシーキーがあっても移行しない', async () => {
        const existing: WbsSettingsEntry[] = [
          {
            id: crypto.randomUUID(),
            projectId: PROJECT_ID,
            effortColumns: createDefaultWbsSettings().effortColumns,
            lastModified: '2026-01-01T00:00:00.000Z',
          },
        ]
        mockList.mockResolvedValue(existing)
        localStorage.setItem(
          LEGACY_KEY,
          JSON.stringify({
            state: {
              settingsMap: { [OTHER_PROJECT_ID]: createDefaultWbsSettings() },
            },
          }),
        )

        useWbsSettingsStore.getState().loadWbsSettings()
        await flushMicrotasks()

        expect(useWbsSettingsStore.getState().entries).toEqual(existing)
        expect(mockCreate).not.toHaveBeenCalled()
      })

      it('反証: レガシーキーが存在しない場合は移行を試みず空のまま', async () => {
        mockList.mockResolvedValue([])
        useWbsSettingsStore.getState().loadWbsSettings()
        await flushMicrotasks()

        expect(useWbsSettingsStore.getState().entries).toEqual([])
        expect(mockCreate).not.toHaveBeenCalled()
      })

      it('反証: 不正なJSON形式のレガシーキーでも例外を投げず空のまま扱う', async () => {
        localStorage.setItem(LEGACY_KEY, '{不正なJSON')
        mockList.mockResolvedValue([])

        useWbsSettingsStore.getState().loadWbsSettings()
        await flushMicrotasks()

        expect(useWbsSettingsStore.getState().entries).toEqual([])
        expect(mockCreate).not.toHaveBeenCalled()
      })

      it('反証: 同一tick内で2回呼ばれても移行は1回だけ実行される（StrictMode二重発火対策）', async () => {
        localStorage.setItem(
          LEGACY_KEY,
          JSON.stringify({
            state: {
              settingsMap: { [PROJECT_ID]: createDefaultWbsSettings() },
            },
          }),
        )
        mockList.mockResolvedValue([])

        useWbsSettingsStore.getState().loadWbsSettings()
        useWbsSettingsStore.getState().loadWbsSettings()
        await flushMicrotasks()

        expect(mockCreate).toHaveBeenCalledTimes(1)
        expect(useWbsSettingsStore.getState().entries).toHaveLength(1)
      })

      it('移行のDataAdapter.create()が失敗した場合はロールバックしトースト表示される', async () => {
        localStorage.setItem(
          LEGACY_KEY,
          JSON.stringify({
            state: {
              settingsMap: { [PROJECT_ID]: createDefaultWbsSettings() },
            },
          }),
        )
        mockList.mockResolvedValue([])
        mockCreate.mockRejectedValueOnce(new Error('network error'))

        useWbsSettingsStore.getState().loadWbsSettings()
        await flushMicrotasks()

        expect(useWbsSettingsStore.getState().entries).toEqual([])
        const { toast } = await import('@/shared/hooks/use-toast')
        expect(toast).toHaveBeenCalledWith(
          expect.objectContaining({ variant: 'destructive' }),
        )
      })
    })
  })

  describe('getSettings', () => {
    it('該当案件のレコードが無い場合はデフォルト設定を返す', () => {
      const settings = useWbsSettingsStore.getState().getSettings(PROJECT_ID)
      expect(settings.effortColumns).toHaveLength(10)
    })

    it('該当案件のレコードがある場合はその内容を返す', () => {
      useWbsSettingsStore
        .getState()
        .updateColumnName(PROJECT_ID, 'effort-1', 'カスタム列名')
      const settings = useWbsSettingsStore.getState().getSettings(PROJECT_ID)
      expect(
        settings.effortColumns.find((c) => c.id === 'effort-1')?.displayName,
      ).toBe('カスタム列名')
    })
  })

  describe('updateColumnName', () => {
    it('レコードが無い場合はデフォルト設定を土台に新規作成する（楽観的に即座へ反映される）', () => {
      useWbsSettingsStore
        .getState()
        .updateColumnName(PROJECT_ID, 'effort-1', '新列名')

      const entries = useWbsSettingsStore.getState().entries
      expect(entries).toHaveLength(1)
      expect(
        entries[0]?.effortColumns.find((c) => c.id === 'effort-1')?.displayName,
      ).toBe('新列名')
      expect(mockCreate).toHaveBeenCalledWith(
        'wbsColumnSettingsEntries',
        expect.objectContaining({ projectId: PROJECT_ID }),
        { id: entries[0]?.id },
      )
    })

    it('既存レコードがある場合は該当列のみ更新し、他の列は保持する', () => {
      useWbsSettingsStore
        .getState()
        .updateColumnName(PROJECT_ID, 'effort-1', '1回目')
      useWbsSettingsStore
        .getState()
        .updateColumnName(PROJECT_ID, 'effort-2', '2回目')

      const entries = useWbsSettingsStore.getState().entries
      expect(entries).toHaveLength(1)
      const columns = entries[0]?.effortColumns ?? []
      expect(columns.find((c) => c.id === 'effort-1')?.displayName).toBe(
        '1回目',
      )
      expect(columns.find((c) => c.id === 'effort-2')?.displayName).toBe(
        '2回目',
      )
      expect(mockUpdate).toHaveBeenCalledWith(
        'wbsColumnSettingsEntries',
        entries[0]?.id,
        expect.objectContaining({}),
      )
    })

    it('別案件のレコードには影響しない', () => {
      useWbsSettingsStore
        .getState()
        .updateColumnName(PROJECT_ID, 'effort-1', '自案件')
      useWbsSettingsStore
        .getState()
        .updateColumnName(OTHER_PROJECT_ID, 'effort-1', '他案件')

      const entries = useWbsSettingsStore.getState().entries
      expect(entries).toHaveLength(2)
      const own = entries.find((e) => e.projectId === PROJECT_ID)
      const other = entries.find((e) => e.projectId === OTHER_PROJECT_ID)
      expect(
        own?.effortColumns.find((c) => c.id === 'effort-1')?.displayName,
      ).toBe('自案件')
      expect(
        other?.effortColumns.find((c) => c.id === 'effort-1')?.displayName,
      ).toBe('他案件')
    })

    it('新規作成がDataAdapterで失敗した場合はロールバックされ、トースト表示される', async () => {
      mockCreate.mockRejectedValueOnce(new Error('network error'))
      useWbsSettingsStore
        .getState()
        .updateColumnName(PROJECT_ID, 'effort-1', '新列名')
      await flushMicrotasks()
      expect(useWbsSettingsStore.getState().entries).toHaveLength(0)
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })

    it('更新がDataAdapterで失敗した場合はロールバックされる', async () => {
      useWbsSettingsStore
        .getState()
        .updateColumnName(PROJECT_ID, 'effort-1', '1回目')
      await flushMicrotasks()
      mockUpdate.mockRejectedValueOnce(new Error('network error'))
      useWbsSettingsStore
        .getState()
        .updateColumnName(PROJECT_ID, 'effort-1', '2回目')
      expect(
        useWbsSettingsStore
          .getState()
          .entries[0]?.effortColumns.find((c) => c.id === 'effort-1')
          ?.displayName,
      ).toBe('2回目')
      await flushMicrotasks()
      expect(
        useWbsSettingsStore
          .getState()
          .entries[0]?.effortColumns.find((c) => c.id === 'effort-1')
          ?.displayName,
      ).toBe('1回目')
    })
  })

  describe('toggleColumnEnabled', () => {
    it('指定列のenabledを反転する', () => {
      const before = useWbsSettingsStore
        .getState()
        .getSettings(PROJECT_ID)
        .effortColumns.find((c) => c.id === 'effort-1')?.enabled
      useWbsSettingsStore.getState().toggleColumnEnabled(PROJECT_ID, 'effort-1')
      const after = useWbsSettingsStore
        .getState()
        .getSettings(PROJECT_ID)
        .effortColumns.find((c) => c.id === 'effort-1')?.enabled
      expect(after).toBe(!before)
    })
  })

  describe('moveColumn', () => {
    it('upで前の列とorderを入れ替える', () => {
      useWbsSettingsStore.getState().moveColumn(PROJECT_ID, 'effort-2', 'up')
      const columns = useWbsSettingsStore
        .getState()
        .getSettings(PROJECT_ID).effortColumns
      expect(columns.find((c) => c.id === 'effort-1')?.order).toBe(1)
      expect(columns.find((c) => c.id === 'effort-2')?.order).toBe(0)
    })

    // 反証: 先頭列をupしても範囲外のため何も変更しない（レコードも作成されない）
    it('反証: 先頭列をupしても何も変更しない（レコードも作成されない）', () => {
      useWbsSettingsStore.getState().moveColumn(PROJECT_ID, 'effort-1', 'up')
      expect(useWbsSettingsStore.getState().entries).toHaveLength(0)
      expect(mockCreate).not.toHaveBeenCalled()
    })
  })

  describe('updateLevelColor', () => {
    // 反証: 範囲外レベル（0〜5以外）を指定した場合は何もしない
    it('反証: 範囲外レベル（6）を指定した場合は何も変更しない', () => {
      useWbsSettingsStore.getState().updateLevelColor(PROJECT_ID, 6, '#ffffff')
      expect(useWbsSettingsStore.getState().entries).toHaveLength(0)
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('範囲内レベルの色を更新する', () => {
      useWbsSettingsStore
        .getState()
        .updateLevelColor(PROJECT_ID, 2, { light: '#123456', dark: '#654321' })
      const settings = useWbsSettingsStore.getState().getSettings(PROJECT_ID)
      expect(settings.levelColors?.['2']).toEqual({
        light: '#123456',
        dark: '#654321',
      })
    })
  })
})
