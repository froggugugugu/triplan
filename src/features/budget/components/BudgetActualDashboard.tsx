import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '@/lib/utils'
import { manYenFormatter as currencyFormatter } from '@/shared/utils/budget-utils'
import { useAssignmentStore, useBudgetStore, useMembersStore } from '@/stores'
import {
  calcConsumptionRate,
  calcMonthlyTrendSeries,
  calcRemainingBudget,
  calcSaasContractsTotalCost,
  calcYearEndForecast,
  getCalendarMonthLabel,
  getFiscalYearMonthKeys,
} from '../utils/expense-budget-utils'
import { PersonnelCostSummary } from './PersonnelCostSummary'

interface BudgetActualDashboardProps {
  divisionId: string
  divisionName: string
  fiscalYear: number
  startMonth: number
}

export function BudgetActualDashboard({
  divisionId,
  divisionName,
  fiscalYear,
  startMonth,
}: BudgetActualDashboardProps) {
  const getDivisionBudgetTotal = useBudgetStore((s) => s.getDivisionBudgetTotal)
  const getDivisionBudget = useBudgetStore((s) => s.getDivisionBudget)
  const getBreakdownsByBudget = useBudgetStore((s) => s.getBreakdownsByBudget)
  const getPersonnelCost = useBudgetStore((s) => s.getPersonnelCost)
  const getAiUsageTotal = useBudgetStore((s) => s.getAiUsageTotal)
  const getAiUsageEntries = useBudgetStore((s) => s.getAiUsageEntries)
  const getSaasContractsByDivision = useBudgetStore(
    (s) => s.getSaasContractsByDivision,
  )
  // AI利用費（＄建て）を万円換算するための為替レート履歴（requirements10）
  const exchangeRateHistory = useBudgetStore((s) => s.exchangeRateHistory)
  // 依存データの変更を検知して再レンダーされ、再計算されるよう購読する
  useBudgetStore((s) => s.divisionBudgets)
  useBudgetStore((s) => s.budgetAdjustments)
  useBudgetStore((s) => s.budgetBreakdowns)
  useBudgetStore((s) => s.aiUsageEntries)
  useBudgetStore((s) => s.saasContracts)
  useAssignmentStore((s) => s.assignments)
  useMembersStore((s) => s.members)

  const monthKeys = getFiscalYearMonthKeys(fiscalYear, startMonth)

  const summary = (() => {
    const budgetTotal = getDivisionBudgetTotal(divisionId, fiscalYear)
    const personnelCost = getPersonnelCost(divisionId, fiscalYear, startMonth)
    const aiUsageTotal = getAiUsageTotal(divisionId, fiscalYear)
    const saasContracts = getSaasContractsByDivision(divisionId)
    const saasTotal = calcSaasContractsTotalCost(saasContracts)
    const actualTotal = personnelCost + aiUsageTotal + saasTotal
    const consumptionRate = calcConsumptionRate(budgetTotal, actualTotal)
    const remainingBudget = calcRemainingBudget(budgetTotal, actualTotal)

    const budget = getDivisionBudget(divisionId, fiscalYear)
    const budgetBreakdowns = budget ? getBreakdownsByBudget(budget.id) : []
    const aiUsageEntries = getAiUsageEntries(divisionId, fiscalYear)
    const yearEndForecast = calcYearEndForecast(
      monthKeys,
      aiUsageEntries,
      budgetBreakdowns,
      saasContracts,
      exchangeRateHistory,
    )
    const monthlyTrend = calcMonthlyTrendSeries(
      monthKeys,
      aiUsageEntries,
      budgetBreakdowns,
      saasContracts,
      exchangeRateHistory,
    )

    return {
      budgetTotal,
      personnelCost,
      aiUsageTotal,
      saasTotal,
      actualTotal,
      consumptionRate,
      remainingBudget,
      yearEndForecast,
      monthlyTrend,
    }
  })()

  const chartData = [
    { name: '人件費', amount: summary.personnelCost },
    { name: 'AI利用費', amount: summary.aiUsageTotal },
    { name: 'SaaS利用料', amount: summary.saasTotal },
  ]

  const monthlyTrendData = summary.monthlyTrend.map((point) => ({
    monthLabel: getCalendarMonthLabel(point.month),
    AI利用費予算: point.aiUsageBudget,
    AI利用費実績: point.aiUsageActual,
    その他実績: point.otherActual,
  }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-budget-planned/30 bg-budget-planned/10 p-4">
          <p className="text-sm text-muted-foreground">予算総額</p>
          <p className="mt-1 text-2xl font-bold">
            {currencyFormatter.format(summary.budgetTotal)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              万円
            </span>
          </p>
        </div>
        <div className="rounded-lg border border-budget-actual/30 bg-budget-actual/10 p-4">
          <p className="text-sm text-muted-foreground">実績合計</p>
          <p className="mt-1 text-2xl font-bold">
            {currencyFormatter.format(summary.actualTotal)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              万円
            </span>
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">消化率</p>
          <p className="mt-1 text-2xl font-bold">
            {summary.consumptionRate.toFixed(1)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              %
            </span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">残予算</p>
          <p
            className={cn(
              'mt-1 text-2xl font-bold',
              summary.remainingBudget < 0 && 'text-destructive',
            )}
          >
            {currencyFormatter.format(summary.remainingBudget)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              万円
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            予算総額 − 実績合計（現時点）
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">年度末着地予測</p>
          <p
            className={cn(
              'mt-1 text-2xl font-bold',
              summary.yearEndForecast > summary.budgetTotal &&
                'text-destructive',
            )}
          >
            {currencyFormatter.format(summary.yearEndForecast)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              万円
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            実績記録月は実績額、未記録月は予算額で算出（予算ベース予測）
          </p>
        </div>
      </div>

      <PersonnelCostSummary
        divisionId={divisionId}
        fiscalYear={fiscalYear}
        startMonth={startMonth}
      />

      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-2 text-sm font-medium">
          {divisionName} 費用内訳（人件費 / AI利用費 / SaaS利用料）
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="name"
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
                '金額',
              ]}
            />
            <Bar
              dataKey="amount"
              fill="var(--color-budget-actual)"
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-2 text-sm font-medium">
          {divisionName}{' '}
          月次推移（AI利用費は予算・実績、その他は月次実績が記録された分のみ）
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={monthlyTrendData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="monthLabel"
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
            <Line
              type="monotone"
              dataKey="AI利用費予算"
              stroke="var(--color-budget-planned)"
              strokeDasharray="4 2"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="AI利用費実績"
              stroke="var(--color-budget-actual)"
              dot={false}
            />
            {/* その他実績はAI利用費実績と区別するためwarningトーンを使用（両方赤系だと判別できないため） */}
            <Line
              type="monotone"
              dataKey="その他実績"
              stroke="var(--color-warning)"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
