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
import type { Member } from '@/shared/types/member'
import { calcProjectMemberHistogram } from '@/shared/utils/resource-histogram-utils'

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

interface ProjectResourceHistogramProps {
  projectId: string
  assignments: AssignmentEntry[]
  members: Member[]
  /** 表示対象の月キー（"YYYY-MM"） */
  monthKeys: string[]
}

function formatMonth(month: string): string {
  const parts = month.split('-')
  return `${Number(parts[1])}月`
}

/**
 * 1案件の月×メンバー別アサイン配分を積み上げた要員山積みグラフ
 * （非公開の設計文書）。案件の立ち上がり・ピーク・収束の形が見え、
 * ベースラインのPV曲線と同じデータの別表現になる。
 */
export function ProjectResourceHistogram({
  projectId,
  assignments,
  members,
  monthKeys,
}: ProjectResourceHistogramProps) {
  const { points, memberIds } = useMemo(
    () => calcProjectMemberHistogram(monthKeys, projectId, assignments),
    [monthKeys, projectId, assignments],
  )

  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  )

  if (memberIds.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
        この期間にアサインされたメンバーがいません
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={points}>
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
          formatter={(value: number, name: string) => [
            value.toFixed(2),
            memberMap.get(name)?.name ?? name,
          ]}
        />
        <Legend
          formatter={(value: string) => memberMap.get(value)?.name ?? value}
          wrapperStyle={{ color: 'var(--color-foreground)' }}
        />
        {memberIds.map((memberId, i) => (
          <Bar
            key={memberId}
            dataKey={memberId}
            stackId="stack"
            fill={CHART_COLORS[i % CHART_COLORS.length]}
            name={memberId}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
