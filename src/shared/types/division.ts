import { z } from 'zod'

/**
 * 部門スキーマ
 */
export const DivisionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  sortOrder: z.number().int().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Division = z.infer<typeof DivisionSchema>

/**
 * 部門作成用スキーマ（IDと日時は自動生成）
 */
export const CreateDivisionSchema = DivisionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type CreateDivision = z.infer<typeof CreateDivisionSchema>

/**
 * 部門更新用スキーマ
 */
export const UpdateDivisionSchema = DivisionSchema.partial().required({
  id: true,
})
export type UpdateDivision = z.infer<typeof UpdateDivisionSchema>
