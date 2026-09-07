import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Project } from '@/shared/types/project'
import { getProjectMonthlyAssignments } from '../utils/dashboard-utils'

const CHART_COLORS = [
  '#4A90D9',
  '#E87040',
  '#50B83C',
  '#9C6ADE',
  '#F49342',
  '#47C1BF',
  '#DE3618',
  '#5C6AC4',
  '#EEC200',
  '#8B5CF6',
  '#2E72D2',
  '#FFC107',
]

interface ProjectAssignmentChartProps {
  assignments: AssignmentEntry[]
  projects: Project[]
  fiscalYear: number
  fiscalYearStartMonth: number
}

export function ProjectAssignmentChart({
  assignments,
  projects,
  fiscalYear,
  fiscalYearStartMonth,
}: ProjectAssignmentChartProps) {
  const chartData = useMemo(
    () =>
      getProjectMonthlyAssignments(
        assignments,
        fiscalYear,
        fiscalYearStartMonth,
      ),
    [assignments, fiscalYear, fiscalYearStartMonth],
  )

  // Collect unique project IDs that appear in the data
  const projectIds = useMemo(() => {
    const ids = new Set<string>()
    for (const row of chartData) {
      for (const key of Object.keys(row)) {
        if (key !== 'month') ids.add(key)
      }
    }
    return Array.from(ids)
  }, [chartData])

  // Map project IDs to display names
  const projectMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  )

  // Format month labels: "YYYY-MM" -> "M月"
  const formatMonth = (month: string) => {
    const m = Number.parseInt(month.split('-')[1] ?? '0', 10)
    return `${m}月`
  }

  if (projectIds.length === 0) {
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
          dataKey="month"
          tickFormatter={formatMonth}
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
          labelFormatter={formatMonth}
          formatter={(value: number, name: string) => {
            const project = projectMap.get(name)
            const label = project ? `${project.code}: ${project.name}` : name
            return [value.toFixed(2), label]
          }}
        />
        <Legend
          formatter={(value: string) => {
            const project = projectMap.get(value)
            return project ? `${project.code}: ${project.name}` : value
          }}
          wrapperStyle={{ color: 'var(--color-foreground)' }}
        />
        {projectIds.map((projectId, i) => (
          <Bar
            key={projectId}
            dataKey={projectId}
            stackId="stack"
            fill={CHART_COLORS[i % CHART_COLORS.length]}
            name={projectId}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
