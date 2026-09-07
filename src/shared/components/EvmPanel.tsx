import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { projectProgressFormSchema } from '@/infrastructure/validation/schemas'
import { Button } from '@/shared/components/ui/button'
import { Label } from '@/shared/components/ui/label'
import { NumericInput } from '@/shared/components/ui/numeric-input'
import { useToast } from '@/shared/hooks/use-toast'
import type { ProjectTreeNode } from '@/shared/types/project'
import {
  calcProjectEstimateBudget,
  manYenFormatter as currencyFormatter,
} from '@/shared/utils/budget-utils'
import { computeProjectTotalEffort } from '@/shared/utils/effort-utils'
import {
  calcEvmSeries,
  calcPvFromBaseline,
  getActiveBaseline,
  getFiscalYearWeekKeys,
  isEvmChartEligible,
  isEvmInputEligible,
} from '@/shared/utils/evm-utils'
import { getIsoWeekKey, getIsoWeekMonday } from '@/shared/utils/iso-week-utils'
import { hasAnyCompletedTask } from '@/shared/utils/wbs-progress-utils'
import {
  useAssignmentStore,
  useBudgetStore,
  useEffortsStore,
  useMembersStore,
  useProjectBaselineStore,
  useProjectProgressStore,
  useProjectsStore,
  useScheduleStore,
  useWbsSettingsStore,
} from '@/stores'

function formatWeekLabel(weekKey: string): string {
  const monday = getIsoWeekMonday(weekKey)
  return `${monday.getMonth() + 1}/${monday.getDate()}`
}

interface EvmPanelProps {
  divisionId: string
  fiscalYear: number
  startMonth: number
  /**
   * trueの場合、週次進捗率入力フォームを非表示にし、グラフ（＋2件以上時の表示
   * プロジェクト切替セレクタ）のみを表示する読み取り専用モードになる。
   * ダッシュボード（`DashboardPage`）でのEVM常時表示に使用（入力は
   * WBS画面（`WbsPage`）側の完了フラグロールアップから行う運用に一本化するため）。
   */
  readOnly?: boolean
}

/**
 * 案件×週次のEVM（PV/EV/AC）パネル。週次の進捗率入力（ユーザーの唯一の週次アクション）と、
 * PV（スケジュール期間按分の自動算出）・EV（進捗率×概算予算の自動算出）・
 * AC（アサイン率×人件費単価の月内日数按分による週次自動集計）の3線グラフを表示する。
 * オプトアウトは消極的対応のみ（進捗率未入力の案件は自然にチャート対象外になる）。
 */
export function EvmPanel({
  divisionId,
  fiscalYear,
  startMonth,
  readOnly = false,
}: EvmPanelProps) {
  const { toast } = useToast()
  const getProjectTree = useProjectsStore((s) => s.getProjectTree)
  // 案件・工数・WBS設定・係数・スケジュール・進捗の変更を検知して再レンダーされるよう購読する
  useProjectsStore((s) => s.projects)
  const scheduleEntries = useScheduleStore((s) => s.entries)
  const loadSchedule = useScheduleStore((s) => s.loadSchedule)
  const progressEntries = useProjectProgressStore(
    (s) => s.projectProgressEntries,
  )
  const loadProjectProgress = useProjectProgressStore(
    (s) => s.loadProjectProgress,
  )
  const setWeeklyProgress = useProjectProgressStore((s) => s.setWeeklyProgress)
  const efforts = useEffortsStore((s) => s.efforts)
  const wbsSettingsEntries = useWbsSettingsStore((s) => s.entries)
  const getWbsSettings = useWbsSettingsStore((s) => s.getSettings)
  const estimatedUnitPrice = useBudgetStore((s) => s.estimatedUnitPrice)
  const workdaysPerMonth = useBudgetStore((s) => s.workdaysPerMonth)
  const budgetBreakdowns = useBudgetStore((s) => s.budgetBreakdowns)
  const getProjectCoefficient = useBudgetStore((s) => s.getProjectCoefficient)
  useBudgetStore((s) => s.projectCoefficients)
  useBudgetStore((s) => s.defaultCoefficient)
  const assignments = useAssignmentStore((s) => s.assignments)
  const members = useMembersStore((s) => s.members)
  const projectBaselines = useProjectBaselineStore((s) => s.projectBaselines)
  const loadProjectBaselines = useProjectBaselineStore(
    (s) => s.loadProjectBaselines,
  )

  useEffect(() => {
    loadSchedule()
    loadProjectProgress()
    loadProjectBaselines()
  }, [loadSchedule, loadProjectProgress, loadProjectBaselines])

  const roots = getProjectTree()

  const inputEligibleProjects = useMemo(
    () =>
      roots.filter((p) => isEvmInputEligible(p, scheduleEntries, divisionId)),
    [roots, scheduleEntries, divisionId],
  )
  const chartEligibleProjects = useMemo(
    () =>
      roots.filter((p) =>
        isEvmChartEligible(
          p,
          scheduleEntries,
          progressEntries,
          divisionId,
          hasAnyCompletedTask(p),
        ),
      ),
    [roots, scheduleEntries, progressEntries, divisionId],
  )

  const weekKeys = useMemo(
    () => getFiscalYearWeekKeys(fiscalYear, startMonth),
    [fiscalYear, startMonth],
  )

  const [selectedChartProjectId, setSelectedChartProjectId] = useState('')
  const effectiveChartProjectId =
    chartEligibleProjects.length === 1
      ? (chartEligibleProjects[0]?.id ?? '')
      : selectedChartProjectId

  const [inputProjectId, setInputProjectId] = useState('')
  const [weekKey, setWeekKey] = useState(() => getIsoWeekKey(new Date()))
  const [progressRateInput, setProgressRateInput] = useState(0)

  /** 案件に紐づく予算枠（BudgetBreakdown）の合計。WBS未作成段階のBAC供給源（L0） */
  const calcBudgetFrame = useCallback(
    (projectId: string): number =>
      budgetBreakdowns
        .filter((b) => b.projectId === projectId)
        .reduce((sum, b) => sum + b.amount, 0),
    [budgetBreakdowns],
  )

  // BACの供給源を段階的に切り替える（非公開の設計文書）。
  // WBS工数が入っていればWBS積み上げ（L1）、無ければ予算枠（L0）を使う。
  // これにより超大概算で予算枠だけ確保した早期段階でもEVMが立ち上がる
  const calcBudgetTotal = useCallback(
    (project: ProjectTreeNode): number => {
      const settings = getWbsSettings(project.id)
      const columnIds = settings.effortColumns
        .filter((c) => c.enabled)
        .map((c) => c.id)
      const result = computeProjectTotalEffort([project], columnIds, efforts)
      const totalEffortDays = result.get(project.id) ?? 0
      if (totalEffortDays <= 0) return calcBudgetFrame(project.id)
      const totalEffortMonths = totalEffortDays / workdaysPerMonth
      const coefficient = getProjectCoefficient(project.id)
      return calcProjectEstimateBudget(
        totalEffortMonths,
        estimatedUnitPrice,
        coefficient,
      )
    },
    [
      wbsSettingsEntries,
      getWbsSettings,
      efforts,
      estimatedUnitPrice,
      workdaysPerMonth,
      getProjectCoefficient,
      calcBudgetFrame,
    ],
  )

  const chartProject = chartEligibleProjects.find(
    (p) => p.id === effectiveChartProjectId,
  )

  // 表示中案件のベースライン履歴（version昇順）と、有効版・当初版
  const chartBaselineHistory = useMemo(
    () =>
      chartProject
        ? projectBaselines
            .filter((b) => b.projectId === chartProject.id)
            .sort((a, b) => a.version - b.version)
        : [],
    [projectBaselines, chartProject],
  )
  const chartBudgetFrame = chartProject ? calcBudgetFrame(chartProject.id) : 0
  const initialBaseline = chartBaselineHistory[0]
  const activeBaseline = chartProject
    ? getActiveBaseline(projectBaselines, chartProject.id)
    : null
  const hasInitialBaselineSeries = Boolean(
    initialBaseline && initialBaseline.version !== activeBaseline?.version,
  )

  // 版の切替点（v2以降）を縦線で示すための週ラベル
  const baselineMarkers = useMemo(
    () =>
      chartBaselineHistory
        .filter((b) => b.version > 1)
        .map((b) => {
          const [y, m, d] = b.approvedAt.split('-').map(Number) as [
            number,
            number,
            number,
          ]
          return {
            version: b.version,
            weekLabel: formatWeekLabel(getIsoWeekKey(new Date(y, m - 1, d))),
          }
        }),
    [chartBaselineHistory],
  )

  const seriesData = useMemo(() => {
    if (!chartProject) return []
    const progressEntry = progressEntries.find(
      (e) => e.projectId === chartProject.id,
    )
    const budgetTotal = calcBudgetTotal(chartProject)
    const columnIds = getWbsSettings(chartProject.id)
      .effortColumns.filter((c) => c.enabled)
      .map((c) => c.id)
    return calcEvmSeries({
      weekKeys,
      projectId: chartProject.id,
      scheduleEntries,
      weeklyProgress: progressEntry?.weeklyProgress ?? {},
      assignments,
      members,
      budgetTotal,
      wbsSource: { node: chartProject, columnIds, efforts },
      baseline: activeBaseline,
      unitPriceMode: chartProject.evmUnitPriceMode,
    }).map((point) => ({
      ...point,
      weekLabel: formatWeekLabel(point.week),
      // 再ベースライン済みなら当初計画（v1）のPVも重ねる
      pvInitial:
        initialBaseline && initialBaseline.version !== activeBaseline?.version
          ? calcPvFromBaseline(
              point.week,
              initialBaseline.monthlyPlannedCost,
              initialBaseline.bacAmount,
            )
          : undefined,
    }))
  }, [
    chartProject,
    progressEntries,
    weekKeys,
    scheduleEntries,
    assignments,
    members,
    calcBudgetTotal,
    getWbsSettings,
    efforts,
    projectBaselines,
    activeBaseline,
    initialBaseline,
  ])

  const handleSubmit = () => {
    const result = projectProgressFormSchema.safeParse({
      projectId: inputProjectId,
      weekKey,
      progressRate: progressRateInput,
    })
    if (!result.success) {
      toast({
        title: result.error.issues[0]?.message ?? '入力内容を確認してください',
        variant: 'destructive',
      })
      return
    }
    setWeeklyProgress(
      result.data.projectId,
      result.data.weekKey,
      result.data.progressRate / 100,
    )
    toast({ title: '進捗率を記録しました' })
  }

  if (inputEligibleProjects.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm font-medium">EVM（計画・出来高・実コスト）</p>
        <p className="mt-2 text-sm text-muted-foreground">
          EVM対象のプロジェクトがありません（スケジュール登録が必要です）。
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm font-medium">EVM（計画・出来高・実コスト）</p>

      {!readOnly && (
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-border p-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="evm-input-project" className="text-xs">
              対象プロジェクト
            </Label>
            <select
              id="evm-input-project"
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
              value={inputProjectId}
              onChange={(e) => setInputProjectId(e.target.value)}
            >
              <option value="">選択してください</option>
              {inputEligibleProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="evm-input-week" className="text-xs">
              対象週
            </Label>
            <select
              id="evm-input-week"
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
              value={weekKey}
              onChange={(e) => setWeekKey(e.target.value)}
            >
              {weekKeys.map((w) => (
                <option key={w} value={w}>
                  {w}（{formatWeekLabel(w)}〜）
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="evm-input-progress" className="text-xs">
              進捗率（%）
            </Label>
            <NumericInput
              id="evm-input-progress"
              value={progressRateInput}
              onValueChange={setProgressRateInput}
              className="h-8"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              size="sm"
              className="w-full"
              onClick={handleSubmit}
            >
              進捗率を記録
            </Button>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-4">
            入力担当: プロジェクト責任者相当を想定
          </p>
        </div>
      )}

      <div className="mt-4">
        {chartEligibleProjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            進捗率が入力されたプロジェクトがまだありません。上記フォームから記録すると、ここにPV/EV/ACのグラフが表示されます。
          </p>
        ) : (
          <>
            {chartEligibleProjects.length > 1 && (
              <div className="mb-2 space-y-1">
                <Label htmlFor="evm-chart-project" className="text-xs">
                  表示プロジェクト
                </Label>
                <select
                  id="evm-chart-project"
                  className="w-full max-w-xs rounded border border-border bg-background px-2 py-1.5 text-sm"
                  value={selectedChartProjectId}
                  onChange={(e) => setSelectedChartProjectId(e.target.value)}
                >
                  <option value="">選択してください</option>
                  {chartEligibleProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {chartProject && (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={seriesData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-border"
                  />
                  <XAxis
                    dataKey="weekLabel"
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
                    dataKey="pv"
                    name="PV（計画）"
                    stroke="var(--color-budget-planned)"
                    strokeDasharray="4 2"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="ev"
                    name="EV（出来高）"
                    stroke="var(--color-success)"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="ac"
                    name="AC（実コスト）"
                    stroke="var(--color-budget-actual)"
                    dot={false}
                  />
                  {/* 再ベースライン済みの案件では当初計画（v1）を点線で重ね、
                      「当初からどれだけずれたか」を読めるようにする */}
                  {hasInitialBaselineSeries && (
                    <Line
                      type="monotone"
                      dataKey="pvInitial"
                      name="PV（当初計画）"
                      stroke="var(--color-muted-foreground)"
                      strokeDasharray="2 3"
                      dot={false}
                    />
                  )}
                  {/* 参照水平線（非公開の設計文書）。いずれも設定時のみ表示する。
                      受注額はBACにしない（粗利を含むため）が、上限の目安として重ねる */}
                  {chartProject?.contractAmount != null &&
                    chartProject.contractAmount > 0 && (
                      <ReferenceLine
                        y={chartProject.contractAmount}
                        stroke="var(--color-foreground)"
                        strokeOpacity={0.5}
                        label={{
                          value: '受注額',
                          position: 'insideTopRight',
                          fontSize: 10,
                          fill: 'var(--color-muted-foreground)',
                        }}
                      />
                    )}
                  {chartBudgetFrame > 0 && (
                    <ReferenceLine
                      y={chartBudgetFrame}
                      stroke="var(--color-muted-foreground)"
                      strokeDasharray="2 3"
                      label={{
                        value: '承認予算枠',
                        position: 'insideBottomRight',
                        fontSize: 10,
                        fill: 'var(--color-muted-foreground)',
                      }}
                    />
                  )}
                  {/* 版の切替点。SPI/CPIの連続性はここで切れるため明示する */}
                  {baselineMarkers.map((marker) => (
                    <ReferenceLine
                      key={marker.version}
                      x={marker.weekLabel}
                      stroke="var(--color-budget-planned)"
                      strokeDasharray="4 3"
                      label={{
                        value: `v${marker.version}`,
                        position: 'top',
                        fontSize: 10,
                        fill: 'var(--color-budget-planned)',
                      }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}

            {/* ベースライン履歴（非公開の設計文書） */}
            {chartBaselineHistory.length > 0 && (
              <div className="mt-3 space-y-1 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">
                  ベースライン履歴
                </p>
                <ul className="space-y-0.5 text-xs">
                  {chartBaselineHistory.map((baseline) => (
                    <li
                      key={baseline.id}
                      className="flex flex-wrap items-baseline gap-x-3 tabular-nums"
                    >
                      <span className="font-medium">v{baseline.version}</span>
                      <span className="text-muted-foreground">
                        {baseline.approvedAt}
                      </span>
                      <span>{baseline.reason}</span>
                      <span className="text-muted-foreground">
                        BAC {currencyFormatter.format(baseline.bacAmount)} 万円
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
