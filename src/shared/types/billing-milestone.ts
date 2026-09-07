import { z } from 'zod'
import { DateOnlySchema } from './date-only'

/**
 * 請求マイルストン（非公開の設計文書・§4.3）。
 * 受注額（`Project.contractAmount`）を検収時期に分割割付し、
 * 「検収→請求→入金」という日本のSI商流のステータスを案件単位で追跡する。
 *
 * 売上計上額 = 検収済（accepted）以降のステータスの金額合計（検収基準）。
 * 受注残 = 受注額 − 売上計上額。配分合計が受注額と一致しない場合はUIで警告する
 * （ブロックはしない。受注額が後から降りてくる商習慣を踏まえ、不一致を許容する）。
 */

export const BillingMilestoneStatusSchema = z.enum([
  'planned', // 予定（未検収）
  'accepted', // 検収済（売上計上）
  'invoiced', // 請求済
  'paid', // 入金済
])
export type BillingMilestoneStatus = z.infer<
  typeof BillingMilestoneStatusSchema
>

export const BILLING_MILESTONE_STATUS_LABELS: Record<
  BillingMilestoneStatus,
  string
> = {
  planned: '予定',
  accepted: '検収済',
  invoiced: '請求済',
  paid: '入金済',
}

export const BillingMilestoneSchema = z.object({
  id: z.string().uuid(),
  // トップレベル案件（level===0）のみ対象
  projectId: z.string().uuid(),
  // マイルストン名（"基本設計完了" / "中間金" / "検収時" 等）
  label: z.string().min(1).max(200),
  // 請求額（万円）
  amount: z.number().min(0),
  // 検収予定日
  plannedAcceptanceDate: DateOnlySchema,
  status: BillingMilestoneStatusSchema,
  note: z.string().max(500).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type BillingMilestone = z.infer<typeof BillingMilestoneSchema>

export const CreateBillingMilestoneSchema = BillingMilestoneSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type CreateBillingMilestone = z.infer<
  typeof CreateBillingMilestoneSchema
>

export const UpdateBillingMilestoneSchema =
  CreateBillingMilestoneSchema.partial().extend({
    id: z.string().uuid(),
  })
export type UpdateBillingMilestone = z.infer<
  typeof UpdateBillingMilestoneSchema
>
