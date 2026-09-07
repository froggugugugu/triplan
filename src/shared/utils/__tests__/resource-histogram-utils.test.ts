import { describe, expect, it } from 'vitest'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Member } from '@/shared/types/member'
import {
  calcProjectMemberHistogram,
  calcResourceHistogram,
  isMemberActiveInMonth,
} from '../resource-histogram-utils'

const PROJECT_ID = crypto.randomUUID()
const OTHER_PROJECT_ID = crypto.randomUUID()
const MEMBER_A = crypto.randomUUID()
const MEMBER_B = crypto.randomUUID()

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: MEMBER_A,
    name: 'メンバーA',
    sectionId: null,
    companyId: null,
    role: '',
    isActive: true,
    techTagIds: [],
    startDate: null,
    endDate: null,
    unitPriceHistory: [],
    contractUnitPriceHistory: [],
    createdAt: '2025-04-01T00:00:00.000Z',
    updatedAt: '2025-04-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeAssignment(
  overrides: Partial<AssignmentEntry> = {},
): AssignmentEntry {
  return {
    id: crypto.randomUUID(),
    projectId: PROJECT_ID,
    taskId: crypto.randomUUID(),
    memberId: MEMBER_A,
    monthlyValues: {},
    createdAt: '2025-04-01T00:00:00.000Z',
    updatedAt: '2025-04-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('isMemberActiveInMonth', () => {
  it('開始日・終了日が未設定なら常に在籍扱い', () => {
    expect(isMemberActiveInMonth(makeMember(), '2025-04')).toBe(true)
  })

  it('開始月より前は在籍していない', () => {
    const member = makeMember({ startDate: '2025-06-01' })
    expect(isMemberActiveInMonth(member, '2025-05')).toBe(false)
    expect(isMemberActiveInMonth(member, '2025-06')).toBe(true)
  })

  it('終了月より後は在籍していない', () => {
    const member = makeMember({ endDate: '2025-09-30' })
    expect(isMemberActiveInMonth(member, '2025-09')).toBe(true)
    expect(isMemberActiveInMonth(member, '2025-10')).toBe(false)
  })

  // 反証: 退職者・休職者を供給キャパシティに数えると「人が足りている」と誤認する
  it('反証: isActive=falseなら在籍期間内でも在籍扱いにしない', () => {
    const member = makeMember({ isActive: false })
    expect(isMemberActiveInMonth(member, '2025-04')).toBe(false)
  })
})

describe('calcResourceHistogram', () => {
  const months = ['2025-04', '2025-05']

  it('月ごとの需要（アサイン合計）と供給（稼働率上限合計）を返す', () => {
    const members = [
      makeMember({ id: MEMBER_A }),
      makeMember({ id: MEMBER_B, name: 'メンバーB', capacityRatio: 0.5 }),
    ]
    const assignments = [
      makeAssignment({
        memberId: MEMBER_A,
        monthlyValues: { '2025-04': 0.8, '2025-05': 1.0 },
      }),
      makeAssignment({
        memberId: MEMBER_B,
        monthlyValues: { '2025-04': 0.5 },
      }),
    ]
    expect(calcResourceHistogram(months, members, assignments)).toEqual([
      { month: '2025-04', demand: 1.3, supply: 1.5 },
      { month: '2025-05', demand: 1.0, supply: 1.5 },
    ])
  })

  // 反証: capacityRatioを無視して1人=1.0で数えると、時短メンバーの分だけ供給が過大になる
  it('反証: 時短メンバーの供給はcapacityRatio分だけ計上される', () => {
    const members = [makeMember({ capacityRatio: 0.6 })]
    const result = calcResourceHistogram(['2025-04'], members, [])
    expect(result[0]?.supply).toBe(0.6)
  })

  it('capacityRatio未設定のメンバーは1.0として計上する', () => {
    const result = calcResourceHistogram(['2025-04'], [makeMember()], [])
    expect(result[0]?.supply).toBe(1)
  })

  // 反証: 対象外メンバーのアサインを需要に含めると、部門ごとの需給比較が壊れる
  it('反証: membersに含まれないメンバーのアサインは需要に含めない', () => {
    const assignments = [
      makeAssignment({
        memberId: MEMBER_B,
        monthlyValues: { '2025-04': 1.0 },
      }),
    ]
    const result = calcResourceHistogram(
      ['2025-04'],
      [makeMember({ id: MEMBER_A })],
      assignments,
    )
    expect(result[0]?.demand).toBe(0)
  })

  // 反証: 退職月以降も供給に数えると、離任後の月で需給が過大に見える
  it('反証: 終了日を過ぎた月は供給から外れる', () => {
    const members = [makeMember({ endDate: '2025-04-30' })]
    const result = calcResourceHistogram(months, members, [])
    expect(result[0]?.supply).toBe(1)
    expect(result[1]?.supply).toBe(0)
  })

  it('メンバーもアサインも無い場合は需要・供給とも0になる', () => {
    expect(calcResourceHistogram(['2025-04'], [], [])).toEqual([
      { month: '2025-04', demand: 0, supply: 0 },
    ])
  })
})

describe('calcProjectMemberHistogram', () => {
  const months = ['2025-04', '2025-05']

  it('月×メンバーの配分を積み上げ用の行データに変換する', () => {
    const assignments = [
      makeAssignment({
        memberId: MEMBER_A,
        monthlyValues: { '2025-04': 0.5, '2025-05': 1.0 },
      }),
      makeAssignment({
        memberId: MEMBER_B,
        monthlyValues: { '2025-05': 0.3 },
      }),
    ]
    const { points, memberIds } = calcProjectMemberHistogram(
      months,
      PROJECT_ID,
      assignments,
    )
    expect(memberIds).toHaveLength(2)
    expect(points[0]).toEqual({
      month: '2025-04',
      [MEMBER_A]: 0.5,
      [MEMBER_B]: 0,
    })
    expect(points[1]).toEqual({
      month: '2025-05',
      [MEMBER_A]: 1.0,
      [MEMBER_B]: 0.3,
    })
  })

  it('同一メンバーが複数タスクにアサインされている場合は月ごとに合算する', () => {
    const assignments = [
      makeAssignment({ monthlyValues: { '2025-04': 0.4 } }),
      makeAssignment({ monthlyValues: { '2025-04': 0.3 } }),
    ]
    const { points } = calcProjectMemberHistogram(
      ['2025-04'],
      PROJECT_ID,
      assignments,
    )
    expect(points[0]?.[MEMBER_A]).toBeCloseTo(0.7)
  })

  // 反証: 他案件のアサインを含めると案件の山が過大になる
  it('反証: 他案件のアサインは含めない', () => {
    const assignments = [
      makeAssignment({
        projectId: OTHER_PROJECT_ID,
        monthlyValues: { '2025-04': 1.0 },
      }),
    ]
    const { points, memberIds } = calcProjectMemberHistogram(
      ['2025-04'],
      PROJECT_ID,
      assignments,
    )
    expect(memberIds).toEqual([])
    expect(points[0]).toEqual({ month: '2025-04' })
  })

  // 反証: 表示期間外にしか配分の無いメンバーを凡例に出すと、凡例が無関係な人で埋まる
  it('反証: 表示対象月に配分が無いメンバーは凡例に含めない', () => {
    const assignments = [
      makeAssignment({ memberId: MEMBER_B, monthlyValues: { '2026-01': 1.0 } }),
    ]
    const { memberIds } = calcProjectMemberHistogram(
      months,
      PROJECT_ID,
      assignments,
    )
    expect(memberIds).toEqual([])
  })

  it('アサインが1件も無い案件でも例外にならず月だけの行を返す', () => {
    expect(() =>
      calcProjectMemberHistogram(months, PROJECT_ID, []),
    ).not.toThrow()
    const { points, memberIds } = calcProjectMemberHistogram(
      months,
      PROJECT_ID,
      [],
    )
    expect(memberIds).toEqual([])
    expect(points).toHaveLength(2)
  })
})
