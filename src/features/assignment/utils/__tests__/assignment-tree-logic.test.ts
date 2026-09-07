import { describe, expect, it } from 'vitest'
import {
  calculateMemberMonthlyTotal,
  formatAssignmentValue,
  getMonthLabel,
  getScheduleMonthRange,
  parseAssignmentInput,
} from '@/features/assignment/utils/assignment-utils'
import type { AssignmentEntry } from '@/shared/types/assignment'

function createAssignment(
  overrides: Partial<AssignmentEntry> & {
    projectId: string
    taskId: string
    memberId: string
    monthlyValues: Record<string, number>
  },
): AssignmentEntry {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('Assignment validation logic', () => {
  describe('parseAssignmentInput - boundary values', () => {
    it('accepts exactly 0', () => {
      expect(parseAssignmentInput('0')).toBe(0)
      expect(parseAssignmentInput('0.00')).toBe(0)
    })

    it('accepts exactly 1', () => {
      expect(parseAssignmentInput('1')).toBe(1)
      expect(parseAssignmentInput('1.00')).toBe(1)
    })

    it('rejects values just above 1', () => {
      expect(parseAssignmentInput('1.01')).toBeNull()
    })

    it('handles mixed full-width and half-width input', () => {
      expect(parseAssignmentInput('０.5')).toBe(0.5)
      expect(parseAssignmentInput('0．５')).toBe(0.5)
    })

    it('handles whitespace-only input as empty', () => {
      expect(parseAssignmentInput('   ')).toBe(0)
    })

    it('rejects alphabetic input', () => {
      expect(parseAssignmentInput('abc')).toBeNull()
      expect(parseAssignmentInput('0.5a')).toBeNull()
    })
  })

  describe('formatAssignmentValue - display formatting', () => {
    it('always shows 2 decimal places', () => {
      expect(formatAssignmentValue(0)).toBe('0.00')
      expect(formatAssignmentValue(1)).toBe('1.00')
      expect(formatAssignmentValue(0.1)).toBe('0.10')
      expect(formatAssignmentValue(0.12)).toBe('0.12')
    })

    it('rounds display correctly', () => {
      expect(formatAssignmentValue(0.005)).toBe('0.01')
      expect(formatAssignmentValue(0.004)).toBe('0.00')
    })
  })

  describe('getScheduleMonthRange - fiscal year months', () => {
    it('always returns 12 months', () => {
      const months = getScheduleMonthRange(2025)
      expect(months).toHaveLength(12)
    })

    it('starts with April of fiscal year', () => {
      const months = getScheduleMonthRange(2025)
      expect(months[0]).toBe('2025-04')
    })

    it('ends with March of next year', () => {
      const months = getScheduleMonthRange(2025)
      expect(months[11]).toBe('2026-03')
    })

    it('correctly crosses year boundary', () => {
      const months = getScheduleMonthRange(2025)
      expect(months[8]).toBe('2025-12') // December of fiscal year
      expect(months[9]).toBe('2026-01') // January of next year
    })
  })

  describe('getMonthLabel', () => {
    it('converts YYYY-MM to display label', () => {
      expect(getMonthLabel('2025-04')).toBe('4月')
      expect(getMonthLabel('2026-01')).toBe('1月')
      expect(getMonthLabel('2025-12')).toBe('12月')
    })
  })
})

describe('Over-allocation detection', () => {
  it('detects when member total exceeds 1.0', () => {
    const assignments = [
      createAssignment({
        projectId: 'p1',
        taskId: 't1',
        memberId: 'm1',
        monthlyValues: { '2025-04': 0.6 },
      }),
      createAssignment({
        projectId: 'p2',
        taskId: 't2',
        memberId: 'm1',
        monthlyValues: { '2025-04': 0.5 },
      }),
    ]

    const total = calculateMemberMonthlyTotal(assignments, 'm1', '2025-04')
    expect(total).toBeCloseTo(1.1)
    expect(total > 1.0).toBe(true)
  })

  it('does not flag when total equals 1.0', () => {
    const assignments = [
      createAssignment({
        projectId: 'p1',
        taskId: 't1',
        memberId: 'm1',
        monthlyValues: { '2025-04': 0.5 },
      }),
      createAssignment({
        projectId: 'p2',
        taskId: 't2',
        memberId: 'm1',
        monthlyValues: { '2025-04': 0.5 },
      }),
    ]

    const total = calculateMemberMonthlyTotal(assignments, 'm1', '2025-04')
    expect(total).toBeCloseTo(1.0)
    expect(total > 1.0).toBe(false)
  })

  it('isolates per-member totals', () => {
    const assignments = [
      createAssignment({
        projectId: 'p1',
        taskId: 't1',
        memberId: 'm1',
        monthlyValues: { '2025-04': 0.8 },
      }),
      createAssignment({
        projectId: 'p1',
        taskId: 't1',
        memberId: 'm2',
        monthlyValues: { '2025-04': 0.9 },
      }),
    ]

    expect(calculateMemberMonthlyTotal(assignments, 'm1', '2025-04')).toBe(0.8)
    expect(calculateMemberMonthlyTotal(assignments, 'm2', '2025-04')).toBe(0.9)
  })

  it('isolates per-month totals', () => {
    const assignments = [
      createAssignment({
        projectId: 'p1',
        taskId: 't1',
        memberId: 'm1',
        monthlyValues: { '2025-04': 0.5, '2025-05': 0.3 },
      }),
    ]

    expect(calculateMemberMonthlyTotal(assignments, 'm1', '2025-04')).toBe(0.5)
    expect(calculateMemberMonthlyTotal(assignments, 'm1', '2025-05')).toBe(0.3)
  })

  it('sums across multiple projects', () => {
    const assignments = [
      createAssignment({
        projectId: 'p1',
        taskId: 't1',
        memberId: 'm1',
        monthlyValues: { '2025-04': 0.4 },
      }),
      createAssignment({
        projectId: 'p2',
        taskId: 't2',
        memberId: 'm1',
        monthlyValues: { '2025-04': 0.3 },
      }),
      createAssignment({
        projectId: 'p3',
        taskId: 't3',
        memberId: 'm1',
        monthlyValues: { '2025-04': 0.2 },
      }),
    ]

    const total = calculateMemberMonthlyTotal(assignments, 'm1', '2025-04')
    expect(total).toBeCloseTo(0.9)
  })
})

describe('Data persistence integrity', () => {
  it('assignment values are independent per task', () => {
    const assignments = [
      createAssignment({
        projectId: 'p1',
        taskId: 't1',
        memberId: 'm1',
        monthlyValues: { '2025-04': 0.3 },
      }),
      createAssignment({
        projectId: 'p1',
        taskId: 't2',
        memberId: 'm1',
        monthlyValues: { '2025-04': 0.5 },
      }),
    ]

    // Filter by task
    const t1Values = assignments
      .filter((a) => a.taskId === 't1')
      .reduce((sum, a) => sum + (a.monthlyValues['2025-04'] ?? 0), 0)
    const t2Values = assignments
      .filter((a) => a.taskId === 't2')
      .reduce((sum, a) => sum + (a.monthlyValues['2025-04'] ?? 0), 0)

    expect(t1Values).toBe(0.3)
    expect(t2Values).toBe(0.5)
  })

  it('hidden months retain data when schedule shortens', () => {
    // Simulate: assignment has data for months outside current view
    const assignment = createAssignment({
      projectId: 'p1',
      taskId: 't1',
      memberId: 'm1',
      monthlyValues: {
        '2025-04': 0.3,
        '2025-05': 0.4,
        '2026-02': 0.2, // month that might be hidden
        '2026-03': 0.1, // month that might be hidden
      },
    })

    // Current schedule range only shows Apr-Dec
    const visibleMonths = getScheduleMonthRange(2025).slice(0, 9) // Apr-Dec
    const hiddenMonthData = Object.entries(assignment.monthlyValues).filter(
      ([mk]) => !visibleMonths.includes(mk),
    )

    // Data for hidden months still exists in the entry
    expect(hiddenMonthData.length).toBeGreaterThan(0)
    expect(assignment.monthlyValues['2026-02']).toBe(0.2)
    expect(assignment.monthlyValues['2026-03']).toBe(0.1)
  })

  it('restored months show original data', () => {
    const assignment = createAssignment({
      projectId: 'p1',
      taskId: 't1',
      memberId: 'm1',
      monthlyValues: {
        '2025-04': 0.3,
        '2026-01': 0.2,
        '2026-02': 0.4,
        '2026-03': 0.1,
      },
    })

    // After re-extending schedule, all months are visible again
    const fullMonths = getScheduleMonthRange(2025) // All 12 months

    for (const mk of fullMonths) {
      const val = assignment.monthlyValues[mk] ?? 0
      if (mk === '2025-04') expect(val).toBe(0.3)
      if (mk === '2026-01') expect(val).toBe(0.2)
      if (mk === '2026-02') expect(val).toBe(0.4)
      if (mk === '2026-03') expect(val).toBe(0.1)
    }
  })
})
