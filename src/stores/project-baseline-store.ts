import { create } from 'zustand'
import { getDataAdapter } from '@/infrastructure/adapters'
import { toast } from '@/shared/hooks/use-toast'
import type { ProjectBaseline } from '@/shared/types'
import type { BaselineSnapshot } from '@/shared/utils/evm-utils'
import { formatDateOnly } from '@/shared/utils/iso-week-utils'
import {
  describeSaveFailure,
  isConflictError,
  isForbiddenError,
  isStorageQuotaError,
} from './persistence-error'

export interface FreezeBaselineInput {
  projectId: string
  /** 凍結理由（"当初計画" / "CR#1 追加開発分" 等） */
  reason: string
  /** 凍結時点のBAC（万円） */
  bacAmount: number
  /** 現在のアサイン計画から構築したスナップショット（`buildBaselineSnapshot`の戻り値） */
  snapshot: BaselineSnapshot
  /** 凍結日。省略時は当日 */
  approvedAt?: string
}

interface ProjectBaselineState {
  projectBaselines: ProjectBaseline[]

  // Actions
  loadProjectBaselines: () => void
  /**
   * 現在のアサイン計画を凍結して新しい版を追記する（再ベースライン）。
   * versionは案件内の最大値+1で自動採番する。
   */
  freezeBaseline: (input: FreezeBaselineInput) => void
  /**
   * 誤って凍結した**最新版のみ**を取り消す（削除する）。過去の版は取り消せない
   * （履歴の中抜きを許すと「当時のPVがどの版で引かれていたか」を再現できなくなるため）。
   * v1まで取り消すと未凍結状態へ戻る。非公開の設計文書-1 の決着
   */
  revokeLatestBaseline: (projectId: string) => void

  // Selectors
  /** 有効なベースライン（案件内で最大のversion）。1件も無ければundefined */
  getActiveBaseline: (projectId: string) => ProjectBaseline | undefined
  /** 版の履歴（version昇順） */
  getBaselineHistory: (projectId: string) => ProjectBaseline[]
}

function notifyPersistenceFailure(action: string, error: unknown) {
  toast({
    // 楽観ロックの競合（412）は障害ではなく並行編集の結果なので、
    // 「失敗」ではなく再読込を促す文言にする
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `ベースラインの${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

export const useProjectBaselineStore = create<ProjectBaselineState>()(
  (set, get) => ({
    projectBaselines: [],

    loadProjectBaselines: () => {
      getDataAdapter()
        .list('projectBaselines')
        .then((projectBaselines) => set({ projectBaselines }))
        .catch((error: unknown) => {
          // 権限が無いだけの読み込み失敗は通知しない
          if (isForbiddenError(error)) return
          notifyPersistenceFailure('読み込み', error)
        })
    },

    // 楽観的更新（docs/project.md「17ストアのDataAdapter配線」参照）。
    // クライアント生成idをDataAdapter.create()のoptions.idへ渡し、確定後もidを固定する
    freezeBaseline: ({
      projectId,
      reason,
      bacAmount,
      snapshot,
      approvedAt,
    }) => {
      const previous = get().projectBaselines
      const maxVersion = previous
        .filter((b) => b.projectId === projectId)
        .reduce((max, b) => Math.max(max, b.version), 0)
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const created: ProjectBaseline = {
        id,
        projectId,
        version: maxVersion + 1,
        approvedAt: approvedAt ?? formatDateOnly(new Date()),
        reason,
        bacAmount,
        monthlyPlannedCost: snapshot.monthlyPlannedCost,
        plannedAllocations: snapshot.plannedAllocations,
        createdAt: now,
      }
      set({ projectBaselines: [...previous, created] })

      const { id: _omitted, ...createInput } = created
      getDataAdapter()
        .create('projectBaselines', createInput, { id })
        .then((persisted) => {
          set((state) => ({
            projectBaselines: state.projectBaselines.map((b) =>
              b.id === id ? persisted : b,
            ),
          }))
        })
        .catch((error: unknown) => {
          set((state) => ({
            projectBaselines: state.projectBaselines.filter((b) => b.id !== id),
          }))
          notifyPersistenceFailure('作成', error)
        })
    },

    revokeLatestBaseline: (projectId) => {
      const previous = get().projectBaselines
      let latest: ProjectBaseline | undefined
      for (const baseline of previous) {
        if (baseline.projectId !== projectId) continue
        if (!latest || baseline.version > latest.version) latest = baseline
      }
      if (!latest) return

      const target = latest
      set({
        projectBaselines: previous.filter((b) => b.id !== target.id),
      })
      getDataAdapter()
        .remove('projectBaselines', target.id)
        .catch((error: unknown) => {
          set({ projectBaselines: previous })
          notifyPersistenceFailure('取り消し', error)
        })
    },

    getActiveBaseline: (projectId) => {
      let active: ProjectBaseline | undefined
      for (const baseline of get().projectBaselines) {
        if (baseline.projectId !== projectId) continue
        if (!active || baseline.version > active.version) active = baseline
      }
      return active
    },

    getBaselineHistory: (projectId) =>
      get()
        .projectBaselines.filter((b) => b.projectId === projectId)
        .sort((a, b) => a.version - b.version),
  }),
)
