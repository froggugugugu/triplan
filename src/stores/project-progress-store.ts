import { create } from 'zustand'
import { getDataAdapter } from '@/infrastructure/adapters'
import { toast } from '@/shared/hooks/use-toast'
import type { ProjectProgressEntry } from '@/shared/types'
import {
  describeSaveFailure,
  isConflictError,
  isStorageQuotaError,
} from './persistence-error'

interface ProjectProgressState {
  projectProgressEntries: ProjectProgressEntry[]

  // Actions
  loadProjectProgress: () => void
  // 案件×週の進捗率をupsert（既存レコードが無ければ新規作成、あれば該当週のみ上書き）
  setWeeklyProgress: (
    projectId: string,
    weekKey: string,
    progressRate: number,
  ) => void

  // Selectors
  getProjectProgressEntry: (
    projectId: string,
  ) => ProjectProgressEntry | undefined
}

function notifyPersistenceFailure(action: string, error: unknown) {
  toast({
    // 楽観ロックの競合（412）は障害ではなく並行編集の結果なので、
    // 「失敗」ではなく再読込を促す文言にする
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `進捗の${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

export const useProjectProgressStore = create<ProjectProgressState>()(
  (set, get) => ({
    projectProgressEntries: [],

    loadProjectProgress: () => {
      getDataAdapter()
        .list('projectProgressEntries')
        .then((projectProgressEntries) => set({ projectProgressEntries }))
        .catch((error: unknown) => notifyPersistenceFailure('読み込み', error))
    },

    // 楽観的更新（docs/project.md「17ストアのDataAdapter配線」参照）。新規作成時は
    // クライアント生成idをDataAdapter.create()のoptions.idで確定id同様に固定する。
    // ⚠️既知の限定的なリスク: 同一案件へ極めて短時間（同一イベントループtick）に
    // 連続でsetWeeklyProgressが呼ばれると、1回目のcreate()がサーバーへ未到達のうちに
    // 2回目のupdate()が発火し、postgresモードで404になりうる（ローカルモードは
    // DataAdapter内部が同期実行のため発生しない）。唯一の呼び出し元EvmPanel.tsxは
    // 1回の送信で1週分のみ入力するフォームのため、実運用上は発生しない想定
    setWeeklyProgress: (projectId, weekKey, progressRate) => {
      const previous = get().projectProgressEntries
      const existing = previous.find((e) => e.projectId === projectId)
      const now = new Date().toISOString()

      if (existing) {
        const weeklyProgress = {
          ...existing.weeklyProgress,
          [weekKey]: progressRate,
        }
        set({
          projectProgressEntries: previous.map((e) =>
            e.projectId === projectId
              ? { ...e, weeklyProgress, updatedAt: now }
              : e,
          ),
        })
        getDataAdapter()
          .update(
            'projectProgressEntries',
            existing.id,
            { weeklyProgress, updatedAt: now },
            // 楽観ロック
            { expectedUpdatedAt: existing.updatedAt },
          )
          .then((saved) => {
            // サーバーが確定した行（特にサーバー時計のupdatedAt）をローカルへ反映する。
            // 反映しないと次回の楽観ロック期待値がクライアント時計のまま残り、
            // 単独ユーザーでも2回目の更新が必ず412になる
            set((state) => ({
              projectProgressEntries: state.projectProgressEntries.map((x) =>
                x.id === existing.id ? saved : x,
              ),
            }))
          })
          .catch((error: unknown) => {
            set({ projectProgressEntries: previous })
            notifyPersistenceFailure('更新', error)
          })
      } else {
        const id = crypto.randomUUID()
        const newEntry: ProjectProgressEntry = {
          id,
          projectId,
          weeklyProgress: { [weekKey]: progressRate },
          createdAt: now,
          updatedAt: now,
        }
        set({ projectProgressEntries: [...previous, newEntry] })
        getDataAdapter()
          .create(
            'projectProgressEntries',
            {
              projectId,
              weeklyProgress: newEntry.weeklyProgress,
              createdAt: now,
              updatedAt: now,
            },
            { id },
          )
          .then((created) => {
            set((state) => ({
              projectProgressEntries: state.projectProgressEntries.map((e) =>
                e.id === id ? created : e,
              ),
            }))
          })
          .catch((error: unknown) => {
            set((state) => ({
              projectProgressEntries: state.projectProgressEntries.filter(
                (e) => e.id !== id,
              ),
            }))
            notifyPersistenceFailure('追加', error)
          })
      }
    },

    getProjectProgressEntry: (projectId) => {
      return get().projectProgressEntries.find((e) => e.projectId === projectId)
    },
  }),
)
