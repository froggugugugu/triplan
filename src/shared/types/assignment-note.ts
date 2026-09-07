import { z } from 'zod'

/**
 * 体制メモ（アサイン表の申し送り）。
 *
 * アサイン（誰を何月に何割）は**外部の実行管理ツールに存在しない本ツール固有のデータ**で、
 * 「なぜこの配分にしたか」「9月から増員する」といった判断の背景を残す場所が無かった。
 * タスクのコメントを作らない（実行管理は餅は餅屋）という設計判断とは別問題で、
 * 委譲先が無いデータの申し送りはここに置く。
 *
 * 追記専用にはしない（申し送りは書き直しが要る）。変更履歴はpostgresモードの
 * 監査証跡が自動で拾うため、追跡性はそちらで担保する。
 */
export const AssignmentNoteSchema = z.object({
  id: z.string().uuid(),
  /** 対象のトップレベル案件（level===0） */
  projectId: z.string().uuid(),
  body: z.string().min(1).max(2000),
  /**
   * 投稿者名。postgresモードはサーバーが`req.user`からスタンプする
   * （クライアント申告は採用しない＝なりすまし防止。monthlyCloseEventsと同じ整理）。
   * localモードは認証が無いためnull
   */
  authorName: z.string().max(100).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type AssignmentNote = z.infer<typeof AssignmentNoteSchema>

export const CreateAssignmentNoteSchema = AssignmentNoteSchema.omit({
  id: true,
})
export type CreateAssignmentNote = z.infer<typeof CreateAssignmentNoteSchema>

export const UpdateAssignmentNoteSchema = AssignmentNoteSchema.omit({
  id: true,
  projectId: true,
  createdAt: true,
})
  .partial()
  .extend({ id: z.string().uuid() })
export type UpdateAssignmentNote = z.infer<typeof UpdateAssignmentNoteSchema>
