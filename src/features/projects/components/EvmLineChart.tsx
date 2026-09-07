import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getIsoWeekMonday } from '@/shared/utils/iso-week-utils'

const currencyFormatter = new Intl.NumberFormat('ja-JP')

/** 週キー（"YYYY-Www"）をX軸ラベル（"M/D"、その週の月曜日）へ変換する */
export function formatWeekLabel(weekKey: string): string {
  const monday = getIsoWeekMonday(weekKey)
  return `${monday.getMonth() + 1}/${monday.getDate()}`
}

export interface EvmChartPoint {
  weekLabel: string
  pv: number
  ev: number
  ac: number
}

interface EvmLineChartProps {
  data: EvmChartPoint[]
  height?: number
}

/**
 * PV/EV/ACの3線チャート（Presentational）。`ProjectEvmDialog`と`ProjectSummaryPage`で
 * 共用する（でダイアログから抽出。部門文脈・参照線・ベースライン履歴を持つ
 * `shared/components/EvmPanel.tsx`のチャートとは別物＝あちらは機能が多く共通化しない）。
 */
export function EvmLineChart({ data, height = 320 }: EvmLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="weekLabel"
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
          formatter={(value: number) => [
            `${currencyFormatter.format(value)} 万円`,
          ]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="pv"
          name="PV（計画）"
          stroke="var(--color-budget-planned)"
          strokeDasharray="4 2"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="ev"
          name="EV（出来高）"
          stroke="var(--color-success)"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="ac"
          name="AC（実コスト）"
          stroke="var(--color-budget-actual)"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
