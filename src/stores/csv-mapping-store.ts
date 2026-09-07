import { create } from 'zustand'
import { getDataAdapter } from '@/infrastructure/adapters'
import { toast } from '@/shared/hooks/use-toast'
import type {
  CreateCsvMappingProfile,
  CsvMappingProfile,
} from '@/shared/types/csv-mapping'
import {
  describeSaveFailure,
  isConflictError,
  isStorageQuotaError,
} from './persistence-error'

/**
 * 汎用CSVマッピングプロファイル（非公開の設計文書）。
 * 外部システム向けCSVの列レイアウト（選択・並び・改名）をユーザー定義として保存し、
 * エクスポート/インポートの両方で使い回す。楽観的更新＋DataAdapter経由の標準パターン
 */
interface CsvMappingState {
  csvMappingProfiles: CsvMappingProfile[]

  // Actions
  loadCsvMappingProfiles: () => void
  addCsvMappingProfile: (data: CreateCsvMappingProfile) => CsvMappingProfile
  updateCsvMappingProfile: (
    id: string,
    patch: Partial<CreateCsvMappingProfile>,
  ) => void
  deleteCsvMappingProfile: (id: string) => void

  // Selectors
  getProfilesForSource: (
    sourceKey: string,
    direction: CsvMappingProfile['direction'],
  ) => CsvMappingProfile[]
}

function notifyPersistenceFailure(action: string, error: unknown) {
  toast({
    // 楽観ロックの競合（412）は障害ではなく並行編集の結果なので、
    // 「失敗」ではなく再読込を促す文言にする
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `CSVマッピングプロファイルの${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

export const useCsvMappingStore = create<CsvMappingState>()((set, get) => ({
  csvMappingProfiles: [],

  loadCsvMappingProfiles: () => {
    getDataAdapter()
      .list('csvMappingProfiles')
      .then((csvMappingProfiles) => set({ csvMappingProfiles }))
      .catch((error: unknown) => notifyPersistenceFailure('読み込み', error))
  },

  addCsvMappingProfile: (data) => {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const optimistic: CsvMappingProfile = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    }

    set((state) => ({
      csvMappingProfiles: [...state.csvMappingProfiles, optimistic],
    }))

    getDataAdapter()
      .create(
        'csvMappingProfiles',
        { ...data, createdAt: now, updatedAt: now },
        { id },
      )
      .then((created) => {
        set((state) => ({
          csvMappingProfiles: state.csvMappingProfiles.map((p) =>
            p.id === id ? created : p,
          ),
        }))
      })
      .catch((error: unknown) => {
        set((state) => ({
          csvMappingProfiles: state.csvMappingProfiles.filter(
            (p) => p.id !== id,
          ),
        }))
        notifyPersistenceFailure('追加', error)
      })

    return optimistic
  },

  updateCsvMappingProfile: (id, patch) => {
    const previous = get().csvMappingProfiles
    const now = new Date().toISOString()
    const fullPatch = { ...patch, updatedAt: now }

    set((state) => ({
      csvMappingProfiles: state.csvMappingProfiles.map((p) =>
        p.id === id ? { ...p, ...fullPatch } : p,
      ),
    }))

    getDataAdapter()
      .update('csvMappingProfiles', id, fullPatch, {
        // 楽観ロック
        expectedUpdatedAt: previous.find((p) => p.id === id)?.updatedAt,
      })
      .then((saved) => {
        // サーバーが確定した行（特にサーバー時計のupdatedAt）をローカルへ反映する。
        // 反映しないと次回の楽観ロック期待値がクライアント時計のまま残り、
        // 単独ユーザーでも2回目の更新が必ず412になる
        set((state) => ({
          csvMappingProfiles: state.csvMappingProfiles.map((p) =>
            p.id === id ? saved : p,
          ),
        }))
      })
      .catch((error: unknown) => {
        set({ csvMappingProfiles: previous })
        notifyPersistenceFailure('更新', error)
      })
  },

  deleteCsvMappingProfile: (id) => {
    const previous = get().csvMappingProfiles
    set((state) => ({
      csvMappingProfiles: state.csvMappingProfiles.filter((p) => p.id !== id),
    }))

    getDataAdapter()
      .remove('csvMappingProfiles', id)
      .catch((error: unknown) => {
        set({ csvMappingProfiles: previous })
        notifyPersistenceFailure('削除', error)
      })
  },

  getProfilesForSource: (sourceKey, direction) => {
    return get()
      .csvMappingProfiles.filter(
        (p) => p.sourceKey === sourceKey && p.direction === direction,
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  },
}))
