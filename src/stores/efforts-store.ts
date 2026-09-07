import { create } from 'zustand'
import { getDataAdapter } from '@/infrastructure/adapters'
import { toast } from '@/shared/hooks/use-toast'
import type { CreateEffortEntry, EffortEntry } from '@/shared/types/effort'
import {
  describeSaveFailure,
  isConflictError,
  isStorageQuotaError,
} from './persistence-error'

interface EffortsState {
  efforts: EffortEntry[]
  // Actions
  loadEfforts: () => void
  upsertEffort: (data: CreateEffortEntry) => void
  deleteEffort: (projectId: string, columnId: string) => void
  deleteByProject: (projectId: string) => void
  // Selectors
  getByProject: (projectId: string) => EffortEntry[]
  getByProjectAndColumn: (
    projectId: string,
    columnId: string,
  ) => EffortEntry | undefined
}

function notifyPersistenceFailure(action: string, error: unknown) {
  toast({
    // 楽観ロックの競合（412）は障害ではなく並行編集の結果なので、
    // 「失敗」ではなく再読込を促す文言にする
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `工数の${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

export const useEffortsStore = create<EffortsState>()((set, get) => ({
  efforts: [],

  loadEfforts: () => {
    getDataAdapter()
      .list('efforts')
      .then((efforts) => set({ efforts }))
      .catch((error: unknown) => notifyPersistenceFailure('読み込み', error))
  },

  // 楽観的更新（docs/project.md「17ストアのDataAdapter配線」参照）。upsertパターンは
  // project-progress-storeのsetWeeklyProgressと同じ設計（新規作成時はクライアント生成idを
  // DataAdapter.create()のoptions.idで固定し、確定後もidが安定するようにする）
  upsertEffort: (data) => {
    const previous = get().efforts
    const existing = previous.find(
      (e) => e.projectId === data.projectId && e.columnId === data.columnId,
    )

    if (existing) {
      set({
        efforts: previous.map((e) =>
          e.id === existing.id ? { ...e, value: data.value } : e,
        ),
      })
      getDataAdapter()
        .update('efforts', existing.id, { value: data.value })
        .catch((error: unknown) => {
          set({ efforts: previous })
          notifyPersistenceFailure('更新', error)
        })
    } else {
      const id = crypto.randomUUID()
      const newEntry: EffortEntry = { ...data, id }
      set({ efforts: [...previous, newEntry] })
      getDataAdapter()
        .create('efforts', data, { id })
        .then((created) => {
          set((state) => ({
            efforts: state.efforts.map((e) => (e.id === id ? created : e)),
          }))
        })
        .catch((error: unknown) => {
          set((state) => ({
            efforts: state.efforts.filter((e) => e.id !== id),
          }))
          notifyPersistenceFailure('追加', error)
        })
    }
  },

  deleteEffort: (projectId, columnId) => {
    const previous = get().efforts
    const target = previous.find(
      (e) => e.projectId === projectId && e.columnId === columnId,
    )
    if (!target) return

    set({
      efforts: previous.filter(
        (e) => !(e.projectId === projectId && e.columnId === columnId),
      ),
    })
    getDataAdapter()
      .remove('efforts', target.id)
      .catch((error: unknown) => {
        set({ efforts: previous })
        notifyPersistenceFailure('削除', error)
      })
  },

  deleteByProject: (projectId) => {
    const previous = get().efforts
    const targets = previous.filter((e) => e.projectId === projectId)
    if (targets.length === 0) return

    set({ efforts: previous.filter((e) => e.projectId !== projectId) })
    Promise.all(
      targets.map((t) => getDataAdapter().remove('efforts', t.id)),
    ).catch((error: unknown) => {
      set({ efforts: previous })
      notifyPersistenceFailure('削除', error)
    })
  },

  getByProject: (projectId) => {
    return get().efforts.filter((e) => e.projectId === projectId)
  },

  getByProjectAndColumn: (projectId, columnId) => {
    return get().efforts.find(
      (e) => e.projectId === projectId && e.columnId === columnId,
    )
  },
}))
