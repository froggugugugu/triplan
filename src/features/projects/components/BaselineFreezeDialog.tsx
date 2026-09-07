import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { manYenFormatter } from '@/shared/utils/budget-utils'

interface BaselineFreezeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectName: string
  /** これから作成される版番号（既存の最大version + 1） */
  nextVersion: number
  /** 凍結時点のBAC（万円） */
  bacAmount: number
  /** 凍結時点の月次計画コスト（キー: "YYYY-MM"、値: 万円） */
  monthlyPlannedCost: Record<string, number>
  onConfirm: (reason: string) => void
}

/**
 * 現在のアサイン計画とBACを凍結してEVMのPV（計画値）の基準線を作るダイアログ
 * （非公開の設計文書）。
 *
 * PMがEVMのために行う唯一の操作がこの凍結であり、以降のPV/EV/ACは
 * アサイン表とWBSの完了チェックから自動導出される。
 */
export function BaselineFreezeDialog({
  open,
  onOpenChange,
  projectName,
  nextVersion,
  bacAmount,
  monthlyPlannedCost,
  onConfirm,
}: BaselineFreezeDialogProps) {
  const defaultReason = nextVersion === 1 ? '当初計画' : ''
  const [reason, setReason] = useState(defaultReason)

  useEffect(() => {
    if (open) setReason(defaultReason)
  }, [open, defaultReason])

  const { plannedTotal, monthCount } = useMemo(() => {
    const values = Object.values(monthlyPlannedCost)
    return {
      plannedTotal: values.reduce((sum, value) => sum + value, 0),
      monthCount: values.filter((value) => value > 0).length,
    }
  }, [monthlyPlannedCost])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = reason.trim()
      if (trimmed.length === 0) return
      onConfirm(trimmed)
      onOpenChange(false)
    },
    [reason, onConfirm, onOpenChange],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>計画を凍結（ベースライン v{nextVersion}）</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {projectName}
            の現在のアサイン計画とBACを凍結し、EVMのPV（計画値）の基準線にします。
            以降のPV・EV・ACはアサイン表とWBSの完了チェックから自動で算出されるため、
            EVMのための入力作業は発生しません。
          </p>

          <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">
                BAC（完成時総予算）
              </dt>
              <dd className="text-right font-bold tabular-nums">
                {manYenFormatter.format(bacAmount)} 万円
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                アサイン計画の総額
              </dt>
              <dd className="text-right font-bold tabular-nums">
                {manYenFormatter.format(plannedTotal)} 万円
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">計画のある月数</dt>
              <dd className="text-right tabular-nums">{monthCount} ヶ月</dd>
            </div>
          </dl>

          {monthCount === 0 ? (
            <p className="text-sm text-destructive">
              アサイン計画が1件も無いため、PV曲線を引けません。アサイン管理でメンバーを配置してから凍結してください
              （凍結しても当面はスケジュール期間の均等按分でPVが表示されます）。
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              PVはアサイン計画の月次配分（山の形）に従い、総額はBACに一致するようスケールします。
              アサイン計画の総額とBACが一致していなくても構いません。
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="baseline-reason">凍結理由</Label>
            <Input
              id="baseline-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="当初計画 / CR#1 追加開発分 など"
              maxLength={200}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={reason.trim().length === 0}>
              凍結する
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
