import { create } from 'zustand'
import { getDataAdapter } from '@/infrastructure/adapters'
import { toast } from '@/shared/hooks/use-toast'
import type {
  CreateRiskEntry,
  RiskEntry,
  UpdateRiskEntry,
} from '@/shared/types'
import {
  describeSaveFailure,
  isConflictError,
  isForbiddenError,
  isStorageQuotaError,
} from './persistence-error'

/**
 * リスク登録簿（非公開の設計文書）。
 *
 * 案件単位のリスク（確率×影響の3段階評価・対応方針・オーナー・期限）のCRUD。
 * 追記専用にはしない（評価の見直し・状態遷移が本質。変更履歴はpostgresモードの
 * 監査証跡が拾う）。楽観的更新＋クライアント生成id＋失敗ロールバックの既存パターン。
 *
 * 案件削除時のカスケードはサーバーFK（ON DELETE CASCADE）に委譲する。localモードで
 * 残る参照は弱参照として扱い、利用側（サマリー・アラート等）が案件解決できない行を
 * スキップする（assignments等の既存エンティティと同じ整理）。
 */

interface RiskState {
  riskEntries: RiskEntry[]

  loadRiskEntries: () => void
  addRiskEntry: (
    input: Omit<CreateRiskEntry, 'status'> & { status?: RiskEntry['status'] },
  ) => void
  updateRiskEntry: (input: UpdateRiskEntry) => void
  deleteRiskEntry: (id: string) => void

  getRisksForProject: (projectId: string) => RiskEntry[]
}

function notifyFailure(action: string, error: unknown) {
  // 読み取りの403は「このロールには見えないデータ」として通知しない
  if (isForbiddenError(error)) return
  toast({
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `リスクの${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

export const useRiskStore = create<RiskState>()((set, get) => ({
  riskEntries: [],

  loadRiskEntries: () => {
    getDataAdapter()
      .list('riskEntries')
      .then((riskEntries) => set({ riskEntries }))
      .catch((error: unknown) => {
        if (!isForbiddenError(error)) notifyFailure('読み込み', error)
      })
  },

  addRiskEntry: (input) => {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const optimistic: RiskEntry = {
      status: 'open',
      ...input,
      id,
      createdAt: now,
      updatedAt: now,
    }
    set((state) => ({ riskEntries: [...state.riskEntries, optimistic] }))

    const { id: _id, ...createData } = optimistic
    getDataAdapter()
      .create('riskEntries', createData, { id })
      .then((created) => {
        set((state) => ({
          riskEntries: state.riskEntries.map((r) =>
            r.id === id ? created : r,
          ),
        }))
      })
      .catch((error: unknown) => {
        set((state) => ({
          riskEntries: state.riskEntries.filter((r) => r.id !== id),
        }))
        notifyFailure('追加', error)
      })
  },

  updateRiskEntry: (input) => {
    const previous = get().riskEntries
    const target = previous.find((r) => r.id === input.id)
    if (!target) return
    const expectedUpdatedAt = target.updatedAt
    const now = new Date().toISOString()
    const { id, ...patch } = input
    set((state) => ({
      riskEntries: state.riskEntries.map((r) =>
        r.id === id ? { ...r, ...patch, updatedAt: now } : r,
      ),
    }))

    getDataAdapter()
      .update(
        'riskEntries',
        id,
        { ...patch, updatedAt: now },
        { expectedUpdatedAt },
      )
      .then((saved) => {
        // サーバー確定行（サーバー時計のupdatedAt）を反映する。
        // 反映しないと次回の楽観ロック期待値が古いままで412になる
        set((state) => ({
          riskEntries: state.riskEntries.map((r) => (r.id === id ? saved : r)),
        }))
      })
      .catch((error: unknown) => {
        set({ riskEntries: previous })
        notifyFailure('更新', error)
      })
  },

  deleteRiskEntry: (id) => {
    const previous = get().riskEntries
    set((state) => ({
      riskEntries: state.riskEntries.filter((r) => r.id !== id),
    }))
    getDataAdapter()
      .remove('riskEntries', id)
      .catch((error: unknown) => {
        set({ riskEntries: previous })
        notifyFailure('削除', error)
      })
  },

  getRisksForProject: (projectId) =>
    get().riskEntries.filter((r) => r.projectId === projectId),
}))
