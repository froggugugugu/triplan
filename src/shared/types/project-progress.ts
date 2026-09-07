import { z } from 'zod'

/**
 * 案件（トップレベルProject）×週単位の進捗率スナップショット。
 * 1案件につき1レコード（weeklyProgressに全週分のデータを保持する、
 * AssignmentEntry.monthlyValuesと同型のパターン）。
 * EVM（PV/EV/AC）のEV算出に使用する。
 */
export const ProjectProgressEntrySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  // キー: "YYYY-Www"（ISO週番号）、値: 0.0〜1.0の進捗率
  weeklyProgress: z.record(z.string(), z.number().min(0).max(1)),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type ProjectProgressEntry = z.infer<typeof ProjectProgressEntrySchema>

/**
 * 作成用スキーマ（id・日時は自動生成）
 */
export const CreateProjectProgressEntrySchema = ProjectProgressEntrySchema.omit(
  {
    id: true,
    createdAt: true,
    updatedAt: true,
  },
)
export type CreateProjectProgressEntry = z.infer<
  typeof CreateProjectProgressEntrySchema
>
