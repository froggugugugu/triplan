import { describe, expect, it } from 'vitest'
import type { SkillEvaluation } from '@/shared/types/skill'
import {
  calcSkillRoadmapProgress,
  getCurrentSkillLevel,
  isSkillEvaluationStale,
  isSkillLevelUp,
  SKILL_LEVEL_LABELS,
  SKILL_LEVEL_ORDER,
  SKILL_REVIEW_CYCLE_MONTHS,
} from '@/shared/utils/skill-utils'

const MEMBER_ID = crypto.randomUUID()
const TAG_ID = crypto.randomUUID()

function createEvaluation(
  overrides: Partial<SkillEvaluation> = {},
): SkillEvaluation {
  return {
    id: crypto.randomUUID(),
    memberId: MEMBER_ID,
    techTagId: TAG_ID,
    evaluatorType: 'self',
    beforeLevel: 'none',
    afterLevel: 'beginner',
    evaluatedAt: '2025-04-01',
    createdAt: '2025-04-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('SKILL_LEVEL_ORDER / SKILL_LEVEL_LABELS', () => {
  it('5段階すべてに順序とラベルが定義されている', () => {
    expect(Object.keys(SKILL_LEVEL_ORDER)).toHaveLength(5)
    expect(Object.keys(SKILL_LEVEL_LABELS)).toHaveLength(5)
    expect(SKILL_LEVEL_ORDER.none).toBe(0)
    expect(SKILL_LEVEL_ORDER.expert).toBe(4)
  })
})

describe('isSkillLevelUp', () => {
  it('レベルが上がった場合はtrueを返す', () => {
    expect(isSkillLevelUp('beginner', 'intermediate')).toBe(true)
  })

  it('2段階以上のジャンプでもtrueを返す', () => {
    expect(isSkillLevelUp('none', 'expert')).toBe(true)
  })

  it('同レベルの場合はfalseを返す', () => {
    expect(isSkillLevelUp('intermediate', 'intermediate')).toBe(false)
  })

  it('レベルが下がった場合はfalseを返す', () => {
    expect(isSkillLevelUp('advanced', 'beginner')).toBe(false)
  })
})

describe('getCurrentSkillLevel', () => {
  it('評価履歴がない場合はnullを返す', () => {
    expect(getCurrentSkillLevel([], MEMBER_ID, TAG_ID, 'self')).toBeNull()
  })

  it('最新のevaluatedAtのafterLevelを返す', () => {
    const evaluations = [
      createEvaluation({ evaluatedAt: '2025-04-01', afterLevel: 'beginner' }),
      createEvaluation({
        evaluatedAt: '2025-07-01',
        afterLevel: 'intermediate',
      }),
    ]
    expect(getCurrentSkillLevel(evaluations, MEMBER_ID, TAG_ID, 'self')).toBe(
      'intermediate',
    )
  })

  it('同日複数件の場合はcreatedAtが新しい方を採用する', () => {
    const evaluations = [
      createEvaluation({
        evaluatedAt: '2025-04-01',
        createdAt: '2025-04-01T09:00:00.000Z',
        afterLevel: 'beginner',
      }),
      createEvaluation({
        evaluatedAt: '2025-04-01',
        createdAt: '2025-04-01T15:00:00.000Z',
        afterLevel: 'intermediate',
      }),
    ]
    expect(getCurrentSkillLevel(evaluations, MEMBER_ID, TAG_ID, 'self')).toBe(
      'intermediate',
    )
  })

  it('evaluatorTypeが異なる履歴は対象外', () => {
    const evaluations = [
      createEvaluation({ evaluatorType: 'self', afterLevel: 'expert' }),
    ]
    expect(
      getCurrentSkillLevel(evaluations, MEMBER_ID, TAG_ID, 'manager'),
    ).toBeNull()
  })

  it('他メンバー・他タグの履歴は対象外', () => {
    const evaluations = [
      createEvaluation({ memberId: crypto.randomUUID(), afterLevel: 'expert' }),
      createEvaluation({
        techTagId: crypto.randomUUID(),
        afterLevel: 'expert',
      }),
    ]
    expect(
      getCurrentSkillLevel(evaluations, MEMBER_ID, TAG_ID, 'self'),
    ).toBeNull()
  })
})

describe('calcSkillRoadmapProgress', () => {
  it('未評価（currentLevel=null）はnoneレベル相当（0%）から計算する', () => {
    expect(calcSkillRoadmapProgress(null, 'advanced')).toBe(0)
  })

  it('targetLevelがnoneの場合は常に100%（達成不要）', () => {
    expect(calcSkillRoadmapProgress(null, 'none')).toBe(100)
    expect(calcSkillRoadmapProgress('expert', 'none')).toBe(100)
  })

  it('部分達成の場合は割合を四捨五入して返す', () => {
    // intermediate(2) / advanced(3) = 66.66...% -> 67%
    expect(calcSkillRoadmapProgress('intermediate', 'advanced')).toBe(67)
  })

  it('目標達成済みの場合は100%を返す', () => {
    expect(calcSkillRoadmapProgress('expert', 'advanced')).toBe(100)
  })

  it('現在レベルと目標が一致する場合は100%を返す', () => {
    expect(calcSkillRoadmapProgress('advanced', 'advanced')).toBe(100)
  })
})

describe('isSkillEvaluationStale', () => {
  const baseDate = new Date(2026, 0, 1) // 2026-01-01

  it('評価履歴が一度もない場合はtrue（要見直し）', () => {
    expect(isSkillEvaluationStale(null, baseDate)).toBe(true)
  })

  it('ちょうどSKILL_REVIEW_CYCLE_MONTHS経過している場合はtrue（境界値）', () => {
    expect(SKILL_REVIEW_CYCLE_MONTHS).toBe(3)
    expect(isSkillEvaluationStale('2025-10-01', baseDate)).toBe(true)
  })

  it('経過月数が1日でも足りない場合はfalse', () => {
    expect(isSkillEvaluationStale('2025-10-02', baseDate)).toBe(false)
  })

  it('十分に最近評価されている場合はfalse', () => {
    expect(isSkillEvaluationStale('2025-12-15', baseDate)).toBe(false)
  })

  it('cycleMonthsを明示的に指定できる', () => {
    expect(isSkillEvaluationStale('2025-07-01', baseDate, 6)).toBe(true)
    expect(isSkillEvaluationStale('2025-08-01', baseDate, 6)).toBe(false)
  })
})
