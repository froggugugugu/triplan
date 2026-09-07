import { z } from 'zod'

/**
 * 技術タグカテゴリ（大分類）スキーマ
 */
export const TechTagCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  sortOrder: z.number().int().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type TechTagCategory = z.infer<typeof TechTagCategorySchema>

export const CreateTechTagCategorySchema = TechTagCategorySchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type CreateTechTagCategory = z.infer<typeof CreateTechTagCategorySchema>

export const UpdateTechTagCategorySchema =
  TechTagCategorySchema.partial().required({
    id: true,
  })
export type UpdateTechTagCategory = z.infer<typeof UpdateTechTagCategorySchema>

/**
 * 技術タグサブカテゴリ（中分類）スキーマ
 */
export const TechTagSubCategorySchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(100),
  sortOrder: z.number().int().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type TechTagSubCategory = z.infer<typeof TechTagSubCategorySchema>

export const CreateTechTagSubCategorySchema = TechTagSubCategorySchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type CreateTechTagSubCategory = z.infer<
  typeof CreateTechTagSubCategorySchema
>

export const UpdateTechTagSubCategorySchema =
  TechTagSubCategorySchema.partial().required({
    id: true,
  })
export type UpdateTechTagSubCategory = z.infer<
  typeof UpdateTechTagSubCategorySchema
>
