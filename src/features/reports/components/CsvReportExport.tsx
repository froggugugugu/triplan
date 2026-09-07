import { FileSpreadsheet } from 'lucide-react'
import { useCallback, useState } from 'react'
import { CsvMappingExportDialog } from '@/shared/components/CsvMappingExportDialog'
import { Button } from '@/shared/components/ui/button'
import { useToast } from '@/shared/hooks/use-toast'
import { getFiscalYearMonthKeys } from '@/shared/utils/budget-utils'
import {
  buildProjectCostBreakdownMap,
  calcDivisionOverheadPool,
} from '@/shared/utils/cost-breakdown-utils'
import {
  BILLING_SOURCE,
  buildBillingRows,
  type CsvExportRow,
  type CsvSourceDefinition,
} from '@/shared/utils/csv-mapping-utils'
import { CSV_BOM, toCsvContent } from '@/shared/utils/csv-utils'
import {
  useAppStore,
  useAssignmentStore,
  useBillingMilestoneStore,
  useBudgetStore,
  useCompaniesStore,
  useEffortsStore,
  useMembersStore,
  useProjectsStore,
  useTeamStore,
  useWbsSettingsStore,
} from '@/stores'
import {
  buildDivisionBudgetCsvRows,
  buildMemberUtilizationCsvRows,
  buildProjectFinanceCsvRows,
  buildProjectFinanceRecords,
  PROJECT_FINANCE_SOURCE,
} from '../utils/report-csv'

/**
 * CSVレポート出力（非公開の設計文書）。
 * 案件別収支表・要員別稼働表・部門予算予実表の3帳票をUTF-8 BOM付きCSVで出力する。
 * 行データの構築は`report-csv.ts`（純粋関数・テスト済み）が担い、本コンポーネントは
 * ストアからの入力集めとダウンロード発火のみを行う。
 */
export function CsvReportExport() {
  const { toast } = useToast()
  const fiscalYear = useAppStore((s) => s.fiscalYear)
  const fiscalYearStartMonth = useAppStore((s) => s.fiscalYearStartMonth)

  const downloadCsv = useCallback(
    (filename: string, rows: (string | number | null)[][]) => {
      // ExcelにUTF-8と認識させるためBOMを先頭へ付与する（csv-utils.tsの契約）
      const blob = new Blob([CSV_BOM + toCsvContent(rows)], {
        type: 'text/csv;charset=utf-8;',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
      toast({ title: `${filename} を出力しました` })
    },
    [toast],
  )

  // 汎用CSVマッピングエクスポート（Phase B）。ソース選択→ダイアログで
  // 列マッピング編集→ダウンロード。行データはダイアログを開く時点で構築する
  const [mappingExport, setMappingExport] = useState<{
    source: CsvSourceDefinition
    rows: CsvExportRow[]
    fileName: string
  } | null>(null)

  const buildProjectFinanceInput = useCallback(() => {
    const { getSettings } = useWbsSettingsStore.getState()
    const budget = useBudgetStore.getState()
    const projectTree = useProjectsStore.getState().getProjectTree()
    const referenceDate = new Date()

    // 原価4区分: 部門ごとの間接費原資を構築し、直接工数比例で配賦する
    const monthKeys = getFiscalYearMonthKeys(fiscalYear, fiscalYearStartMonth)
    const overheadPoolByDivision = new Map<string, number>()
    for (const root of projectTree) {
      if (!root.divisionId || overheadPoolByDivision.has(root.divisionId)) {
        continue
      }
      overheadPoolByDivision.set(
        root.divisionId,
        calcDivisionOverheadPool({
          divisionId: root.divisionId,
          fiscalYear,
          monthKeys,
          divisionBudgets: budget.divisionBudgets,
          budgetBreakdowns: budget.budgetBreakdowns,
          saasContracts: budget.saasContracts,
          aiUsageEntries: budget.aiUsageEntries,
          exchangeRateHistory: budget.exchangeRateHistory,
        }),
      )
    }
    const costBreakdownByProjectId = buildProjectCostBreakdownMap({
      topLevelProjects: projectTree,
      assignments: useAssignmentStore.getState().assignments,
      members: useMembersStore.getState().members,
      companies: useCompaniesStore.getState().companies,
      budgetBreakdowns: budget.budgetBreakdowns,
      monthKeys,
      overheadPoolByDivision,
      referenceDate,
    })

    return {
      projectTree,
      divisions: useTeamStore.getState().divisions,
      efforts: useEffortsStore.getState().efforts,
      getColumnIds: (projectId: string) =>
        getSettings(projectId)
          .effortColumns.filter((c) => c.enabled)
          .map((c) => c.id),
      estimatedUnitPrice: budget.estimatedUnitPrice,
      workdaysPerMonth: budget.workdaysPerMonth,
      getCoefficient: (projectId: string) =>
        budget.getProjectCoefficient(projectId),
      assignments: useAssignmentStore.getState().assignments,
      members: useMembersStore.getState().members,
      budgetBreakdowns: budget.budgetBreakdowns,
      referenceDate,
      costBreakdownByProjectId,
    }
  }, [fiscalYear, fiscalYearStartMonth])

  const handleOpenBillingExport = useCallback(() => {
    useBillingMilestoneStore.getState().loadBillingMilestones()
    const rows = buildBillingRows(
      useProjectsStore.getState().projects,
      useBillingMilestoneStore.getState().billingMilestones,
    )
    setMappingExport({
      source: BILLING_SOURCE,
      rows,
      fileName: `請求データ_${fiscalYear}年度`,
    })
  }, [fiscalYear])

  const handleOpenProjectFinanceExport = useCallback(() => {
    setMappingExport({
      source: PROJECT_FINANCE_SOURCE,
      rows: buildProjectFinanceRecords(buildProjectFinanceInput()),
      fileName: `案件別収支_${fiscalYear}年度`,
    })
  }, [buildProjectFinanceInput, fiscalYear])

  const handleProjectFinance = useCallback(() => {
    const rows = buildProjectFinanceCsvRows(buildProjectFinanceInput())
    downloadCsv(`案件別収支_${fiscalYear}年度.csv`, rows)
  }, [buildProjectFinanceInput, downloadCsv, fiscalYear])

  const handleMemberUtilization = useCallback(() => {
    const rows = buildMemberUtilizationCsvRows({
      members: useMembersStore.getState().members,
      assignments: useAssignmentStore.getState().assignments,
      projects: useProjectsStore.getState().projects,
      monthKeys: getFiscalYearMonthKeys(fiscalYear, fiscalYearStartMonth),
    })
    downloadCsv(`要員別稼働_${fiscalYear}年度.csv`, rows)
  }, [downloadCsv, fiscalYear, fiscalYearStartMonth])

  const handleDivisionBudget = useCallback(() => {
    const { divisions } = useTeamStore.getState()
    const { getBudgetOverview } = useBudgetStore.getState()
    const rows = buildDivisionBudgetCsvRows(
      [...divisions]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((division) => ({
          divisionName: division.name,
          overview: getBudgetOverview(division.id, fiscalYear),
        })),
      fiscalYear,
    )
    downloadCsv(`部門予算予実_${fiscalYear}年度.csv`, rows)
  }, [downloadCsv, fiscalYear])

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        対象年度: {fiscalYear}
        年度。いずれもExcelでそのまま開けるUTF-8（BOM付き）のCSVです
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={handleProjectFinance} variant="outline">
          <FileSpreadsheet className="h-4 w-4" />
          案件別収支表
        </Button>
        <Button onClick={handleMemberUtilization} variant="outline">
          <FileSpreadsheet className="h-4 w-4" />
          要員別稼働表
        </Button>
        <Button onClick={handleDivisionBudget} variant="outline">
          <FileSpreadsheet className="h-4 w-4" />
          部門予算予実表
        </Button>
      </div>
      <div className="border-t border-border pt-3">
        <p className="mb-2 text-sm font-medium">
          外部システム向けCSV（カスタムマッピング）
        </p>
        <p className="mb-2 text-xs text-muted-foreground">
          会計ソフト・請求書発行サービス等の取込レイアウトに合わせて、列の選択・並び・ヘッダ名をGUIで調整してエクスポートできます（プロファイル保存で使い回し可能）
        </p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleOpenBillingExport} variant="outline">
            <FileSpreadsheet className="h-4 w-4" />
            請求データ
          </Button>
          <Button onClick={handleOpenProjectFinanceExport} variant="outline">
            <FileSpreadsheet className="h-4 w-4" />
            案件別収支（カスタム）
          </Button>
        </div>
      </div>
      {mappingExport && (
        <CsvMappingExportDialog
          open={mappingExport !== null}
          onOpenChange={(open) => {
            if (!open) setMappingExport(null)
          }}
          source={mappingExport.source}
          rows={mappingExport.rows}
          fileName={mappingExport.fileName}
        />
      )}
      <ul className="space-y-0.5 text-xs text-muted-foreground">
        <li>
          案件別収支表:
          受注金額・概算予算・実コスト・粗利・進捗率（案件レビュー会議向け）
        </li>
        <li>
          要員別稼働表:
          メンバー×プロジェクト×月の計画/実績配分（稼働報告書・BP支払根拠の原型）
        </li>
        <li>部門予算予実表: 部門予算タブの俯瞰集計（月次の予算会議向け）</li>
      </ul>
    </div>
  )
}
