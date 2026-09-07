import { describe, expect, it } from 'vitest'
import {
  skillEvaluationFormSchema,
  skillRoadmapGoalFormSchema,
} from '@/infrastructure/validation/schemas'

const validEvaluation = {
  techTagId: crypto.randomUUID(),
  evaluatorType: 'self' as const,
  afterLevel: 'intermediate' as const,
  evaluatedAt: '2025-04-01',
}

describe('skillEvaluationFormSchema', () => {
  it('正しいデータでバリデーション成功', () => {
    expect(skillEvaluationFormSchema.safeParse(validEvaluation).success).toBe(
      true,
    )
  })

  it('techTagIdが不正な場合エラー', () => {
    const result = skillEvaluationFormSchema.safeParse({
      ...validEvaluation,
      techTagId: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('技術タグを選択してください')
    }
  })

  it('evaluatorTypeが不正な値の場合エラー', () => {
    const result = skillEvaluationFormSchema.safeParse({
      ...validEvaluation,
      evaluatorType: 'admin',
    })
    expect(result.success).toBe(false)
  })

  it('afterLevelが不正な値の場合エラー', () => {
    const result = skillEvaluationFormSchema.safeParse({
      ...validEvaluation,
      afterLevel: 'god-tier',
    })
    expect(result.success).toBe(false)
  })

  it('evaluatedAtがYYYY-MM-DD形式でない場合エラー', () => {
    const result = skillEvaluationFormSchema.safeParse({
      ...validEvaluation,
      evaluatedAt: '2025/04/01',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('評価日を入力してください')
    }
  })

  it('noteを省略できる', () => {
    expect(skillEvaluationFormSchema.safeParse(validEvaluation).success).toBe(
      true,
    )
  })

  it('noteが500文字を超える場合エラー', () => {
    const result = skillEvaluationFormSchema.safeParse({
      ...validEvaluation,
      note: 'a'.repeat(501),
    })
    expect(result.success).toBe(false)
  })
})

const validGoal = {
  techTagId: crypto.randomUUID(),
  targetLevel: 'advanced' as const,
  targetDate: '2026-03',
}

describe('skillRoadmapGoalFormSchema', () => {
  it('正しいデータでバリデーション成功', () => {
    expect(skillRoadmapGoalFormSchema.safeParse(validGoal).success).toBe(true)
  })

  it('targetDateがYYYY-MM形式でない場合エラー', () => {
    const result = skillRoadmapGoalFormSchema.safeParse({
      ...validGoal,
      targetDate: '2026-03-01',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        '達成予定時期（YYYY-MM）を入力してください',
      )
    }
  })

  it('targetLevelが不正な値の場合エラー', () => {
    const result = skillRoadmapGoalFormSchema.safeParse({
      ...validGoal,
      targetLevel: 'invalid',
    })
    expect(result.success).toBe(false)
  })
})
