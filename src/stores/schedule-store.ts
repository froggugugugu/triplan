import { create } from 'zustand'
import { getDataAdapter } from '@/infrastructure/adapters'
import { toast } from '@/shared/hooks/use-toast'
import type {
  DependencyType,
  PhaseDependency,
  ScheduleEntry,
} from '@/shared/types/schedule'
import {
  describeSaveFailure,
  isConflictError,
  isStorageQuotaError,
} from './persistence-error'

interface ScheduleState {
  entries: ScheduleEntry[]
  dependencies: PhaseDependency[]

  // Entry operations
  loadSchedule: () => void
  upsertEntry: (
    projectId: string,
    phaseKey: string,
    startDate: string,
    endDate: string,
  ) => void
  deleteEntry: (projectId: string, phaseKey: string) => void
  deleteByProject: (projectId: string) => void

  // Dependency operations
  addDependency: (
    projectId: string,
    from: string,
    to: string,
    type: DependencyType,
  ) => void
  deleteDependency: (id: string) => void

  // Selectors (return new arrays to avoid Zustand mutation issues)
  getEntriesByProject: (projectId: string) => ScheduleEntry[]
  getDependenciesByProject: (projectId: string) => PhaseDependency[]
}

function notifyPersistenceFailure(action: string, error: unknown) {
  toast({
    // 楽観ロックの競合（412）は障害ではなく並行編集の結果なので、
    // 「失敗」ではなく再読込を促す文言にする
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `スケジュールの${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

export const useScheduleStore = create<ScheduleState>()((set, get) => ({
  entries: [],
  dependencies: [],

  loadSchedule: () => {
    getDataAdapter()
      .list('scheduleEntries')
      .then((entries) => set({ entries }))
      .catch((error: unknown) => notifyPersistenceFailure('読み込み', error))
    getDataAdapter()
      .list('dependencies')
      .then((dependencies) => set({ dependencies }))
      .catch((error: unknown) => notifyPersistenceFailure('読み込み', error))
  },

  // 楽観的更新（docs/project.md「17ストアのDataAdapter配線」参照）。upsertパターンは
  // project-progress-store・efforts-storeと同じ設計
  upsertEntry: (projectId, phaseKey, startDate, endDate) => {
    const previous = get().entries
    const existing = previous.find(
      (e) => e.projectId === projectId && e.phaseKey === phaseKey,
    )

    if (existing) {
      set({
        entries: previous.map((e) =>
          e.id === existing.id ? { ...e, startDate, endDate } : e,
        ),
      })
      getDataAdapter()
        .update('scheduleEntries', existing.id, { startDate, endDate })
        .catch((error: unknown) => {
          set({ entries: previous })
          notifyPersistenceFailure('更新', error)
        })
    } else {
      const id = crypto.randomUUID()
      const newEntry: ScheduleEntry = {
        id,
        projectId,
        phaseKey,
        startDate,
        endDate,
      }
      set({ entries: [...previous, newEntry] })
      getDataAdapter()
        .create(
          'scheduleEntries',
          { projectId, phaseKey, startDate, endDate },
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
  },

  deleteEntry: (projectId, phaseKey) => {
    const previous = get().entries
    const target = previous.find(
      (e) => e.projectId === projectId && e.phaseKey === phaseKey,
    )
    if (!target) return

    set({
      entries: previous.filter(
        (e) => !(e.projectId === projectId && e.phaseKey === phaseKey),
      ),
    })
    getDataAdapter()
      .remove('scheduleEntries', target.id)
      .catch((error: unknown) => {
        set({ entries: previous })
        notifyPersistenceFailure('削除', error)
      })
  },

  deleteByProject: (projectId) => {
    const previousEntries = get().entries
    const previousDeps = get().dependencies
    const targetEntryIds = previousEntries
      .filter((e) => e.projectId === projectId)
      .map((e) => e.id)
    const targetDepIds = previousDeps
      .filter((d) => d.projectId === projectId)
      .map((d) => d.id)
    if (targetEntryIds.length === 0 && targetDepIds.length === 0) return

    set({
      entries: previousEntries.filter((e) => e.projectId !== projectId),
      dependencies: previousDeps.filter((d) => d.projectId !== projectId),
    })
    Promise.all([
      ...targetEntryIds.map((id) =>
        getDataAdapter().remove('scheduleEntries', id),
      ),
      ...targetDepIds.map((id) => getDataAdapter().remove('dependencies', id)),
    ]).catch((error: unknown) => {
      set({ entries: previousEntries, dependencies: previousDeps })
      notifyPersistenceFailure('削除', error)
    })
  },

  addDependency: (projectId, fromPhaseKey, toPhaseKey, type) => {
    const previous = get().dependencies
    // Prevent duplicates (projectId × fromPhaseKey × toPhaseKey)
    const exists = previous.some(
      (d) =>
        d.projectId === projectId &&
        d.fromPhaseKey === fromPhaseKey &&
        d.toPhaseKey === toPhaseKey,
    )
    if (exists) return

    const id = crypto.randomUUID()
    const newDep: PhaseDependency = {
      id,
      projectId,
      fromPhaseKey,
      toPhaseKey,
      dependencyType: type,
    }
    set({ dependencies: [...previous, newDep] })
    getDataAdapter()
      .create(
        'dependencies',
        {
          projectId,
          fromPhaseKey,
          toPhaseKey,
          dependencyType: type,
        },
        { id },
      )
      .then((created) => {
        set((state) => ({
          dependencies: state.dependencies.map((d) =>
            d.id === id ? created : d,
          ),
        }))
      })
      .catch((error: unknown) => {
        set((state) => ({
          dependencies: state.dependencies.filter((d) => d.id !== id),
        }))
        notifyPersistenceFailure('依存関係追加', error)
      })
  },

  deleteDependency: (id) => {
    const previous = get().dependencies
    set({ dependencies: previous.filter((d) => d.id !== id) })
    getDataAdapter()
      .remove('dependencies', id)
      .catch((error: unknown) => {
        set({ dependencies: previous })
        notifyPersistenceFailure('依存関係削除', error)
      })
  },

  getEntriesByProject: (projectId) => {
    return get().entries.filter((e) => e.projectId === projectId)
  },

  getDependenciesByProject: (projectId) => {
    return get().dependencies.filter((d) => d.projectId === projectId)
  },
}))
