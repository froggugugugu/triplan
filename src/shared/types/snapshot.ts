import { z } from 'zod'
import { DatabaseSchema } from './database'

/**
 * スナップショットタグスキーマ（半角英数字・ドット・ハイフン・アンダースコアのみ、1〜50文字）
 */
export const SnapshotTagSchema = z
  .string()
  .min(1, 'タグは必須です')
  .max(50, 'タグは50文字以内で入力してください')
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    'タグは半角英数字・ドット・ハイフン・アンダースコアのみ使用できます',
  )

export type SnapshotTag = z.infer<typeof SnapshotTagSchema>

/**
 * スナップショットメタデータスキーマ
 */
export const SnapshotMetaSchema = z.object({
  id: z.string().uuid(),
  tag: SnapshotTagSchema,
  version: z.string(),
  createdAt: z.string().datetime(),
  fiscalYear: z.number().int(),
  dataSize: z.number().int().nonnegative(),
})

export type SnapshotMeta = z.infer<typeof SnapshotMetaSchema>

/**
 * スナップショットエントリスキーマ（メタデータ + データ本体）
 */
export const SnapshotEntrySchema = z.object({
  meta: SnapshotMetaSchema,
  data: DatabaseSchema,
})

export type SnapshotEntry = z.infer<typeof SnapshotEntrySchema>

/**
 * スナップショット履歴スキーマ
 */
export const SnapshotHistorySchema = z.object({
  snapshots: z.array(SnapshotEntrySchema),
})

export type SnapshotHistory = z.infer<typeof SnapshotHistorySchema>
