import { create } from 'zustand'
import { getDataAdapter } from '@/infrastructure/adapters'
import { toast } from '@/shared/hooks/use-toast'
import type { CreateTaskSyncLog, TaskSyncLog } from '@/shared/types/task-sync'
import {
  describeSaveFailure,
  isConflictError,
  isStorageQuotaError,
} from './persistence-error'

/**
 * 外部完了同期ログ（非公開の設計文書）のストア。
 * 追記専用（actuals-storeの取込履歴と同じパターン）。完了状態そのものは
 * projects-store（completed/completedAt/externalSource/externalTaskId）が受け皿。
 */
interface TaskSyncState {
  taskSyncLogs: TaskSyncLog[]

  loadTaskSyncLogs: () => void

  /** 同期ログを追記する（追記専用。更新・削除アクションは設けない） */
  addTaskSyncLog: (data: CreateTaskSyncLog) => TaskSyncLog
}

function notifyPersistenceFailure(action: string, error: unknown) {
  toast({
    // 楽観ロックの競合（412）は障害ではなく並行編集の結果なので、
    // 「失敗」ではなく再読込を促す文言にする
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `完了同期ログの${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

export const useTaskSyncStore = create<TaskSyncState>()((set, get) => ({
  taskSyncLogs: [],

  loadTaskSyncLogs: () => {
    getDataAdapter()
      .list('taskSyncLogs')
      .then((taskSyncLogs) => set({ taskSyncLogs }))
      .catch((error: unknown) => notifyPersistenceFailure('読み込み', error))
  },

  addTaskSyncLog: (data) => {
    const previous = get().taskSyncLogs
    const id = crypto.randomUUID()
    const record: TaskSyncLog = { ...data, id }
    set({ taskSyncLogs: [...previous, record] })
    getDataAdapter()
      .create('taskSyncLogs', data, { id })
      .then((created) => {
        set((state) => ({
          taskSyncLogs: state.taskSyncLogs.map((l) =>
            l.id === id ? created : l,
          ),
        }))
      })
      .catch((error: unknown) => {
        set((state) => ({
          taskSyncLogs: state.taskSyncLogs.filter((l) => l.id !== id),
        }))
        notifyPersistenceFailure('記録', error)
      })
    return record
  },
}))
