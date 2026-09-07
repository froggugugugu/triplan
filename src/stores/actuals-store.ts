import { create } from 'zustand'
import { getDataAdapter } from '@/infrastructure/adapters'
import { toast } from '@/shared/hooks/use-toast'
import type {
  ActualsImportLog,
  CreateActualsImportLog,
  MonthlyActualsConfirmation,
  MonthlyCloseEvent,
} from '@/shared/types/actuals'
import {
  describeSaveFailure,
  isConflictError,
  isStorageQuotaError,
} from './persistence-error'

/**
 * 月次実績（P1-a）の周辺エンティティを扱うストア。
 * 実績値そのものは`assignment-store`の`actualMonthlyValues`が受け皿で、
 * ここでは確定マーク（全社×月・ソフトロック）とCSV取込履歴（追記専用）のみを管理する。
 */
interface ActualsState {
  monthlyActualsConfirmations: MonthlyActualsConfirmation[]
  actualsImportLogs: ActualsImportLog[]
  monthlyCloseEvents: MonthlyCloseEvent[]

  loadActualsData: () => void

  /**
   * 対象月を確定する（既に確定済みならconfirmedAtを更新＝再確定）。
   * マークのみで実績キーの一括書込みは行わない（DESIGN §4.3）
   */
  confirmMonth: (month: string) => void

  /** CSV取込履歴を追記する（追記専用。更新・削除アクションは設けない） */
  addImportLog: (data: CreateActualsImportLog) => ActualsImportLog

  getConfirmation: (month: string) => MonthlyActualsConfirmation | undefined

  /**
   * 対象月を締める（ハードロック、P1-b）。追記専用イベントとして記録し、
   * 締め状態は履歴から導出する。既に締め済みなら何もしない
   */
  closeMonth: (month: string, reason?: string | null) => void

  /** 締めを解除する（理由必須。空白のみは拒否）。締まっていなければ何もしない */
  reopenMonth: (month: string, reason: string) => void

  /** 対象月が締め済みか（月ごとの最新イベントがcloseか）を判定する */
  isMonthClosed: (month: string) => boolean

  /** 対象月の最新の締めイベント（表示用: 締め日時・実行者） */
  getLatestCloseEvent: (month: string) => MonthlyCloseEvent | undefined
}

/**
 * 月ごとの最新イベントを求める。occurredAt昇順の末尾（同時刻は配列順=追記順を
 * 保持する安定ソート）を現況とする。サーバー側の導出（ORDER BY occurred_at）と
 * 同じセマンティクス
 */
function latestEventFor(
  events: MonthlyCloseEvent[],
  month: string,
): MonthlyCloseEvent | undefined {
  return [...events]
    .filter((e) => e.month === month)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .at(-1)
}

function notifyPersistenceFailure(action: string, error: unknown) {
  toast({
    // 楽観ロックの競合（412）は障害ではなく並行編集の結果なので、
    // 「失敗」ではなく再読込を促す文言にする
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `月次実績の${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

export const useActualsStore = create<ActualsState>()((set, get) => ({
  monthlyActualsConfirmations: [],
  actualsImportLogs: [],
  monthlyCloseEvents: [],

  loadActualsData: () => {
    getDataAdapter()
      .list('monthlyActualsConfirmations')
      .then((monthlyActualsConfirmations) =>
        set({ monthlyActualsConfirmations }),
      )
      .catch((error: unknown) => notifyPersistenceFailure('読み込み', error))
    getDataAdapter()
      .list('actualsImportLogs')
      .then((actualsImportLogs) => set({ actualsImportLogs }))
      .catch((error: unknown) => notifyPersistenceFailure('読み込み', error))
    getDataAdapter()
      .list('monthlyCloseEvents')
      .then((monthlyCloseEvents) => set({ monthlyCloseEvents }))
      .catch((error: unknown) => notifyPersistenceFailure('読み込み', error))
  },

  confirmMonth: (month) => {
    // 締め済み月への確定・再確定は不可（締めが確定を包含する。DESIGN §3.1）
    if (get().isMonthClosed(month)) {
      toast({
        title: `${month}は締め済みのため確定できません`,
        variant: 'destructive',
      })
      return
    }
    const previous = get().monthlyActualsConfirmations
    const now = new Date().toISOString()
    const existing = previous.find((c) => c.month === month)

    if (existing) {
      set({
        monthlyActualsConfirmations: previous.map((c) =>
          c.id === existing.id ? { ...c, confirmedAt: now } : c,
        ),
      })
      getDataAdapter()
        .update('monthlyActualsConfirmations', existing.id, {
          confirmedAt: now,
        })
        .catch((error: unknown) => {
          set({ monthlyActualsConfirmations: previous })
          notifyPersistenceFailure('確定', error)
        })
      return
    }

    const id = crypto.randomUUID()
    const record: MonthlyActualsConfirmation = { id, month, confirmedAt: now }
    set({ monthlyActualsConfirmations: [...previous, record] })
    getDataAdapter()
      .create(
        'monthlyActualsConfirmations',
        { month, confirmedAt: now },
        { id },
      )
      .then((created) => {
        set((state) => ({
          monthlyActualsConfirmations: state.monthlyActualsConfirmations.map(
            (c) => (c.id === id ? created : c),
          ),
        }))
      })
      .catch((error: unknown) => {
        set((state) => ({
          monthlyActualsConfirmations: state.monthlyActualsConfirmations.filter(
            (c) => c.id !== id,
          ),
        }))
        notifyPersistenceFailure('確定', error)
      })
  },

  addImportLog: (data) => {
    const previous = get().actualsImportLogs
    const id = crypto.randomUUID()
    const record: ActualsImportLog = { ...data, id }
    set({ actualsImportLogs: [...previous, record] })
    getDataAdapter()
      .create('actualsImportLogs', data, { id })
      .then((created) => {
        set((state) => ({
          actualsImportLogs: state.actualsImportLogs.map((l) =>
            l.id === id ? created : l,
          ),
        }))
      })
      .catch((error: unknown) => {
        set((state) => ({
          actualsImportLogs: state.actualsImportLogs.filter((l) => l.id !== id),
        }))
        notifyPersistenceFailure('取込履歴の記録', error)
      })
    return record
  },

  getConfirmation: (month) => {
    return get().monthlyActualsConfirmations.find((c) => c.month === month)
  },

  closeMonth: (month, reason = null) => {
    if (get().isMonthClosed(month)) return
    const previous = get().monthlyCloseEvents
    const id = crypto.randomUUID()
    const trimmed = reason?.trim()
    const record: MonthlyCloseEvent = {
      id,
      month,
      action: 'close',
      reason: trimmed ? trimmed : null,
      occurredAt: new Date().toISOString(),
      // postgresモードはサーバー側がreq.userで上書きスタンプする（create確定時に反映）
      actorName: null,
    }
    set({ monthlyCloseEvents: [...previous, record] })
    getDataAdapter()
      .create(
        'monthlyCloseEvents',
        {
          month: record.month,
          action: record.action,
          reason: record.reason,
          occurredAt: record.occurredAt,
          actorName: record.actorName,
        },
        { id },
      )
      .then((created) => {
        set((state) => ({
          monthlyCloseEvents: state.monthlyCloseEvents.map((e) =>
            e.id === id ? created : e,
          ),
        }))
      })
      .catch((error: unknown) => {
        set((state) => ({
          monthlyCloseEvents: state.monthlyCloseEvents.filter(
            (e) => e.id !== id,
          ),
        }))
        notifyPersistenceFailure('締め', error)
      })
  },

  reopenMonth: (month, reason) => {
    if (!get().isMonthClosed(month)) return
    const trimmed = reason.trim()
    if (trimmed === '') {
      // 解除の理由は必須（「なぜ戻したか」を必ず監査に残す。DESIGN 決定事項6）
      toast({
        title: '締めの解除には理由の入力が必要です',
        variant: 'destructive',
      })
      return
    }
    const previous = get().monthlyCloseEvents
    const id = crypto.randomUUID()
    const record: MonthlyCloseEvent = {
      id,
      month,
      action: 'reopen',
      reason: trimmed,
      occurredAt: new Date().toISOString(),
      actorName: null,
    }
    set({ monthlyCloseEvents: [...previous, record] })
    getDataAdapter()
      .create(
        'monthlyCloseEvents',
        {
          month: record.month,
          action: record.action,
          reason: record.reason,
          occurredAt: record.occurredAt,
          actorName: record.actorName,
        },
        { id },
      )
      .then((created) => {
        set((state) => ({
          monthlyCloseEvents: state.monthlyCloseEvents.map((e) =>
            e.id === id ? created : e,
          ),
        }))
      })
      .catch((error: unknown) => {
        set((state) => ({
          monthlyCloseEvents: state.monthlyCloseEvents.filter(
            (e) => e.id !== id,
          ),
        }))
        notifyPersistenceFailure('締めの解除', error)
      })
  },

  isMonthClosed: (month) => {
    return latestEventFor(get().monthlyCloseEvents, month)?.action === 'close'
  },

  getLatestCloseEvent: (month) => {
    return latestEventFor(get().monthlyCloseEvents, month)
  },
}))
