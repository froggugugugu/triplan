import { create } from 'zustand'
import { getDataAdapter } from '@/infrastructure/adapters'
import { toast } from '@/shared/hooks/use-toast'
import type { ChangeRequest, CreateChangeRequest } from '@/shared/types'
import { formatDateOnly } from '@/shared/utils/iso-week-utils'
import { useProjectsStore } from '@/stores/projects-store'
import {
  describeSaveFailure,
  isConflictError,
  isForbiddenError,
  isStorageQuotaError,
} from './persistence-error'

export type AddChangeRequestInput = Omit<
  CreateChangeRequest,
  'status' | 'decidedAt'
>

interface ChangeRequestState {
  changeRequests: ChangeRequest[]

  // Actions
  loadChangeRequests: () => void
  /** pending状態で新規追加する */
  addChangeRequest: (input: AddChangeRequestInput) => void
  /**
   * 承認する。受注額差分（`contractAmountDelta`）と新納期（`newDueDate`）を
   * 対象Projectの`contractAmount`/`masterDueDate`へ自動反映する。
   * 工数差分（`effortDeltaDays`）はWBSのどのタスクへ積むか自動で決められないため
   * 反映しない（WBS更新→ベースライン再凍結をUI側で促す）。
   */
  approveChangeRequest: (id: string) => void
  /** 却下する（Projectへは何も反映しない） */
  rejectChangeRequest: (id: string) => void
  /** 削除する。pendingのみ削除可（承認/却下済みは記録として残す） */
  deleteChangeRequest: (id: string) => void

  // Selectors
  getByProject: (projectId: string) => ChangeRequest[]
}

function notifyPersistenceFailure(action: string, error: unknown) {
  toast({
    // 楽観ロックの競合（412）は障害ではなく並行編集の結果なので、
    // 「失敗」ではなく再読込を促す文言にする
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `変更管理の${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

/** 承認された変更内容をProjectへ反映する（受注額・マスター納期のみ） */
function applyApprovedChangeToProject(changeRequest: ChangeRequest) {
  const project = useProjectsStore
    .getState()
    .projects.find((p) => p.id === changeRequest.projectId)
  if (!project) return

  const updates: {
    id: string
    contractAmount?: number | null
    masterDueDate?: string | null
  } = { id: project.id }
  let changed = false

  if (changeRequest.contractAmountDelta > 0) {
    const current = project.contractAmount ?? 0
    const signedDelta =
      changeRequest.contractAmountDeltaType === 'decrease'
        ? -changeRequest.contractAmountDelta
        : changeRequest.contractAmountDelta
    updates.contractAmount = Math.max(0, current + signedDelta)
    changed = true
  }
  if (changeRequest.newDueDate) {
    updates.masterDueDate = changeRequest.newDueDate
    changed = true
  }
  if (changed) {
    useProjectsStore.getState().updateProject(updates)
  }
}

export const useChangeRequestStore = create<ChangeRequestState>()(
  (set, get) => ({
    changeRequests: [],

    loadChangeRequests: () => {
      getDataAdapter()
        .list('changeRequests')
        .then((changeRequests) => set({ changeRequests }))
        .catch((error: unknown) => {
          // 権限が無いだけの読み込み失敗は通知しない
          if (isForbiddenError(error)) return
          notifyPersistenceFailure('読み込み', error)
        })
    },

    // 楽観的更新（docs/project.md「17ストアのDataAdapter配線」参照）
    addChangeRequest: (input) => {
      const previous = get().changeRequests
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const created: ChangeRequest = {
        ...input,
        id,
        status: 'pending',
        decidedAt: null,
        createdAt: now,
        updatedAt: now,
      }
      set({ changeRequests: [...previous, created] })

      const { id: _omitted, ...createInput } = created
      getDataAdapter()
        .create('changeRequests', createInput, { id })
        .then((persisted) => {
          set((state) => ({
            changeRequests: state.changeRequests.map((c) =>
              c.id === id ? persisted : c,
            ),
          }))
        })
        .catch((error: unknown) => {
          set((state) => ({
            changeRequests: state.changeRequests.filter((c) => c.id !== id),
          }))
          notifyPersistenceFailure('追加', error)
        })
    },

    approveChangeRequest: (id) => {
      const previous = get().changeRequests
      const target = previous.find((c) => c.id === id)
      if (!target || target.status !== 'pending') return

      const now = new Date().toISOString()
      const decidedAt = formatDateOnly(new Date())
      const approved: ChangeRequest = {
        ...target,
        status: 'approved',
        decidedAt,
        updatedAt: now,
      }
      set({
        changeRequests: previous.map((c) => (c.id === id ? approved : c)),
      })
      getDataAdapter()
        .update(
          'changeRequests',
          id,
          { status: 'approved', decidedAt, updatedAt: now },
          // 楽観ロック: 他者が先に承認/却下していれば412で止まる
          // （受注額・納期をProjectへ自動反映するため二重適用が特に危険）
          { expectedUpdatedAt: target.updatedAt },
        )
        .then((saved) => {
          // サーバーが確定した行（特にサーバー時計のupdatedAt）をローカルへ反映する。
          // 反映しないと次回の楽観ロック期待値がクライアント時計のまま残り、
          // 単独ユーザーでも2回目の更新が必ず412になる
          set((state) => ({
            changeRequests: state.changeRequests.map((x) =>
              x.id === id ? saved : x,
            ),
          }))
        })
        .catch((error: unknown) => {
          set({ changeRequests: previous })
          notifyPersistenceFailure('承認', error)
        })

      // Projectへの反映は承認の確定を待たず楽観的に行う（失敗時はCR側がロールバックされ、
      // Project側の更新はprojects-store自身のロールバック機構が守る）
      applyApprovedChangeToProject(approved)
    },

    rejectChangeRequest: (id) => {
      const previous = get().changeRequests
      const target = previous.find((c) => c.id === id)
      if (!target || target.status !== 'pending') return

      const now = new Date().toISOString()
      const decidedAt = formatDateOnly(new Date())
      set({
        changeRequests: previous.map((c) =>
          c.id === id
            ? { ...c, status: 'rejected', decidedAt, updatedAt: now }
            : c,
        ),
      })
      getDataAdapter()
        .update(
          'changeRequests',
          id,
          { status: 'rejected', decidedAt, updatedAt: now },
          // 楽観ロック: 他者が先に承認/却下していれば412で止まる
          { expectedUpdatedAt: previous.find((c) => c.id === id)?.updatedAt },
        )
        .then((saved) => {
          // サーバーが確定した行（特にサーバー時計のupdatedAt）をローカルへ反映する。
          // 反映しないと次回の楽観ロック期待値がクライアント時計のまま残り、
          // 単独ユーザーでも2回目の更新が必ず412になる
          set((state) => ({
            changeRequests: state.changeRequests.map((x) =>
              x.id === id ? saved : x,
            ),
          }))
        })
        .catch((error: unknown) => {
          set({ changeRequests: previous })
          notifyPersistenceFailure('却下', error)
        })
    },

    deleteChangeRequest: (id) => {
      const previous = get().changeRequests
      const target = previous.find((c) => c.id === id)
      // 承認/却下済みは「着地がなぜ動いたか」の記録なので削除させない
      if (!target || target.status !== 'pending') return

      set({ changeRequests: previous.filter((c) => c.id !== id) })
      getDataAdapter()
        .remove('changeRequests', id)
        .catch((error: unknown) => {
          set({ changeRequests: previous })
          notifyPersistenceFailure('削除', error)
        })
    },

    getByProject: (projectId) =>
      get()
        .changeRequests.filter((c) => c.projectId === projectId)
        .sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1)),
  }),
)
