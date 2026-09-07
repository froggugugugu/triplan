import { create } from 'zustand'
import { getDataAdapter } from '@/infrastructure/adapters'
import { toast } from '@/shared/hooks/use-toast'
import type { PhaseSettingsEntry } from '@/shared/types'
import type { PhaseDefinition, PhaseSettings } from '@/shared/types/schedule'
import { createDefaultPhaseSettings } from '@/shared/types/schedule'
import type { ThemeColor } from '@/shared/types/theme-color'
import { migrateToThemeColor } from '@/shared/types/theme-color'
import {
  describeSaveFailure,
  isConflictError,
  isStorageQuotaError,
} from './persistence-error'

// 旧Zustand persistミドルウェアが使っていた独立localStorageキー（案件別工程設定、
// 17ストアのDataAdapter配線・第11弾でDataAdapter経由の永続化へ移行）。
// データ破壊回避を最優先するため、移行後もこのキー自体は削除しない
// （postgresモードへの書き込みが何らかの理由で失われた場合のフォールバック的なバックアップとして残す）
const LEGACY_STORAGE_KEY = 'schedule-settings-storage'

interface LegacyPersistedShape {
  state?: { settingsMap?: Record<string, PhaseSettings> }
}

function readLegacySettingsMap(): Record<string, PhaseSettings> {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as LegacyPersistedShape
    return parsed.state?.settingsMap ?? {}
  } catch {
    return {}
  }
}

interface ScheduleSettingsState {
  entries: PhaseSettingsEntry[]

  loadScheduleSettings: () => void
  getSettings: (projectId: string) => PhaseSettings
  updatePhaseName: (projectId: string, phaseKey: string, name: string) => void
  updatePhaseColor: (
    projectId: string,
    phaseKey: string,
    color: ThemeColor,
  ) => void
  togglePhaseEnabled: (projectId: string, phaseKey: string) => void
  reorderPhase: (projectId: string, fromKey: string, toKey: string) => void
}

function notifyPersistenceFailure(action: string, error: unknown) {
  toast({
    // 楽観ロックの競合（412）は障害ではなく並行編集の結果なので、
    // 「失敗」ではなく再読込を促す文言にする
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `工程設定の${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

// loadScheduleSettings()の多重発火防止用ガード（モジュールスコープ、ページ読み込みごとに
// リセット）。React StrictMode（開発時）はuseEffectを2回発火するため、実行中は後続の
// 呼び出しを完全にスキップするsingle-flightパターンにする。当初は「移行フラグのみ」を
// 同期ガードする設計だったが、2回目の呼び出しがガードをすり抜けて自分自身のlist()結果
// （移行前の空配列）で`set({ entries })`を呼んでしまい、1回目が進めている移行の楽観的
// set()を後から上書きして消してしまう競合が実際にユニットテストで再現した（wbs-template-store
// のseedStandardTemplateとは異なり、load自体とmigrateが同一アクションに同居するため、
// 「migrateだけガードする」では不十分だった）。single-flight化により2回目の呼び出しは
// list()すら発行せず、常に安全に収束する
let inFlightLoad: Promise<void> | null = null

/** テスト用: モジュールスコープのロードガードをリセットする */
export function resetScheduleSettingsMigrationGuardForTesting(): void {
  inFlightLoad = null
}

export const useScheduleSettingsStore = create<ScheduleSettingsState>()(
  (set, get) => {
    // 指定projectIdの工程設定を更新する共通ヘルパー（既存レコードがなければ
    // デフォルト設定を土台に新規作成する）。楽観的set＋バックグラウンド永続化＋
    // 失敗時ロールバックのパターンはproject-progress-store.tsのsetWeeklyProgressと同型
    function upsertPhases(
      projectId: string,
      transformPhases: (phases: PhaseDefinition[]) => PhaseDefinition[] | null,
    ) {
      const previous = get().entries
      const existing = previous.find((e) => e.projectId === projectId)
      const basePhases = existing?.phases ?? createDefaultPhaseSettings().phases
      const nextPhases = transformPhases(basePhases)
      if (nextPhases === null) return // 変更対象なし（reorderPhaseの不正な指定等）
      const now = new Date().toISOString()

      if (existing) {
        set({
          entries: previous.map((e) =>
            e.id === existing.id
              ? { ...e, phases: nextPhases, lastModified: now }
              : e,
          ),
        })
        getDataAdapter()
          .update('scheduleSettingsEntries', existing.id, {
            phases: nextPhases,
            lastModified: now,
          })
          .catch((error: unknown) => {
            set({ entries: previous })
            notifyPersistenceFailure('更新', error)
          })
      } else {
        const id = crypto.randomUUID()
        const newEntry: PhaseSettingsEntry = {
          id,
          projectId,
          phases: nextPhases,
          lastModified: now,
        }
        set({ entries: [...previous, newEntry] })
        getDataAdapter()
          .create(
            'scheduleSettingsEntries',
            { projectId, phases: nextPhases, lastModified: now },
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

      loadScheduleSettings: () => {
        // single-flight: 実行中は後続の呼び出しを完全にスキップする（上記コメント参照）
        if (inFlightLoad) return

        inFlightLoad = getDataAdapter()
          .list('scheduleSettingsEntries')
          .then(async (entries) => {
            set({ entries })
            if (entries.length > 0) return

            // レガシーpersistキーからの1回限りの移行（データ破壊回避を最優先。
            // DataAdapter側が実際に0件であることを確認してから実行するため、
            // 既に移行済みの環境で誤って重複移行することはない）
            const legacyMap = readLegacySettingsMap()
            const legacyProjectIds = Object.keys(legacyMap)
            if (legacyProjectIds.length === 0) return

            const migratedEntries: PhaseSettingsEntry[] = legacyProjectIds.map(
              (projectId) => {
                const legacy = legacyMap[projectId]
                return {
                  id: crypto.randomUUID(),
                  projectId,
                  phases: legacy?.phases ?? createDefaultPhaseSettings().phases,
                  lastModified:
                    legacy?.lastModified ?? new Date().toISOString(),
                }
              },
            )
            set({ entries: migratedEntries })
            await Promise.all(
              migratedEntries.map((entry) =>
                getDataAdapter().create(
                  'scheduleSettingsEntries',
                  {
                    projectId: entry.projectId,
                    phases: entry.phases,
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
          .catch((error: unknown) =>
            notifyPersistenceFailure('読み込み', error),
          )
          .finally(() => {
            inFlightLoad = null
          })
      },

      getSettings: (projectId) => {
        const existing = get().entries.find((e) => e.projectId === projectId)
        if (existing) {
          return {
            phases: existing.phases,
            lastModified: existing.lastModified,
          }
        }
        return createDefaultPhaseSettings()
      },

      updatePhaseName: (projectId, phaseKey, name) => {
        upsertPhases(projectId, (phases) =>
          phases.map((p) => (p.phaseKey === phaseKey ? { ...p, name } : p)),
        )
      },

      updatePhaseColor: (projectId, phaseKey, color) => {
        const themeColor = migrateToThemeColor(color)
        upsertPhases(projectId, (phases) =>
          phases.map((p) =>
            p.phaseKey === phaseKey ? { ...p, color: themeColor } : p,
          ),
        )
      },

      togglePhaseEnabled: (projectId, phaseKey) => {
        upsertPhases(projectId, (phases) =>
          phases.map((p) =>
            p.phaseKey === phaseKey ? { ...p, enabled: !p.enabled } : p,
          ),
        )
      },

      reorderPhase: (projectId, fromKey, toKey) => {
        upsertPhases(projectId, (phases) => {
          const sorted = [...phases].sort((a, b) => a.sortOrder - b.sortOrder)
          const fromIdx = sorted.findIndex((p) => p.phaseKey === fromKey)
          const toIdx = sorted.findIndex((p) => p.phaseKey === toKey)
          if (fromIdx === -1 || toIdx === -1) return null

          const fromOrder = sorted[fromIdx]?.sortOrder ?? 0
          const toOrder = sorted[toIdx]?.sortOrder ?? 0

          return phases.map((p) => {
            if (p.phaseKey === fromKey) return { ...p, sortOrder: toOrder }
            if (p.phaseKey === toKey) return { ...p, sortOrder: fromOrder }
            return p
          })
        })
      },
    }
  },
)
