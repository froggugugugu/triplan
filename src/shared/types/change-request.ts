import { z } from 'zod'
import { DateOnlySchema } from './date-only'

/**
 * 変更管理（Change Request、非公開の設計文書・§4.4）。
 * 期中に発生した契約変更・追加発注を記録し、「なぜ着地が動いたか」を追跡可能にする。
 * `BudgetAdjustment`（コスト側の予算調整）の売上・スコープ側の対概念。
 *
 * 承認（approve）時に受注額差分・新納期をProjectへ自動反映する（budget-store等と同じ
 * 「エンティティ本体のCRUD＋連動する自動再計算」の二段構成）。工数差分はWBSのどのタスクへ
 * 積むか自動では決められないため反映せず、WBS更新→ベースライン再凍結を促す。
 */

export const ChangeRequestStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
])
export type ChangeRequestStatus = z.infer<typeof ChangeRequestStatusSchema>

// 差分額は絶対値＋増減区分で表す（NumericInputが負値を受け付けないため。
// BudgetAdjustment.adjustmentTypeで確立済みのパターン）
export const ChangeRequestDeltaTypeSchema = z.enum(['increase', 'decrease'])
export type ChangeRequestDeltaType = z.infer<
  typeof ChangeRequestDeltaTypeSchema
>

export const ChangeRequestSchema = z.object({
  id: z.string().uuid(),
  // トップレベル案件（level===0）のみ対象
  projectId: z.string().uuid(),
  // 変更内容の表題（"追加画面3本の開発" 等）
  title: z.string().min(1).max(200),
  // 発生日（業務上の日付）
  requestedAt: DateOnlySchema,
  status: ChangeRequestStatusSchema,
  // 受注額差分（万円、絶対値）。0 = 受注額の変更なし
  contractAmountDelta: z.number().min(0),
  contractAmountDeltaType: ChangeRequestDeltaTypeSchema,
  // 工数差分（人日、絶対値）。0 = 工数影響なし。承認時の自動反映はしない（上記参照）
  effortDeltaDays: z.number().min(0),
  effortDeltaType: ChangeRequestDeltaTypeSchema,
  // 変更後のマスター納期。null = 納期の変更なし
  newDueDate: DateOnlySchema.nullable(),
  note: z.string().max(1000).optional(),
  // 承認/却下した日。pendingの間はnull
  decidedAt: DateOnlySchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type ChangeRequest = z.infer<typeof ChangeRequestSchema>

export const CreateChangeRequestSchema = ChangeRequestSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type CreateChangeRequest = z.infer<typeof CreateChangeRequestSchema>
