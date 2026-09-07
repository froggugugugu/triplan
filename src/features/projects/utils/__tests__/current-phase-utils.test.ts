import { describe, expect, it } from 'vitest'
import type { PhaseDefinition, ScheduleEntry } from '@/shared/types/schedule'
import { getCurrentPhase } from '../current-phase-utils'

const PROJECT_ID = crypto.randomUUID()

function makeEntry(overrides: Partial<ScheduleEntry> = {}): ScheduleEntry {
  return {
    id: crypto.randomUUID(),
    projectId: PROJECT_ID,
    phaseKey: 'phase-1',
    startDate: '2025-04-01',
    endDate: '2025-04-30',
    ...overrides,
  }
}

function makePhase(overrides: Partial<PhaseDefinition> = {}): PhaseDefinition {
  return {
    phaseKey: 'phase-1',
    name: '要件定義',
    color: '#000000',
    enabled: true,
    sortOrder: 0,
    ...overrides,
  }
}

describe('getCurrentPhase', () => {
  it('現在日付を含む工程が1件の場合、それを返す', () => {
    const entries = [
      makeEntry({ startDate: '2025-04-01', endDate: '2025-04-30' }),
    ]
    const phases = [makePhase()]
    const result = getCurrentPhase(entries, phases, '2025-04-15')
    expect(result?.phaseKey).toBe('phase-1')
  })

  // 反証: 期間の境界日（開始日・終了日ちょうど）も期間内として扱われる
  it('反証: 開始日ちょうどの場合も期間内として扱われる', () => {
    const entries = [
      makeEntry({ startDate: '2025-04-01', endDate: '2025-04-30' }),
    ]
    const phases = [makePhase()]
    expect(getCurrentPhase(entries, phases, '2025-04-01')?.phaseKey).toBe(
      'phase-1',
    )
  })

  it('反証: 終了日ちょうどの場合も期間内として扱われる', () => {
    const entries = [
      makeEntry({ startDate: '2025-04-01', endDate: '2025-04-30' }),
    ]
    const phases = [makePhase()]
    expect(getCurrentPhase(entries, phases, '2025-04-30')?.phaseKey).toBe(
      'phase-1',
    )
  })

  it('現在日付が期間開始前の場合、nullを返す', () => {
    const entries = [
      makeEntry({ startDate: '2025-05-01', endDate: '2025-05-31' }),
    ]
    const phases = [makePhase()]
    expect(getCurrentPhase(entries, phases, '2025-04-15')).toBeNull()
  })

  it('現在日付が期間終了後の場合、nullを返す', () => {
    const entries = [
      makeEntry({ startDate: '2025-01-01', endDate: '2025-01-31' }),
    ]
    const phases = [makePhase()]
    expect(getCurrentPhase(entries, phases, '2025-04-15')).toBeNull()
  })

  // 反証: ScheduleEntryが0件でも例外を投げない
  it('反証: ScheduleEntryが0件の場合はnullを返す（例外を投げない）', () => {
    expect(getCurrentPhase([], [makePhase()], '2025-04-15')).toBeNull()
  })

  it('複数工程が現在日付を含む場合、sortOrderが最小の工程を決定論的に選択する', () => {
    const entries = [
      makeEntry({
        phaseKey: 'phase-2',
        startDate: '2025-04-01',
        endDate: '2025-04-30',
      }),
      makeEntry({
        phaseKey: 'phase-1',
        startDate: '2025-04-10',
        endDate: '2025-04-20',
      }),
    ]
    const phases = [
      makePhase({ phaseKey: 'phase-1', sortOrder: 0 }),
      makePhase({ phaseKey: 'phase-2', sortOrder: 1 }),
    ]
    expect(getCurrentPhase(entries, phases, '2025-04-15')?.phaseKey).toBe(
      'phase-1',
    )
  })

  // 反証: phases配列に該当phaseKeyの定義が無くてもクラッシュしない
  it('反証: 該当するPhaseDefinitionが見つからない場合でも例外を投げない', () => {
    const entries = [makeEntry({ phaseKey: 'phase-99' })]
    const phases = [makePhase({ phaseKey: 'phase-1' })]
    expect(() => getCurrentPhase(entries, phases, '2025-04-15')).not.toThrow()
    expect(getCurrentPhase(entries, phases, '2025-04-15')?.phaseKey).toBe(
      'phase-99',
    )
  })

  it('他プロジェクトのScheduleEntryが混在していても、渡された配列内でのみ判定する（呼び出し側でprojectIdフィルタ済み前提）', () => {
    const otherProjectEntry = makeEntry({
      projectId: crypto.randomUUID(),
      startDate: '2025-04-01',
      endDate: '2025-04-30',
    })
    const phases = [makePhase()]
    expect(
      getCurrentPhase([otherProjectEntry], phases, '2025-04-15')?.phaseKey,
    ).toBe('phase-1')
  })
})
