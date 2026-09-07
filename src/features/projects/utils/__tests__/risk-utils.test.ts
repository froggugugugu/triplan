import { describe, expect, it } from 'vitest'
import type { RiskEntry, RiskLevel } from '@/shared/types'
import {
  deriveRiskSeverity,
  type RiskSeverity,
  sortRiskEntries,
} from '../risk-utils'

const NOW = '2026-08-01T00:00:00.000Z'

function makeRisk(overrides: Partial<RiskEntry> = {}): RiskEntry {
  return {
    id: crypto.randomUUID(),
    projectId: '00000000-0000-4000-8000-0000000000p1'.replace('p', 'a'),
    title: 'テストリスク',
    probability: 'medium',
    impact: 'medium',
    status: 'open',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

describe('deriveRiskSeverity', () => {
  it('3×3の全組み合わせが決定論マップと一致する（非公開の設計文書）', () => {
    const expected: [RiskLevel, RiskLevel, RiskSeverity][] = [
      ['high', 'high', 'critical'],
      ['high', 'medium', 'high'],
      ['high', 'low', 'medium'],
      ['medium', 'high', 'high'],
      ['medium', 'medium', 'medium'],
      ['medium', 'low', 'low'],
      ['low', 'high', 'medium'],
      ['low', 'medium', 'low'],
      ['low', 'low', 'low'],
    ]
    for (const [probability, impact, severity] of expected) {
      expect(deriveRiskSeverity(probability, impact)).toBe(severity)
    }
  })
})

describe('sortRiskEntries', () => {
  it('open→realized→closedの順に並び、同グループ内は重大度順（決定論）', () => {
    const closedCritical = makeRisk({
      id: '00000000-0000-4000-8000-0000000000c1',
      status: 'closed',
      probability: 'high',
      impact: 'high',
    })
    const openLow = makeRisk({
      id: '00000000-0000-4000-8000-0000000000c2',
      probability: 'low',
      impact: 'low',
    })
    const openCritical = makeRisk({
      id: '00000000-0000-4000-8000-0000000000c3',
      probability: 'high',
      impact: 'high',
    })
    const realized = makeRisk({
      id: '00000000-0000-4000-8000-0000000000c4',
      status: 'realized',
    })
    const sorted = sortRiskEntries([
      closedCritical,
      openLow,
      realized,
      openCritical,
    ])
    expect(sorted.map((r) => r.id)).toEqual([
      openCritical.id,
      openLow.id,
      realized.id,
      closedCritical.id,
    ])
  })

  it('同重大度は対応期限昇順で、期限なしは末尾に回る', () => {
    const noDue = makeRisk({ id: '00000000-0000-4000-8000-0000000000d1' })
    const later = makeRisk({
      id: '00000000-0000-4000-8000-0000000000d2',
      dueDate: '2026-10-01',
    })
    const sooner = makeRisk({
      id: '00000000-0000-4000-8000-0000000000d3',
      dueDate: '2026-09-01',
    })
    const sorted = sortRiskEntries([noDue, later, sooner])
    expect(sorted.map((r) => r.id)).toEqual([sooner.id, later.id, noDue.id])
  })

  it('入力順に依存しない（反証: 逆順で与えても同じ結果）', () => {
    const risks = [
      makeRisk({ id: '00000000-0000-4000-8000-0000000000e1' }),
      makeRisk({
        id: '00000000-0000-4000-8000-0000000000e2',
        probability: 'high',
        impact: 'high',
      }),
      makeRisk({
        id: '00000000-0000-4000-8000-0000000000e3',
        status: 'closed',
      }),
    ]
    const a = sortRiskEntries(risks).map((r) => r.id)
    const b = sortRiskEntries([...risks].reverse()).map((r) => r.id)
    expect(a).toEqual(b)
  })

  it('元の配列を破壊しない', () => {
    const risks = [
      makeRisk({
        id: '00000000-0000-4000-8000-0000000000f1',
        status: 'closed',
      }),
      makeRisk({ id: '00000000-0000-4000-8000-0000000000f2' }),
    ]
    sortRiskEntries(risks)
    expect(risks[0]?.status).toBe('closed')
  })
})
