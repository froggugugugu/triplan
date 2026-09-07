import { useMemo } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Member } from '@/shared/types/member'
import { calcResourceHistogram } from '@/shared/utils/resource-histogram-utils'

interface ResourceDemandSupplyChartProps {
  members: Member[]
  assignments: AssignmentEntry[]
  /** 表示対象の月キー（"YYYY-MM"）。年度12ヶ月分を想定 */
  monthKeys: string[]
}

function formatMonth(month: string): string {
  const parts = month.split('-')
  return `${Number(parts[1])}月`
}

/**
 * 要員需要（月次アサイン合計）と供給キャパシティ（在籍メンバーの稼働率上限合計）を
 * 重ねた山積みグラフ（非公開の設計文書）。
 * 「来期、人が足りるのか」＝採用・BP調達の判断材料になる。
 *
 * 需要が供給を上回る月は棒が線を突き抜けるため、不足月が一目で分かる。
 */
export function ResourceDemandSupplyChart({
  members,
  assignments,
  monthKeys,
}: ResourceDemandSupplyChartProps) {
  const chartData = useMemo(
    () => calcResourceHistogram(monthKeys, members, assignments),
    [monthKeys, members, assignments],
  )

  const hasAnyValue = chartData.some(
    (point) => point.demand > 0 || point.supply > 0,
  )

  if (!hasAnyValue) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
        対象のメンバー・アサインがありません
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData}>
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
          formatter={(value: number, name: string) => [value.toFixed(2), name]}
        />
        <Legend wrapperStyle={{ color: 'var(--color-foreground)' }} />
        <Bar dataKey="demand" name="需要（アサイン合計）" fill="#4A90D9" />
        <Line
          type="monotone"
          dataKey="supply"
          name="供給（稼働可能キャパシティ）"
          stroke="#DE3618"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
