import { describe, expect, it } from 'vitest'
import {
  CreateSkillEvaluationSchema,
  CreateSkillRoadmapGoalSchema,
  SKILL_LEVELS,
  SkillEvaluationSchema,
  SkillEvaluatorTypeSchema,
  SkillLevelSchema,
  SkillRoadmapGoalSchema,
} from '@/shared/types/skill'

describe('SkillLevelSchema', () => {
  it('5段階の全レベルを受け付ける', () => {
    for (const level of SKILL_LEVELS) {
      expect(() => SkillLevelSchema.parse(level)).not.toThrow()
    }
    expect(SKILL_LEVELS).toHaveLength(5)
  })

  it('未知のレベルはエラーになる', () => {
    expect(() => SkillLevelSchema.parse('super-expert')).toThrow()
  })
})

describe('SkillEvaluatorTypeSchema', () => {
  it('self/managerを受け付ける', () => {
    expect(() => SkillEvaluatorTypeSchema.parse('self')).not.toThrow()
    expect(() => SkillEvaluatorTypeSchema.parse('manager')).not.toThrow()
  })

  it('未知の評価者区分はエラーになる', () => {
    expect(() => SkillEvaluatorTypeSchema.parse('admin')).toThrow()
  })
})

describe('SkillEvaluationSchema', () => {
  const validEvaluation = {
    id: crypto.randomUUID(),
    memberId: crypto.randomUUID(),
    techTagId: crypto.randomUUID(),
    evaluatorType: 'self' as const,
    beforeLevel: 'none' as const,
    afterLevel: 'beginner' as const,
    evaluatedAt: '2025-04-01',
    createdAt: new Date().toISOString(),
  }

  it('必須項目のみでバリデーションできる（noteは省略可）', () => {
    const parsed = SkillEvaluationSchema.parse(validEvaluation)
    expect(parsed.note).toBeUndefined()
  })

  it('noteを含めてバリデーションできる', () => {
    const parsed = SkillEvaluationSchema.parse({
      ...validEvaluation,
      note: 'ペアプロで習得',
    })
    expect(parsed.note).toBe('ペアプロで習得')
  })

  it('evaluatedAtがYYYY-MM-DD形式でない場合はエラーになる', () => {
    expect(() =>
      SkillEvaluationSchema.parse({
        ...validEvaluation,
        evaluatedAt: '2025/04/01',
      }),
    ).toThrow()
  })

  it('beforeLevel/afterLevelに不正な値を指定するとエラーになる', () => {
    expect(() =>
      SkillEvaluationSchema.parse({ ...validEvaluation, afterLevel: 'super' }),
    ).toThrow()
  })

  it('noteが500文字を超える場合はエラーになる', () => {
    expect(() =>
      SkillEvaluationSchema.parse({
        ...validEvaluation,
        note: 'a'.repeat(501),
      }),
    ).toThrow()
  })
})

describe('CreateSkillEvaluationSchema', () => {
  it('id/createdAtを含まずに作成データをバリデーションできる', () => {
    const parsed = CreateSkillEvaluationSchema.parse({
      memberId: crypto.randomUUID(),
      techTagId: crypto.randomUUID(),
      evaluatorType: 'manager',
      beforeLevel: 'beginner',
      afterLevel: 'intermediate',
      evaluatedAt: '2025-07-01',
    })
    expect(parsed).not.toHaveProperty('id')
    expect(parsed).not.toHaveProperty('createdAt')
  })
})

describe('SkillRoadmapGoalSchema', () => {
  const validGoal = {
    id: crypto.randomUUID(),
    memberId: crypto.randomUUID(),
    techTagId: crypto.randomUUID(),
    targetLevel: 'advanced' as const,
    targetDate: '2026-03',
    createdAt: new Date().toISOString(),
  }

  it('必須項目のみでバリデーションできる', () => {
    const parsed = SkillRoadmapGoalSchema.parse(validGoal)
    expect(parsed.targetLevel).toBe('advanced')
  })

  it('targetDateがYYYY-MM形式でない場合はエラーになる', () => {
    expect(() =>
      SkillRoadmapGoalSchema.parse({ ...validGoal, targetDate: '2026-03-01' }),
    ).toThrow()
  })
})

describe('CreateSkillRoadmapGoalSchema', () => {
  it('id/createdAtを含まずに作成データをバリデーションできる', () => {
    const parsed = CreateSkillRoadmapGoalSchema.parse({
      memberId: crypto.randomUUID(),
      techTagId: crypto.randomUUID(),
      targetLevel: 'expert',
      targetDate: '2027-04',
    })
    expect(parsed).not.toHaveProperty('id')
    expect(parsed).not.toHaveProperty('createdAt')
  })
})
