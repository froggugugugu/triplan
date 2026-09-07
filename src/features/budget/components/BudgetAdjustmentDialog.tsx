import { useCallback, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { NumericInput } from '@/shared/components/ui/numeric-input'
import { useToast } from '@/shared/hooks/use-toast'
import type { BudgetAdjustmentType } from '@/shared/types/budget'
import { manYenFormatter as currencyFormatter } from '@/shared/utils/budget-utils'
import { useBudgetStore } from '@/stores'

const ADJUSTMENT_TYPE_LABELS: Record<BudgetAdjustmentType, string> = {
  increase: '増額',
  decrease: '減額',
}

function getTodayDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

interface BudgetAdjustmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  budgetId: string | null
  divisionName: string
}

/**
 * その他予算変更ダイアログ（「追加履歴」からの改称）。
 * 理由を明記しての予算調整を記録する（追記専用、更新・削除APIなし）。増額・減額の両方に対応し、
 * amountは常に0より大きい絶対値、符号はadjustmentTypeで表す（NumericInputが負値を
 * 受け付けないため。docs/development-patterns.md 6.3）。
 */
export function BudgetAdjustmentDialog({
  open,
  onOpenChange,
  budgetId,
  divisionName,
}: BudgetAdjustmentDialogProps) {
  const { toast } = useToast()
  const addBudgetAdjustment = useBudgetStore((s) => s.addBudgetAdjustment)
  const budgetAdjustments = useBudgetStore((s) => s.budgetAdjustments)

  const [amount, setAmount] = useState(0)
  const [adjustmentType, setAdjustmentType] =
    useState<BudgetAdjustmentType>('increase')
  const [reason, setReason] = useState('')
  const [adjustedAt, setAdjustedAt] = useState(getTodayDate)

  const history = useMemo(() => {
    if (!budgetId) return []
    return budgetAdjustments
      .filter((a) => a.budgetId === budgetId)
      .sort((a, b) => b.adjustedAt.localeCompare(a.adjustedAt))
  }, [budgetAdjustments, budgetId])

  const handleSubmit = useCallback(() => {
    if (!budgetId) return
    if (amount <= 0) {
      toast({
        title: '金額は0より大きい値を入力してください',
        variant: 'destructive',
      })
      return
    }
    if (!reason.trim()) {
      toast({ title: '理由を入力してください', variant: 'destructive' })
      return
    }
    addBudgetAdjustment({
      budgetId,
      amount,
      adjustmentType,
      reason,
      adjustedAt,
    })
    toast({ title: 'その他予算変更を記録しました' })
    setAmount(0)
    setAdjustmentType('increase')
    setReason('')
    setAdjustedAt(getTodayDate())
  }, [
    budgetId,
    amount,
    adjustmentType,
    reason,
    adjustedAt,
    addBudgetAdjustment,
    toast,
  ])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>その他予算変更</DialogTitle>
          <DialogDescription>
            {divisionName}
            の予算調整（増額・減額）を、理由を明記して記録します。記録は追記専用で、過去のレコードは変更されません。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="adjustment-type">区分</Label>
              <select
                id="adjustment-type"
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                value={adjustmentType}
                onChange={(e) =>
                  setAdjustmentType(e.target.value as BudgetAdjustmentType)
                }
              >
                {Object.entries(ADJUSTMENT_TYPE_LABELS).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjustment-date">変更日</Label>
              <Input
                id="adjustment-date"
                type="date"
                value={adjustedAt}
                onChange={(e) => setAdjustedAt(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="adjustment-amount">金額（万円）</Label>
            <NumericInput
              id="adjustment-amount"
              value={amount}
              onValueChange={setAmount}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="adjustment-reason">理由</Label>
            <Input
              id="adjustment-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例: 期中受注に伴う追加 / 契約内容見直しによる減額"
            />
          </div>
          <Button type="button" onClick={handleSubmit} className="w-full">
            変更を記録
          </Button>

          <div className="space-y-2">
            <Label>その他予算変更の履歴</Label>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                変更履歴はまだありません
              </p>
            ) : (
              <div className="divide-y divide-border rounded-md border border-border">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className={cn(
                      'flex items-center justify-between px-3 py-2 text-sm',
                      h.adjustmentType === 'decrease'
                        ? 'bg-budget-actual/10'
                        : 'bg-budget-planned/10',
                    )}
                  >
                    <div>
                      <p>
                        {h.adjustedAt} ・{' '}
                        {ADJUSTMENT_TYPE_LABELS[h.adjustmentType]}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {h.reason}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'font-medium',
                        h.adjustmentType === 'decrease'
                          ? 'text-budget-actual'
                          : 'text-budget-planned',
                      )}
                    >
                      {h.adjustmentType === 'decrease' ? '-' : '+'}
                      {currencyFormatter.format(h.amount)}万円
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            閉じる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
