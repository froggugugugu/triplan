import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  HelpCircle,
  ListTree,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { Combobox } from '@/shared/components/ui/combobox'
import { useCanViewFinancials } from '@/shared/hooks/use-financial-visibility'
import type { ProjectTreeNode } from '@/shared/types/project'
import {
  calcProjectEstimateBudget,
  getFiscalYearMonthKeys,
  manYenFormatter,
} from '@/shared/utils/budget-utils'
import {
  buildProjectCostBreakdownMap,
  calcDivisionOverheadPool,
} from '@/shared/utils/cost-breakdown-utils'
import { computeProjectTotalEffort } from '@/shared/utils/effort-utils'
import { getSnapshotsForProject } from '@/shared/utils/estimate-snapshot-utils'
import {
  calcEvmSeries,
  getActiveBaseline,
  getFiscalYearWeekKeys,
  resolveProgressRateAtWeek,
  type WbsProgressSource,
} from '@/shared/utils/evm-utils'
import { formatDateOnly, getIsoWeekKey } from '@/shared/utils/iso-week-utils'
import { resolveInitialProjectId } from '@/shared/utils/navigation-utils'
import { calcProjectProfitability } from '@/shared/utils/profitability-utils'
import {
  ESTIMATE_STAGE_LABELS,
  formatConeWidth,
} from '@/shared/utils/uncertainty-cone'
import { hasAnyCompletedTask } from '@/shared/utils/wbs-progress-utils'
import {
  useAppStore,
  useAssignmentStore,
  useBillingMilestoneStore,
  useBudgetStore,
  useChangeRequestStore,
  useCompaniesStore,
  useEffortsStore,
  useEstimateStore,
  useMembersStore,
  useProjectBaselineStore,
  useProjectProgressStore,
  useProjectsStore,
  useRiskStore,
  useScheduleSettingsStore,
  useScheduleStore,
  useTeamStore,
  useWbsSettingsStore,
} from '@/stores'
import { EvmLineChart, formatWeekLabel } from '../components/EvmLineChart'
import { ProjectResourceHistogram } from '../components/ProjectResourceHistogram'
import {
  calcBillingTotals,
  calcOrderBacklog,
} from '../utils/billing-milestone-utils'
import { getCurrentPhase } from '../utils/current-phase-utils'
import {
  buildProjectTeamRows,
  calcCurrentEvmIndices,
  deriveOverallStatus,
  evaluateSummaryJudgments,
  filterJudgmentsByFinancialVisibility,
  hasSummaryEvaluationBasis,
} from '../utils/project-summary-utils'
import {
  deriveRiskSeverity,
  RISK_SEVERITY_LABELS,
  RISK_STATUS_LABELS,
  sortRiskEntries,
} from '../utils/risk-utils'

type OverallBadgeKey = 'good' | 'warning' | 'critical' | 'unknown'

const OVERALL_BADGE: Record<
  OverallBadgeKey,
  { label: string; className: string }
> = {
  good: {
    label: '良好',
    className: 'border-transparent bg-success/15 text-success',
  },
  warning: {
    label: '要注意',
    className:
      'border-yellow-500/40 bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
  },
  critical: {
    label: '危険',
    className: 'border-transparent bg-destructive text-destructive-foreground',
  },
  unknown: {
    label: '判定不能',
    className: 'border-transparent bg-secondary text-secondary-foreground',
  },
}

/** 原価4区分の積み上げ横棒の配色（分類の区別のみが目的。ライト/ダーク両対応の中間トーン） */
const COST_SEGMENTS = [
  { key: 'laborCost', label: '労務費', className: 'bg-sky-600' },
  { key: 'subcontractCost', label: '外注費', className: 'bg-orange-500' },
  { key: 'directExpense', label: '直接経費', className: 'bg-violet-500' },
  { key: 'allocatedOverhead', label: '間接費配賦', className: 'bg-slate-400' },
] as const

function formatManYen(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${manYenFormatter.format(value)} 万円`
}

/**
 * プロジェクトサマリー統合ビュー（/project-summary、非公開の設計文書）。
 *
 * 「PMが週次に、担当案件が大丈夫かを1分で確認する」ための読み取り専用ページ。
 * 決定論的な8ルール（project-summary-utils）で総合判定バッジと理由リストを提示し、
 * 金・モノ・人・商流の4区画に既存の算出結果（EVM・損益・原価4区分・請求マイルストン・
 * 山積み）を集約する。新しい入力は一切持たない。
 *
 * 金額の表示制御はページ単位ではなく**セクション単位**（金・商流と金額系判定のみ非表示）。
 * partnerロール・localトグルOFFでも進捗・体制・納期の確認用途で使える。
 */
export function ProjectSummaryPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const canViewFinancials = useCanViewFinancials()

  const fiscalYear = useAppStore((s) => s.fiscalYear)
  const startMonth = useAppStore((s) => s.fiscalYearStartMonth)

  const projects = useProjectsStore((s) => s.projects)
  const getProjectTree = useProjectsStore((s) => s.getProjectTree)
  const loadProjects = useProjectsStore((s) => s.loadProjects)
  const scheduleEntries = useScheduleStore((s) => s.entries)
  const loadSchedule = useScheduleStore((s) => s.loadSchedule)
  const loadScheduleSettings = useScheduleSettingsStore(
    (s) => s.loadScheduleSettings,
  )
  const getScheduleSettings = useScheduleSettingsStore((s) => s.getSettings)
  useScheduleSettingsStore((s) => s.entries)
  const efforts = useEffortsStore((s) => s.efforts)
  const loadEfforts = useEffortsStore((s) => s.loadEfforts)
  const loadWbsSettings = useWbsSettingsStore((s) => s.loadWbsSettings)
  const getWbsSettings = useWbsSettingsStore((s) => s.getSettings)
  useWbsSettingsStore((s) => s.entries)
  const assignments = useAssignmentStore((s) => s.assignments)
  const loadAssignments = useAssignmentStore((s) => s.loadAssignments)
  const members = useMembersStore((s) => s.members)
  const loadMembers = useMembersStore((s) => s.loadMembers)
  const divisions = useTeamStore((s) => s.divisions)
  const loadTeam = useTeamStore((s) => s.loadTeam)
  const companies = useCompaniesStore((s) => s.companies)
  const loadCompanies = useCompaniesStore((s) => s.loadCompanies)
  const projectBaselines = useProjectBaselineStore((s) => s.projectBaselines)
  const loadProjectBaselines = useProjectBaselineStore(
    (s) => s.loadProjectBaselines,
  )
  const progressEntries = useProjectProgressStore(
    (s) => s.projectProgressEntries,
  )
  const loadProjectProgress = useProjectProgressStore(
    (s) => s.loadProjectProgress,
  )
  const billingMilestones = useBillingMilestoneStore((s) => s.billingMilestones)
  const loadBillingMilestones = useBillingMilestoneStore(
    (s) => s.loadBillingMilestones,
  )
  const changeRequests = useChangeRequestStore((s) => s.changeRequests)
  const loadChangeRequests = useChangeRequestStore((s) => s.loadChangeRequests)
  const riskEntries = useRiskStore((s) => s.riskEntries)
  const loadRiskEntries = useRiskStore((s) => s.loadRiskEntries)
  const estimateSnapshots = useEstimateStore((s) => s.estimateSnapshots)
  const loadEstimateSnapshots = useEstimateStore((s) => s.loadEstimateSnapshots)

  const loadBudgetData = useBudgetStore((s) => s.loadBudgetData)
  const estimatedUnitPrice = useBudgetStore((s) => s.estimatedUnitPrice)
  const workdaysPerMonth = useBudgetStore((s) => s.workdaysPerMonth)
  const getProjectCoefficient = useBudgetStore((s) => s.getProjectCoefficient)
  useBudgetStore((s) => s.projectCoefficients)
  useBudgetStore((s) => s.defaultCoefficient)
  const budgetBreakdowns = useBudgetStore((s) => s.budgetBreakdowns)
  const divisionBudgets = useBudgetStore((s) => s.divisionBudgets)
  const saasContracts = useBudgetStore((s) => s.saasContracts)
  const aiUsageEntries = useBudgetStore((s) => s.aiUsageEntries)
  const exchangeRateHistory = useBudgetStore((s) => s.exchangeRateHistory)
  const baselineStaleThreshold = useBudgetStore((s) => s.baselineStaleThreshold)
  const budgetProgressGapThreshold = useBudgetStore(
    (s) => s.summaryBudgetProgressGapThreshold,
  )
  const spiWarningThreshold = useBudgetStore(
    (s) => s.summarySpiWarningThreshold,
  )

  useEffect(() => {
    loadProjects()
    loadSchedule()
    loadScheduleSettings()
    loadEfforts()
    loadWbsSettings()
    loadAssignments()
    loadMembers()
    loadTeam()
    loadCompanies()
    loadProjectBaselines()
    loadProjectProgress()
    loadBillingMilestones()
    loadChangeRequests()
    loadRiskEntries()
    loadEstimateSnapshots()
    loadBudgetData()
  }, [
    loadProjects,
    loadSchedule,
    loadScheduleSettings,
    loadEfforts,
    loadWbsSettings,
    loadAssignments,
    loadMembers,
    loadTeam,
    loadCompanies,
    loadProjectBaselines,
    loadProjectProgress,
    loadBillingMilestones,
    loadChangeRequests,
    loadRiskEntries,
    loadEstimateSnapshots,
    loadBudgetData,
  ])

  // 判定基準日はマウント時に一度だけ確定する（レンダーごとに揺れない決定論）
  const [referenceDate] = useState(() => new Date())

  const majorProjects = useMemo(() => {
    void projects
    return getProjectTree()
  }, [projects, getProjectTree])

  // クエリパラメータ（?projectId=xxx）→ location.state の優先順位で初期選択する
  // （ストアの非同期ロード完了を待つ2段階パターン）
  const [initialProjectIdCandidate] = useState(() =>
    resolveInitialProjectId(
      searchParams.get('projectId'),
      (location.state as { selectedProjectId?: string } | null)
        ?.selectedProjectId ?? null,
      () => true,
    ),
  )
  const [selectedProjectId, setSelectedProjectId] = useState('')

  useEffect(() => {
    if (
      !selectedProjectId &&
      initialProjectIdCandidate &&
      majorProjects.some((p) => p.id === initialProjectIdCandidate)
    ) {
      setSelectedProjectId(initialProjectIdCandidate)
    }
  }, [majorProjects, selectedProjectId, initialProjectIdCandidate])

  const project: ProjectTreeNode | null = useMemo(
    () => majorProjects.find((p) => p.id === selectedProjectId) ?? null,
    [majorProjects, selectedProjectId],
  )

  const summary = useMemo(() => {
    if (!project) return null
    const today = formatDateOnly(referenceDate)
    const currentMonth = today.slice(0, 7)
    const currentWeekKey = getIsoWeekKey(referenceDate)
    const monthKeys = getFiscalYearMonthKeys(fiscalYear, startMonth)
    const weekKeys = getFiscalYearWeekKeys(fiscalYear, startMonth)

    // --- モノ: スケジュール・現工程・進捗率 ---
    const projectSchedule = scheduleEntries.filter(
      (e) => e.projectId === project.id,
    )
    const scheduleStart =
      projectSchedule.length > 0
        ? projectSchedule.reduce(
            (min, e) => (e.startDate < min ? e.startDate : min),
            projectSchedule[0]?.startDate ?? '',
          )
        : null
    const scheduleEnd =
      projectSchedule.length > 0
        ? projectSchedule.reduce(
            (max, e) => (e.endDate > max ? e.endDate : max),
            projectSchedule[0]?.endDate ?? '',
          )
        : null
    const phases = getScheduleSettings(project.id).phases
    const currentPhaseEntry = getCurrentPhase(projectSchedule, phases, today)
    const currentPhaseName = currentPhaseEntry
      ? (phases.find((p) => p.phaseKey === currentPhaseEntry.phaseKey)?.name ??
        null)
      : null

    const wbsSettings = getWbsSettings(project.id)
    const columnIds = wbsSettings.effortColumns
      .filter((c) => c.enabled)
      .map((c) => c.id)
    const wbsSource: WbsProgressSource = {
      node: project,
      columnIds,
      efforts,
    }
    const progressEntry = progressEntries.find(
      (e) => e.projectId === project.id,
    )
    const weeklyProgress = progressEntry?.weeklyProgress ?? {}
    const hasEvSource =
      progressEntry !== undefined || hasAnyCompletedTask(project)
    const progressRate = hasEvSource
      ? resolveProgressRateAtWeek(currentWeekKey, weeklyProgress, wbsSource)
      : null

    // --- 金: BAC（WBS積み上げ→予算枠フォールバック）・損益・原価4区分 ---
    const totalEffortDays =
      computeProjectTotalEffort([project], columnIds, efforts).get(
        project.id,
      ) ?? 0
    const budgetFrame = budgetBreakdowns
      .filter((b) => b.projectId === project.id)
      .reduce((sum, b) => sum + b.amount, 0)
    const currentBac =
      totalEffortDays > 0
        ? calcProjectEstimateBudget(
            totalEffortDays / workdaysPerMonth,
            estimatedUnitPrice,
            getProjectCoefficient(project.id),
          )
        : budgetFrame
    const baseline = getActiveBaseline(projectBaselines, project.id)
    const effectiveBac = baseline ? baseline.bacAmount : currentBac

    const profitability = calcProjectProfitability(
      project,
      assignments,
      members,
      budgetBreakdowns,
      referenceDate,
    )

    const overheadPoolByDivision = new Map<string, number>()
    if (project.divisionId) {
      overheadPoolByDivision.set(
        project.divisionId,
        calcDivisionOverheadPool({
          divisionId: project.divisionId,
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
    const costBreakdown =
      buildProjectCostBreakdownMap({
        topLevelProjects: majorProjects,
        assignments,
        members,
        companies,
        budgetBreakdowns,
        monthKeys,
        overheadPoolByDivision,
        referenceDate,
      }).get(project.id) ?? null

    // --- EVM: 週次系列とSPI/CPI（スケジュールと進捗ソースが揃った案件のみ） ---
    const evmEligible = projectSchedule.length > 0 && hasEvSource
    const evmSeries = evmEligible
      ? calcEvmSeries({
          weekKeys,
          projectId: project.id,
          scheduleEntries,
          weeklyProgress,
          assignments,
          members,
          budgetTotal: currentBac,
          wbsSource,
          baseline,
          unitPriceMode: project.evmUnitPriceMode,
        })
      : []
    const { spi, cpi } = calcCurrentEvmIndices(evmSeries, currentWeekKey)
    const evmChartData = evmSeries.map((point) => ({
      ...point,
      weekLabel: formatWeekLabel(point.week),
    }))

    // --- 商流: 請求マイルストン・変更要求 ---
    const projectMilestones = billingMilestones.filter(
      (m) => m.projectId === project.id,
    )
    const billingTotals = calcBillingTotals(projectMilestones)
    const orderBacklog = calcOrderBacklog(
      project.contractAmount,
      billingTotals.recognizedTotal,
    )
    const nextMilestone =
      projectMilestones
        .filter((m) => m.status === 'planned')
        .sort((a, b) =>
          a.plannedAcceptanceDate.localeCompare(b.plannedAcceptanceDate),
        )[0] ?? null
    const pendingChangeRequests = changeRequests.filter(
      (c) => c.projectId === project.id && c.status === 'pending',
    ).length

    // --- リスク: 登録簿（非公開の設計文書） ---
    const projectRisks = riskEntries.filter((r) => r.projectId === project.id)

    // --- 人: 体制 ---
    const teamRows = buildProjectTeamRows(
      project.id,
      assignments,
      members,
      monthKeys,
      currentMonth,
    )

    // --- 判定 ---
    const judgments = evaluateSummaryJudgments({
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
        masterDueDate: project.masterDueDate,
      },
      today,
      scheduleStart,
      progressRate,
      contractAmount: project.contractAmount ?? null,
      currentBac,
      actualCostTotal: profitability.actualCostTotal,
      spi,
      baseline,
      billingAllocatedTotal: billingTotals.allocatedTotal,
      teamMembers: teamRows.map((r) => ({
        id: r.memberId,
        name: r.name,
        capacityRatio: r.capacityRatio,
      })),
      assignments,
      currentMonth,
      risks: projectRisks,
      baselineStaleThreshold,
      budgetProgressGapThreshold,
      spiWarningThreshold,
    })
    const visibleJudgments = filterJudgmentsByFinancialVisibility(
      judgments,
      canViewFinancials,
    )
    const hasBasis = hasSummaryEvaluationBasis({
      progressRate,
      currentBac,
      contractAmount: project.contractAmount ?? null,
    })
    const overall: OverallBadgeKey = hasBasis
      ? deriveOverallStatus(visibleJudgments)
      : 'unknown'

    const divisionName = project.divisionId
      ? (divisions.find((d) => d.id === project.divisionId)?.name ?? null)
      : null

    return {
      today,
      currentMonth,
      monthKeys,
      scheduleStart,
      scheduleEnd,
      currentPhaseName,
      progressRate,
      currentBac,
      effectiveBac,
      baseline,
      profitability,
      costBreakdown,
      evmEligible,
      evmChartData,
      spi,
      cpi,
      billingTotals,
      orderBacklog,
      nextMilestone,
      pendingChangeRequests,
      teamRows,
      risks: sortRiskEntries(projectRisks),
      visibleJudgments,
      overall,
      divisionName,
    }
  }, [
    project,
    referenceDate,
    fiscalYear,
    startMonth,
    scheduleEntries,
    getScheduleSettings,
    getWbsSettings,
    efforts,
    progressEntries,
    budgetBreakdowns,
    workdaysPerMonth,
    estimatedUnitPrice,
    getProjectCoefficient,
    projectBaselines,
    assignments,
    members,
    divisionBudgets,
    saasContracts,
    aiUsageEntries,
    exchangeRateHistory,
    majorProjects,
    companies,
    billingMilestones,
    changeRequests,
    riskEntries,
    baselineStaleThreshold,
    budgetProgressGapThreshold,
    spiWarningThreshold,
    canViewFinancials,
    divisions,
  ])

  const costTotal = summary?.costBreakdown
    ? summary.costBreakdown.laborCost +
      summary.costBreakdown.subcontractCost +
      summary.costBreakdown.directExpense +
      summary.costBreakdown.allocatedOverhead
    : 0

  const badge = summary ? OVERALL_BADGE[summary.overall] : null

  // 見積の推移: 最初の版→最新の見積版（実績の記録は除く）。記録が無ければ行を出さない
  const estimateTrend = useMemo(() => {
    if (!project) return null
    const history = getSnapshotsForProject(estimateSnapshots, project.id)
    const first = history[0]
    const latest = [...history].reverse().find((s) => s.method !== 'actual')
    if (!first || !latest) return null
    return { first, latest }
  }, [estimateSnapshots, project])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">プロジェクトサマリー</h1>
        <Combobox
          value={selectedProjectId}
          onValueChange={setSelectedProjectId}
          options={majorProjects.map((p) => ({
            value: p.id,
            label: `${p.code} - ${p.name}（${p.confidence ?? '未設定'}）`,
          }))}
          placeholder="プロジェクトを選択"
          searchPlaceholder="コード・名称で検索"
          emptyMessage="プロジェクトがありません"
        />
        {badge && (
          <Badge className={badge.className} data-testid="summary-overall">
            {badge.label}
          </Badge>
        )}
      </div>

      {majorProjects.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            プロジェクトが登録されていません。プロジェクト画面で作成してください。
          </CardContent>
        </Card>
      )}

      {majorProjects.length > 0 && !project && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            プロジェクトを選択すると、判断に必要な情報（判定・金・モノ・人・商流）を1画面で確認できます。
          </CardContent>
        </Card>
      )}

      {project && summary && (
        <>
          {/* 基本属性 */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <span className="font-mono">{project.code}</span>
            <span>確度: {project.confidence ?? '未設定'}</span>
            <span>契約形態: {project.contractType ?? '未設定'}</span>
            <span>発注元: {project.clientName ?? '未設定'}</span>
            <span>担当部門: {summary.divisionName ?? '未設定'}</span>
            <span>マスター納期: {project.masterDueDate ?? '未設定'}</span>
            <span>現在の工程: {summary.currentPhaseName ?? '—'}</span>
          </div>

          {/* 判断エリア */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">判定理由</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.visibleJudgments.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  {summary.overall === 'unknown' ? (
                    <>
                      <HelpCircle className="h-4 w-4 shrink-0" />
                      判定材料（進捗・概算予算・受注額のいずれか）がまだありません。WBS・スケジュール・アサインを整えると判定が始まります。
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                      懸念は検出されていません
                    </>
                  )}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {summary.visibleJudgments.map((j) => (
                    <li key={j.key} className="flex items-start gap-2 text-sm">
                      <AlertTriangle
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          j.severity === 'critical'
                            ? 'text-destructive'
                            : 'text-yellow-600 dark:text-yellow-400'
                        }`}
                      />
                      <Badge variant="outline" className="shrink-0">
                        {j.category}
                      </Badge>
                      <span>{j.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* 金 */}
            {canViewFinancials && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">金（予算・損益）</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <span className="text-muted-foreground">受注額</span>
                    <span className="text-right tabular-nums">
                      {formatManYen(project.contractAmount)}
                    </span>
                    <span className="text-muted-foreground">
                      概算予算（BAC{summary.baseline ? '・凍結済み' : ''}）
                    </span>
                    <span className="text-right tabular-nums">
                      {formatManYen(
                        summary.effectiveBac > 0 ? summary.effectiveBac : null,
                      )}
                    </span>
                    <span className="text-muted-foreground">実コスト合計</span>
                    <span className="text-right tabular-nums">
                      {formatManYen(summary.profitability.actualCostTotal)}
                    </span>
                    <span className="text-muted-foreground">粗利</span>
                    <span
                      className={`text-right tabular-nums ${summary.profitability.grossProfit < 0 ? 'text-destructive' : ''}`}
                    >
                      {project.contractAmount
                        ? `${formatManYen(summary.profitability.grossProfit)}（利益率 ${
                            summary.profitability.profitMarginRate === null
                              ? '—'
                              : `${summary.profitability.profitMarginRate.toFixed(1)}%`
                          }）`
                        : '—'}
                    </span>
                    {estimateTrend && (
                      <>
                        <span className="text-muted-foreground">
                          見積の推移
                        </span>
                        <span className="text-right tabular-nums">
                          <button
                            type="button"
                            className="underline-offset-2 hover:underline"
                            onClick={() =>
                              navigate(`/estimates?projectId=${project.id}`)
                            }
                            title="見積（段階ごとの記録・不確実性コーン・振り返り）を開く"
                          >
                            {ESTIMATE_STAGE_LABELS[estimateTrend.first.stage]}{' '}
                            {formatManYen(estimateTrend.first.amount)}
                            {estimateTrend.latest.id !== estimateTrend.first.id
                              ? ` → ${ESTIMATE_STAGE_LABELS[estimateTrend.latest.stage]} ${formatManYen(estimateTrend.latest.amount)}`
                              : ''}
                            （現在の幅{' '}
                            {formatConeWidth(estimateTrend.latest.stage)}）
                          </button>
                        </span>
                      </>
                    )}
                  </div>

                  {summary.costBreakdown && costTotal > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        原価4区分（実コストの内訳）
                      </p>
                      <div className="flex h-3 w-full overflow-hidden rounded-sm">
                        {COST_SEGMENTS.map((seg) => {
                          const value = summary.costBreakdown?.[seg.key] ?? 0
                          if (value <= 0) return null
                          return (
                            <div
                              key={seg.key}
                              className={seg.className}
                              style={{
                                width: `${(value / costTotal) * 100}%`,
                              }}
                              title={`${seg.label}: ${manYenFormatter.format(value)}万円`}
                            />
                          )
                        })}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                        {COST_SEGMENTS.map((seg) => (
                          <span
                            key={seg.key}
                            className="inline-flex items-center gap-1"
                          >
                            <span
                              className={`inline-block h-2 w-2 rounded-sm ${seg.className}`}
                            />
                            {seg.label}{' '}
                            {manYenFormatter.format(
                              summary.costBreakdown?.[seg.key] ?? 0,
                            )}
                          </span>
                        ))}
                      </div>
                      {(summary.costBreakdown.allocatedOverhead > 0 ||
                        project.contractAmount) && (
                        <p className="text-xs text-muted-foreground">
                          配賦後利益:{' '}
                          {project.contractAmount
                            ? formatManYen(
                                summary.profitability.grossProfit -
                                  summary.costBreakdown.allocatedOverhead,
                              )
                            : '—'}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* モノ */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">モノ（進捗・EVM）</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="text-muted-foreground">進捗率</span>
                  <span className="text-right tabular-nums">
                    {summary.progressRate === null
                      ? '未記録'
                      : `${Math.round(summary.progressRate * 100)}%`}
                  </span>
                  <span className="text-muted-foreground">スケジュール</span>
                  <span className="text-right tabular-nums">
                    {summary.scheduleStart
                      ? `${summary.scheduleStart} 〜 ${summary.scheduleEnd}`
                      : '未設定'}
                  </span>
                  <span className="text-muted-foreground">
                    SPI / CPI（直近週）
                  </span>
                  <span className="text-right tabular-nums">
                    {summary.spi === null ? '—' : summary.spi.toFixed(2)} /{' '}
                    {summary.cpi === null ? '—' : summary.cpi.toFixed(2)}
                  </span>
                </div>
                {canViewFinancials && summary.evmEligible && (
                  <EvmLineChart data={summary.evmChartData} height={220} />
                )}
                {!summary.evmEligible && (
                  <p className="text-xs text-muted-foreground">
                    EVMチャートはスケジュールと進捗記録（完了チェックまたは週次進捗率）が揃うと表示されます。
                  </p>
                )}
              </CardContent>
            </Card>

            {/* 人 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">人（体制）</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {summary.teamRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    アサインされているメンバーがいません
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="py-1 text-left font-medium">担当者</th>
                        <th className="py-1 text-right font-medium">
                          当月配分
                        </th>
                        <th className="py-1 text-right font-medium">
                          稼働上限
                        </th>
                        <th className="py-1 text-right font-medium">
                          年度合計
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.teamRows.map((row) => (
                        <tr
                          key={row.memberId}
                          className="border-b border-border/50"
                        >
                          <td className="py-1">
                            {row.name}
                            {row.role && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                （{row.role}）
                              </span>
                            )}
                          </td>
                          <td className="py-1 text-right tabular-nums">
                            {row.currentMonthAllocation.toFixed(2)}
                          </td>
                          <td className="py-1 text-right tabular-nums">
                            {row.capacityRatio.toFixed(2)}
                          </td>
                          <td className="py-1 text-right tabular-nums">
                            {row.fiscalYearTotal.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <ProjectResourceHistogram
                  projectId={project.id}
                  assignments={assignments}
                  members={members}
                  monthKeys={summary.monthKeys}
                />
              </CardContent>
            </Card>

            {/* リスク（非公開の設計文書）。金額を含まないためマスク対象外 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  リスク
                  {summary.risks.length > 0 && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground tabular-nums">
                      {
                        summary.risks.filter((r) => r.status !== 'closed')
                          .length
                      }
                      件
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {summary.risks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    登録されたリスクはありません（プロジェクト一覧の「リスク」列から登録できます）
                  </p>
                ) : (
                  <>
                    <ul className="space-y-1.5">
                      {summary.risks.slice(0, 5).map((risk) => {
                        const severity = deriveRiskSeverity(
                          risk.probability,
                          risk.impact,
                        )
                        const ownerName = risk.ownerMemberId
                          ? (members.find((m) => m.id === risk.ownerMemberId)
                              ?.name ?? '（不明）')
                          : null
                        return (
                          <li
                            key={risk.id}
                            className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded border border-border px-2 py-1.5 text-sm"
                          >
                            <span
                              className={cn(
                                'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-bold',
                                (severity === 'critical' ||
                                  severity === 'high') &&
                                  'bg-destructive/15 text-destructive',
                                severity === 'medium' &&
                                  'bg-[#ffd43d]/25 text-amber-700 dark:text-amber-300',
                                severity === 'low' &&
                                  'bg-muted text-muted-foreground',
                              )}
                            >
                              {RISK_SEVERITY_LABELS[severity]}
                            </span>
                            <span
                              className={cn(
                                risk.status === 'closed' &&
                                  'text-muted-foreground line-through',
                              )}
                            >
                              {risk.title}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              [{RISK_STATUS_LABELS[risk.status]}]
                            </span>
                            {risk.dueDate && (
                              <span className="text-xs text-muted-foreground tabular-nums">
                                期限 {risk.dueDate}
                              </span>
                            )}
                            {ownerName && (
                              <span className="text-xs text-muted-foreground">
                                {ownerName}
                              </span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                    {summary.risks.length > 5 && (
                      <p className="text-xs text-muted-foreground">
                        ほか{summary.risks.length - 5}件
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* 商流 */}
            {canViewFinancials && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    商流（請求・変更管理）
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <span className="text-muted-foreground">
                      売上計上額（検収基準）
                    </span>
                    <span className="text-right tabular-nums">
                      {formatManYen(summary.billingTotals.recognizedTotal)}
                    </span>
                    <span className="text-muted-foreground">入金済</span>
                    <span className="text-right tabular-nums">
                      {formatManYen(summary.billingTotals.paidTotal)}
                    </span>
                    <span className="text-muted-foreground">受注残</span>
                    <span className="text-right tabular-nums">
                      {formatManYen(summary.orderBacklog)}
                    </span>
                    <span className="text-muted-foreground">次回検収予定</span>
                    <span className="text-right">
                      {summary.nextMilestone
                        ? `${summary.nextMilestone.plannedAcceptanceDate}（${summary.nextMilestone.label}）`
                        : '—'}
                    </span>
                    <span className="text-muted-foreground">
                      承認待ちの変更要求
                    </span>
                    <span className="text-right tabular-nums">
                      {summary.pendingChangeRequests}件
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    マイルストン・変更要求の操作はプロジェクト画面の「商流」から行います
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* 相互リンク */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/wbs?projectId=${project.id}`)}
            >
              <ListTree className="mr-1 h-4 w-4" />
              WBSを開く
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/schedule?projectId=${project.id}`)}
            >
              <CalendarDays className="mr-1 h-4 w-4" />
              スケジュールを開く
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/assignment?projectId=${project.id}`)}
            >
              <ClipboardList className="mr-1 h-4 w-4" />
              アサインを開く
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
