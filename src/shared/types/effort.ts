import { z } from 'zod'

/**
 * 工数エントリスキーマ（プロジェクト×列ごとに1レコード）
 */
export const EffortEntrySchema = z.object({
  id: z.guid(),
  projectId: z.guid(),
  columnId: z.string(), // "effort-1" ~ "effort-10"
  value: z.number().min(0),
})
export type EffortEntry = z.infer<typeof EffortEntrySchema>

/**
 * 工数エントリ作成用スキーマ
 */
export const CreateEffortEntrySchema = EffortEntrySchema.omit({ id: true })
export type CreateEffortEntry = z.infer<typeof CreateEffortEntrySchema>
