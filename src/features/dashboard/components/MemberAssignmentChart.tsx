import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Member } from '@/shared/types/member'
import {
  getFiscalYearMonths,
  getMemberAssignmentSummary,
  type MemberAssignmentSummary,
} from '../utils/dashboard-utils'

const MONTH_COLORS = [
  '#4A90D9',
  '#5C9BE0',
  '#6EADE7',
  '#E87040',
  '#ED8A60',
  '#F2A480',
  '#50B83C',
  '#6BC856',
  '#86D870',
  '#9C6ADE',
  '#AF83E5',
  '#C29CEC',
]

interface MemberAssignmentChartProps {
  members: Member[]
  assignments: AssignmentEntry[]
  fiscalYear: number
  fiscalYearStartMonth: number
}

export function MemberAssignmentChart({
  members,
  assignments,
  fiscalYear,
  fiscalYearStartMonth,
}: MemberAssignmentChartProps) {
  const months = useMemo(
    () => getFiscalYearMonths(fiscalYear, fiscalYearStartMonth),
    [fiscalYear, fiscalYearStartMonth],
  )

  const summaries = useMemo(
    () =>
      getMemberAssignmentSummary(
        members,
        assignments,
        fiscalYear,
        fiscalYearStartMonth,
      ),
    [members, assignments, fiscalYear, fiscalYearStartMonth],
  )

  // Transform to chart data: one row per member, each month as a key
  const chartData = useMemo(
    () =>
      summaries.map((s: MemberAssignmentSummary) => {
        const row: Record<string, string | number> = {
          memberName: s.memberName,
        }
        for (const month of months) {
          row[month] = s.monthlyTotals[month] ?? 0
        }
        return row
      }),
    [summaries, months],
  )

  // Format month labels: "YYYY-MM" -> "M月"
  const formatMonth = (month: string) => {
    const m = Number.parseInt(month.split('-')[1] ?? '0', 10)
    return `${m}月`
  }

  if (summaries.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
        アサインデータがありません
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="memberName"
          className="text-xs"
          tick={{ fill: 'var(--color-muted-foreground)' }}
        />
        <YAxis
          className="text-xs"
          tick={{ fill: 'var(--color-muted-foreground)' }}
          label={{
            value: '人月',
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
          formatter={(value: number, name: string) => [
            value.toFixed(2),
            formatMonth(name),
          ]}
        />
        <Legend
          formatter={formatMonth}
          wrapperStyle={{ color: 'var(--color-foreground)' }}
        />
        <ReferenceLine
          y={1.0}
          stroke="var(--color-destructive)"
          strokeDasharray="4 4"
          label={{
            value: '1.0 (上限)',
            position: 'right',
            fill: 'var(--color-destructive)',
            fontSize: 12,
          }}
        />
        {months.map((month, i) => (
          <Bar
            key={month}
            dataKey={month}
            fill={MONTH_COLORS[i % MONTH_COLORS.length]}
            name={month}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
