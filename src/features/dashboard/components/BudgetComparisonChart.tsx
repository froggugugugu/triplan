import { useCallback, useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Division } from '@/shared/types/division'
import type { Member } from '@/shared/types/member'
import type { Section } from '@/shared/types/section'
import {
  calcDivisionBudget,
  calcDivisionExpectedRevenue,
} from '@/shared/utils/budget-utils'

interface BudgetComparisonChartProps {
  divisions: Division[]
  sections: Section[]
  members: Member[]
  assignments: AssignmentEntry[]
  fiscalYear: number
  fiscalYearStartMonth: number
}

export function BudgetComparisonChart({
  divisions,
  sections,
  members,
  assignments,
  fiscalYear,
  fiscalYearStartMonth,
}: BudgetComparisonChartProps) {
  const getMemberMonthlyTotal = useCallback(
    (memberId: string, monthKey: string): number => {
      let total = 0
      for (const a of assignments) {
        if (a.memberId === memberId) {
          total += a.monthlyValues[monthKey] ?? 0
        }
      }
      return total
    },
    [assignments],
  )

  const chartData = useMemo(() => {
    const sorted = [...divisions].sort((a, b) => a.sortOrder - b.sortOrder)
    return sorted
      .map((div) => {
        const divSections = sections.filter((s) => s.divisionId === div.id)
        const budget = calcDivisionBudget(
          divSections,
          members,
          fiscalYear,
          fiscalYearStartMonth,
        )
        const expected = calcDivisionExpectedRevenue(
          divSections,
          members,
          getMemberMonthlyTotal,
          fiscalYear,
          fiscalYearStartMonth,
        )
        return { name: div.name, budget, expected }
      })
      .filter((d) => d.budget > 0 || d.expected > 0)
  }, [
    divisions,
    sections,
    members,
    getMemberMonthlyTotal,
    fiscalYear,
    fiscalYearStartMonth,
  ])

  if (chartData.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
        売上データがありません
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="name"
          className="text-xs"
          tick={{ fill: 'var(--color-muted-foreground)' }}
        />
        <YAxis
          className="text-xs"
          tick={{ fill: 'var(--color-muted-foreground)' }}
          label={{
            value: '万円',
            angle: -90,
            position: 'insideLeft',
            fill: 'var(--color-muted-foreground)',
          }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--color-popover)',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            color: 'var(--color-popover-foreground)',
          }}
          formatter={(value: number, name: string, props) => {
            const label = name === 'budget' ? '売上予算' : '見込売上'
            const entry = props.payload as {
              budget: number
              expected: number
            }
            const rate =
              entry.budget > 0
                ? ((entry.expected / entry.budget) * 100).toFixed(1)
                : '-'
            if (name === 'expected') {
              return [
                `${value.toLocaleString()} 万円（達成率: ${rate}%）`,
                label,
              ]
            }
            return [`${value.toLocaleString()} 万円`, label]
          }}
        />
        <Bar
          dataKey="budget"
          fill="#3b82f6"
          name="budget"
          radius={[2, 2, 0, 0]}
        />
        <Bar
          dataKey="expected"
          fill="#22c55e"
          name="expected"
          radius={[2, 2, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
