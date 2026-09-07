import { create } from 'zustand'
import { getDataAdapter } from '@/infrastructure/adapters'
import { toast } from '@/shared/hooks/use-toast'
import type { WbsSettingsEntry } from '@/shared/types'
import type { ThemeColor } from '@/shared/types/theme-color'
import { migrateToThemeColor } from '@/shared/types/theme-color'
import type { EffortColumn, WbsSettings } from '@/shared/types/wbs-settings'
import { createDefaultWbsSettings } from '@/shared/types/wbs-settings'
import {
  describeSaveFailure,
  isConflictError,
  isStorageQuotaError,
} from './persistence-error'

// 旧Zustand persistミドルウェアが使っていた独立localStorageキー（案件別WBS列設定、
// 17ストアのDataAdapter配線・第11弾でDataAdapter経由の永続化へ移行）。
// データ破壊回避を最優先するため、移行後もこのキー自体は削除しない
// （postgresモードへの書き込みが何らかの理由で失われた場合のフォールバック的なバックアップとして残す）
const LEGACY_STORAGE_KEY = 'wbs-settings-storage'

interface LegacyPersistedShape {
  state?: { settingsMap?: Record<string, WbsSettings> }
}

function readLegacySettingsMap(): Record<string, WbsSettings> {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as LegacyPersistedShape
    return parsed.state?.settingsMap ?? {}
  } catch {
    return {}
  }
}

interface WbsSettingsState {
  entries: WbsSettingsEntry[]

  loadWbsSettings: () => void
  getSettings: (projectId: string) => WbsSettings
  updateColumnName: (
    projectId: string,
    columnId: string,
    displayName: string,
  ) => void
  toggleColumnEnabled: (projectId: string, columnId: string) => void
  moveColumn: (
    projectId: string,
    columnId: string,
    direction: 'up' | 'down',
  ) => void
  updateColumnBackgroundColor: (
    projectId: string,
    columnId: string,
    color: ThemeColor,
  ) => void
  updateColumnTechTags: (
    projectId: string,
    columnId: string,
    techTagIds: string[],
  ) => void
  updateLevelColor: (
    projectId: string,
    level: number,
    color: ThemeColor,
  ) => void
}

function notifyPersistenceFailure(action: string, error: unknown) {
  toast({
    // 楽観ロックの競合（412）は障害ではなく並行編集の結果なので、
    // 「失敗」ではなく再読込を促す文言にする
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `WBS列設定の${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

// loadWbsSettings()の多重発火防止用ガード（モジュールスコープ、ページ読み込みごとに
// リセット）。schedule-settings-store.tsと同じsingle-flightパターン（詳細な経緯は
// そちらのコメント参照。「移行フラグのみガード」では2回目の呼び出しが自分自身の
// list()結果（移行前の空配列）でset({entries})し、1回目が進めている移行を
// 後から上書きして消してしまう競合が実際にユニットテストで再現したため採用）
let inFlightLoad: Promise<void> | null = null

/** テスト用: モジュールスコープのロードガードをリセットする */
export function resetWbsSettingsMigrationGuardForTesting(): void {
  inFlightLoad = null
}

export const useWbsSettingsStore = create<WbsSettingsState>()((set, get) => {
  // 指定projectIdのWBS設定を更新する共通ヘルパー（既存レコードがなければデフォルト設定を
  // 土台に新規作成する）。schedule-settings-store.tsのupsertPhasesと同型
  function upsertSettings(
    projectId: string,
    transform: (settings: WbsSettings) => WbsSettings | null,
  ) {
    const previous = get().entries
    const existing = previous.find((e) => e.projectId === projectId)
    const base: WbsSettings = existing
      ? {
          effortColumns: existing.effortColumns,
          levelColors: existing.levelColors,
          lastModified: existing.lastModified,
        }
      : createDefaultWbsSettings()
    const next = transform(base)
    if (next === null) return // 変更対象なし（moveColumnの範囲外指定等）
    const now = new Date().toISOString()

    if (existing) {
      set({
        entries: previous.map((e) =>
          e.id === existing.id
            ? {
                ...e,
                effortColumns: next.effortColumns,
                levelColors: next.levelColors,
                lastModified: now,
              }
            : e,
        ),
      })
      getDataAdapter()
        .update('wbsColumnSettingsEntries', existing.id, {
          effortColumns: next.effortColumns,
          levelColors: next.levelColors,
          lastModified: now,
        })
        .catch((error: unknown) => {
          set({ entries: previous })
          notifyPersistenceFailure('更新', error)
        })
    } else {
      const id = crypto.randomUUID()
      const newEntry: WbsSettingsEntry = {
        id,
        projectId,
        effortColumns: next.effortColumns,
        levelColors: next.levelColors,
        lastModified: now,
      }
      set({ entries: [...previous, newEntry] })
      getDataAdapter()
        .create(
          'wbsColumnSettingsEntries',
          {
            projectId,
            effortColumns: next.effortColumns,
            levelColors: next.levelColors,
            lastModified: now,
          },
          { id },
        )
        .then((created) => {
          set((state) => ({
            entries: state.entries.map((e) => (e.id === id ? created : e)),
          }))
        })
        .catch((error: unknown) => {
          set((state) => ({
            entries: state.entries.filter((e) => e.id !== id),
          }))
          notifyPersistenceFailure('追加', error)
        })
    }
  }

  return {
    entries: [],

    loadWbsSettings: () => {
      // single-flight: 実行中は後続の呼び出しを完全にスキップする（上記コメント参照）
      if (inFlightLoad) return

      inFlightLoad = getDataAdapter()
        .list('wbsColumnSettingsEntries')
        .then(async (entries) => {
          set({ entries })
          if (entries.length > 0) return

          // レガシーpersistキーからの1回限りの移行（データ破壊回避を最優先。
          // DataAdapter側が実際に0件であることを確認してから実行する）
          const legacyMap = readLegacySettingsMap()
          const legacyProjectIds = Object.keys(legacyMap)
          if (legacyProjectIds.length === 0) return

          const migratedEntries: WbsSettingsEntry[] = legacyProjectIds.map(
            (projectId) => {
              const legacy = legacyMap[projectId]
              const fallback = createDefaultWbsSettings()
              return {
                id: crypto.randomUUID(),
                projectId,
                effortColumns: legacy?.effortColumns ?? fallback.effortColumns,
                levelColors: legacy?.levelColors,
                lastModified: legacy?.lastModified ?? new Date().toISOString(),
              }
            },
          )
          set({ entries: migratedEntries })
          await Promise.all(
            migratedEntries.map((entry) =>
              getDataAdapter().create(
                'wbsColumnSettingsEntries',
                {
                  projectId: entry.projectId,
                  effortColumns: entry.effortColumns,
                  levelColors: entry.levelColors,
                  lastModified: entry.lastModified,
                },
                { id: entry.id },
              ),
            ),
          ).catch((error: unknown) => {
            set({ entries: [] })
            notifyPersistenceFailure('移行', error)
          })
        })
        .catch((error: unknown) => notifyPersistenceFailure('読み込み', error))
        .finally(() => {
          inFlightLoad = null
        })
    },

    getSettings: (projectId) => {
      const existing = get().entries.find((e) => e.projectId === projectId)
      if (existing) {
        return {
          effortColumns: existing.effortColumns,
          levelColors: existing.levelColors,
          lastModified: existing.lastModified,
        }
      }
      return createDefaultWbsSettings()
    },

    updateColumnName: (projectId, columnId, displayName) => {
      upsertSettings(projectId, (settings) => ({
        ...settings,
        effortColumns: settings.effortColumns.map((col) =>
          col.id === columnId ? { ...col, displayName } : col,
        ),
      }))
    },

    toggleColumnEnabled: (projectId, columnId) => {
      upsertSettings(projectId, (settings) => ({
        ...settings,
        effortColumns: settings.effortColumns.map((col) =>
          col.id === columnId ? { ...col, enabled: !col.enabled } : col,
        ),
      }))
    },

    moveColumn: (projectId, columnId, direction) => {
      upsertSettings(projectId, (settings) => {
        const columns = [...settings.effortColumns].sort(
          (a, b) => a.order - b.order,
        )
        const idx = columns.findIndex((c) => c.id === columnId)
        if (idx === -1) return null
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1
        if (swapIdx < 0 || swapIdx >= columns.length) return null

        const swapOrder = columns[swapIdx]?.order ?? 0
        const idxOrder = columns[idx]?.order ?? 0
        const newColumns: EffortColumn[] = columns.map((col, i) => {
          if (i === idx) return { ...col, order: swapOrder }
          if (i === swapIdx) return { ...col, order: idxOrder }
          return col
        })

        return { ...settings, effortColumns: newColumns }
      })
    },

    updateColumnBackgroundColor: (projectId, columnId, color) => {
      const themeColor = color ? migrateToThemeColor(color) : undefined
      upsertSettings(projectId, (settings) => ({
        ...settings,
        effortColumns: settings.effortColumns.map((col) =>
          col.id === columnId ? { ...col, backgroundColor: themeColor } : col,
        ),
      }))
    },

    updateColumnTechTags: (projectId, columnId, techTagIds) => {
      upsertSettings(projectId, (settings) => ({
        ...settings,
        effortColumns: settings.effortColumns.map((col) =>
          col.id === columnId
            ? {
                ...col,
                techTagIds: techTagIds.length > 0 ? techTagIds : undefined,
              }
            : col,
        ),
      }))
    },

    updateLevelColor: (projectId, level, color) => {
      // Only allow levels in the valid range (0–5) to avoid storing invalid colors
      if (level < 0 || level > 5) return
      const themeColor = migrateToThemeColor(color)
      upsertSettings(projectId, (settings) => ({
        ...settings,
        levelColors: {
          ...(settings.levelColors ?? {}),
          [String(level)]: themeColor,
        },
      }))
    },
  }
})
