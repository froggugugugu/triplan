import { History, ListTree } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
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
import type { Division } from '@/shared/types/division'
import {
  calcSaasContractsActualTotal,
  manYenFormatter as currencyFormatter,
} from '@/shared/utils/budget-utils'
import { computeProjectTotalEffort } from '@/shared/utils/effort-utils'
import {
  useBudgetStore,
  useEffortsStore,
  useProjectsStore,
  useTeamStore,
  useWbsSettingsStore,
} from '@/stores'
import {
  calcBudgetBreakdownActualRecordsTotal,
  calcProjectEstimateBudgets,
  getFiscalYearMonthKeys,
} from '../utils/expense-budget-utils'
import { BudgetAdjustmentDialog } from './BudgetAdjustmentDialog'
import { BudgetBreakdownDialog } from './BudgetBreakdownDialog'

// 「その他のPJ予算」= WBS概算以外の案件関連予算
const OTHER_PROJECT_BUDGET_CATEGORIES = [
  'project_personnel',
  'project_expense',
] as const

/**
 * 部門予算タブの3行セル（予算合計／実績合計 or 人件費予算合計／残予算合計）に渡す値の組
 */
interface BudgetTriRow {
  budgetTotal: number
  secondaryTotal: number
  remaining: number
}

function sumBudgetTriRows(rows: BudgetTriRow[]): BudgetTriRow {
  return rows.reduce(
    (acc, r) => ({
      budgetTotal: acc.budgetTotal + r.budgetTotal,
      secondaryTotal: acc.secondaryTotal + r.secondaryTotal,
      remaining: acc.remaining + r.remaining,
    }),
    { budgetTotal: 0, secondaryTotal: 0, remaining: 0 },
  )
}

/**
 * 3行セル（予算合計=青字／実績合計 or 人件費予算合計=赤字／残予算合計=黒字、
 * マイナス時は強調表示）を描画する。
 */
function BudgetTriRowCell({
  budgetTotal,
  secondaryTotal,
  remaining,
  className,
}: BudgetTriRow & { className?: string }) {
  return (
    <TableCell className={cn('text-right tabular-nums', className)}>
      <div className="text-budget-planned">
        {currencyFormatter.format(budgetTotal)}
      </div>
      <div className="text-budget-actual">
        {currencyFormatter.format(secondaryTotal)}
      </div>
      <div className={cn(remaining < 0 && 'font-medium text-destructive')}>
        {currencyFormatter.format(remaining)}
      </div>
    </TableCell>
  )
}

interface DivisionBudgetPanelProps {
  fiscalYear: number
  startMonth: number
}

/**
 * 部門予算タブ（俯瞰一覧）。案件予算・その他費用・AI利用費・SaaS費用・総合計の5列を
 * 部門横断で俯瞰する。各列は3行セル（予算合計／実績合計（案件予算列のみ人件費予算合計）／
 * 残予算合計）で構成される。
 * 「案件予算」列の予算合計は、手動登録済みのBudgetBreakdown（project_personnel/project_expense、
 * 「その他のPJ予算」ダイアログで登録）に加え、担当部門（Project.divisionId）一致のトップレベル
 * 案件のWBS概算予算額を合算して表示する（getBudgetOverviewの
 * projectWbsEstimateTotalを使用し、BudgetBreakdown.projectIdで既に手動計上済みの案件は
 * 二重計上を避けるため除外される）。
 * 「総合計」列は上記4列の合計（その他予算変更＝予算追加履歴は含まない）。
 * 上部の「案件タブの概算予算（全社・WBS工数ベースの見立て）」は、部門紐付け・手動計上有無に
 * 関わらず全案件のWBS概算額を合算した参考値（案件予算列とは別軸、除外ロジックなし）。
 * 「内訳」「追加履歴」機能はで「その他のPJ予算」「その他予算変更」に改称。
 */
export function DivisionBudgetPanel({
  fiscalYear,
  startMonth,
}: DivisionBudgetPanelProps) {
  const divisions = useTeamStore((s) => s.divisions)
  const getBudgetOverview = useBudgetStore((s) => s.getBudgetOverview)
  const getOrCreateDivisionBudget = useBudgetStore(
    (s) => s.getOrCreateDivisionBudget,
  )
  const getDivisionBudget = useBudgetStore((s) => s.getDivisionBudget)
  const getAiUsageTotal = useBudgetStore((s) => s.getAiUsageTotal)
  const estimatedUnitPrice = useBudgetStore((s) => s.estimatedUnitPrice)
  const workdaysPerMonth = useBudgetStore((s) => s.workdaysPerMonth)
  const defaultCoefficient = useBudgetStore((s) => s.defaultCoefficient)
  const projectCoefficients = useBudgetStore((s) => s.projectCoefficients)
  // その他費用（general_expense）の実績明細集計・SaaS費用の実績集計に使用する生データ
  const budgetBreakdowns = useBudgetStore((s) => s.budgetBreakdowns)
  const saasContracts = useBudgetStore((s) => s.saasContracts)
  // 予算・AI利用費・人員計画・為替レートの変更を検知して再計算するため購読する
  // （為替レートはAI利用費＄→万円換算に使用。requirements10）
  useBudgetStore((s) => s.divisionBudgets)
  useBudgetStore((s) => s.aiUsageEntries)
  useBudgetStore((s) => s.exchangeRateHistory)

  const getProjectTree = useProjectsStore((s) => s.getProjectTree)
  // 案件・工数・WBS設定の変更を検知して再レンダーされるよう購読する
  useProjectsStore((s) => s.projects)
  const efforts = useEffortsStore((s) => s.efforts)
  useWbsSettingsStore((s) => s.entries)
  const getWbsSettings = useWbsSettingsStore((s) => s.getSettings)

  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false)
  const [adjustmentTarget, setAdjustmentTarget] = useState<{
    budgetId: string
    divisionName: string
  } | null>(null)

  const [breakdownDialogOpen, setBreakdownDialogOpen] = useState(false)
  const [breakdownTarget, setBreakdownTarget] = useState<{
    budgetId: string
    divisionId: string
    divisionName: string
  } | null>(null)

  const sortedDivisions = useMemo(
    () => [...divisions].sort((a, b) => a.sortOrder - b.sortOrder),
    [divisions],
  )

  const handleOpenBreakdown = useCallback(
    (division: Division) => {
      const budget = getOrCreateDivisionBudget(division.id, fiscalYear)
      setBreakdownTarget({
        budgetId: budget.id,
        divisionId: division.id,
        divisionName: division.name,
      })
      setBreakdownDialogOpen(true)
    },
    [fiscalYear, getOrCreateDivisionBudget],
  )

  const handleOpenAdjustment = useCallback(
    (division: Division) => {
      const budget = getDivisionBudget(division.id, fiscalYear)
      if (!budget) return
      setAdjustmentTarget({ budgetId: budget.id, divisionName: division.name })
      setAdjustmentDialogOpen(true)
    },
    [fiscalYear, getDivisionBudget],
  )

  // 案件タブの概算予算（全社ベース・WBS工数×概算単価、除外ロジック無しの参考値）。
  // 意図的にuseMemo化しない（getProjectTreeの参照は安定だがprojects変更を検知できず
  // 値が古くなるため、上の `useProjectsStore((s) => s.projects)` 購読による再レンダー時に
  // 毎回再計算する）
  let companyWideEstimateTotal = 0
  const coefficients = new Map(Object.entries(projectCoefficients))
  for (const root of getProjectTree()) {
    const settings = getWbsSettings(root.id)
    const columnIds = settings.effortColumns
      .filter((c) => c.enabled)
      .map((c) => c.id)
    const totalEffortsDays = computeProjectTotalEffort(
      [root],
      columnIds,
      efforts,
    )
    // 概算単価は月額単価のため、総工数（人日）を人月換算してから乗じる（是正）
    const totalEffortsMonths = new Map(
      Array.from(totalEffortsDays, ([id, days]) => [
        id,
        days / workdaysPerMonth,
      ]),
    )
    const estimates = calcProjectEstimateBudgets(
      totalEffortsMonths,
      estimatedUnitPrice,
      coefficients,
      defaultCoefficient,
    )
    companyWideEstimateTotal += estimates.get(root.id) ?? 0
  }

  const monthKeys = getFiscalYearMonthKeys(fiscalYear, startMonth)

  const overviewByDivision = sortedDivisions.map((division) => {
    const budget = getDivisionBudget(division.id, fiscalYear)
    const overview = getBudgetOverview(division.id, fiscalYear)

    const projectBudgetTotal =
      overview.projectPersonnelTotal +
      overview.projectExpenseTotal +
      overview.projectWbsEstimateTotal
    // 案件予算列の2行目は「実績」ではなく人員計画側の人件費予算
    const projectRow: BudgetTriRow = {
      budgetTotal: projectBudgetTotal,
      secondaryTotal: overview.personnelPlanBudgetTotal,
      remaining: projectBudgetTotal - overview.personnelPlanBudgetTotal,
    }

    const otherExpenseBreakdowns: BudgetBreakdown[] = budget
      ? budgetBreakdowns.filter(
          (b) => b.budgetId === budget.id && b.category === 'general_expense',
        )
      : []
    const otherExpenseActual = calcBudgetBreakdownActualRecordsTotal(
      otherExpenseBreakdowns,
    )
    const otherExpenseRow: BudgetTriRow = {
      budgetTotal: overview.generalExpenseTotal,
      secondaryTotal: otherExpenseActual,
      remaining: overview.generalExpenseTotal - otherExpenseActual,
    }

    const aiUsageActual = getAiUsageTotal(division.id, fiscalYear)
    const aiUsageRow: BudgetTriRow = {
      budgetTotal: overview.aiUsageBudgetTotal,
      secondaryTotal: aiUsageActual,
      remaining: overview.aiUsageBudgetTotal - aiUsageActual,
    }

    const divisionSaasContracts = saasContracts.filter(
      (c) => c.divisionId === division.id,
    )
    const saasActual = calcSaasContractsActualTotal(
      divisionSaasContracts,
      monthKeys,
    )
    const saasRow: BudgetTriRow = {
      budgetTotal: overview.saasCostTotal,
      secondaryTotal: saasActual,
      remaining: overview.saasCostTotal - saasActual,
    }

    // 総合計列は上記4列（案件予算・その他費用・AI利用費・SaaS費用）の合計
    // （その他予算変更＝予算追加履歴は含まない。次工程で要件と再確認可能な点として残る）
    const totalRow = sumBudgetTriRows([
      projectRow,
      otherExpenseRow,
      aiUsageRow,
      saasRow,
    ])

    return {
      division,
      budget,
      projectRow,
      otherExpenseRow,
      aiUsageRow,
      saasRow,
      totalRow,
    }
  })

  const divisionTotalRow = sumBudgetTriRows(
    overviewByDivision.map(({ totalRow }) => totalRow),
  )

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-budget-planned/30 bg-budget-planned/10 p-4">
        <p className="text-sm text-muted-foreground">
          プロジェクトタブの概算予算（全社・WBS工数ベースの見立て）
        </p>
        <p className="mt-1 text-xl font-bold">
          {currencyFormatter.format(companyWideEstimateTotal)}
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            万円
          </span>
        </p>
      </div>

      {sortedDivisions.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          部門が登録されていません。先に「チーム」画面から部門を作成してください。
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>部門</TableHead>
              <TableHead className="text-right">
                プロジェクト予算（万円）
              </TableHead>
              <TableHead className="text-right">その他費用（万円）</TableHead>
              <TableHead className="text-right">AI利用費（万円）</TableHead>
              <TableHead className="text-right">SaaS費用（万円）</TableHead>
              <TableHead className="bg-budget-planned/10 text-right">
                総合計（万円）
              </TableHead>
              <TableHead className="w-28 text-right">その他のPJ予算</TableHead>
              <TableHead className="w-28 text-right">その他予算変更</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {overviewByDivision.map(
              ({
                division,
                budget,
                projectRow,
                otherExpenseRow,
                aiUsageRow,
                saasRow,
                totalRow,
              }) => (
                <TableRow key={division.id}>
                  <TableCell>{division.name}</TableCell>
                  <BudgetTriRowCell {...projectRow} />
                  <BudgetTriRowCell {...otherExpenseRow} />
                  <BudgetTriRowCell {...aiUsageRow} />
                  <BudgetTriRowCell {...saasRow} />
                  <BudgetTriRowCell
                    {...totalRow}
                    className="bg-budget-planned/10 font-medium"
                  />
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="その他のPJ予算"
                      onClick={() => handleOpenBreakdown(division)}
                    >
                      <ListTree className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={!budget}
                      title={
                        budget
                          ? 'その他予算変更'
                          : '先にその他のPJ予算を登録してください'
                      }
                      onClick={() => handleOpenAdjustment(division)}
                    >
                      <History className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ),
            )}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-medium">全部門合計</TableCell>
              <TableCell colSpan={4} />
              <BudgetTriRowCell
                {...divisionTotalRow}
                className="bg-budget-planned/10 font-medium"
              />
              <TableCell colSpan={2} />
            </TableRow>
          </TableFooter>
        </Table>
      )}

      <BudgetBreakdownDialog
        open={breakdownDialogOpen}
        onOpenChange={setBreakdownDialogOpen}
        budgetId={breakdownTarget?.budgetId ?? null}
        divisionId={breakdownTarget?.divisionId ?? null}
        fiscalYear={fiscalYear}
        startMonth={startMonth}
        divisionName={breakdownTarget?.divisionName ?? ''}
        allowedCategories={[...OTHER_PROJECT_BUDGET_CATEGORIES]}
      />

      <BudgetAdjustmentDialog
        open={adjustmentDialogOpen}
        onOpenChange={setAdjustmentDialogOpen}
        budgetId={adjustmentTarget?.budgetId ?? null}
        divisionName={adjustmentTarget?.divisionName ?? ''}
      />
    </div>
  )
}
