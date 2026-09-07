import { create } from 'zustand'
import { getDataAdapter } from '@/infrastructure/adapters'
import { toast } from '@/shared/hooks/use-toast'
import type {
  BillingMilestone,
  BillingMilestoneStatus,
  CreateBillingMilestone,
} from '@/shared/types'
import {
  describeSaveFailure,
  isConflictError,
  isForbiddenError,
  isStorageQuotaError,
} from './persistence-error'

interface BillingMilestoneState {
  billingMilestones: BillingMilestone[]

  // Actions
  loadBillingMilestones: () => void
  addBillingMilestone: (input: CreateBillingMilestone) => void
  updateBillingMilestoneStatus: (
    id: string,
    status: BillingMilestoneStatus,
  ) => void
  deleteBillingMilestone: (id: string) => void

  // Selectors
  getByProject: (projectId: string) => BillingMilestone[]
}

function notifyPersistenceFailure(action: string, error: unknown) {
  toast({
    // 楽観ロックの競合（412）は障害ではなく並行編集の結果なので、
    // 「失敗」ではなく再読込を促す文言にする
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `請求マイルストンの${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

export const useBillingMilestoneStore = create<BillingMilestoneState>()(
  (set, get) => ({
    billingMilestones: [],

    loadBillingMilestones: () => {
      getDataAdapter()
        .list('billingMilestones')
        .then((billingMilestones) => set({ billingMilestones }))
        .catch((error: unknown) => {
          // 権限が無いだけの読み込み失敗は通知しない
          if (isForbiddenError(error)) return
          notifyPersistenceFailure('読み込み', error)
        })
    },

    // 楽観的更新（docs/project.md「17ストアのDataAdapter配線」参照）
    addBillingMilestone: (input) => {
      const previous = get().billingMilestones
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const created: BillingMilestone = {
        ...input,
        id,
        createdAt: now,
        updatedAt: now,
      }
      set({ billingMilestones: [...previous, created] })

      const { id: _omitted, ...createInput } = created
      getDataAdapter()
        .create('billingMilestones', createInput, { id })
        .then((persisted) => {
          set((state) => ({
            billingMilestones: state.billingMilestones.map((m) =>
              m.id === id ? persisted : m,
            ),
          }))
        })
        .catch((error: unknown) => {
          set((state) => ({
            billingMilestones: state.billingMilestones.filter(
              (m) => m.id !== id,
            ),
          }))
          notifyPersistenceFailure('追加', error)
        })
    },

    updateBillingMilestoneStatus: (id, status) => {
      const previous = get().billingMilestones
      const target = previous.find((m) => m.id === id)
      if (!target || target.status === status) return

      const now = new Date().toISOString()
      set({
        billingMilestones: previous.map((m) =>
          m.id === id ? { ...m, status, updatedAt: now } : m,
        ),
      })
      getDataAdapter()
        .update(
          'billingMilestones',
          id,
          { status, updatedAt: now },
          // 楽観ロック
          { expectedUpdatedAt: target.updatedAt },
        )
        .then((saved) => {
          // サーバーが確定した行（特にサーバー時計のupdatedAt）をローカルへ反映する。
          // 反映しないと次回の楽観ロック期待値がクライアント時計のまま残り、
          // 単独ユーザーでも2回目の更新が必ず412になる
          set((state) => ({
            billingMilestones: state.billingMilestones.map((x) =>
              x.id === id ? saved : x,
            ),
          }))
        })
        .catch((error: unknown) => {
          set({ billingMilestones: previous })
          notifyPersistenceFailure('更新', error)
        })
    },

    deleteBillingMilestone: (id) => {
      const previous = get().billingMilestones
      if (!previous.some((m) => m.id === id)) return
      set({ billingMilestones: previous.filter((m) => m.id !== id) })
      getDataAdapter()
        .remove('billingMilestones', id)
        .catch((error: unknown) => {
          set({ billingMilestones: previous })
          notifyPersistenceFailure('削除', error)
        })
    },

    getByProject: (projectId) =>
      get()
        .billingMilestones.filter((m) => m.projectId === projectId)
        .sort((a, b) =>
          a.plannedAcceptanceDate < b.plannedAcceptanceDate ? -1 : 1,
        ),
  }),
)
