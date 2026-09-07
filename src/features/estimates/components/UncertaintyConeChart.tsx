import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { EstimateSnapshot } from '@/shared/types'
import { ESTIMATE_STAGES } from '@/shared/types/estimate-snapshot'
import { manYenFormatter } from '@/shared/utils/budget-utils'
import {
  calcConeBounds,
  ESTIMATE_STAGE_LABELS,
} from '@/shared/utils/uncertainty-cone'

interface UncertaintyConeChartProps {
  /** 対象案件の版（順不同でよい） */
  snapshots: readonly EstimateSnapshot[]
  /** 横線で重ねる実績（万円）。0以下なら描かない */
  actualAmount: number
  height?: number
}

interface ConePoint {
  label: string
  /** その段階の最新版の見積（万円）。版が無ければnull */
  amount: number | null
  /** 見積×幅（万円）。版が無ければnull */
  range: [number, number] | null
}

/**
 * 不確実性コーン: x=段階、y=万円。各段階の最新版の見積を点で、その段階の幅（low〜high）を
 * 帯で描き、実績を横線で重ねる（Presentational）。`EvmLineChart`と同じテーマ変数を使う
 */
export function buildConePoints(
  snapshots: readonly EstimateSnapshot[],
): ConePoint[] {
  return ESTIMATE_STAGES.map((stage) => {
    const latest = [...snapshots]
      .filter((s) => s.stage === stage && s.method !== 'actual')
      .sort((a, b) => b.version - a.version)[0]
    if (!latest) {
      return { label: ESTIMATE_STAGE_LABELS[stage], amount: null, range: null }
    }
    const bounds = calcConeBounds(latest.amount, stage)
    return {
      label: ESTIMATE_STAGE_LABELS[stage],
      amount: latest.amount,
      range: [bounds.low, bounds.high],
    }
  })
}

export function UncertaintyConeChart({
  snapshots,
  actualAmount,
  height = 320,
}: UncertaintyConeChartProps) {
  const data = buildConePoints(snapshots)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="label"
          className="text-xs"
          tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
          interval={0}
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
          formatter={(value: number | [number, number], name: string) => {
            if (Array.isArray(value)) {
              return [
                `${manYenFormatter.format(value[0])}〜${manYenFormatter.format(value[1])} 万円`,
                name,
              ]
            }
            return [`${manYenFormatter.format(value)} 万円`, name]
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area
          type="monotone"
          dataKey="range"
          name="幅（実績が収まる範囲）"
          stroke="var(--color-budget-planned)"
          fill="var(--color-budget-planned)"
          fillOpacity={0.15}
          connectNulls
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="amount"
          name="見積"
          stroke="var(--color-budget-planned)"
          strokeWidth={2}
          connectNulls
        />
        {actualAmount > 0 && (
          <ReferenceLine
            y={actualAmount}
            stroke="var(--color-budget-actual)"
            strokeDasharray="4 2"
            label={{
              value: `実績 ${manYenFormatter.format(actualAmount)}`,
              position: 'insideTopRight',
              fill: 'var(--color-budget-actual)',
              fontSize: 11,
            }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
