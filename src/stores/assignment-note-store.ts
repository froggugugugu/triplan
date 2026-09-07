import { create } from 'zustand'
import { getDataAdapter } from '@/infrastructure/adapters'
import { toast } from '@/shared/hooks/use-toast'
import type { AssignmentNote, AssignmentSnapshot } from '@/shared/types'
import type {
  SnapshotEntry,
  SnapshotSourceAssignment,
} from '@/shared/utils/assignment-snapshot-utils'
import { buildAssignmentSnapshotEntries } from '@/shared/utils/assignment-snapshot-utils'
import {
  describeSaveFailure,
  isConflictError,
  isForbiddenError,
  isStorageQuotaError,
} from './persistence-error'

/**
 * 体制メモ（案件単位の申し送り）とアサインスナップショット（体制の記録）を扱う
 * 。どちらも「アサイン表の周辺情報」で、参照する画面が同じ
 * （`/assignment`）ため1ストアにまとめる。
 *
 * スナップショットは**追記専用**（更新アクションを持たない）。記録が後から
 * 書き換わっては比較の基準にならないため。取り違えた記録の削除だけは許す。
 */

interface AssignmentNoteState {
  assignmentNotes: AssignmentNote[]
  assignmentSnapshots: AssignmentSnapshot[]

  loadAssignmentNotes: () => void

  addNote: (projectId: string, body: string) => void
  updateNote: (id: string, body: string) => void
  deleteNote: (id: string) => void

  /** 現在のアサインから記録を取る。entriesは呼び出し側で組まず、ここで構築する */
  takeSnapshot: (input: {
    projectId: string
    label: string
    assignments: readonly SnapshotSourceAssignment[]
  }) => void
  deleteSnapshot: (id: string) => void

  // Selectors
  getNotesForProject: (projectId: string) => AssignmentNote[]
  getSnapshotsForProject: (projectId: string) => AssignmentSnapshot[]
}

function notifyFailure(action: string, error: unknown) {
  // 読み取りの403は「このロールには見えないデータ」として通知しない
  if (isForbiddenError(error)) return
  toast({
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `体制メモの${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

export const useAssignmentNoteStore = create<AssignmentNoteState>()(
  (set, get) => ({
    assignmentNotes: [],
    assignmentSnapshots: [],

    loadAssignmentNotes: () => {
      const adapter = getDataAdapter()
      adapter
        .list('assignmentNotes')
        .then((assignmentNotes) => set({ assignmentNotes }))
        .catch((error: unknown) => {
          if (!isForbiddenError(error)) notifyFailure('読み込み', error)
        })
      adapter
        .list('assignmentSnapshots')
        .then((assignmentSnapshots) => set({ assignmentSnapshots }))
        .catch((error: unknown) => {
          if (!isForbiddenError(error)) notifyFailure('読み込み', error)
        })
    },

    addNote: (projectId, body) => {
      const now = new Date().toISOString()
      const id = crypto.randomUUID()
      const optimistic: AssignmentNote = {
        id,
        projectId,
        body,
        // 投稿者名はサーバーが確定する（postgresモード）。localモードはnullのまま
        authorName: null,
        createdAt: now,
        updatedAt: now,
      }
      set((state) => ({
        assignmentNotes: [...state.assignmentNotes, optimistic],
      }))

      getDataAdapter()
        .create(
          'assignmentNotes',
          { projectId, body, authorName: null, createdAt: now, updatedAt: now },
          { id },
        )
        .then((created) => {
          set((state) => ({
            assignmentNotes: state.assignmentNotes.map((n) =>
              n.id === id ? created : n,
            ),
          }))
        })
        .catch((error: unknown) => {
          set((state) => ({
            assignmentNotes: state.assignmentNotes.filter((n) => n.id !== id),
          }))
          notifyFailure('追加', error)
        })
    },

    updateNote: (id, body) => {
      const previous = get().assignmentNotes
      const expectedUpdatedAt = previous.find((n) => n.id === id)?.updatedAt
      const now = new Date().toISOString()
      set((state) => ({
        assignmentNotes: state.assignmentNotes.map((n) =>
          n.id === id ? { ...n, body, updatedAt: now } : n,
        ),
      }))

      getDataAdapter()
        .update(
          'assignmentNotes',
          id,
          { body, updatedAt: now },
          { expectedUpdatedAt },
        )
        .then((saved) => {
          // サーバー確定行（サーバー時計のupdatedAt）を反映する。
          // 反映しないと次回の楽観ロック期待値が古いままで412になる
          set((state) => ({
            assignmentNotes: state.assignmentNotes.map((n) =>
              n.id === id ? saved : n,
            ),
          }))
        })
        .catch((error: unknown) => {
          set({ assignmentNotes: previous })
          notifyFailure('更新', error)
        })
    },

    deleteNote: (id) => {
      const previous = get().assignmentNotes
      set((state) => ({
        assignmentNotes: state.assignmentNotes.filter((n) => n.id !== id),
      }))
      getDataAdapter()
        .remove('assignmentNotes', id)
        .catch((error: unknown) => {
          set({ assignmentNotes: previous })
          notifyFailure('削除', error)
        })
    },

    takeSnapshot: ({ projectId, label, assignments }) => {
      const now = new Date().toISOString()
      const id = crypto.randomUUID()
      const entries: SnapshotEntry[] = buildAssignmentSnapshotEntries(
        assignments,
        projectId,
      )
      const optimistic: AssignmentSnapshot = {
        id,
        projectId,
        label,
        takenAt: now,
        entries,
        authorName: null,
        createdAt: now,
      }
      set((state) => ({
        assignmentSnapshots: [...state.assignmentSnapshots, optimistic],
      }))

      getDataAdapter()
        .create(
          'assignmentSnapshots',
          {
            projectId,
            label,
            takenAt: now,
            entries,
            authorName: null,
            createdAt: now,
          },
          { id },
        )
        .then((created) => {
          set((state) => ({
            assignmentSnapshots: state.assignmentSnapshots.map((s) =>
              s.id === id ? created : s,
            ),
          }))
        })
        .catch((error: unknown) => {
          set((state) => ({
            assignmentSnapshots: state.assignmentSnapshots.filter(
              (s) => s.id !== id,
            ),
          }))
          notifyFailure('スナップショットの保存', error)
        })
    },

    deleteSnapshot: (id) => {
      const previous = get().assignmentSnapshots
      set((state) => ({
        assignmentSnapshots: state.assignmentSnapshots.filter(
          (s) => s.id !== id,
        ),
      }))
      getDataAdapter()
        .remove('assignmentSnapshots', id)
        .catch((error: unknown) => {
          set({ assignmentSnapshots: previous })
          notifyFailure('スナップショットの削除', error)
        })
    },

    getNotesForProject: (projectId) =>
      get()
        .assignmentNotes.filter((n) => n.projectId === projectId)
        // 新しい申し送りほど上（申し送りは直近が重要）
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),

    getSnapshotsForProject: (projectId) =>
      get()
        .assignmentSnapshots.filter((s) => s.projectId === projectId)
        .sort((a, b) => b.takenAt.localeCompare(a.takenAt)),
  }),
)
