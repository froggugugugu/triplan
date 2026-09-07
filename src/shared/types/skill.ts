import { z } from 'zod'
import { DateOnlySchema } from './date-only'

/**
 * スキル習熟度レベル（5段階、行動基準で定義。全技術タグ共通）。
 * none=未経験、beginner=初級（指導を受ければ実装できる）、intermediate=中級（一人で実装できる）、
 * advanced=上級（設計・レビューができる）、expert=エキスパート（社内の第一人者・後進を育成できる）
 */
export const SKILL_LEVELS = [
  'none',
  'beginner',
  'intermediate',
  'advanced',
  'expert',
] as const
export const SkillLevelSchema = z.enum(SKILL_LEVELS)
export type SkillLevel = z.infer<typeof SkillLevelSchema>

/** 評価者区分。ログイン機構がないため記録の都度ユーザーが手動選択する */
export const SkillEvaluatorTypeSchema = z.enum(['self', 'manager'])
export type SkillEvaluatorType = z.infer<typeof SkillEvaluatorTypeSchema>

/**
 * スキル評価履歴（成長記録の実体）。member×techTagId×evaluatorTypeでレベルが変化するたびに
 * 1レコード追記する。追記専用（BudgetAdjustmentと同じパターン。更新・削除APIは設けない）。
 * 「現在のレベル」はevaluatedAt最新のafterLevelから導出する（getCurrentSkillLevel参照）。
 */
export const SkillEvaluationSchema = z.object({
  id: z.string().uuid(),
  memberId: z.string().uuid(),
  techTagId: z.string().uuid(),
  evaluatorType: SkillEvaluatorTypeSchema,
  beforeLevel: SkillLevelSchema,
  afterLevel: SkillLevelSchema,
  evaluatedAt: DateOnlySchema, // 評価日 "YYYY-MM-DD"
  note: z.string().max(500).nullable().optional(),
  createdAt: z.string().datetime(),
})
export type SkillEvaluation = z.infer<typeof SkillEvaluationSchema>

export const CreateSkillEvaluationSchema = SkillEvaluationSchema.omit({
  id: true,
  createdAt: true,
})
export type CreateSkillEvaluation = z.infer<typeof CreateSkillEvaluationSchema>

/**
 * 成長ロードマップ目標。member×techTagIdで目標を設定するたびに1レコード追記する
 * （追記専用。更新・削除APIは設けない）。同一member×techTagIdで最新のcreatedAtを持つ
 * レコードが「現在の目標」で、それ以前のレコードはそのまま履歴（アーカイブ）として残る。
 */
export const SkillRoadmapGoalSchema = z.object({
  id: z.string().uuid(),
  memberId: z.string().uuid(),
  techTagId: z.string().uuid(),
  targetLevel: SkillLevelSchema,
  targetDate: z.string().regex(/^\d{4}-\d{2}$/), // 達成予定時期 "YYYY-MM"
  note: z.string().max(500).nullable().optional(),
  createdAt: z.string().datetime(),
})
export type SkillRoadmapGoal = z.infer<typeof SkillRoadmapGoalSchema>

export const CreateSkillRoadmapGoalSchema = SkillRoadmapGoalSchema.omit({
  id: true,
  createdAt: true,
})
export type CreateSkillRoadmapGoal = z.infer<
  typeof CreateSkillRoadmapGoalSchema
>
