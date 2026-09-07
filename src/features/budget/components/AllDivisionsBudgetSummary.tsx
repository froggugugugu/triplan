import { manYenFormatter as currencyFormatter } from '@/shared/utils/budget-utils'
import {
  useBudgetStore,
  useEffortsStore,
  useProjectsStore,
  useTeamStore,
  useWbsSettingsStore,
} from '@/stores'

interface AllDivisionsBudgetSummaryProps {
  fiscalYear: number
}

/**
 * 「全部門」選択時の読み取り専用サマリー（FR-020）。
 * 部門予算一覧タブ（`DivisionBudgetPanel`）が既に持つ部門横断の俯瞰UIとは別に、
 * その他費用／AI利用費／人員計画／予実ダッシュボードタブで「全部門」を選択した際に、
 * 編集機能を持つ通常の単一部門ビューの代わりに表示する軽量な集計カード。
 * 編集操作は特定部門を選んだ場合のみ可能とし、「全部門」は表示専用に限定する
 * （複数部門にまたがる書き込み対象が一意に定まらないため）。
 */
export function AllDivisionsBudgetSummary({
  fiscalYear,
}: AllDivisionsBudgetSummaryProps) {
  const divisions = useTeamStore((s) => s.divisions)
  const getBudgetOverviewForDivisions = useBudgetStore(
    (s) => s.getBudgetOverviewForDivisions,
  )
  const getAiUsageTotalForDivisions = useBudgetStore(
    (s) => s.getAiUsageTotalForDivisions,
  )
  // DivisionBudgetPanel.tsxと同一の購読パターン: getBudgetOverviewForDivisions内部が
  // 参照するstoreフィールドの変更を検知して再レンダーされるよう明示的に購読する
  useBudgetStore((s) => s.divisionBudgets)
  useBudgetStore((s) => s.budgetBreakdowns)
  useBudgetStore((s) => s.aiUsageEntries)
  useBudgetStore((s) => s.saasContracts)
  useBudgetStore((s) => s.exchangeRateHistory)
  useBudgetStore((s) => s.estimatedUnitPrice)
  useBudgetStore((s) => s.defaultCoefficient)
  useBudgetStore((s) => s.projectCoefficients)
  useProjectsStore((s) => s.projects)
  useEffortsStore((s) => s.efforts)
  useWbsSettingsStore((s) => s.entries)

  const divisionIds = divisions.map((d) => d.id)
  const overview = getBudgetOverviewForDivisions(divisionIds, fiscalYear)
  const aiUsageActualTotal = getAiUsageTotalForDivisions(
    divisionIds,
    fiscalYear,
  )

  const rows: { label: string; value: number; className?: string }[] = [
    {
      label: '案件予算（その他のPJ予算）',
      value: overview.projectPersonnelTotal + overview.projectExpenseTotal,
    },
    { label: 'その他費用', value: overview.generalExpenseTotal },
    {
      label: 'AI利用費（予算）',
      value: overview.aiUsageBudgetTotal,
      className: 'text-budget-planned',
    },
    {
      label: 'AI利用費（実績）',
      value: aiUsageActualTotal,
      className: 'text-budget-actual',
    },
    { label: 'SaaS費用（年間コスト）', value: overview.saasCostTotal },
    { label: '人件費予算', value: overview.personnelPlanBudgetTotal },
    {
      label: 'WBS概算予算額（案件タブ）',
      value: overview.projectWbsEstimateTotal,
    },
  ]

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          全部門サマリー（{divisions.length}部門合計）
        </h3>
        <p className="text-xs text-muted-foreground">
          部門ごとの内訳・編集は「部門予算一覧」タブ、または部門を選択してご確認ください
        </p>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.label}
              className="border-b border-border/50 last:border-b-0"
            >
              <td className="py-1.5 text-muted-foreground">{row.label}</td>
              <td
                className={`py-1.5 text-right tabular-nums ${row.className ?? ''}`}
              >
                {currencyFormatter.format(row.value)} 万円
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border font-semibold">
            <td className="py-1.5">総合計</td>
            <td className="py-1.5 text-right tabular-nums">
              {currencyFormatter.format(overview.grandTotal)} 万円
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
