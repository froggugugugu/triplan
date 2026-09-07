import { z } from 'zod'

/**
 * 技術タグスキーマ
 */
export const TechTagSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  categoryId: z.string().uuid(),
  subCategoryId: z.string().uuid().nullable().default(null),
  note: z.string().max(200).nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type TechTag = z.infer<typeof TechTagSchema>

/**
 * 技術タグ作成スキーマ（id, createdAt, updatedAt を除外）
 */
export const CreateTechTagSchema = TechTagSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type CreateTechTag = z.infer<typeof CreateTechTagSchema>

/**
 * 技術タグ更新スキーマ（idは必須、他はオプション）
 */
export const UpdateTechTagSchema = TechTagSchema.partial().required({
  id: true,
})
export type UpdateTechTag = z.infer<typeof UpdateTechTagSchema>
