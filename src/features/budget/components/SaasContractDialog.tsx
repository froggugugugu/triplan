import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { calcSaasAmountFromHeadcount } from '@/features/budget/utils/expense-budget-utils'
import {
  type SaasContractFormValues,
  saasContractFormSchema,
} from '@/infrastructure/validation/schemas'
import { Button } from '@/shared/components/ui/button'
import { Combobox } from '@/shared/components/ui/combobox'
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
import type {
  SaasAmountHistoryEntry,
  SaasContract,
} from '@/shared/types/budget'
import { useBudgetStore, useTeamStore } from '@/stores'

interface SaasContractDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contract?: SaasContract | null
  defaultDivisionId?: string | null
}

export function SaasContractDialog({
  open,
  onOpenChange,
  contract,
  defaultDivisionId,
}: SaasContractDialogProps) {
  const { toast } = useToast()
  const divisions = useTeamStore((s) => s.divisions)
  const addSaasContract = useBudgetStore((s) => s.addSaasContract)
  const updateSaasContract = useBudgetStore((s) => s.updateSaasContract)

  const isEditing = !!contract

  const [amountHistory, setAmountHistory] = useState<SaasAmountHistoryEntry[]>(
    [],
  )

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SaasContractFormValues>({
    resolver: zodResolver(saasContractFormSchema),
    defaultValues: {
      name: '',
      plan: null,
      contractType: 'annual',
      amount: 0,
      headcount: null,
      unitPrice: null,
      paymentCycle: 'annual',
      contractStartDate: '',
      nextRenewalDate: '',
      note: null,
    },
  })

  useEffect(() => {
    if (open) {
      reset({
        name: contract?.name ?? '',
        plan: contract?.plan ?? null,
        divisionId: contract?.divisionId ?? defaultDivisionId ?? undefined,
        contractType: contract?.contractType ?? 'annual',
        amount: contract?.amount ?? 0,
        headcount: contract?.headcount ?? null,
        unitPrice: contract?.unitPrice ?? null,
        paymentCycle: contract?.paymentCycle ?? 'annual',
        contractStartDate: contract?.contractStartDate ?? '',
        nextRenewalDate: contract?.nextRenewalDate ?? '',
        note: contract?.note ?? null,
      })
      setAmountHistory(contract?.amountHistory ?? [])
    }
  }, [open, contract, defaultDivisionId, reset])

  const sortedDivisions = useMemo(
    () => [...divisions].sort((a, b) => a.sortOrder - b.sortOrder),
    [divisions],
  )

  const divisionId = watch('divisionId')
  const headcount = watch('headcount')
  const unitPrice = watch('unitPrice')
  const amount = watch('amount')

  const handleApplyHeadcountCalc = useCallback(() => {
    if (!headcount || unitPrice === null || unitPrice === undefined) return
    setValue('amount', calcSaasAmountFromHeadcount(headcount, unitPrice))
  }, [headcount, unitPrice, setValue])

  const handleAddHistoryEntry = useCallback(() => {
    const yearMonth = new Date().toISOString().slice(0, 7)
    setAmountHistory((prev) => [
      ...prev,
      { effectiveFrom: yearMonth, amount: watch('amount') || 0 },
    ])
  }, [watch])

  const handleDeleteHistoryEntry = useCallback((index: number) => {
    setAmountHistory((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleHistoryEntryChange = useCallback(
    (
      index: number,
      field: 'effectiveFrom' | 'amount',
      value: string | number,
    ) => {
      setAmountHistory((prev) => {
        const updated = prev.map((entry, i) =>
          i === index ? { ...entry, [field]: value } : entry,
        )
        if (field === 'effectiveFrom') {
          return updated.sort((a, b) =>
            a.effectiveFrom.localeCompare(b.effectiveFrom),
          )
        }
        return updated
      })
    },
    [],
  )

  const onSubmit = (data: SaasContractFormValues) => {
    const payload = { ...data, amountHistory }
    if (isEditing && contract) {
      updateSaasContract({ id: contract.id, ...payload })
      toast({ title: 'SaaS契約を更新しました' })
    } else {
      addSaasContract(payload)
      toast({ title: 'SaaS契約を登録しました' })
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'SaaS契約を編集' : '新規SaaS契約'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'SaaS契約の情報を編集します。'
              : '新しいSaaS契約を登録します。'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="saas-name">サービス名</Label>
            <Input
              id="saas-name"
              {...register('name')}
              placeholder="例: GitHub Copilot"
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="saas-plan">グレード・プラン（任意）</Label>
            <Input
              id="saas-plan"
              {...register('plan')}
              placeholder="例: Business, Enterprise"
            />
            {errors.plan && (
              <p className="text-sm text-destructive">{errors.plan.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>対象部門</Label>
            <Combobox
              value={divisionId ?? ''}
              onValueChange={(v) => setValue('divisionId', v)}
              options={sortedDivisions.map((d) => ({
                value: d.id,
                label: d.name,
              }))}
              placeholder="部門を選択してください"
              searchPlaceholder="部門を検索..."
            />
            {errors.divisionId && (
              <p className="text-sm text-destructive">
                {errors.divisionId.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="saas-contract-type">契約形態</Label>
              <select
                id="saas-contract-type"
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                {...register('contractType')}
              >
                <option value="annual">年間契約</option>
                <option value="monthly">月次払い</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="saas-payment-cycle">支払いサイクル</Label>
              <select
                id="saas-payment-cycle"
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                {...register('paymentCycle')}
              >
                <option value="monthly">月次</option>
                <option value="annual">年次</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            年間契約で支払月に年額をまとめて払う場合は、支払いサイクルを「年次」とし、実績は支払い月に実績年額を入力してください（月次実績の入力は「月次実績」ボタンから行います）。
          </p>

          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">
              人数×単価で金額を算出する場合はこちらに入力
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="saas-headcount">利用人数</Label>
                <NumericInput
                  id="saas-headcount"
                  value={headcount ?? 0}
                  onValueChange={(v) =>
                    setValue('headcount', v === 0 ? null : v)
                  }
                />
                {errors.headcount && (
                  <p className="text-sm text-destructive">
                    {errors.headcount.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="saas-unit-price">単価（万円/人）</Label>
                <NumericInput
                  id="saas-unit-price"
                  value={unitPrice ?? 0}
                  onValueChange={(v) =>
                    setValue('unitPrice', v === 0 ? null : v)
                  }
                />
                {errors.unitPrice && (
                  <p className="text-sm text-destructive">
                    {errors.unitPrice.message}
                  </p>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleApplyHeadcountCalc}
              disabled={
                !headcount || unitPrice === null || unitPrice === undefined
              }
            >
              金額に反映
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="saas-amount">金額（万円）</Label>
            <NumericInput
              id="saas-amount"
              value={amount ?? 0}
              onValueChange={(v) => setValue('amount', v)}
            />
            {errors.amount && (
              <p className="text-sm text-destructive">
                {errors.amount.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="saas-contract-start">契約開始日</Label>
              <Input
                id="saas-contract-start"
                type="date"
                {...register('contractStartDate')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="saas-next-renewal">次回更新日</Label>
              <Input
                id="saas-next-renewal"
                type="date"
                {...register('nextRenewalDate')}
              />
            </div>
          </div>
          {errors.nextRenewalDate && (
            <p className="text-sm text-destructive">
              {errors.nextRenewalDate.message}
            </p>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>金額変更履歴（年途中の契約変更を記録）</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddHistoryEntry}
              >
                <Plus className="mr-1 h-3 w-3" />
                変更を追加
              </Button>
            </div>
            {amountHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                金額変更履歴はありません
              </p>
            ) : (
              <div className="space-y-2">
                {amountHistory.map((entry, index) => (
                  <div
                    key={`${entry.effectiveFrom}-${index}`}
                    className="flex items-center gap-2"
                  >
                    <Input
                      type="month"
                      value={entry.effectiveFrom}
                      onChange={(e) =>
                        handleHistoryEntryChange(
                          index,
                          'effectiveFrom',
                          e.target.value,
                        )
                      }
                      className="w-40"
                    />
                    <NumericInput
                      value={entry.amount}
                      onValueChange={(v) =>
                        handleHistoryEntryChange(index, 'amount', v)
                      }
                      className="w-28 text-right tabular-nums"
                      placeholder="万円"
                    />
                    <span className="text-sm text-muted-foreground">万円</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteHistoryEntry(index)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="saas-note">備考</Label>
            <Input id="saas-note" {...register('note')} placeholder="任意" />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button type="submit">{isEditing ? '更新' : '登録'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
