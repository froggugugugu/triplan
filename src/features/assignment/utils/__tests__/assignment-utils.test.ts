import { describe, expect, it } from 'vitest'
import {
  calculateMemberMonthlyTotal,
  filterAssignmentsByConfidence,
  filterMembersByOrganization,
  formatAssignmentValue,
  formatProjectNameWithConfidence,
  getMonthLabel,
  getMonthRangeFromSchedule,
  getScheduleMonthRange,
  isOverCapacity,
  parseAssignmentInput,
} from '@/features/assignment/utils/assignment-utils'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Member } from '@/shared/types/member'
import type { Project } from '@/shared/types/project'
import type { ScheduleEntry } from '@/shared/types/schedule'
import type { Section } from '@/shared/types/section'

describe('formatAssignmentValue', () => {
  it('formats to 2 decimal places with zero-padding', () => {
    expect(formatAssignmentValue(0)).toBe('0.00')
    expect(formatAssignmentValue(0.5)).toBe('0.50')
    expect(formatAssignmentValue(0.05)).toBe('0.05')
    expect(formatAssignmentValue(1)).toBe('1.00')
    expect(formatAssignmentValue(0.12)).toBe('0.12')
    expect(formatAssignmentValue(0.1)).toBe('0.10')
  })
})

describe('parseAssignmentInput', () => {
  it('returns 0 for empty string', () => {
    expect(parseAssignmentInput('')).toBe(0)
    expect(parseAssignmentInput('  ')).toBe(0)
  })

  it('returns null for negative values', () => {
    expect(parseAssignmentInput('-1')).toBeNull()
    expect(parseAssignmentInput('-0.5')).toBeNull()
  })

  it('returns null for values over 1', () => {
    expect(parseAssignmentInput('1.01')).toBeNull()
    expect(parseAssignmentInput('2')).toBeNull()
  })

  it('returns null for non-numeric input', () => {
    expect(parseAssignmentInput('abc')).toBeNull()
    expect(parseAssignmentInput('1.2.3')).toBeNull()
  })

  it('parses valid half-width input', () => {
    expect(parseAssignmentInput('0.50')).toBe(0.5)
    expect(parseAssignmentInput('0.05')).toBe(0.05)
    expect(parseAssignmentInput('1')).toBe(1)
    expect(parseAssignmentInput('0')).toBe(0)
    expect(parseAssignmentInput('0.33')).toBe(0.33)
  })

  it('converts full-width digits to half-width', () => {
    expect(parseAssignmentInput('０．５０')).toBe(0.5)
    expect(parseAssignmentInput('１')).toBe(1)
    expect(parseAssignmentInput('０．１２')).toBe(0.12)
  })

  it('rounds to 2 decimal places', () => {
    expect(parseAssignmentInput('0.333')).toBe(0.33)
    expect(parseAssignmentInput('0.999')).toBe(1) // rounds to 1.00 which is valid
    expect(parseAssignmentInput('1.006')).toBeNull() // rounds to 1.01 which exceeds 1
  })
})

describe('getScheduleMonthRange', () => {
  it('generates 12 months from April to March for fiscal year', () => {
    const months = getScheduleMonthRange(2025)
    expect(months).toHaveLength(12)
    expect(months[0]).toBe('2025-04')
    expect(months[1]).toBe('2025-05')
    expect(months[8]).toBe('2025-12')
    expect(months[9]).toBe('2026-01')
    expect(months[10]).toBe('2026-02')
    expect(months[11]).toBe('2026-03')
  })

  it('handles year boundary correctly', () => {
    const months = getScheduleMonthRange(2024)
    expect(months[0]).toBe('2024-04')
    expect(months[11]).toBe('2025-03')
  })

  it('generates 12 months from January to December for startMonth=1', () => {
    const months = getScheduleMonthRange(2025, 1)
    expect(months).toHaveLength(12)
    expect(months[0]).toBe('2025-01')
    expect(months[11]).toBe('2025-12')
  })

  it('generates 12 months from October for startMonth=10', () => {
    const months = getScheduleMonthRange(2025, 10)
    expect(months).toHaveLength(12)
    expect(months[0]).toBe('2025-10')
    expect(months[1]).toBe('2025-11')
    expect(months[2]).toBe('2025-12')
    expect(months[3]).toBe('2026-01')
    expect(months[11]).toBe('2026-09')
  })
})

describe('calculateMemberMonthlyTotal', () => {
  const createAssignment = (
    memberId: string,
    monthlyValues: Record<string, number>,
  ): AssignmentEntry => ({
    id: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    taskId: crypto.randomUUID(),
    memberId,
    monthlyValues,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  it('returns 0 when no assignments for member', () => {
    const result = calculateMemberMonthlyTotal([], 'member-1', '2025-04')
    expect(result).toBe(0)
  })

  it('sums values across assignments for same member and month', () => {
    const assignments = [
      createAssignment('member-1', { '2025-04': 0.3, '2025-05': 0.2 }),
      createAssignment('member-1', { '2025-04': 0.4 }),
    ]

    expect(
      calculateMemberMonthlyTotal(assignments, 'member-1', '2025-04'),
    ).toBe(0.7)
    expect(
      calculateMemberMonthlyTotal(assignments, 'member-1', '2025-05'),
    ).toBe(0.2)
  })

  it('ignores assignments for other members', () => {
    const assignments = [
      createAssignment('member-1', { '2025-04': 0.5 }),
      createAssignment('member-2', { '2025-04': 0.8 }),
    ]

    expect(
      calculateMemberMonthlyTotal(assignments, 'member-1', '2025-04'),
    ).toBe(0.5)
  })

  it('returns 0 when month has no values', () => {
    const assignments = [createAssignment('member-1', { '2025-04': 0.5 })]

    expect(
      calculateMemberMonthlyTotal(assignments, 'member-1', '2025-05'),
    ).toBe(0)
  })
})

describe('getMonthLabel', () => {
  it('extracts month number and adds suffix', () => {
    expect(getMonthLabel('2025-04')).toBe('4月')
    expect(getMonthLabel('2025-12')).toBe('12月')
    expect(getMonthLabel('2026-01')).toBe('1月')
    expect(getMonthLabel('2026-03')).toBe('3月')
  })
})

describe('getMonthRangeFromSchedule', () => {
  const makeEntry = (startDate: string, endDate: string): ScheduleEntry => ({
    id: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    phaseKey: 'phase-1',
    startDate,
    endDate,
  })

  it('returns empty array for no entries', () => {
    expect(getMonthRangeFromSchedule([])).toEqual([])
  })

  it('returns month range from single entry', () => {
    const entries = [makeEntry('2025-04-01', '2025-06-30')]
    const result = getMonthRangeFromSchedule(entries)
    expect(result).toEqual(['2025-04', '2025-05', '2025-06'])
  })

  it('spans across year boundary', () => {
    const entries = [makeEntry('2025-11-01', '2026-02-28')]
    const result = getMonthRangeFromSchedule(entries)
    expect(result).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })

  it('uses earliest start and latest end across multiple entries', () => {
    const entries = [
      makeEntry('2025-06-01', '2025-09-30'),
      makeEntry('2025-04-01', '2025-07-31'),
      makeEntry('2025-08-01', '2025-12-31'),
    ]
    const result = getMonthRangeFromSchedule(entries)
    expect(result[0]).toBe('2025-04')
    expect(result[result.length - 1]).toBe('2025-12')
    expect(result).toHaveLength(9)
  })

  it('handles single month range', () => {
    const entries = [makeEntry('2025-07-01', '2025-07-31')]
    const result = getMonthRangeFromSchedule(entries)
    expect(result).toEqual(['2025-07'])
  })
})

describe('formatProjectNameWithConfidence', () => {
  it('appends confidence in parentheses when present', () => {
    expect(formatProjectNameWithConfidence('案件A', 'A')).toBe('案件A (A)')
    expect(formatProjectNameWithConfidence('案件B', 'S')).toBe('案件B (S)')
    expect(formatProjectNameWithConfidence('案件C', 'B')).toBe('案件C (B)')
    expect(formatProjectNameWithConfidence('案件D', 'C')).toBe('案件D (C)')
  })

  it('returns name only when confidence is null', () => {
    expect(formatProjectNameWithConfidence('案件A', null)).toBe('案件A')
  })

  it('returns name only when confidence is undefined', () => {
    expect(formatProjectNameWithConfidence('案件A', undefined)).toBe('案件A')
  })
})

describe('filterMembersByOrganization', () => {
  const now = new Date().toISOString()

  const makeMember = (
    id: string,
    name: string,
    sectionId: string | null,
  ): Member => ({
    id,
    name,
    sectionId,
    role: 'エンジニア',
    isActive: true,
    techTagIds: [],
    startDate: '2025-04-01',
    endDate: null,
    unitPriceHistory: [],
    createdAt: now,
    updatedAt: now,
  })

  const makeSection = (
    id: string,
    divisionId: string,
    name: string,
  ): Section => ({
    id,
    divisionId,
    name,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  })

  const sections: Section[] = [
    makeSection('sec-1', 'div-1', '開発1課'),
    makeSection('sec-2', 'div-1', '開発2課'),
    makeSection('sec-3', 'div-2', 'デザイン課'),
  ]

  const members: Member[] = [
    makeMember('m1', '田中', 'sec-1'),
    makeMember('m2', '鈴木', 'sec-1'),
    makeMember('m3', '佐藤', 'sec-2'),
    makeMember('m4', '高橋', 'sec-3'),
    makeMember('m5', '伊藤', null),
  ]

  it('部門・課ともに未選択の場合は全メンバーを返す', () => {
    const result = filterMembersByOrganization(members, sections, '', '')
    expect(result).toHaveLength(5)
  })

  it('「未所属」を選択するとsectionIdがnullのメンバーのみ返す', () => {
    const result = filterMembersByOrganization(
      members,
      sections,
      '__unaffiliated__',
      '',
    )
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('m5')
  })

  it('部門を選択すると、その部門配下の課に所属するメンバーのみ返す', () => {
    const result = filterMembersByOrganization(members, sections, 'div-1', '')
    expect(result).toHaveLength(3)
    const ids = result.map((m) => m.id).sort()
    expect(ids).toEqual(['m1', 'm2', 'm3'])
  })

  it('部門+課を選択すると、その課に所属するメンバーのみ返す', () => {
    const result = filterMembersByOrganization(
      members,
      sections,
      'div-1',
      'sec-2',
    )
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('m3')
  })

  it('該当メンバーがいない部門の場合は空配列を返す', () => {
    const result = filterMembersByOrganization(
      members,
      sections,
      'div-unknown',
      '',
    )
    expect(result).toHaveLength(0)
  })

  it('全メンバーが未所属の場合、部門フィルタで空配列を返す', () => {
    const unaffiliatedMembers = [
      makeMember('m10', 'テスト', null),
      makeMember('m11', 'テスト2', null),
    ]
    const result = filterMembersByOrganization(
      unaffiliatedMembers,
      sections,
      'div-1',
      '',
    )
    expect(result).toHaveLength(0)
  })
})

describe('filterAssignmentsByConfidence', () => {
  const now = new Date().toISOString()

  const makeProject = (
    id: string,
    confidence: 'S' | 'A' | 'B' | 'C' | null,
  ): Project => ({
    id,
    code: `P${id}`,
    name: `Project ${id}`,
    description: '',
    parentId: null,
    level: 0,
    status: 'active',
    confidence,
    completed: false,
    createdAt: now,
    updatedAt: now,
  })

  const makeAssignment = (
    projectId: string,
    memberId: string,
  ): AssignmentEntry => ({
    id: crypto.randomUUID(),
    projectId,
    taskId: crypto.randomUUID(),
    memberId,
    monthlyValues: { '2025-04': 0.5 },
    createdAt: now,
    updatedAt: now,
  })

  const projects = [
    makeProject('p1', 'S'),
    makeProject('p2', 'A'),
    makeProject('p3', 'B'),
    makeProject('p4', 'C'),
    makeProject('p5', null),
  ]

  const assignments = [
    makeAssignment('p1', 'm1'),
    makeAssignment('p2', 'm1'),
    makeAssignment('p3', 'm2'),
    makeAssignment('p4', 'm2'),
    makeAssignment('p5', 'm3'),
  ]

  it('returns all assignments when all confidences selected', () => {
    const selected = new Set(['S', 'A', 'B', 'C', '__null__'])
    const result = filterAssignmentsByConfidence(
      assignments,
      projects,
      selected,
    )
    expect(result).toHaveLength(5)
  })

  it('returns empty when no confidences selected', () => {
    const selected = new Set<string>()
    const result = filterAssignmentsByConfidence(
      assignments,
      projects,
      selected,
    )
    expect(result).toHaveLength(0)
  })

  it('filters to only S confidence', () => {
    const selected = new Set(['S'])
    const result = filterAssignmentsByConfidence(
      assignments,
      projects,
      selected,
    )
    expect(result).toHaveLength(1)
    expect(result[0]?.projectId).toBe('p1')
  })

  it('filters to null confidence using __null__ key', () => {
    const selected = new Set(['__null__'])
    const result = filterAssignmentsByConfidence(
      assignments,
      projects,
      selected,
    )
    expect(result).toHaveLength(1)
    expect(result[0]?.projectId).toBe('p5')
  })

  it('filters mixed selection (A + C)', () => {
    const selected = new Set(['A', 'C'])
    const result = filterAssignmentsByConfidence(
      assignments,
      projects,
      selected,
    )
    expect(result).toHaveLength(2)
    const projectIds = result.map((r) => r.projectId).sort()
    expect(projectIds).toEqual(['p2', 'p4'])
  })

  it('excludes assignments for unknown projects', () => {
    const unknownAssignment = makeAssignment('unknown-id', 'm1')
    const selected = new Set(['S', 'A', 'B', 'C', '__null__'])
    const result = filterAssignmentsByConfidence(
      [unknownAssignment],
      projects,
      selected,
    )
    expect(result).toHaveLength(0)
  })
})

describe('isOverCapacity', () => {
  it('稼働率上限を超えていればtrueを返す', () => {
    expect(isOverCapacity(1.2, 1)).toBe(true)
    expect(isOverCapacity(0.6, 0.5)).toBe(true)
  })

  it('稼働率上限ちょうどは超過扱いにしない', () => {
    expect(isOverCapacity(1.0, 1)).toBe(false)
    expect(isOverCapacity(0.5, 0.5)).toBe(false)
  })

  // 反証: capacityRatio未設定（既存データ）は1.0として扱う
  it('反証: capacityRatioがundefinedなら1.0を上限として判定する', () => {
    expect(isOverCapacity(1.0, undefined)).toBe(false)
    expect(isOverCapacity(1.01, undefined)).toBe(true)
  })

  // 反証: 時短勤務のメンバーは1.0未満でも超過になる（固定値1.0で判定していない）
  it('反証: 時短メンバー（上限0.5）は0.8で超過と判定される', () => {
    expect(isOverCapacity(0.8, 0.5)).toBe(true)
  })

  // 反証: 浮動小数点の丸め誤差（0.1+0.2=0.30000000000000004）で誤検知しない
  it('反証: 浮動小数点の丸め誤差では超過と判定しない', () => {
    expect(isOverCapacity(0.1 + 0.2, 0.3)).toBe(false)
    expect(isOverCapacity(0.7 + 0.1 + 0.2, 1)).toBe(false)
  })
})
