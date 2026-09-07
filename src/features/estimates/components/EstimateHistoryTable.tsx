import type { ChangeRequest, EstimateSnapshot } from '@/shared/types'
import { manYenFormatter } from '@/shared/utils/budget-utils'
import {
  diffEstimateSnapshots,
  ESTIMATE_METHOD_LABELS,
} from '@/shared/utils/estimate-snapshot-utils'
import { FP_METHOD_LABELS } from '@/shared/utils/function-point-utils'
import {
  ESTIMATE_STAGE_LABELS,
  formatConeWidth,
} from '@/shared/utils/uncertainty-cone'

interface EstimateHistoryTableProps {
  /** version昇順 */
  history: readonly EstimateSnapshot[]
  changeRequests: readonly ChangeRequest[]
}

function formatDelta(value: number | null, digits: number): string {
  if (value === null) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

/** 記録タブの版一覧（版・日付・段階・方法・工数・金額・幅・前版比・CR）。差分はUIで導出する */
export function EstimateHistoryTable({
  history,
  changeRequests,
}: EstimateHistoryTableProps) {
  if (history.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        記録された見積はありません。引合の時点で簡易FPから超概算を出し、要件が固まる
        たびに記録しておくと、後から「どの段階の見積がどれだけ外れたか」を振り返れます。
      </p>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-xs">
            <th className="px-2 py-1.5 text-left font-medium">版</th>
            <th className="px-2 py-1.5 text-left font-medium">記録日</th>
            <th className="px-2 py-1.5 text-left font-medium">段階</th>
            <th className="px-2 py-1.5 text-left font-medium">方法</th>
            <th className="px-2 py-1.5 text-right font-medium">工数（人日）</th>
            <th className="px-2 py-1.5 text-right font-medium">金額（万円）</th>
            <th className="px-2 py-1.5 text-right font-medium">幅</th>
            <th className="px-2 py-1.5 text-right font-medium">前版比</th>
            <th className="px-2 py-1.5 text-left font-medium">ラベル</th>
            <th className="px-2 py-1.5 text-left font-medium">記録者</th>
          </tr>
        </thead>
        <tbody>
          {history.map((snapshot, index) => {
            const previous = index > 0 ? (history[index - 1] ?? null) : null
            const diff = diffEstimateSnapshots(previous, snapshot)
            const cr = snapshot.changeRequestId
              ? changeRequests.find((c) => c.id === snapshot.changeRequestId)
              : undefined
            const methodLabel =
              snapshot.method === 'function_point' && snapshot.fp
                ? `${ESTIMATE_METHOD_LABELS.function_point}（${FP_METHOD_LABELS[snapshot.fp.method]}・${snapshot.fp.totalFp}FP）`
                : snapshot.method === 'wbs' && snapshot.wbs
                  ? `${ESTIMATE_METHOD_LABELS.wbs}（${snapshot.wbs.leafCount}タスク）`
                  : ESTIMATE_METHOD_LABELS[snapshot.method]
            const fpDiff = diff.fpItems
            const fpDiffText =
              fpDiff &&
              (fpDiff.added.length > 0 ||
                fpDiff.removed.length > 0 ||
                fpDiff.changed.length > 0)
                ? [
                    fpDiff.added.length > 0
                      ? `追加: ${fpDiff.added.map((i) => i.name).join('、')}`
                      : null,
                    fpDiff.removed.length > 0
                      ? `削除: ${fpDiff.removed.map((i) => i.name).join('、')}`
                      : null,
                    fpDiff.changed.length > 0
                      ? `変更: ${fpDiff.changed
                          .map(
                            (c) =>
                              `${c.name}（${c.before.count}→${c.after.count}）`,
                          )
                          .join('、')}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' ／ ')
                : null
            return (
              <tr
                key={snapshot.id}
                className="border-b border-border/50 align-top"
                data-testid="estimate-history-row"
              >
                <td className="px-2 py-1.5 tabular-nums">
                  v{snapshot.version}
                </td>
                <td className="px-2 py-1.5 tabular-nums">
                  {formatDate(snapshot.takenAt)}
                </td>
                <td className="px-2 py-1.5">
                  {ESTIMATE_STAGE_LABELS[snapshot.stage]}
                </td>
                <td className="px-2 py-1.5">{methodLabel}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {snapshot.effortDays.toFixed(2)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {manYenFormatter.format(snapshot.amount)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {formatConeWidth(snapshot.stage)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {diff.amountDelta === null ? (
                    '—'
                  ) : (
                    <span
                      className={
                        diff.amountDelta > 0
                          ? 'text-destructive'
                          : diff.amountDelta < 0
                            ? 'text-success'
                            : undefined
                      }
                    >
                      {formatDelta(diff.amountDelta, 0)}万円／
                      {formatDelta(diff.effortDaysDelta, 2)}人日
                    </span>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <div>{snapshot.label}</div>
                  {cr && (
                    <div className="text-xs text-muted-foreground">
                      CR: {cr.title}
                    </div>
                  )}
                  {fpDiffText && (
                    <div className="text-xs text-muted-foreground">
                      FP項目 {fpDiffText}
                    </div>
                  )}
                  {snapshot.note && (
                    <div className="text-xs text-muted-foreground">
                      {snapshot.note}
                    </div>
                  )}
                </td>
                <td className="px-2 py-1.5 text-xs text-muted-foreground">
                  {snapshot.authorName ?? '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
