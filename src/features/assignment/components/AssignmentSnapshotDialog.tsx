import { Camera, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import type { AssignmentSnapshot } from '@/shared/types'
import type { SnapshotSourceAssignment } from '@/shared/utils/assignment-snapshot-utils'
import {
  type AssignmentDiffRow,
  diffAssignmentSnapshot,
  summarizeAssignmentDiff,
} from '@/shared/utils/assignment-snapshot-utils'

/**
 * アサイン表のスナップショット。
 *
 * 任意のタイミングで体制を記録し、**現在との差分**を見る。
 * 復元は提供しない（誤操作で現在の計画を壊すリスクと、締め済み月のガード・
 * 監査証跡との整合コストが利便性に見合わないため）。差分を見て手で直す運用。
 *
 * `ProjectBaseline`（EVMのPV基準線）とは別物で、こちらは**タスク粒度**を保ち
 * 金額を持たない。
 */

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

const STATUS_LABEL: Record<AssignmentDiffRow['status'], string> = {
  added: '追加',
  removed: '削除',
  changed: '変更',
}

const STATUS_STYLE: Record<AssignmentDiffRow['status'], string> = {
  added: 'bg-budget-planned/15 text-foreground',
  removed: 'bg-destructive/15 text-destructive',
  changed: 'bg-accent text-accent-foreground',
}

function formatDelta(delta: number): string {
  if (Math.abs(delta) < 0.0001) return '±0'
  return `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
  snapshots: AssignmentSnapshot[]
  assignments: readonly SnapshotSourceAssignment[]
  /** タスクid → 表示名（コード＋名前）。解決できないidはidをそのまま出す */
  taskLabelOf: (taskId: string) => string
  /** メンバーid → 氏名 */
  memberLabelOf: (memberId: string) => string
  onTake: (label: string) => void
  onDelete: (id: string) => void
}

export function AssignmentSnapshotDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  snapshots,
  assignments,
  taskLabelOf,
  memberLabelOf,
  onTake,
  onDelete,
}: Props) {
  const [label, setLabel] = useState('')
  const [comparingId, setComparingId] = useState<string | null>(null)

  const comparing = snapshots.find((s) => s.id === comparingId) ?? null

  const diff = useMemo(() => {
    if (!comparing) return null
    const rows = diffAssignmentSnapshot(
      comparing.entries,
      assignments,
      projectId,
    )
    return { rows, summary: summarizeAssignmentDiff(rows) }
  }, [comparing, assignments, projectId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>アサイン表のスナップショット</DialogTitle>
          <DialogDescription>
            {projectName}
            の体制を記録し、現在との差分を確認します。記録は書き換わりません（復元は行いません）
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="snapshot-label">記録の名前</Label>
              <Input
                id="snapshot-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="例: 10月キックオフ時点"
                maxLength={100}
              />
            </div>
            <Button
              type="button"
              className="gap-1"
              disabled={label.trim().length === 0}
              onClick={() => {
                onTake(label.trim())
                setLabel('')
              }}
            >
              <Camera className="h-4 w-4" />
              いまの体制を記録
            </Button>
          </div>

          <div>
            <h3 className="mb-2 font-medium text-sm">記録一覧</h3>
            {snapshots.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                まだ記録がありません
              </p>
            ) : (
              <ul className="space-y-1">
                {snapshots.map((snapshot) => (
                  <li
                    key={snapshot.id}
                    className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{snapshot.label}</span>
                    <span className="text-muted-foreground text-xs">
                      {formatTimestamp(snapshot.takenAt)}
                      {snapshot.authorName && ` ／ ${snapshot.authorName}`}
                      {` ／ ${snapshot.entries.length}行`}
                    </span>
                    <span className="flex-1" />
                    <Button
                      type="button"
                      size="sm"
                      variant={
                        comparingId === snapshot.id ? 'default' : 'outline'
                      }
                      onClick={() =>
                        setComparingId(
                          comparingId === snapshot.id ? null : snapshot.id,
                        )
                      }
                    >
                      {comparingId === snapshot.id
                        ? '差分を閉じる'
                        : '現在と比較'}
                    </Button>
                    <button
                      type="button"
                      aria-label={`${snapshot.label}を削除`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (comparingId === snapshot.id) setComparingId(null)
                        onDelete(snapshot.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {comparing && diff && (
            <div>
              <h3 className="mb-2 font-medium text-sm">
                「{comparing.label}」と現在の差分
              </h3>
              <p className="mb-2 text-muted-foreground text-sm">
                追加 {diff.summary.added}件 ／ 削除 {diff.summary.removed}件 ／
                変更 {diff.summary.changed}件 ／ 配分合計{' '}
                <span className="tabular-nums">
                  {formatDelta(diff.summary.totalDelta)}
                </span>
                人月
              </p>
              {diff.rows.length === 0 ? (
                <p className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                  記録した時点から体制は変わっていません
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground text-xs">
                        <th className="py-2 pr-3 font-medium">状態</th>
                        <th className="py-2 pr-3 font-medium">タスク</th>
                        <th className="py-2 pr-3 font-medium">担当者</th>
                        <th className="py-2 pr-3 font-medium">変わった月</th>
                        <th className="py-2 text-right font-medium">増減</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diff.rows.map((row) => (
                        <tr
                          key={`${row.taskId}-${row.memberId}`}
                          className="border-b align-top"
                        >
                          <td className="py-2 pr-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[row.status]}`}
                            >
                              {STATUS_LABEL[row.status]}
                            </span>
                          </td>
                          <td className="py-2 pr-3">
                            {taskLabelOf(row.taskId)}
                          </td>
                          <td className="py-2 pr-3">
                            {memberLabelOf(row.memberId)}
                          </td>
                          <td className="py-2 pr-3 text-xs">
                            {row.changedMonths.map((month) => (
                              <div key={month} className="tabular-nums">
                                {month}: {(row.before[month] ?? 0).toFixed(2)} →{' '}
                                {(row.after[month] ?? 0).toFixed(2)}
                              </div>
                            ))}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {formatDelta(row.totalDelta)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
