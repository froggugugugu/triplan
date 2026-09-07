import { z } from 'zod'

/**
 * 人員計画（採用計画）スキーマ。
 * 部門×年度×区分（4固定区分）で1レコード（枠）。
 * 「人件費（プロパー/プロパー以外）」の実績人数はMemberの在籍実績から自動集計するため
 * このレコードには持たない（shared/utils/budget-utils.tsのセレクタで算出する）。
 * 「追加予定（プロパー/プロパー以外）」の実績人数（実現人数）は個別のクローズ機構を持たず、
 * monthlyRealizedHeadcountに月別で手入力する。
 */
export const PERSONNEL_PLAN_CATEGORIES = [
  'personnel_internal',
  'personnel_external',
  'planned_internal',
  'planned_external',
] as const

export const PersonnelPlanCategorySchema = z.enum(PERSONNEL_PLAN_CATEGORIES)
export type PersonnelPlanCategory = z.infer<typeof PersonnelPlanCategorySchema>

export const PersonnelPlanEntrySchema = z.object({
  id: z.string().uuid(),
  divisionId: z.string().uuid(),
  fiscalYear: z.number().int().min(2000).max(2100),
  category: PersonnelPlanCategorySchema,
  monthlyHeadcount: z.record(z.string(), z.number().min(0)),
  monthlyRealizedHeadcount: z.record(z.string(), z.number().min(0)).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type PersonnelPlanEntry = z.infer<typeof PersonnelPlanEntrySchema>

/**
 * 作成用スキーマ（id・日時は自動生成）
 */
export const CreatePersonnelPlanEntrySchema = PersonnelPlanEntrySchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type CreatePersonnelPlanEntry = z.infer<
  typeof CreatePersonnelPlanEntrySchema
>

/**
 * 汎用更新用スキーマ。idのみ必須、他は任意項目。
 */
export const UpdatePersonnelPlanEntrySchema = PersonnelPlanEntrySchema.omit({
  createdAt: true,
  updatedAt: true,
})
  .partial()
  .required({ id: true })
export type UpdatePersonnelPlanEntry = z.infer<
  typeof UpdatePersonnelPlanEntrySchema
>
