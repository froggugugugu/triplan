import { z } from 'zod'

/**
 * 課スキーマ
 */
export const SectionSchema = z.object({
  id: z.string().uuid(),
  divisionId: z.string().uuid(),
  name: z.string().min(1).max(100),
  sortOrder: z.number().int().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Section = z.infer<typeof SectionSchema>

/**
 * 課作成用スキーマ（IDと日時は自動生成）
 */
export const CreateSectionSchema = SectionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type CreateSection = z.infer<typeof CreateSectionSchema>

/**
 * 課更新用スキーマ
 */
export const UpdateSectionSchema = SectionSchema.partial().required({
  id: true,
})
export type UpdateSection = z.infer<typeof UpdateSectionSchema>
