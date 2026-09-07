import type {
  CellValueChangedEvent,
  ColDef,
  RowClassParams,
  ValueSetterParams,
} from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { useCallback, useMemo } from 'react'
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
import { gridTheme } from '@/shared/ag-grid-theme'
import {
  getFiscalYearMonthKeys,
  manYenFormatter,
} from '@/shared/utils/budget-utils'
import {
  buildProjectCostBreakdownMap,
  calcDivisionOverheadPool,
} from '@/shared/utils/cost-breakdown-utils'
import { computeProjectTotalEffort } from '@/shared/utils/effort-utils'
import { formatProjectNameWithConfidence } from '@/shared/utils/project-display'
import {
  useAppStore,
  useAssignmentStore,
  useBudgetStore,
  useCompaniesStore,
  useEffortsStore,
  useMembersStore,
  useProjectsStore,
  useWbsSettingsStore,
} from '@/stores'
import {
  calcAssignedEffortMonths,
  calcProjectEstimateBudget,
  calcProjectProfitability,
  calcProjectRowsTotal,
  isProjectBudgetOverrun,
} from '../utils/expense-budget-utils'

ModuleRegistry.registerModules([AllCommunityModule])

interface ProjectRow {
  projectId: string
  code: string
  name: string
  totalEffort: number
  coefficient: number
  estimateBudget: number
  assignedEffort: number
  assignedBudget: number
  unassignedEffort: number
  unassignedBudget: number
  // 案件別損益（人・モノ・金の三位一体強化、ENHANCEMENT-ROADMAP §4）。
  // contractAmount未設定の案件はnullのまま表示する（0円受注と区別するため）
  contractAmount: number | null
  grossProfit: number | null
  isBudgetOverrun: boolean
  // 原価4区分。労務費+外注費=実人件費、直接経費=実付帯費用と同値
  laborCost: number
  subcontractCost: number
  directExpense: number
  allocatedOverhead: number
  // 配賦後利益 = 粗利 − 間接費配賦。粗利と同じく受注金額未設定はnull（判定不能）
  netProfitAfterOverhead: number | null
}

interface ProjectBudgetViewProps {
  // 対象部門で絞り込む。未指定または`null`（「全部門」）の場合は
  // 未指定時は全案件を対象にする
  divisionId?: string | null
}

/**
 * 案件タブ。全案件（トップレベルプロジェクト）を対象に、総工数（WBS工数列横断ロールアップ合計）×
 * 概算単価（全社共通）×係数で概算予算額を算出して一覧表示する。係数はAG Gridで案件ごとに
 * インライン編集でき、デフォルトはシステム設定値（defaultCoefficient）が入力された状態になる。
 * データ源泉はstores/projects-store・stores/efforts-store・stores/wbs-settings-store・
 * stores/budget-store・stores/assignment-storeのみに依存し、features/projectsは直接importしない
 * （依存方向ルール遵守）。
 */
export function ProjectBudgetView({ divisionId }: ProjectBudgetViewProps = {}) {
  const getProjectTree = useProjectsStore((s) => s.getProjectTree)
  // 案件・工数・WBS設定・係数の変更を検知して再レンダーされるよう購読する
  useProjectsStore((s) => s.projects)
  const efforts = useEffortsStore((s) => s.efforts)
  const wbsSettingsEntries = useWbsSettingsStore((s) => s.entries)
  const getWbsSettings = useWbsSettingsStore((s) => s.getSettings)
  const estimatedUnitPrice = useBudgetStore((s) => s.estimatedUnitPrice)
  const workdaysPerMonth = useBudgetStore((s) => s.workdaysPerMonth)
  const getProjectCoefficient = useBudgetStore((s) => s.getProjectCoefficient)
  const setProjectCoefficient = useBudgetStore((s) => s.setProjectCoefficient)
  useBudgetStore((s) => s.defaultCoefficient)
  useBudgetStore((s) => s.projectCoefficients)
  const assignments = useAssignmentStore((s) => s.assignments)
  const members = useMembersStore((s) => s.members)
  const budgetBreakdowns = useBudgetStore((s) => s.budgetBreakdowns)
  // 原価4区分の入力。セレクタ購読漏れはUIが古い値のまま止まる既知の
  // 落とし穴（development-patterns.md §10）のため、参照フィールドを全て購読する
  const companies = useCompaniesStore((s) => s.companies)
  const divisionBudgets = useBudgetStore((s) => s.divisionBudgets)
  const saasContracts = useBudgetStore((s) => s.saasContracts)
  const aiUsageEntries = useBudgetStore((s) => s.aiUsageEntries)
  const exchangeRateHistory = useBudgetStore((s) => s.exchangeRateHistory)
  const fiscalYear = useAppStore((s) => s.fiscalYear)
  const fiscalYearStartMonth = useAppStore((s) => s.fiscalYearStartMonth)
  // 案件別損益（実コスト）の集計基準日。マウント時に一度だけ固定し、以降の再レンダーで
  // 変動させない（SaasContractTable.tsxのisContractRenewalWarning基準日と同じパターン）
  const referenceDate = useMemo(() => new Date(), [])

  const allRoots = getProjectTree()
  const roots = useMemo(
    () =>
      divisionId
        ? allRoots.filter((root) => root.divisionId === divisionId)
        : allRoots,
    [allRoots, divisionId],
  )

  // 総工数はWBS工数（人日）を1人月=WORKDAYS_PER_MONTH人日で人月換算して保持する
  // （概算単価が月額単価のため、次元を揃えないと概算予算額が過大になる）
  const totalEfforts = useMemo(() => {
    const merged = new Map<string, number>()
    for (const root of roots) {
      const settings = getWbsSettings(root.id)
      const columnIds = settings.effortColumns
        .filter((c) => c.enabled)
        .map((c) => c.id)
      const result = computeProjectTotalEffort([root], columnIds, efforts)
      for (const [key, value] of result) {
        merged.set(key, value / workdaysPerMonth)
      }
    }
    return merged
  }, [roots, wbsSettingsEntries, getWbsSettings, efforts, workdaysPerMonth])

  const costBreakdownMap = useMemo(() => {
    const monthKeys = getFiscalYearMonthKeys(fiscalYear, fiscalYearStartMonth)
    const overheadPoolByDivision = new Map<string, number>()
    for (const root of roots) {
      if (!root.divisionId || overheadPoolByDivision.has(root.divisionId)) {
        continue
      }
      overheadPoolByDivision.set(
        root.divisionId,
        calcDivisionOverheadPool({
          divisionId: root.divisionId,
          fiscalYear,
          monthKeys,
          divisionBudgets,
          budgetBreakdowns,
          saasContracts,
          aiUsageEntries,
          exchangeRateHistory,
        }),
      )
    }
    return buildProjectCostBreakdownMap({
      topLevelProjects: roots,
      assignments,
      members,
      companies,
      budgetBreakdowns,
      monthKeys,
      overheadPoolByDivision,
      referenceDate,
    })
  }, [
    roots,
    fiscalYear,
    fiscalYearStartMonth,
    divisionBudgets,
    budgetBreakdowns,
    saasContracts,
    aiUsageEntries,
    exchangeRateHistory,
    assignments,
    members,
    companies,
    referenceDate,
  ])

  const rowData = useMemo<ProjectRow[]>(
    () =>
      roots.map((root) => {
        const totalEffort = totalEfforts.get(root.id) ?? 0
        const coefficient = getProjectCoefficient(root.id)
        // 割当済工数はアサイン管理側の月次配分値（人月）合計、未割当工数は
        // 総工数との差分。アサインが総工数を超過する場合は
        // 過剰配分のシグナルとして未割当を負値のまま表示する（クランプしない）
        const assignedEffort = calcAssignedEffortMonths(root.id, assignments)
        const unassignedEffort = totalEffort - assignedEffort
        const profitability = calcProjectProfitability(
          root,
          assignments,
          members,
          budgetBreakdowns,
          referenceDate,
        )
        const costBreakdown = costBreakdownMap.get(root.id)
        return {
          projectId: root.id,
          code: root.code,
          name: formatProjectNameWithConfidence(root.name, root.confidence),
          totalEffort,
          coefficient,
          estimateBudget: calcProjectEstimateBudget(
            totalEffort,
            estimatedUnitPrice,
            coefficient,
          ),
          assignedEffort,
          assignedBudget: calcProjectEstimateBudget(
            assignedEffort,
            estimatedUnitPrice,
            coefficient,
          ),
          unassignedEffort,
          unassignedBudget: calcProjectEstimateBudget(
            unassignedEffort,
            estimatedUnitPrice,
            coefficient,
          ),
          contractAmount: root.contractAmount ?? null,
          grossProfit:
            root.contractAmount != null ? profitability.grossProfit : null,
          isBudgetOverrun: isProjectBudgetOverrun(profitability),
          laborCost: costBreakdown?.laborCost ?? 0,
          subcontractCost: costBreakdown?.subcontractCost ?? 0,
          directExpense: costBreakdown?.directExpense ?? 0,
          allocatedOverhead: costBreakdown?.allocatedOverhead ?? 0,
          netProfitAfterOverhead:
            root.contractAmount != null
              ? profitability.grossProfit -
                (costBreakdown?.allocatedOverhead ?? 0)
              : null,
        }
      }),
    [
      roots,
      totalEfforts,
      estimatedUnitPrice,
      getProjectCoefficient,
      assignments,
      members,
      budgetBreakdowns,
      referenceDate,
      costBreakdownMap,
    ],
  )

  // 合計行（pinned bottom row）。総工数・概算予算額・割当済/未割当工数とその概算金額を
  // 合計し、コード・案件名・係数は対象外（係数は行によって値が異なる係数であり合算に
  // 意味がないため空欄表示にする）
  const pinnedBottomRowData = useMemo<ProjectRow[]>(() => {
    const totals = calcProjectRowsTotal(rowData)
    return [
      {
        projectId: '__total__',
        code: '',
        name: '合計',
        totalEffort: totals.totalEffort,
        coefficient: Number.NaN,
        estimateBudget: totals.estimateBudget,
        assignedEffort: totals.assignedEffort,
        assignedBudget: totals.assignedBudget,
        unassignedEffort: totals.unassignedEffort,
        unassignedBudget: totals.unassignedBudget,
        // 受注金額・粗利は案件によって「未設定」の意味合いが強く出るため、
        // 係数と同様に合計対象外（空欄表示）とする
        contractAmount: null,
        grossProfit: null,
        isBudgetOverrun: false,
        // 原価4区分は常に定義される値のため合算する
        laborCost: rowData.reduce((sum, r) => sum + r.laborCost, 0),
        subcontractCost: rowData.reduce((sum, r) => sum + r.subcontractCost, 0),
        directExpense: rowData.reduce((sum, r) => sum + r.directExpense, 0),
        allocatedOverhead: rowData.reduce(
          (sum, r) => sum + r.allocatedOverhead,
          0,
        ),
        // 配賦後利益は粗利と同様に受注金額未設定案件が混在するため合計対象外
        netProfitAfterOverhead: null,
      },
    ]
  }, [rowData])

  const columnDefs = useMemo<ColDef<ProjectRow>[]>(
    () => [
      { field: 'code', headerName: 'コード', editable: false, width: 120 },
      { field: 'name', headerName: 'プロジェクト名', editable: false, flex: 1 },
      {
        field: 'totalEffort',
        headerName: '総工数（人月）',
        editable: false,
        cellClass: 'text-right tabular-nums',
        width: 140,
        valueFormatter: (params) => (params.value as number).toFixed(2),
      },
      {
        field: 'assignedEffort',
        headerName: '割当済工数（人月）',
        editable: false,
        cellClass: 'text-right tabular-nums',
        width: 150,
        valueFormatter: (params) => (params.value as number).toFixed(2),
      },
      {
        field: 'unassignedEffort',
        headerName: '未割当工数（人月）',
        editable: false,
        cellClass: 'text-right tabular-nums',
        width: 150,
        valueFormatter: (params) => (params.value as number).toFixed(2),
      },
      {
        field: 'coefficient',
        headerName: '係数',
        editable: (params) => !params.node?.rowPinned,
        cellClass: 'text-right tabular-nums',
        width: 100,
        valueFormatter: (params) =>
          params.node?.rowPinned ? '' : String(params.value),
        valueSetter: (params: ValueSetterParams<ProjectRow>) => {
          if (!params.data) return false
          params.data.coefficient = Number(params.newValue)
          return true
        },
      },
      {
        field: 'estimateBudget',
        headerName: '概算予算額（万円）',
        editable: false,
        cellClass: 'bg-budget-planned/10 text-right tabular-nums',
        width: 160,
        valueFormatter: (params) =>
          manYenFormatter.format(params.value as number),
      },
      {
        field: 'assignedBudget',
        headerName: '割当済概算（万円）',
        editable: false,
        cellClass: 'bg-budget-actual/10 text-right tabular-nums',
        width: 160,
        valueFormatter: (params) =>
          manYenFormatter.format(params.value as number),
      },
      {
        field: 'unassignedBudget',
        headerName: '未割当概算（万円）',
        editable: false,
        cellClass: 'bg-budget-planned/10 text-right tabular-nums',
        width: 160,
        valueFormatter: (params) =>
          manYenFormatter.format(params.value as number),
      },
      {
        // 受注金額・粗利（人・モノ・金の三位一体強化、ENHANCEMENT-ROADMAP §4）。
        // 編集はProjectDialog経由に一本化し、本グリッドでは読み取り専用とする
        field: 'contractAmount',
        headerName: '受注金額（万円）',
        editable: false,
        cellClass: 'bg-budget-planned/10 text-right tabular-nums',
        width: 150,
        valueFormatter: (params) =>
          params.value == null
            ? '—'
            : manYenFormatter.format(params.value as number),
      },
      {
        field: 'grossProfit',
        headerName: '粗利（万円）',
        editable: false,
        cellClass: (params) =>
          params.data?.isBudgetOverrun
            ? 'bg-budget-actual/10 text-right tabular-nums text-destructive font-medium'
            : 'bg-budget-actual/10 text-right tabular-nums',
        width: 150,
        valueFormatter: (params) =>
          params.value == null
            ? '—'
            : manYenFormatter.format(params.value as number),
      },
      // 原価4区分（非公開の設計文書）。
      // 実コスト（支出）系の分類のためbg-budget-actual/10で統一する
      ...(
        [
          ['laborCost', '労務費（万円）'],
          ['subcontractCost', '外注費（万円）'],
          ['directExpense', '直接経費（万円）'],
          ['allocatedOverhead', '間接費配賦（万円）'],
        ] as const
      ).map(
        ([field, headerName]): ColDef<ProjectRow> => ({
          field,
          headerName,
          editable: false,
          cellClass: 'bg-budget-actual/10 text-right tabular-nums',
          width: 140,
          valueFormatter: (params) =>
            manYenFormatter.format((params.value as number) ?? 0),
        }),
      ),
      {
        field: 'netProfitAfterOverhead',
        headerName: '配賦後利益（万円）',
        editable: false,
        cellClass: 'text-right tabular-nums',
        width: 150,
        valueFormatter: (params) =>
          params.value == null
            ? '—'
            : manYenFormatter.format(params.value as number),
      },
    ],
    [],
  )

  // 合計行（pinned bottom row）のスタイルを、その他費用タブ・SaaS費用タブの合計行
  // （shadcn/uiのTableFooter: `bg-muted/50 border-t font-medium`）と視覚統一する。
  // AG Grid側はCSSクラスを直接付与できないため、ハードコード色値を避けてCSS変数
  // 経由のインラインstyleで同等の見た目を再現する（ダークモード自動対応、
  // docs/development-patterns.mdの既知の落とし穴#「AG Gridのハードコード色値」参照）
  const getRowStyle = useCallback((params: RowClassParams<ProjectRow>) => {
    if (params.node.rowPinned) {
      return {
        fontWeight: 500,
        backgroundColor:
          'color-mix(in srgb, var(--color-muted) 50%, transparent)',
        borderTop: '1px solid var(--color-border)',
      }
    }
    return undefined
  }, [])

  const handleCellValueChanged = useCallback(
    (event: CellValueChangedEvent<ProjectRow>) => {
      if (!event.data) return
      if (event.colDef.field === 'coefficient') {
        setProjectCoefficient(event.data.projectId, event.data.coefficient)
      }
    },
    [setProjectCoefficient],
  )

  if (roots.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        プロジェクトがありません
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div
        style={{ height: Math.min(640, 60 + rowData.length * 42 + 20 + 42) }}
      >
        <AgGridReact<ProjectRow>
          theme={gridTheme}
          rowData={rowData}
          columnDefs={columnDefs}
          pinnedBottomRowData={pinnedBottomRowData}
          getRowId={(params) => params.data.projectId}
          getRowStyle={getRowStyle}
          onCellValueChanged={handleCellValueChanged}
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-2 text-sm font-medium">
          プロジェクト別 概算予算額（万円）
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={rowData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="code"
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
                `${manYenFormatter.format(value)} 万円`,
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              dataKey="estimateBudget"
              name="概算予算額"
              fill="var(--color-budget-planned)"
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="assignedBudget"
              name="割当済概算"
              fill="var(--color-budget-actual)"
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
