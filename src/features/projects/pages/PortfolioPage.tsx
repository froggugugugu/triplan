import { ArrowRight, LayoutGrid } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table'
import { useCanViewFinancials } from '@/shared/hooks/use-financial-visibility'
import {
  useAppStore,
  useAssignmentStore,
  useBillingMilestoneStore,
  useBudgetStore,
  useEffortsStore,
  useMembersStore,
  useProjectBaselineStore,
  useProjectProgressStore,
  useProjectsStore,
  useRiskStore,
  useScheduleStore,
  useTeamStore,
  useWbsSettingsStore,
} from '@/stores'
import {
  buildPortfolioRows,
  type PortfolioOverallStatus,
} from '../utils/portfolio-utils'

/** 総合判定バッジ（ProjectSummaryPageのOVERALL_BADGEと同じ表記・配色を用いる） */
const OVERALL_BADGE: Record<
  PortfolioOverallStatus,
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

/**
 * ポートフォリオ（/portfolio）。
 *
 * 「どのプロジェクトから見るべきか」に答える全プロジェクト横断の読み取り専用一覧。
 * プロジェクトサマリーの決定論8ルール（project-summary-utils）を全ルート案件へ適用し、
 * 総合判定の悪い順に並べる。行の「開く」で各プロジェクトのサマリーへ移動する。
 *
 * 完了済み（status==='completed'）のプロジェクトは表示しない（週次に見るのは
 * 進行中・未着手の案件。完了案件の振り返りはサマリー・レポート側の責務）。
 * 金額の表示制御は判定単位（金額系判定のみ除外＝サマリーと同じセクション単位の思想）。
 */
export function PortfolioPage() {
  const canViewFinancials = useCanViewFinancials()
  const fiscalYear = useAppStore((s) => s.fiscalYear)
  const startMonth = useAppStore((s) => s.fiscalYearStartMonth)

  const projects = useProjectsStore((s) => s.projects)
  const getProjectTree = useProjectsStore((s) => s.getProjectTree)
  const loadProjects = useProjectsStore((s) => s.loadProjects)
  const scheduleEntries = useScheduleStore((s) => s.entries)
  const loadSchedule = useScheduleStore((s) => s.loadSchedule)
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
  const riskEntries = useRiskStore((s) => s.riskEntries)
  const loadRiskEntries = useRiskStore((s) => s.loadRiskEntries)
  const loadBudgetData = useBudgetStore((s) => s.loadBudgetData)
  const estimatedUnitPrice = useBudgetStore((s) => s.estimatedUnitPrice)
  const workdaysPerMonth = useBudgetStore((s) => s.workdaysPerMonth)
  const getProjectCoefficient = useBudgetStore((s) => s.getProjectCoefficient)
  useBudgetStore((s) => s.projectCoefficients)
  useBudgetStore((s) => s.defaultCoefficient)
  const budgetBreakdowns = useBudgetStore((s) => s.budgetBreakdowns)
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
    loadEfforts()
    loadWbsSettings()
    loadAssignments()
    loadMembers()
    loadTeam()
    loadProjectBaselines()
    loadProjectProgress()
    loadBillingMilestones()
    loadRiskEntries()
    loadBudgetData()
  }, [
    loadProjects,
    loadSchedule,
    loadEfforts,
    loadWbsSettings,
    loadAssignments,
    loadMembers,
    loadTeam,
    loadProjectBaselines,
    loadProjectProgress,
    loadBillingMilestones,
    loadRiskEntries,
    loadBudgetData,
  ])

  // 判定基準日はマウント時に一度だけ確定する（レンダーごとに揺れない決定論）
  const [referenceDate] = useState(() => new Date())

  // biome-ignore lint/correctness/useExhaustiveDependencies: getProjectTree/getWbsSettings/getProjectCoefficientは内部でストア状態を参照するため、参照元の状態（projects等）を依存に含めて再計算をトリガーする
  const rows = useMemo(() => {
    void projects
    return buildPortfolioRows({
      rootNodes: getProjectTree(),
      divisions,
      scheduleEntries,
      efforts,
      progressEntries,
      projectBaselines,
      budgetBreakdowns,
      billingMilestones,
      riskEntries,
      assignments,
      members,
      referenceDate,
      fiscalYear,
      fiscalYearStartMonth: startMonth,
      estimatedUnitPrice,
      workdaysPerMonth,
      canViewFinancials,
      baselineStaleThreshold,
      budgetProgressGapThreshold,
      spiWarningThreshold,
      getEnabledColumnIds: (projectId) =>
        getWbsSettings(projectId)
          .effortColumns.filter((c) => c.enabled)
          .map((c) => c.id),
      getCoefficient: getProjectCoefficient,
    })
  }, [
    projects,
    getProjectTree,
    divisions,
    scheduleEntries,
    efforts,
    progressEntries,
    projectBaselines,
    budgetBreakdowns,
    billingMilestones,
    riskEntries,
    assignments,
    members,
    referenceDate,
    fiscalYear,
    startMonth,
    estimatedUnitPrice,
    workdaysPerMonth,
    canViewFinancials,
    baselineStaleThreshold,
    budgetProgressGapThreshold,
    spiWarningThreshold,
    getWbsSettings,
    getProjectCoefficient,
  ])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <LayoutGrid className="h-6 w-6" aria-hidden="true" />
          ポートフォリオ
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          進行中・未着手の全プロジェクトを健全性の悪い順に一覧します（完了済みは表示されません）。
          判定はプロジェクトサマリーと同じ決定論ルールです。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            プロジェクト健全性一覧
            {rows.length > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground tabular-nums">
                {rows.length}件
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              対象のプロジェクトがありません。プロジェクト管理でトップレベルのプロジェクトを登録すると表示されます。
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">総合</TableHead>
                    <TableHead>プロジェクト</TableHead>
                    <TableHead>部門</TableHead>
                    <TableHead className="text-right">進捗率</TableHead>
                    <TableHead className="text-right">SPI</TableHead>
                    <TableHead>マスター納期</TableHead>
                    <TableHead>検出された問題</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const badge = OVERALL_BADGE[row.overall]
                    return (
                      <TableRow key={row.projectId}>
                        <TableCell>
                          <span
                            className={cn(
                              'inline-flex items-center rounded border px-2 py-0.5 text-xs font-bold',
                              badge.className,
                            )}
                          >
                            {badge.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{row.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.code}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.divisionName ?? '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {row.progressRate !== null
                            ? `${Math.round(row.progressRate * 100)}%`
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {row.spi !== null ? row.spi.toFixed(2) : '—'}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {row.masterDueDate ?? '—'}
                        </TableCell>
                        <TableCell>
                          {row.judgments.length === 0 ? (
                            <span className="text-sm text-muted-foreground">
                              —
                            </span>
                          ) : (
                            <ul className="space-y-0.5">
                              {row.judgments.map((j) => (
                                <li
                                  key={j.key}
                                  className={cn(
                                    'text-xs leading-5',
                                    j.severity === 'critical'
                                      ? 'text-destructive font-medium'
                                      : 'text-yellow-600 dark:text-yellow-400',
                                  )}
                                >
                                  [{j.category}] {j.message}
                                </li>
                              ))}
                            </ul>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" asChild>
                            <Link
                              to={`/project-summary?projectId=${row.projectId}`}
                            >
                              開く
                              <ArrowRight
                                className="ml-1 h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
