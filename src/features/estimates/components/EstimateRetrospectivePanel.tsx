import { cn } from '@/lib/utils'
import { manYenFormatter } from '@/shared/utils/budget-utils'
import type {
  ActualReference,
  CalibrationHint,
  EstimateRetrospectiveRow,
} from '@/shared/utils/estimate-retrospective-utils'
import {
  ESTIMATE_STAGE_LABELS,
  formatConeWidth,
} from '@/shared/utils/uncertainty-cone'

interface EstimateRetrospectivePanelProps {
  rows: readonly EstimateRetrospectiveRow[]
  actual: ActualReference
  /** 実績 人時/FP（FP版が無ければnull） */
  actualHoursPerFp: number | null
  /** 全社設定の人時/FP */
  hoursPerFunctionPoint: number
  calibration: CalibrationHint
}

function formatRatio(value: number | null): string {
  if (value === null) return '—'
  return `${value.toFixed(2)}x`
}

/** 振り返りタブ: 版ごとの実績÷見積・コーン内判定と、実績 人時/FP（次の見積へ戻す生産性） */
export function EstimateRetrospectivePanel({
  rows,
  actual,
  actualHoursPerFp,
  hoursPerFunctionPoint,
  calibration,
}: EstimateRetrospectivePanelProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <span className="text-muted-foreground">
          比較する実績
          {actual.fromCompletedRecord ? '（完了時の記録）' : '（現在の実績）'}
        </span>
        <span className="tabular-nums">
          {actual.effortDays.toFixed(2)}人日 ／{' '}
          {manYenFormatter.format(actual.amount)}万円
        </span>
        <span className="text-muted-foreground">実績 人時/FP</span>
        <span className="tabular-nums">
          {actualHoursPerFp === null
            ? '—（FP版がありません）'
            : `${actualHoursPerFp.toFixed(2)}（設定値: ${hoursPerFunctionPoint}）`}
        </span>
        <span className="text-muted-foreground">完了案件からの校正ヒント</span>
        <span className="tabular-nums">
          {calibration.medianHoursPerFp === null
            ? '—（実績とFP版を両方持つ完了案件がありません）'
            : `完了案件${calibration.sampleCount}件の実績 人時/FP 中央値: ${calibration.medianHoursPerFp.toFixed(2)}（設定値: ${hoursPerFunctionPoint}）`}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          比較する見積がありません。記録タブで見積を記録すると、ここで実績との誤差比を確認できます。
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs">
                <th className="px-2 py-1.5 text-left font-medium">版</th>
                <th className="px-2 py-1.5 text-left font-medium">段階</th>
                <th className="px-2 py-1.5 text-right font-medium">
                  見積（人日／万円）
                </th>
                <th className="px-2 py-1.5 text-right font-medium">
                  実績÷見積（工数）
                </th>
                <th className="px-2 py-1.5 text-right font-medium">
                  実績÷見積（金額）
                </th>
                <th className="px-2 py-1.5 text-right font-medium">幅</th>
                <th className="px-2 py-1.5 text-center font-medium">判定</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.snapshot.id}
                  className="border-b border-border/50"
                  data-testid="estimate-retrospective-row"
                >
                  <td className="px-2 py-1.5 tabular-nums">
                    v{row.snapshot.version}
                  </td>
                  <td className="px-2 py-1.5">
                    {ESTIMATE_STAGE_LABELS[row.snapshot.stage]}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {row.snapshot.effortDays.toFixed(2)}／
                    {manYenFormatter.format(row.snapshot.amount)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatRatio(row.effortRatio)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatRatio(row.amountRatio)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatConeWidth(row.snapshot.stage)}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {row.withinCone === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-xs font-medium',
                          row.withinCone
                            ? 'bg-success/10 text-success'
                            : 'bg-destructive/10 text-destructive',
                        )}
                      >
                        {row.withinCone ? '幅の内側' : '幅の外側'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
