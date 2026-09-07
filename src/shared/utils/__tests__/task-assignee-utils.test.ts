import { describe, expect, it } from 'vitest'
import {
  buildTaskAssigneeMap,
  formatTaskAssignee,
  type TaskAssigneeAssignment,
  type TaskAssigneeMember,
} from '../task-assignee-utils'

const MONTHS = ['2025-04', '2025-05', '2025-06']

const members: TaskAssigneeMember[] = [
  { id: 'm1', name: '青木一郎' },
  { id: 'm2', name: '伊藤二郎' },
  { id: 'm3', name: '上田三郎' },
]

function assignment(
  taskId: string,
  memberId: string,
  monthlyValues: Record<string, number>,
  actualMonthlyValues?: Record<string, number>,
): TaskAssigneeAssignment {
  return { taskId, memberId, monthlyValues, actualMonthlyValues }
}

describe('buildTaskAssigneeMap', () => {
  it('配分が最大のメンバーを主担当として返す', () => {
    const map = buildTaskAssigneeMap(
      [
        assignment('t1', 'm1', { '2025-04': 0.2 }),
        assignment('t1', 'm2', { '2025-04': 0.6 }),
      ],
      members,
      MONTHS,
    )
    expect(map.get('t1')).toEqual({ primaryName: '伊藤二郎', otherCount: 1 })
  })

  it('単独担当はotherCountが0', () => {
    const map = buildTaskAssigneeMap(
      [assignment('t1', 'm1', { '2025-04': 0.5 })],
      members,
      MONTHS,
    )
    expect(map.get('t1')).toEqual({ primaryName: '青木一郎', otherCount: 0 })
  })

  it('同一メンバーの複数月は合算して比較する', () => {
    const map = buildTaskAssigneeMap(
      [
        // m1は3ヶ月で合計0.9、m2は1ヶ月で0.6
        assignment('t1', 'm1', {
          '2025-04': 0.3,
          '2025-05': 0.3,
          '2025-06': 0.3,
        }),
        assignment('t1', 'm2', { '2025-04': 0.6 }),
      ],
      members,
      MONTHS,
    )
    expect(map.get('t1')?.primaryName).toBe('青木一郎')
  })

  it('実績の例外入力がある月は実績を優先する', () => {
    const map = buildTaskAssigneeMap(
      [
        // 計画ではm2が多いが、実績ではm1が上回る
        assignment('t1', 'm1', { '2025-04': 0.2 }, { '2025-04': 0.9 }),
        assignment('t1', 'm2', { '2025-04': 0.6 }),
      ],
      members,
      MONTHS,
    )
    expect(map.get('t1')?.primaryName).toBe('青木一郎')
  })

  // ── 反証 ────────────────────────────────────────────────────────────────

  it('反証: 対象期間に配分が無いアサインは担当にしない（過去に外れた担当を残さない）', () => {
    const map = buildTaskAssigneeMap(
      [assignment('t1', 'm1', { '2024-04': 0.8 })],
      members,
      MONTHS,
    )
    expect(map.has('t1')).toBe(false)
  })

  it('反証: 配分が全て0のアサインは担当にしない', () => {
    const map = buildTaskAssigneeMap(
      [assignment('t1', 'm1', { '2025-04': 0, '2025-05': 0 })],
      members,
      MONTHS,
    )
    expect(map.has('t1')).toBe(false)
  })

  it('反証: 削除済みメンバーへの参照は担当にしない（存在しない名前を出さない）', () => {
    const map = buildTaskAssigneeMap(
      [assignment('t1', 'deleted-member', { '2025-04': 0.9 })],
      members,
      MONTHS,
    )
    expect(map.has('t1')).toBe(false)
  })

  it('反証: 削除済みメンバーが最大配分でも、残ったメンバーが主担当になる', () => {
    const map = buildTaskAssigneeMap(
      [
        assignment('t1', 'deleted-member', { '2025-04': 0.9 }),
        assignment('t1', 'm1', { '2025-04': 0.1 }),
      ],
      members,
      MONTHS,
    )
    expect(map.get('t1')).toEqual({ primaryName: '青木一郎', otherCount: 0 })
  })

  it('反証: 配分が同率でも入力順に依存せず一意に決まる（実行のたびに入れ替わらない）', () => {
    const build = (list: TaskAssigneeAssignment[]) =>
      buildTaskAssigneeMap(list, members, MONTHS).get('t1')
    const a = assignment('t1', 'm1', { '2025-04': 0.5 })
    const b = assignment('t1', 'm2', { '2025-04': 0.5 })
    // 同率の並びは氏名比較で決めるが、漢字は読みを持たないため五十音順にはならない。
    // ここで担保したいのは「どちらが選ばれるか」ではなく
    // **アサインの並び順が変わっても結果が変わらないこと**
    expect(build([a, b])).toEqual(build([b, a]))
    expect(build([a, b])?.otherCount).toBe(1)
  })

  it('反証: 別タスクのアサインを混ぜない', () => {
    const map = buildTaskAssigneeMap(
      [
        assignment('t1', 'm1', { '2025-04': 0.1 }),
        assignment('t2', 'm2', { '2025-04': 0.9 }),
      ],
      members,
      MONTHS,
    )
    expect(map.get('t1')).toEqual({ primaryName: '青木一郎', otherCount: 0 })
    expect(map.get('t2')).toEqual({ primaryName: '伊藤二郎', otherCount: 0 })
  })

  it('アサインが無ければ空のマップを返す', () => {
    expect(buildTaskAssigneeMap([], members, MONTHS).size).toBe(0)
  })
})

describe('formatTaskAssignee', () => {
  it('単独担当は氏名のみ', () => {
    expect(formatTaskAssignee({ primaryName: '青木一郎', otherCount: 0 })).toBe(
      '青木一郎',
    )
  })

  it('複数担当は「他N名」を付ける', () => {
    expect(formatTaskAssignee({ primaryName: '青木一郎', otherCount: 2 })).toBe(
      '青木一郎 他2名',
    )
  })

  it('担当なしは空文字（セルに何も出さない）', () => {
    expect(formatTaskAssignee(undefined)).toBe('')
  })
})
