import { z } from 'zod'
import { DateOnlySchema } from './date-only'

/**
 * 凍結時点のアサイン計画（メンバー×月次配分率）。
 * `monthlyPlannedCost`（金額）とは別に配分率そのものを保持することで、
 * 単価改定時に「最新単価で再計算する」モード（`Project.evmUnitPriceMode='latest'`）へ
 * 後から切り替えられる（非公開の設計文書）。
 */
export const BaselineAllocationSchema = z.object({
  memberId: z.string().uuid(),
  // キー: "YYYY-MM"、値: 月次アサイン率（0.0〜。同一メンバーが複数タスクに
  // アサインされている場合は合算済みの値を保持する）
  monthlyValues: z.record(z.string(), z.number().min(0)),
})
export type BaselineAllocation = z.infer<typeof BaselineAllocationSchema>

/**
 * 計画のスナップショット（EVMのPV＝計画値の基準線）。
 * 案件×版で1レコードの追記専用エンティティ（`BudgetAdjustment`・`SkillEvaluation`と
 * 同じパターン。更新・削除APIは設けない）。
 *
 * 要件変更・追加予算で計画が改定された場合は新しい版（version+1）を追記する（再ベースライン）。
 * 「有効なベースライン」は案件内で最大のversionを持つレコード（`getActiveBaseline`）。
 * 詳細な設計背景は 非公開の設計文書・§3.1 を参照。
 */
export const ProjectBaselineSchema = z.object({
  id: z.string().uuid(),
  // トップレベル案件（level===0）のみ対象
  projectId: z.string().uuid(),
  // 案件内の連番（1 = 当初計画）
  version: z.number().int().min(1),
  // 凍結日（業務上の承認日）
  approvedAt: DateOnlySchema,
  // 凍結理由（"当初計画" / "CR#1 追加開発分" 等の自由記述）
  reason: z.string().min(1).max(200),
  // 凍結時点のBAC（完成時総予算、万円）。EV = 進捗率 × この値
  bacAmount: z.number().min(0),
  // キー: "YYYY-MM"、値: その月の計画コスト（万円）。PV曲線の源（frozenモード）
  monthlyPlannedCost: z.record(z.string(), z.number().min(0)),
  // 凍結時点のアサイン配分率。PV曲線の源（latestモード）
  plannedAllocations: z.array(BaselineAllocationSchema),
  createdAt: z.string().datetime(),
})
export type ProjectBaseline = z.infer<typeof ProjectBaselineSchema>

/**
 * ベースライン作成用スキーマ（IDは自動生成）。
 * 追記専用のため更新用スキーマは持たない。
 */
export const CreateProjectBaselineSchema = ProjectBaselineSchema.omit({
  id: true,
})
export type CreateProjectBaseline = z.infer<typeof CreateProjectBaselineSchema>
