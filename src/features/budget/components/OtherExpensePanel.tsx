import { ListTree, Receipt } from 'lucide-react'
import { useMemo, useState } from 'react'
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
import { Button } from '@/shared/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table'
import type { BudgetBreakdown } from '@/shared/types/budget'
import { manYenFormatter as currencyFormatter } from '@/shared/utils/budget-utils'
import { useAppStore, useBudgetStore, useTeamStore } from '@/stores'
import {
  calcBudgetBreakdownActualRecordsTotal,
  calcBudgetBreakdownAmountTotal,
  calcOtherExpenseActualTotal,
  calcRemainingBudget,
} from '../utils/expense-budget-utils'
import { BudgetBreakdownDialog } from './BudgetBreakdownDialog'
import { OtherExpenseActualDialog } from './OtherExpenseActualDialog'

interface OtherExpensePanelProps {
  divisionId: string
  fiscalYear: number
}

/**
 * その他費用タブ。案件に紐づかない自由経費（BudgetBreakdownのgeneral_expense区分）を
 * 一覧表示する。予算枠自体の追加・編集・削除はBudgetBreakdownDialog（lockedCategory固定）を
 * 再利用し、実績明細（購入日・品目・金額、予算1:実績Nの構造）はOtherExpenseActualDialogで扱う。
 */
export function OtherExpensePanel({
  divisionId,
  fiscalYear,
}: OtherExpensePanelProps) {
  const fiscalYearStartMonth = useAppStore((s) => s.fiscalYearStartMonth)
  const divisions = useTeamStore((s) => s.divisions)
  const getOrCreateDivisionBudget = useBudgetStore(
    (s) => s.getOrCreateDivisionBudget,
  )
  const budgetBreakdowns = useBudgetStore((s) => s.budgetBreakdowns)

  const budget = getOrCreateDivisionBudget(divisionId, fiscalYear)
  const divisionName = divisions.find((d) => d.id === divisionId)?.name ?? ''

  const [breakdownDialogOpen, setBreakdownDialogOpen] = useState(false)
  const [actualDialogOpen, setActualDialogOpen] = useState(false)
  const [actualTarget, setActualTarget] = useState<BudgetBreakdown | null>(null)

  const expenses = useMemo(
    () =>
      budgetBreakdowns
        .filter(
          (b) => b.budgetId === budget.id && b.category === 'general_expense',
        )
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
    [budgetBreakdowns, budget.id],
  )

  // 合計行（部門予算タブと同様に予算合計・実績合計・残予算合計を表示）
  const budgetTotal = calcBudgetBreakdownAmountTotal(expenses)
  const actualGrandTotal = calcBudgetBreakdownActualRecordsTotal(expenses)
  const remainingTotal = calcRemainingBudget(budgetTotal, actualGrandTotal)

  const chartData = useMemo(
    () =>
      expenses.map((expense) => ({
        label: expense.label,
        budget: expense.amount,
        actual: calcOtherExpenseActualTotal(expense),
      })),
    [expenses],
  )

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setBreakdownDialogOpen(true)}>
          <ListTree className="h-4 w-4" />
          その他費用を管理（追加・編集・削除）
        </Button>
      </div>

      {expenses.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          その他費用はまだありません
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>内容</TableHead>
              <TableHead>計上日</TableHead>
              <TableHead className="text-right">予算額（万円）</TableHead>
              <TableHead className="text-right">実績合計（万円）</TableHead>
              <TableHead className="text-right">残額（万円）</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((expense) => {
              const actualTotal = calcOtherExpenseActualTotal(expense)
              const remaining = calcRemainingBudget(expense.amount, actualTotal)
              return (
                <TableRow key={expense.id}>
                  <TableCell>{expense.label}</TableCell>
                  <TableCell>{expense.recordedAt}</TableCell>
                  <TableCell className="bg-budget-planned/10 text-right tabular-nums">
                    {currencyFormatter.format(expense.amount)}
                  </TableCell>
                  <TableCell className="bg-budget-actual/10 text-right tabular-nums">
                    {currencyFormatter.format(actualTotal)}
                  </TableCell>
                  <TableCell
                    className={
                      remaining < 0
                        ? 'text-right tabular-nums font-medium text-destructive'
                        : 'text-right tabular-nums'
                    }
                  >
                    {currencyFormatter.format(remaining)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7"
                        onClick={() => {
                          setActualTarget(expense)
                          setActualDialogOpen(true)
                        }}
                      >
                        <Receipt className="h-3.5 w-3.5" />
                        実績明細
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-medium" colSpan={2}>
                合計
              </TableCell>
              <TableCell className="bg-budget-planned/10 text-right font-medium tabular-nums">
                {currencyFormatter.format(budgetTotal)}
              </TableCell>
              <TableCell className="bg-budget-actual/10 text-right font-medium tabular-nums">
                {currencyFormatter.format(actualGrandTotal)}
              </TableCell>
              <TableCell
                className={
                  remainingTotal < 0
                    ? 'text-right font-medium tabular-nums text-destructive'
                    : 'text-right font-medium tabular-nums'
                }
              >
                {currencyFormatter.format(remainingTotal)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      )}

      {expenses.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="mb-2 text-sm font-medium">
            項目別 予算額 vs 実績合計（万円）
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
                name="実績合計"
                fill="var(--color-budget-actual)"
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <BudgetBreakdownDialog
        open={breakdownDialogOpen}
        onOpenChange={setBreakdownDialogOpen}
        budgetId={budget.id}
        divisionId={divisionId}
        fiscalYear={fiscalYear}
        startMonth={fiscalYearStartMonth}
        divisionName={divisionName}
        allowedCategories={['general_expense']}
      />

      <OtherExpenseActualDialog
        open={actualDialogOpen}
        onOpenChange={setActualDialogOpen}
        breakdown={actualTarget}
      />
    </div>
  )
}
