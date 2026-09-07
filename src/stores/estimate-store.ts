import { create } from 'zustand'
import { getDataAdapter } from '@/infrastructure/adapters'
import { toast } from '@/shared/hooks/use-toast'
import type {
  EstimateBasis,
  EstimateFpDetail,
  EstimateMethod,
  EstimateSnapshot,
  EstimateStage,
  EstimateWbsDetail,
} from '@/shared/types'
import { CreateEstimateSnapshotSchema } from '@/shared/types/estimate-snapshot'
import {
  getLatestSnapshot,
  getSnapshotsForProject,
} from '@/shared/utils/estimate-snapshot-utils'
import {
  describeSaveFailure,
  isConflictError,
  isForbiddenError,
  isStorageQuotaError,
} from './persistence-error'

export interface RecordEstimateInput {
  projectId: string
  stage: EstimateStage
  method: EstimateMethod
  label: string
  /** 人日（小数2桁に丸め済みの値を渡す） */
  effortDays: number
  /** 万円（整数） */
  amount: number
  /** 記録時点の設定値（後で設定を変えても履歴が動かないよう凍結する） */
  basis: EstimateBasis
  fp?: EstimateFpDetail
  wbs?: EstimateWbsDetail
  changeRequestId?: string | null
  note?: string
  /** 記録日時。省略時は現在 */
  takenAt?: string
}

interface EstimateState {
  estimateSnapshots: EstimateSnapshot[]

  // Actions
  loadEstimateSnapshots: () => void
  /**
   * 見積を新しい版として追記する（versionは案件内の最大値+1で自動採番）。
   * 方法と根拠の整合（FP法にFP項目が要る等）はZodで検証し、通らなければ
   * 何も書かずにnullを返す（楽観的に追加してから静かに戻る、を避ける）
   */
  recordEstimate: (input: RecordEstimateInput) => EstimateSnapshot | null
  /**
   * 誤って記録した**最新版のみ**を取り消す。途中の版を消すと連番と差分が壊れるため
   * 過去の版は取り消せない（`revokeLatestBaseline`と同じ整理）
   */
  revokeLatestEstimate: (projectId: string) => void

  // Selectors
  /** 版の履歴（version昇順） */
  getEstimateHistory: (projectId: string) => EstimateSnapshot[]
  /** 最新版。1件も無ければundefined */
  getLatestEstimate: (projectId: string) => EstimateSnapshot | undefined
}

function notifyPersistenceFailure(action: string, error: unknown) {
  toast({
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `見積の${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

export const useEstimateStore = create<EstimateState>()((set, get) => ({
  estimateSnapshots: [],

  loadEstimateSnapshots: () => {
    getDataAdapter()
      .list('estimateSnapshots')
      .then((estimateSnapshots) => set({ estimateSnapshots }))
      .catch((error: unknown) => {
        // 権限が無いだけの読み込み失敗（partnerの403）は通知しない
        if (isForbiddenError(error)) return
        notifyPersistenceFailure('読み込み', error)
      })
  },

  // 楽観的更新（docs/project.md「17ストアのDataAdapter配線」参照）。
  // クライアント生成idをDataAdapter.create()のoptions.idへ渡し、確定後もidを固定する
  recordEstimate: (input) => {
    const previous = get().estimateSnapshots
    const maxVersion = previous
      .filter((s) => s.projectId === input.projectId)
      .reduce((max, s) => Math.max(max, s.version), 0)
    const now = new Date().toISOString()
    const createInput = {
      projectId: input.projectId,
      version: maxVersion + 1,
      stage: input.stage,
      method: input.method,
      label: input.label,
      takenAt: input.takenAt ?? now,
      effortDays: input.effortDays,
      amount: input.amount,
      basis: input.basis,
      fp: input.fp,
      wbs: input.wbs,
      changeRequestId: input.changeRequestId ?? null,
      note: input.note,
      // postgresモードはサーバーがreq.userからスタンプする（クライアント申告は採用しない）
      authorName: null,
      createdAt: now,
    }
    const parsed = CreateEstimateSnapshotSchema.safeParse(createInput)
    if (!parsed.success) {
      toast({
        title: '見積を記録できません',
        description: parsed.error.issues[0]?.message,
        variant: 'destructive',
      })
      return null
    }

    const id = crypto.randomUUID()
    const created: EstimateSnapshot = { id, ...parsed.data }
    set({ estimateSnapshots: [...previous, created] })

    getDataAdapter()
      .create('estimateSnapshots', parsed.data, { id })
      .then((persisted) => {
        set((state) => ({
          estimateSnapshots: state.estimateSnapshots.map((s) =>
            s.id === id ? persisted : s,
          ),
        }))
      })
      .catch((error: unknown) => {
        set((state) => ({
          estimateSnapshots: state.estimateSnapshots.filter((s) => s.id !== id),
        }))
        notifyPersistenceFailure('記録', error)
      })
    return created
  },

  revokeLatestEstimate: (projectId) => {
    const previous = get().estimateSnapshots
    const latest = getLatestSnapshot(previous, projectId)
    if (!latest) return

    set({ estimateSnapshots: previous.filter((s) => s.id !== latest.id) })
    getDataAdapter()
      .remove('estimateSnapshots', latest.id)
      .catch((error: unknown) => {
        set({ estimateSnapshots: previous })
        notifyPersistenceFailure('取り消し', error)
      })
  },

  getEstimateHistory: (projectId) =>
    getSnapshotsForProject(get().estimateSnapshots, projectId),

  getLatestEstimate: (projectId) =>
    getLatestSnapshot(get().estimateSnapshots, projectId) ?? undefined,
}))
