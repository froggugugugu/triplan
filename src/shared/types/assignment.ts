import { z } from 'zod'

/**
 * アサインエントリスキーマ（プロジェクト×タスク×メンバーごとに1レコード）
 * monthlyValues: "YYYY-MM" キーで月次アサイン値を保持
 */
export const AssignmentEntrySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  memberId: z.string().uuid(),
  monthlyValues: z.record(z.string(), z.number().min(0).max(1)),
  // 実績の配分率（任意の例外入力、非公開の設計文書・§5）。
  // **入力された月のキーだけが存在する**（未入力月はキー自体を持たない）。
  // AC算出時は `actualMonthlyValues?.[month] ?? monthlyValues[month]` で解決するため、
  // 無操作＝計画どおり（未入力は欠測ではなく「変更なし」）として扱われる。
  // 実績は「事実の記録」のため計画（0〜1）と異なり上限を設けない（残業等で1.0人月超が
  // 実際に起こる。非公開の設計文書 原則5）
  actualMonthlyValues: z.record(z.string(), z.number().min(0)).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type AssignmentEntry = z.infer<typeof AssignmentEntrySchema>

/**
 * アサインエントリ作成用スキーマ（IDと日時は自動生成）
 */
export const CreateAssignmentEntrySchema = AssignmentEntrySchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type CreateAssignmentEntry = z.infer<typeof CreateAssignmentEntrySchema>
