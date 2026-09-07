import { z } from 'zod'
import { DateOnlySchema } from './date-only'

/**
 * リスク登録簿（非公開の設計文書）。
 *
 * アラートセンターが「起きた／起きそうな問題」の事後検知を担うのに対し、
 * こちらは**まだ数字に出ていない懸念**を事前に識別・評価・監視する
 * PMBOK/PRINCE2のリスク管理の軽量版。案件（トップレベル）単位で管理する。
 *
 * - 発生確率・影響度は3段階の定性評価で固定する（数値%は偽精度になるため）
 * - 重大度は保存せず`probability`×`impact`から都度導出する
 *   （導出値を保存すると評価変更との不整合が生じる。「現在レベルは履歴から導出」と同じ整理）
 * - 追記専用にはしない（評価の見直し・状態遷移が本質）。変更履歴はpostgresモードの
 *   監査証跡が自動で拾う
 */

/** 発生確率・影響度の3段階評価 */
export const RiskLevelSchema = z.enum(['high', 'medium', 'low'])
export type RiskLevel = z.infer<typeof RiskLevelSchema>

/** リスクの状態: 監視中／顕在化した／解消した */
export const RiskStatusSchema = z.enum(['open', 'realized', 'closed'])
export type RiskStatus = z.infer<typeof RiskStatusSchema>

export const RiskEntrySchema = z.object({
  id: z.string().uuid(),
  /** 対象のトップレベル案件（level===0）。案件削除でカスケード削除 */
  projectId: z.string().uuid(),
  /** リスクの内容（「○○の仕様が未確定」等） */
  title: z.string().min(1).max(200),
  probability: RiskLevelSchema,
  impact: RiskLevelSchema,
  status: RiskStatusSchema.default('open'),
  /**
   * 対応方針（回避・軽減・転嫁・受容の内容を自由記述）。
   * サーバーのtext列は未設定をNULLで返すため、export/import往復が壊れないよう
   * null許容にする（documentTemplates.sourceRefsで踏んだ同型問題。統合テストで検出）
   */
  response: z.string().max(2000).nullable().optional(),
  /** オーナー（弱参照。削除済み・退職メンバーはUI側が「（不明）」表示） */
  ownerMemberId: z.string().uuid().nullable().optional(),
  /** 対応期限。アラートセンターの期限超過・接近判定の起点 */
  dueDate: DateOnlySchema.nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type RiskEntry = z.infer<typeof RiskEntrySchema>

export const CreateRiskEntrySchema = RiskEntrySchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type CreateRiskEntry = z.infer<typeof CreateRiskEntrySchema>

export const UpdateRiskEntrySchema = RiskEntrySchema.omit({
  id: true,
  projectId: true,
  createdAt: true,
})
  .partial()
  .extend({ id: z.string().uuid() })
export type UpdateRiskEntry = z.infer<typeof UpdateRiskEntrySchema>
