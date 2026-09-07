import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Member } from '@/shared/types/member'
import { getMemberUtilizationRates } from '../utils/dashboard-utils'

interface UtilizationRateChartProps {
  members: Member[]
  assignments: AssignmentEntry[]
  fiscalYear: number
  fiscalYearStartMonth: number
}

function getBarColor(rate: number): string {
  if (rate > 1.0) return '#ef4444' // 赤（過負荷）
  if (rate >= 0.9) return '#22c55e' // 緑（適正）
  if (rate >= 0.5) return '#eab308' // 黄（やや余裕）
  return '#3b82f6' // 青（低稼働）
}

export function UtilizationRateChart({
  members,
  assignments,
  fiscalYear,
  fiscalYearStartMonth,
}: UtilizationRateChartProps) {
  const chartData = useMemo(() => {
    const rates = getMemberUtilizationRates(
      members,
      assignments,
      fiscalYear,
      fiscalYearStartMonth,
    )
    return rates
      .map((r) => ({
        memberName: r.memberName,
        rate: Math.round(r.rate * 1000) / 10, // percentage with 1 decimal
        rawRate: r.rate,
        activeMonths: r.activeMonths,
      }))
      .sort((a, b) => b.rate - a.rate)
  }, [members, assignments, fiscalYear, fiscalYearStartMonth])

  if (chartData.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
        アサインデータがありません
      </div>
    )
  }

  const chartHeight = Math.max(300, chartData.length * 36 + 60)

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          type="number"
          domain={[
            0,
            (max: number) => Math.max(120, Math.ceil(max / 10) * 10 + 10),
          ]}
          unit="%"
          className="text-xs"
          tick={{ fill: 'var(--color-muted-foreground)' }}
        />
        <YAxis
          type="category"
          dataKey="memberName"
          width={100}
          className="text-xs"
          tick={{ fill: 'var(--color-muted-foreground)' }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--color-popover)',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            color: 'var(--color-popover-foreground)',
          }}
          formatter={(value: number, _name: string, props) => {
            const entry = props.payload as { activeMonths: number }
            return [
              `${value.toFixed(1)}%（アクティブ月: ${entry.activeMonths}ヶ月）`,
              '充足率',
            ]
          }}
        />
        <ReferenceLine
          x={100}
          stroke="var(--color-destructive)"
          strokeDasharray="4 4"
          label={{
            value: '100%',
            position: 'top',
            fill: 'var(--color-destructive)',
            fontSize: 12,
          }}
        />
        <Bar dataKey="rate" radius={[0, 2, 2, 0]}>
          {chartData.map((entry) => (
            <Cell key={entry.memberName} fill={getBarColor(entry.rawRate)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
