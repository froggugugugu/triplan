import { z } from 'zod'

/**
 * 外部実行管理ツールとの完了同期ログ（非公開の設計文書）。
 * **追記専用**（`ActualsImportLog`と同じパターン。更新・削除APIなし）。
 * 「いつ・どの経路から・何件完了/戻し・何件なぜskipしたか」の追跡性を担保する。
 * CSV経路（Phase 1）とWebhook経路（Phase 2）で共用する。
 */
export const TaskSyncLogSchema = z.object({
  id: z.string().uuid(),
  syncedAt: z.string().datetime(),
  // 経路: 'csv'＝完了CSV取込（Phase 1）／'webhook'＝Webhook受信（Phase 2）
  channel: z.string().min(1).max(50),
  // 取込元ツールのプリセット名（'generic' | 'backlog' | 'asana' | 'jira'）
  source: z.string().min(1).max(50),
  // CSV経路のみ。Webhook経路はnull
  fileName: z.string().min(1).max(255).nullable(),
  /** 未完了→完了へ変わった件数 */
  completedCount: z.number().int().min(0),
  /** 完了→未完了へ戻った件数 */
  reopenedCount: z.number().int().min(0),
  /** 状態が変わらなかった件数 */
  unchangedCount: z.number().int().min(0),
  skippedCount: z.number().int().min(0),
  /**
   * API起票（channel='api'）で作成した件数。
   * 完了同期（CSV・Webhook）のログには存在しないためoptional
   */
  createdCount: z.number().int().min(0).optional(),
  // スキップ理由の明細（最大100件で打ち切り。rowはCSVの行番号、Webhook経路は0）
  skippedReasons: z
    .array(
      z.object({
        row: z.number().int().min(0),
        reason: z.string().max(500),
      }),
    )
    .max(100),
  note: z.string().max(500).nullable(),
})
export type TaskSyncLog = z.infer<typeof TaskSyncLogSchema>

export const CreateTaskSyncLogSchema = TaskSyncLogSchema.omit({ id: true })
export type CreateTaskSyncLog = z.infer<typeof CreateTaskSyncLogSchema>
