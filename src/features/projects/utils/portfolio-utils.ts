import type {
  AssignmentEntry,
  BillingMilestone,
  BudgetBreakdown,
  Division,
  EffortEntry,
  Member,
  ProjectBaseline,
  ProjectProgressEntry,
  ProjectTreeNode,
  RiskEntry,
  ScheduleEntry,
} from '@/shared/types'
import {
  calcProjectEstimateBudget,
  getFiscalYearMonthKeys,
} from '@/shared/utils/budget-utils'
import { computeProjectTotalEffort } from '@/shared/utils/effort-utils'
import {
  calcEvmSeries,
  getActiveBaseline,
  getFiscalYearWeekKeys,
  resolveProgressRateAtWeek,
  type WbsProgressSource,
} from '@/shared/utils/evm-utils'
import { formatDateOnly, getIsoWeekKey } from '@/shared/utils/iso-week-utils'
import { calcProjectProfitability } from '@/shared/utils/profitability-utils'
import { hasAnyCompletedTask } from '@/shared/utils/wbs-progress-utils'
import { calcBillingTotals } from './billing-milestone-utils'
import {
  buildProjectTeamRows,
  calcCurrentEvmIndices,
  deriveOverallStatus,
  evaluateSummaryJudgments,
  filterJudgmentsByFinancialVisibility,
  hasSummaryEvaluationBasis,
  type SummaryJudgment,
} from './project-summary-utils'

/**
 * ポートフォリオビュー（/portfolio）の行モデル構築。
 *
 * プロジェクトサマリー（単一案件の深掘り）に対して、こちらは「どの案件から見るべきか」に
 * 答える全案件横断の一覧。判定はproject-summary-utilsの決定論8ルールを**全ルート案件へ
 * そのまま適用**する（判定エンジンの二重実装をしない＝サマリーと必ず同じ結論になる）。
 *
 * すべて純関数。ストアのゲッター（有効工数列・案件別係数）は注入で受け取る
 * （applyWbsTemplateと同じ形）。「現在日時」はreferenceDateで注入する。
 */

export type PortfolioOverallStatus = 'good' | 'warning' | 'critical' | 'unknown'

export interface PortfolioRow {
  projectId: string
  code: string
  name: string
  divisionName: string | null
  /** 総合判定。判定材料（進捗・BAC・受注額）が全て無い案件は'unknown' */
  overall: PortfolioOverallStatus
  /** 金額可視性でフィルタ済みの判定（重大度順）。overallもこのフィルタ後から導出する */
  judgments: SummaryJudgment[]
  /** 現在の進捗率（0.0〜1.0）。進捗ソース（完了チェック・週次手入力）が無ければnull */
  progressRate: number | null
  /** 直近週のSPI。EVM対象外・PV=0はnull */
  spi: number | null
  masterDueDate: string | null
}

export interface BuildPortfolioRowsInput {
  /** ルート案件のツリーノード（level===0、getProjectTree()の結果） */
  rootNodes: ProjectTreeNode[]
  divisions: Pick<Division, 'id' | 'name'>[]
  scheduleEntries: ScheduleEntry[]
  efforts: EffortEntry[]
  progressEntries: ProjectProgressEntry[]
  projectBaselines: ProjectBaseline[]
  budgetBreakdowns: BudgetBreakdown[]
  billingMilestones: BillingMilestone[]
  /** リスク登録簿（R9判定用）。省略時はR9を判定しない（後方互換） */
  riskEntries?: RiskEntry[]
  assignments: AssignmentEntry[]
  members: Member[]
  /** 判定基準日（決定論のため注入） */
  referenceDate: Date
  fiscalYear: number
  fiscalYearStartMonth: number
  estimatedUnitPrice: number
  workdaysPerMonth: number
  canViewFinancials: boolean
  baselineStaleThreshold?: number
  budgetProgressGapThreshold?: number
  spiWarningThreshold?: number
  /** 案件別の有効工数列ID（wbs-settings-storeのgetSettingsを注入） */
  getEnabledColumnIds: (projectId: string) => string[]
  /** 案件別係数（budget-storeのgetProjectCoefficientを注入） */
  getCoefficient: (projectId: string) => number
}

const OVERALL_ORDER: Record<PortfolioOverallStatus, number> = {
  critical: 0,
  warning: 1,
  good: 2,
  unknown: 3,
}

export function buildPortfolioRows(
  input: BuildPortfolioRowsInput,
): PortfolioRow[] {
  const {
    rootNodes,
    divisions,
    scheduleEntries,
    efforts,
    progressEntries,
    projectBaselines,
    budgetBreakdowns,
    billingMilestones,
    riskEntries = [],
    assignments,
    members,
    referenceDate,
    fiscalYear,
    fiscalYearStartMonth,
    estimatedUnitPrice,
    workdaysPerMonth,
    canViewFinancials,
    baselineStaleThreshold,
    budgetProgressGapThreshold,
    spiWarningThreshold,
    getEnabledColumnIds,
    getCoefficient,
  } = input

  const today = formatDateOnly(referenceDate)
  const currentMonth = today.slice(0, 7)
  const currentWeekKey = getIsoWeekKey(referenceDate)
  const monthKeys = getFiscalYearMonthKeys(fiscalYear, fiscalYearStartMonth)
  const weekKeys = getFiscalYearWeekKeys(fiscalYear, fiscalYearStartMonth)
  const divisionNameById = new Map(divisions.map((d) => [d.id, d.name]))

  const rows: PortfolioRow[] = []
  for (const project of rootNodes) {
    // 完了済みは対象外（週次に見るのは進行中・未着手の案件。完了案件の振り返りは
    // プロジェクトサマリー・レポート側の責務）
    if (project.status === 'completed') continue

    // --- 入力の組み立て（ProjectSummaryPageのsummary useMemoと同じ解決順） ---
    const projectSchedule = scheduleEntries.filter(
      (e) => e.projectId === project.id,
    )
    const scheduleStart = projectSchedule.reduce<string | null>(
      (min, e) => (min === null || e.startDate < min ? e.startDate : min),
      null,
    )

    const columnIds = getEnabledColumnIds(project.id)
    const wbsSource: WbsProgressSource = { node: project, columnIds, efforts }
    const progressEntry = progressEntries.find(
      (e) => e.projectId === project.id,
    )
    const weeklyProgress = progressEntry?.weeklyProgress ?? {}
    const hasEvSource =
      progressEntry !== undefined || hasAnyCompletedTask(project)
    const progressRate = hasEvSource
      ? resolveProgressRateAtWeek(currentWeekKey, weeklyProgress, wbsSource)
      : null

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
            getCoefficient(project.id),
          )
        : budgetFrame
    const baseline = getActiveBaseline(projectBaselines, project.id)

    const profitability = calcProjectProfitability(
      project,
      assignments,
      members,
      budgetBreakdowns,
      referenceDate,
    )

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
    const { spi } = calcCurrentEvmIndices(evmSeries, currentWeekKey)

    const projectMilestones = billingMilestones.filter(
      (m) => m.projectId === project.id,
    )
    const billingTotals = calcBillingTotals(projectMilestones)

    const projectRisks = riskEntries.filter((r) => r.projectId === project.id)

    const teamRows = buildProjectTeamRows(
      project.id,
      assignments,
      members,
      monthKeys,
      currentMonth,
    )

    // --- 判定（サマリーと同一関数・同一フィルタ） ---
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
    const overall: PortfolioOverallStatus = hasBasis
      ? deriveOverallStatus(visibleJudgments)
      : 'unknown'

    rows.push({
      projectId: project.id,
      code: project.code,
      name: project.name,
      divisionName: project.divisionId
        ? (divisionNameById.get(project.divisionId) ?? null)
        : null,
      overall,
      judgments: visibleJudgments,
      progressRate,
      spi,
      masterDueDate: project.masterDueDate ?? null,
    })
  }

  // 悪い順の固定ソート（critical→warning→good→判定不能）。
  // 同順位は指摘件数の多い順→コード昇順（決定論・入力順に依存しない）
  return rows.sort((a, b) => {
    const byOverall = OVERALL_ORDER[a.overall] - OVERALL_ORDER[b.overall]
    if (byOverall !== 0) return byOverall
    const byCount = b.judgments.length - a.judgments.length
    if (byCount !== 0) return byCount
    return a.code.localeCompare(b.code)
  })
}
