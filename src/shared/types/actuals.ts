import { z } from 'zod'

/**
 * 月次実績（P1-a）関連のエンティティ。
 * 実績値そのものは`AssignmentEntry.actualMonthlyValues`（既存）が受け皿で、
 * ここには「確定マーク」と「CSV取込履歴」という周辺エンティティのみを定義する
 * （非公開の設計文書）。
 */

const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/

/**
 * 月次実績の確定マーク（全社×月で1レコード）。
 * ソフトロック: 確定済み月の実績編集は警告表示のみで拒否しない。
 * ハードロック（編集拒否）は月次締め（P1-b）の責務で、本エンティティはその土台。
 * 確定はマークのみで、実績キーの一括書込みは行わない（キー欠落=計画どおりの
 * セマンティクスを保つ。`DESIGN` §4.3）。
 * 部門別の確定が必要になった場合はdivisionIdカラム追加で拡張する（設計ゲート決定事項1）。
 */
export const MonthlyActualsConfirmationSchema = z.object({
  id: z.string().uuid(),
  month: z.string().regex(MONTH_KEY_PATTERN),
  confirmedAt: z.string().datetime(),
})
export type MonthlyActualsConfirmation = z.infer<
  typeof MonthlyActualsConfirmationSchema
>

export const CreateMonthlyActualsConfirmationSchema =
  MonthlyActualsConfirmationSchema.omit({ id: true })
export type CreateMonthlyActualsConfirmation = z.infer<
  typeof CreateMonthlyActualsConfirmationSchema
>

/** 取込スキップ行の理由（行番号つき。上限100件で打ち切り） */
export const ImportSkippedReasonSchema = z.object({
  row: z.number().int().positive(),
  reason: z.string().max(500),
})
export type ImportSkippedReason = z.infer<typeof ImportSkippedReasonSchema>

/**
 * CSV取込履歴（追記専用。`BudgetAdjustment`と同じパターンで更新・削除APIは設けない）。
 * 「いつ・どのファイルから・何件適用し・何件なぜスキップしたか」の追跡性を担保する。
 */
export const ActualsImportLogSchema = z.object({
  id: z.string().uuid(),
  importedAt: z.string().datetime(),
  fileName: z.string().min(1).max(255),
  // 取込対象になった月（"YYYY-MM"）の一覧
  targetMonths: z.array(z.string().regex(MONTH_KEY_PATTERN)),
  appliedCount: z.number().int().min(0),
  skippedCount: z.number().int().min(0),
  // スキップ理由の明細（最大100件で打ち切り。全行分は保持しない）
  skippedReasons: z.array(ImportSkippedReasonSchema).max(100),
  note: z.string().max(500).nullable(),
})
export type ActualsImportLog = z.infer<typeof ActualsImportLogSchema>

export const CreateActualsImportLogSchema = ActualsImportLogSchema.omit({
  id: true,
})
export type CreateActualsImportLog = z.infer<
  typeof CreateActualsImportLogSchema
>

/**
 * 月次締めイベント（P1-b。非公開の設計文書）。
 * **追記専用**で、締め状態は保存フィールドで持たず月ごとの最新イベントから導出する
 * （`getActiveBaseline`/`getCurrentSkillLevel`と同じパターン）。イベント自体が
 * 「いつ・誰が・なぜ締めた/解除したか」の監査記録を兼ねる。
 * monthはuniqueにしない（同月にclose→reopen→closeが積まれる）。
 */
export const MonthlyCloseEventSchema = z.object({
  id: z.string().uuid(),
  month: z.string().regex(MONTH_KEY_PATTERN),
  action: z.enum(['close', 'reopen']),
  // reopen時はUI/ストアで必須を強制（スキーマ上はclose時の省略を許すためnullable）
  reason: z.string().min(1).max(500).nullable(),
  occurredAt: z.string().datetime(),
  // 実行者。postgresモードはサーバー側がreq.userからスタンプする（クライアント申告は不採用）。
  // localモードは認証が無いためnull
  actorName: z.string().max(200).nullable(),
})
export type MonthlyCloseEvent = z.infer<typeof MonthlyCloseEventSchema>

export const CreateMonthlyCloseEventSchema = MonthlyCloseEventSchema.omit({
  id: true,
})
export type CreateMonthlyCloseEvent = z.infer<
  typeof CreateMonthlyCloseEventSchema
>
