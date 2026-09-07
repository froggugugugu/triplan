import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { otherExpenseActualFormSchema } from '@/infrastructure/validation/schemas'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table'
import { Textarea } from '@/shared/components/ui/textarea'
import { useToast } from '@/shared/hooks/use-toast'
import type { BudgetBreakdown } from '@/shared/types/budget'
import { manYenFormatter as currencyFormatter } from '@/shared/utils/budget-utils'
import { useBudgetStore } from '@/stores'
import {
  calcOtherExpenseActualTotal,
  calcRemainingBudget,
} from '../utils/expense-budget-utils'

function getTodayDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

interface OtherExpenseActualDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  breakdown: BudgetBreakdown | null
}

/**
 * その他費用（BudgetBreakdown、general_expense区分）の実績明細（購入日・購入品目・金額）を
 * 一覧表示し、追加・編集・削除する。予算1:実績Nの構造（1つの予算枠に複数の実績明細を紐付ける）。
 */
export function OtherExpenseActualDialog({
  open,
  onOpenChange,
  breakdown,
}: OtherExpenseActualDialogProps) {
  const { toast } = useToast()
  const budgetBreakdowns = useBudgetStore((s) => s.budgetBreakdowns)
  const addBudgetBreakdownActualRecord = useBudgetStore(
    (s) => s.addBudgetBreakdownActualRecord,
  )
  const updateBudgetBreakdownActualRecord = useBudgetStore(
    (s) => s.updateBudgetBreakdownActualRecord,
  )
  const deleteBudgetBreakdownActualRecord = useBudgetStore(
    (s) => s.deleteBudgetBreakdownActualRecord,
  )

  const [editingId, setEditingId] = useState<string | null>(null)
  const [purchasedAt, setPurchasedAt] = useState(getTodayDate)
  const [itemLabel, setItemLabel] = useState('')
  const [amount, setAmount] = useState(0)
  const [note, setNote] = useState('')

  const resetForm = useCallback(() => {
    setEditingId(null)
    setPurchasedAt(getTodayDate())
    setItemLabel('')
    setAmount(0)
    setNote('')
  }, [])

  // storeの最新状態を反映するため、渡されたbreakdownのidで都度参照し直す
  const current = useMemo(
    () => budgetBreakdowns.find((b) => b.id === breakdown?.id) ?? breakdown,
    [budgetBreakdowns, breakdown],
  )
  const records = useMemo(
    () =>
      [...(current?.actualRecords ?? [])].sort((a, b) =>
        b.purchasedAt.localeCompare(a.purchasedAt),
      ),
    [current],
  )

  const actualTotal = current ? calcOtherExpenseActualTotal(current) : 0
  const remaining = current
    ? calcRemainingBudget(current.amount, actualTotal)
    : 0

  const handleSubmit = useCallback(() => {
    if (!current) return
    const result = otherExpenseActualFormSchema.safeParse({
      purchasedAt,
      itemLabel,
      amount,
      note: note || null,
    })
    if (!result.success) {
      toast({
        title: result.error.issues[0]?.message ?? '入力内容を確認してください',
        variant: 'destructive',
      })
      return
    }

    if (editingId) {
      updateBudgetBreakdownActualRecord(current.id, editingId, result.data)
      toast({ title: '実績明細を更新しました' })
    } else {
      addBudgetBreakdownActualRecord(current.id, result.data)
      toast({ title: '実績明細を追加しました' })
    }
    resetForm()
  }, [
    current,
    purchasedAt,
    itemLabel,
    amount,
    note,
    editingId,
    addBudgetBreakdownActualRecord,
    updateBudgetBreakdownActualRecord,
    resetForm,
    toast,
  ])

  const handleEdit = useCallback(
    (recordId: string) => {
      const target = records.find((r) => r.id === recordId)
      if (!target) return
      setEditingId(target.id)
      setPurchasedAt(target.purchasedAt)
      setItemLabel(target.itemLabel)
      setAmount(target.amount)
      setNote(target.note ?? '')
    },
    [records],
  )

  const handleDelete = useCallback(
    (recordId: string) => {
      if (!current) return
      deleteBudgetBreakdownActualRecord(current.id, recordId)
      if (editingId === recordId) {
        resetForm()
      }
      toast({ title: '実績明細を削除しました' })
    },
    [current, editingId, deleteBudgetBreakdownActualRecord, resetForm, toast],
  )

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetForm()
      onOpenChange(next)
    },
    [onOpenChange, resetForm],
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>実績明細</DialogTitle>
          <DialogDescription>
            {current?.label}
            の実績明細（いつ・何を購入したか）を記録します。1つの予算枠に対して複数件の実績を登録できます。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="actual-purchased-at">購入日</Label>
              <Input
                id="actual-purchased-at"
                type="date"
                value={purchasedAt}
                onChange={(e) => setPurchasedAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="actual-amount">金額（万円）</Label>
              <NumericInput
                id="actual-amount"
                value={amount}
                onValueChange={setAmount}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="actual-item-label">購入品目</Label>
            <Textarea
              id="actual-item-label"
              value={itemLabel}
              onChange={(e) => setItemLabel(e.target.value)}
              placeholder="例: 書籍代（〇〇部署向け技術書一式）"
              rows={2}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="actual-note">備考</Label>
            <Textarea
              id="actual-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="詳細情報を自由に記入できます（任意）"
              rows={3}
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={handleSubmit} className="w-full">
              {editingId ? (
                '実績明細を更新'
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  実績明細を追加
                </>
              )}
            </Button>
            {editingId && (
              <Button type="button" variant="outline" onClick={resetForm}>
                キャンセル
              </Button>
            )}
          </div>

          {records.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              実績明細はまだありません
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>購入日</TableHead>
                  <TableHead>購入品目</TableHead>
                  <TableHead>備考</TableHead>
                  <TableHead className="text-right">金額（万円）</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>{record.purchasedAt}</TableCell>
                    <TableCell className="whitespace-pre-wrap">
                      {record.itemLabel}
                    </TableCell>
                    <TableCell className="whitespace-pre-wrap text-muted-foreground">
                      {record.note ?? '-'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {currencyFormatter.format(record.amount)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="編集"
                          onClick={() => handleEdit(record.id)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title="削除"
                          onClick={() => handleDelete(record.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="grid grid-cols-3 gap-2 rounded-md border border-border p-3 text-sm">
            <div className="rounded bg-budget-planned/10 p-2 text-center">
              <p className="text-xs text-muted-foreground">予算額</p>
              <p className="font-medium">
                {current ? currencyFormatter.format(current.amount) : 0}万円
              </p>
            </div>
            <div className="rounded bg-budget-actual/10 p-2 text-center">
              <p className="text-xs text-muted-foreground">実績合計</p>
              <p className="font-medium">
                {currencyFormatter.format(actualTotal)}万円
              </p>
            </div>
            <div className="rounded p-2 text-center">
              <p className="text-xs text-muted-foreground">残額</p>
              <p
                className={cn(
                  'font-medium',
                  remaining < 0 && 'text-destructive',
                )}
              >
                {currencyFormatter.format(remaining)}万円
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            閉じる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
