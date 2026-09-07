import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
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
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table'
import { useToast } from '@/shared/hooks/use-toast'
import type { SaasContract } from '@/shared/types/budget'
import {
  calcSaasAnnualCost,
  manYenFormatter as currencyFormatter,
} from '@/shared/utils/budget-utils'
import { useBudgetStore, useTeamStore } from '@/stores'
import {
  calcRemainingSaasBudget,
  calcSaasActualTotal,
  getFiscalYearMonthKeys,
  isContractRenewalWarning,
} from '../utils/expense-budget-utils'
import { SaasActualGrid } from './SaasActualGrid'
import { SaasContractDialog } from './SaasContractDialog'

const CONTRACT_TYPE_LABEL: Record<SaasContract['contractType'], string> = {
  annual: '年間契約',
  monthly: '月次払い',
}

const PAYMENT_CYCLE_LABEL: Record<SaasContract['paymentCycle'], string> = {
  monthly: '月次',
  annual: '年次',
}

interface SaasContractTableProps {
  fiscalYear: number
  startMonth: number
  // 対象部門で絞り込む。未指定または`null`（「全部門」）の場合は
  // 未指定時は全契約を対象にする
  divisionId?: string | null
}

export function SaasContractTable({
  fiscalYear,
  startMonth,
  divisionId,
}: SaasContractTableProps) {
  const { toast } = useToast()
  const divisions = useTeamStore((s) => s.divisions)
  const saasContracts = useBudgetStore((s) => s.saasContracts)
  const deleteSaasContract = useBudgetStore((s) => s.deleteSaasContract)

  const filteredContracts = useMemo(
    () =>
      divisionId
        ? saasContracts.filter((c) => c.divisionId === divisionId)
        : saasContracts,
    [saasContracts, divisionId],
  )

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingContract, setEditingContract] = useState<SaasContract | null>(
    null,
  )
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SaasContract | null>(null)
  const [actualDialogOpen, setActualDialogOpen] = useState(false)
  const [actualTarget, setActualTarget] = useState<SaasContract | null>(null)

  const divisionNameMap = useMemo(
    () => new Map(divisions.map((d) => [d.id, d.name])),
    [divisions],
  )

  // 同一サービス（name）で複数プランを契約している場合に近接表示されるよう、
  // name → plan → nextRenewalDateの順でソートする
  const sortedContracts = useMemo(
    () =>
      [...filteredContracts].sort((a, b) => {
        const nameCompare = a.name.localeCompare(b.name)
        if (nameCompare !== 0) return nameCompare
        const planCompare = (a.plan ?? '').localeCompare(b.plan ?? '')
        if (planCompare !== 0) return planCompare
        return a.nextRenewalDate.localeCompare(b.nextRenewalDate)
      }),
    [filteredContracts],
  )

  const handleAdd = useCallback(() => {
    setEditingContract(null)
    setDialogOpen(true)
  }, [])

  const handleEdit = useCallback((contract: SaasContract) => {
    setEditingContract(contract)
    setDialogOpen(true)
  }, [])

  const handleOpenActual = useCallback((contract: SaasContract) => {
    setActualTarget(contract)
    setActualDialogOpen(true)
  }, [])

  const handleDeleteClick = useCallback((contract: SaasContract) => {
    setDeleteTarget(contract)
    setDeleteDialogOpen(true)
  }, [])

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return
    deleteSaasContract(deleteTarget.id)
    toast({ title: 'SaaS契約を削除しました' })
    setDeleteDialogOpen(false)
    setDeleteTarget(null)
  }, [deleteTarget, deleteSaasContract, toast])

  const now = useMemo(() => new Date(), [])
  const monthKeys = useMemo(
    () => getFiscalYearMonthKeys(fiscalYear, startMonth),
    [fiscalYear, startMonth],
  )

  const totals = useMemo(() => {
    const budgetTotal = sortedContracts.reduce(
      (sum, c) => sum + calcSaasAnnualCost(c),
      0,
    )
    const actualTotal = sortedContracts.reduce(
      (sum, c) => sum + calcSaasActualTotal(c, monthKeys),
      0,
    )
    return {
      budgetTotal,
      actualTotal,
      remainingTotal: budgetTotal - actualTotal,
    }
  }, [sortedContracts, monthKeys])

  const chartData = useMemo(
    () =>
      sortedContracts.map((c) => ({
        label: c.plan ? `${c.name}（${c.plan}）` : c.name,
        budget: calcSaasAnnualCost(c),
        actual: calcSaasActualTotal(c, monthKeys),
      })),
    [sortedContracts, monthKeys],
  )

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleAdd}>
          <Plus className="h-4 w-4" />
          SaaS契約を追加
        </Button>
      </div>

      {sortedContracts.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          SaaS契約が登録されていません。
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>サービス名</TableHead>
              <TableHead>プラン</TableHead>
              <TableHead>対象部門</TableHead>
              <TableHead>契約形態</TableHead>
              <TableHead>支払いサイクル</TableHead>
              <TableHead className="bg-budget-planned/10 text-right">
                予算額（万円）
              </TableHead>
              <TableHead className="bg-budget-actual/10 text-right">
                実績額（万円）
              </TableHead>
              <TableHead className="text-right">残り予算（万円）</TableHead>
              <TableHead>契約開始日</TableHead>
              <TableHead>次回更新日</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedContracts.map((contract) => {
              const isWarning = isContractRenewalWarning(
                contract.nextRenewalDate,
                now,
              )
              return (
                <TableRow
                  key={contract.id}
                  className={cn(
                    isWarning &&
                      'bg-destructive/10 hover:bg-destructive/15 dark:bg-destructive/20 dark:hover:bg-destructive/25',
                  )}
                >
                  <TableCell>{contract.name}</TableCell>
                  <TableCell>{contract.plan ?? '-'}</TableCell>
                  <TableCell>
                    {divisionNameMap.get(contract.divisionId) ?? '-'}
                  </TableCell>
                  <TableCell>
                    {CONTRACT_TYPE_LABEL[contract.contractType]}
                  </TableCell>
                  <TableCell>
                    {PAYMENT_CYCLE_LABEL[contract.paymentCycle]}
                  </TableCell>
                  <TableCell className="bg-budget-planned/10 text-right tabular-nums">
                    {currencyFormatter.format(calcSaasAnnualCost(contract))}
                  </TableCell>
                  <TableCell className="bg-budget-actual/10 text-right tabular-nums">
                    {currencyFormatter.format(
                      calcSaasActualTotal(contract, monthKeys),
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right tabular-nums',
                      calcRemainingSaasBudget(contract, monthKeys) < 0 &&
                        'font-medium text-destructive',
                    )}
                  >
                    {currencyFormatter.format(
                      calcRemainingSaasBudget(contract, monthKeys),
                    )}
                  </TableCell>
                  <TableCell>{contract.contractStartDate}</TableCell>
                  <TableCell
                    className={cn(
                      isWarning && 'font-semibold text-destructive',
                    )}
                  >
                    {contract.nextRenewalDate}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleOpenActual(contract)}
                        title="月次実績"
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleEdit(contract)}
                        title="編集"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteClick(contract)}
                        title="削除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={5} className="font-medium">
                合計
              </TableCell>
              <TableCell className="bg-budget-planned/10 text-right font-medium tabular-nums">
                {currencyFormatter.format(totals.budgetTotal)}
              </TableCell>
              <TableCell className="bg-budget-actual/10 text-right font-medium tabular-nums">
                {currencyFormatter.format(totals.actualTotal)}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right font-medium tabular-nums',
                  totals.remainingTotal < 0 && 'text-destructive',
                )}
              >
                {currencyFormatter.format(totals.remainingTotal)}
              </TableCell>
              <TableCell colSpan={3} />
            </TableRow>
          </TableFooter>
        </Table>
      )}

      {sortedContracts.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="mb-2 text-sm font-medium">
            契約別 予算額 vs 実績額（万円）
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
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
              <Bar
                dataKey="budget"
                name="予算額"
                fill="var(--color-budget-planned)"
                radius={[2, 2, 0, 0]}
              />
              <Bar
                dataKey="actual"
                name="実績額"
                fill="var(--color-budget-actual)"
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <SaasContractDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contract={editingContract}
      />

      <Dialog open={actualDialogOpen} onOpenChange={setActualDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>月次実績</DialogTitle>
            <DialogDescription>
              {actualTarget?.name}
              の月次実績額を記録します。契約金額改定履歴（amountHistory）とは別に管理されます。
            </DialogDescription>
          </DialogHeader>
          {actualTarget && (
            <SaasActualGrid
              contractId={actualTarget.id}
              fiscalYear={fiscalYear}
              startMonth={startMonth}
            />
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setActualDialogOpen(false)}
            >
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>SaaS契約の削除</DialogTitle>
            <DialogDescription>
              「{deleteTarget?.name}」を削除しますか？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
