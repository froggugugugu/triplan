import { useCallback, useEffect, useMemo, useState } from 'react'
import { EvmPanel } from '@/shared/components/EvmPanel'
import { GettingStartedCard } from '@/shared/components/GettingStartedCard'
import { SetupWizardDialog } from '@/shared/components/SetupWizardDialog'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { Combobox } from '@/shared/components/ui/combobox'
import { useCanViewFinancials } from '@/shared/hooks/use-financial-visibility'
import {
  type AppAlert,
  collectBaselineStaleAlerts,
  collectBillingAcceptanceAlerts,
  collectBudgetOverrunAlerts,
  collectCapacityAlerts,
  collectDueDateAlerts,
  collectRiskDueDateAlerts,
  collectSaasRenewalAlerts,
  collectUpcomingDueDateAlerts,
} from '@/shared/utils/alert-utils'
import {
  calcProjectEstimateBudget,
  getFiscalYearMonthKeys,
} from '@/shared/utils/budget-utils'
import { computeProjectTotalEffort } from '@/shared/utils/effort-utils'
import { resolveProgressRateAtWeek } from '@/shared/utils/evm-utils'
import { formatDateOnly, getIsoWeekKey } from '@/shared/utils/iso-week-utils'
import { filterMembersByOrganization } from '@/shared/utils/member-filter'
import { calcProjectProfitability } from '@/shared/utils/profitability-utils'
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
  useSkillStore,
  useTeamStore,
  useTechTagsStore,
  useWbsSettingsStore,
} from '@/stores'
import { AlertCenter } from '../components/AlertCenter'
import { BudgetComparisonChart } from '../components/BudgetComparisonChart'
import { MemberAssignmentChart } from '../components/MemberAssignmentChart'
import { ProjectAssignmentChart } from '../components/ProjectAssignmentChart'
import { ResourceDemandSupplyChart } from '../components/ResourceDemandSupplyChart'
import { SkillDistributionChart } from '../components/SkillDistributionChart'
import { UtilizationRateChart } from '../components/UtilizationRateChart'
import { getStaleSkillReviewCount } from '../utils/dashboard-utils'

export function DashboardPage() {
  const canViewFinancials = useCanViewFinancials()
  const globalFiscalYear = useAppStore((s) => s.fiscalYear)
  const fiscalYearStartMonth = useAppStore((s) => s.fiscalYearStartMonth)
  const projects = useProjectsStore((s) => s.projects)
  const loadProjects = useProjectsStore((s) => s.loadProjects)
  const members = useMembersStore((s) => s.members)
  const loadMembers = useMembersStore((s) => s.loadMembers)
  const assignments = useAssignmentStore((s) => s.assignments)
  const loadAssignments = useAssignmentStore((s) => s.loadAssignments)
  const divisions = useTeamStore((s) => s.divisions)
  const sections = useTeamStore((s) => s.sections)
  const loadTeam = useTeamStore((s) => s.loadTeam)
  const techTags = useTechTagsStore((s) => s.techTags)
  const techTagCategories = useTechTagsStore((s) => s.techTagCategories)
  const loadTechTags = useTechTagsStore((s) => s.loadTechTags)
  const skillEvaluations = useSkillStore((s) => s.skillEvaluations)
  const loadSkillData = useSkillStore((s) => s.loadSkillData)
  const loadBudgetData = useBudgetStore((s) => s.loadBudgetData)
  const loadEfforts = useEffortsStore((s) => s.loadEfforts)
  // ── アラートセンター用の追加データソース（PROPOSAL §4.5） ──
  const efforts = useEffortsStore((s) => s.efforts)
  const getProjectTree = useProjectsStore((s) => s.getProjectTree)
  const scheduleEntries = useScheduleStore((s) => s.entries)
  const loadSchedule = useScheduleStore((s) => s.loadSchedule)
  const progressEntries = useProjectProgressStore(
    (s) => s.projectProgressEntries,
  )
  const loadProjectProgress = useProjectProgressStore(
    (s) => s.loadProjectProgress,
  )
  const projectBaselines = useProjectBaselineStore((s) => s.projectBaselines)
  const loadProjectBaselines = useProjectBaselineStore(
    (s) => s.loadProjectBaselines,
  )
  const wbsSettingsEntries = useWbsSettingsStore((s) => s.entries)
  const getWbsSettings = useWbsSettingsStore((s) => s.getSettings)
  const loadWbsSettings = useWbsSettingsStore((s) => s.loadWbsSettings)
  const saasContracts = useBudgetStore((s) => s.saasContracts)
  const budgetBreakdowns = useBudgetStore((s) => s.budgetBreakdowns)
  const estimatedUnitPrice = useBudgetStore((s) => s.estimatedUnitPrice)
  const workdaysPerMonth = useBudgetStore((s) => s.workdaysPerMonth)
  const skillReviewCycleMonths = useBudgetStore((s) => s.skillReviewCycleMonths)
  const baselineStaleThreshold = useBudgetStore((s) => s.baselineStaleThreshold)
  const getProjectCoefficient = useBudgetStore((s) => s.getProjectCoefficient)
  useBudgetStore((s) => s.projectCoefficients)
  useBudgetStore((s) => s.defaultCoefficient)
  const billingMilestones = useBillingMilestoneStore((s) => s.billingMilestones)
  const loadBillingMilestones = useBillingMilestoneStore(
    (s) => s.loadBillingMilestones,
  )
  const riskEntries = useRiskStore((s) => s.riskEntries)
  const loadRiskEntries = useRiskStore((s) => s.loadRiskEntries)

  const [selectedFiscalYear, setSelectedFiscalYear] = useState(globalFiscalYear)
  const [selectedDivisionId, setSelectedDivisionId] = useState('')
  const [selectedSectionId, setSelectedSectionId] = useState('')
  // EVMパネル専用の部門セレクタ（FR-002、要確認-2 A案）。
  // 上記のメンバー別アサインフィルタ用selectedDivisionId（''=全て・'__unaffiliated__'=未所属という
  // 別の意味を持つ）とは独立させる。EvmPanelは具体的な部門IDを必須とするため、これらのセンチネル値と
  // 混在させると意味が衝突する
  const [evmDivisionId, setEvmDivisionId] = useState('')

  useEffect(() => {
    loadProjects()
    loadMembers()
    loadAssignments()
    loadTeam()
    loadTechTags()
    loadSkillData()
    loadBudgetData()
    loadEfforts()
    loadSchedule()
    loadProjectProgress()
    loadProjectBaselines()
    loadWbsSettings()
    loadBillingMilestones()
    loadRiskEntries()
  }, [
    loadProjects,
    loadMembers,
    loadAssignments,
    loadTeam,
    loadTechTags,
    loadSkillData,
    loadBudgetData,
    loadEfforts,
    loadSchedule,
    loadProjectProgress,
    loadProjectBaselines,
    loadWbsSettings,
    loadBillingMilestones,
    loadRiskEntries,
  ])

  const handleDivisionChange = useCallback((divisionId: string) => {
    setSelectedDivisionId(divisionId)
    setSelectedSectionId('')
  }, [])

  const sortedDivisions = useMemo(
    () => [...divisions].sort((a, b) => a.sortOrder - b.sortOrder),
    [divisions],
  )

  // EVMパネル用部門セレクタ: 部門が読み込まれたら先頭を自動選択する（BudgetPage.tsxと同一パターン）
  useEffect(() => {
    if (!evmDivisionId && sortedDivisions.length > 0) {
      setEvmDivisionId(sortedDivisions[0]?.id ?? '')
    }
  }, [evmDivisionId, sortedDivisions])

  const availableSections = useMemo(
    () =>
      selectedDivisionId && selectedDivisionId !== '__unaffiliated__'
        ? [...sections]
            .filter((s) => s.divisionId === selectedDivisionId)
            .sort((a, b) => a.sortOrder - b.sortOrder)
        : [],
    [sections, selectedDivisionId],
  )

  const filteredMembers = useMemo(
    () =>
      filterMembersByOrganization(
        members,
        sections,
        selectedDivisionId,
        selectedSectionId,
      ),
    [members, sections, selectedDivisionId, selectedSectionId],
  )

  // 要員需給グラフの表示対象月（選択年度の12ヶ月）
  const resourceMonthKeys = useMemo(
    () => getFiscalYearMonthKeys(selectedFiscalYear, fiscalYearStartMonth),
    [selectedFiscalYear, fiscalYearStartMonth],
  )

  // 四半期レビュー未実施件数（部門・課フィルタ連動、requirements-skill-growth.md設計判断④）
  const staleSkillReviewCount = useMemo(
    () =>
      getStaleSkillReviewCount(
        filteredMembers,
        skillEvaluations,
        new Date(),
        skillReviewCycleMonths,
      ),
    [filteredMembers, skillEvaluations, skillReviewCycleMonths],
  )

  // ── アラートセンター（PROPOSAL §4.5）: 散在する警告判定を集約し重大度順に提示 ──
  // biome-ignore lint/correctness/useExhaustiveDependencies: getProjectTree/getWbsSettings/getProjectCoefficientは内部でストア状態を参照するため、参照元の状態（projects/wbsSettingsEntries等）を依存に含めて再計算をトリガーする
  const alerts = useMemo(() => {
    const tree = getProjectTree()
    const treeById = new Map(tree.map((node) => [node.id, node]))
    const roots = projects.filter((p) => p.level === 0)
    const now = new Date()
    const today = formatDateOnly(now)
    const currentWeek = getIsoWeekKey(now)

    const enabledColumnIds = (projectId: string) =>
      getWbsSettings(projectId)
        .effortColumns.filter((c) => c.enabled)
        .map((c) => c.id)

    const dueDateInputs = roots.map((project) => {
      const node = treeById.get(project.id)
      const columnIds = enabledColumnIds(project.id)
      // 進捗率はEVと同じ解決順（週次手入力優先→WBS完了チェックの工数加重）で求める
      const weeklyProgress =
        progressEntries.find((e) => e.projectId === project.id)
          ?.weeklyProgress ?? {}
      const progressRate = resolveProgressRateAtWeek(
        currentWeek,
        weeklyProgress,
        node ? { node, columnIds, efforts } : null,
      )
      const projectSchedule = scheduleEntries.filter(
        (e) => e.projectId === project.id,
      )
      const scheduleStart = projectSchedule.reduce<string | null>(
        (min, e) => (min === null || e.startDate < min ? e.startDate : min),
        null,
      )
      return {
        id: project.id,
        name: project.name,
        masterDueDate: project.masterDueDate,
        status: project.status,
        scheduleStart,
        progressRate,
      }
    })

    const baselineInputs = roots.map((project) => {
      const node = treeById.get(project.id)
      const columnIds = enabledColumnIds(project.id)
      const totalEffortDays = node
        ? (computeProjectTotalEffort([node], columnIds, efforts).get(
            project.id,
          ) ?? 0)
        : 0
      return {
        projectId: project.id,
        name: project.name,
        currentBac: calcProjectEstimateBudget(
          totalEffortDays / workdaysPerMonth,
          estimatedUnitPrice,
          getProjectCoefficient(project.id),
        ),
      }
    })

    const overrunInputs = roots
      .filter((p) => (p.contractAmount ?? 0) > 0)
      .map((project) => {
        const profitability = calcProjectProfitability(
          project,
          assignments,
          members,
          budgetBreakdowns,
          now,
        )
        return {
          projectId: project.id,
          name: project.name,
          contractAmount: profitability.contractAmount,
          actualCostTotal: profitability.actualCostTotal,
        }
      })

    // 検収予定日の接近・経過（事前リマインド）。削除済み案件への参照（弱参照）は
    // 案件名を解決できないためスキップする
    const rootNameById = new Map(roots.map((p) => [p.id, p.name]))
    const billingAcceptanceInputs = billingMilestones.flatMap((m) => {
      const projectName = rootNameById.get(m.projectId)
      if (!projectName) return []
      return [
        {
          id: m.id,
          label: m.label,
          projectName,
          plannedAcceptanceDate: m.plannedAcceptanceDate,
          status: m.status,
        },
      ]
    })

    // リスクの対応期限（非公開の設計文書）。案件を解決できない参照（弱参照）はスキップ
    const riskAlertInputs = riskEntries.flatMap((r) => {
      const projectName = rootNameById.get(r.projectId)
      if (!projectName) return []
      return [
        {
          id: r.id,
          title: r.title,
          projectName,
          status: r.status,
          dueDate: r.dueDate ?? null,
        },
      ]
    })

    // 予算超過アラートは金額情報（受注額・実コスト）を含むため、
    // 金額の可視性がない場合は集約対象から除外する
    const collected: AppAlert[] = [
      ...collectDueDateAlerts(dueDateInputs, today),
      ...(canViewFinancials ? collectBudgetOverrunAlerts(overrunInputs) : []),
      ...collectCapacityAlerts(members, assignments, resourceMonthKeys),
      ...collectBaselineStaleAlerts(
        baselineInputs,
        projectBaselines,
        baselineStaleThreshold,
      ),
      ...collectSaasRenewalAlerts(saasContracts, now),
      ...collectUpcomingDueDateAlerts(dueDateInputs, today),
      // 検収予定日アラートは金額こそ文面に含めないが、請求マイルストン自体が
      // 金額系エンティティ（サーバー側GETがfinancials:read必須）のため予算超過と同じ扱い
      ...(canViewFinancials
        ? collectBillingAcceptanceAlerts(billingAcceptanceInputs, today)
        : []),
      ...collectRiskDueDateAlerts(riskAlertInputs, today),
    ]
    if (staleSkillReviewCount > 0) {
      collected.push({
        key: 'skill-review-stale',
        severity: 'info',
        category: 'スキル',
        message: `定期スキルレビュー（3ヶ月周期）が未実施のメンバーが${staleSkillReviewCount}名います`,
      })
    }
    return collected
  }, [
    projects,
    getProjectTree,
    getWbsSettings,
    wbsSettingsEntries,
    efforts,
    progressEntries,
    scheduleEntries,
    assignments,
    members,
    budgetBreakdowns,
    projectBaselines,
    saasContracts,
    billingMilestones,
    riskEntries,
    estimatedUnitPrice,
    workdaysPerMonth,
    baselineStaleThreshold,
    getProjectCoefficient,
    resourceMonthKeys,
    staleSkillReviewCount,
    canViewFinancials,
  ])

  // Fiscal year options: current year +/- 2 years
  const fiscalYearOptions = useMemo(() => {
    const years: number[] = []
    for (let y = globalFiscalYear - 2; y <= globalFiscalYear + 2; y++) {
      years.push(y)
    }
    return years
  }, [globalFiscalYear])

  return (
    <div className="space-y-4">
      {/* Header with fiscal year selector */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <div data-tour="dashboard-fiscal-year">
          <Combobox
            value={String(selectedFiscalYear)}
            onValueChange={(v) => setSelectedFiscalYear(Number(v))}
            options={fiscalYearOptions.map((year) => ({
              value: String(year),
              label: `${year}年度`,
            }))}
            searchPlaceholder="年度を検索..."
            className="w-[160px]"
          />
        </div>
      </div>

      {/* 初期設定ウィザード: 空データ・デモ試用中のみカード表示 */}
      <GettingStartedCard />
      <SetupWizardDialog />

      {/* アラートセンター（PROPOSAL §4.5）: 「まず開く画面」として最上部に置く */}
      <AlertCenter alerts={alerts} />

      {/* 横2分割グループ（FR-001、要確認-1）:
          ProjectAssignmentChart（月軸固定）とBudgetComparisonChart（部門軸、比較的少数固定）は
          横並び表示が窮屈にならないため2分割の対象とする。lg未満では縦積みに戻る */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Project Assignment Chart */}
        <Card data-tour="dashboard-project-chart">
          <CardHeader>
            <CardTitle>プロジェクト別アサイン</CardTitle>
          </CardHeader>
          <CardContent>
            <ProjectAssignmentChart
              assignments={assignments}
              projects={projects}
              fiscalYear={selectedFiscalYear}
              fiscalYearStartMonth={fiscalYearStartMonth}
            />
          </CardContent>
        </Card>

        {/* Budget Comparison Chart（金額情報。可視性がない場合は非表示） */}
        {canViewFinancials && (
          <Card data-tour="dashboard-budget-chart">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                売上予算 vs 見込売上
                <span className="text-xs font-normal text-muted-foreground">
                  （部門別）
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-sm bg-[#3b82f6]" />
                  売上予算
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-sm bg-[#22c55e]" />
                  見込売上
                </span>
              </div>
              <BudgetComparisonChart
                divisions={divisions}
                sections={sections}
                members={members}
                assignments={assignments}
                fiscalYear={selectedFiscalYear}
                fiscalYearStartMonth={fiscalYearStartMonth}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Member Assignment Chart */}
      <Card data-tour="dashboard-member-chart">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>メンバー別アサイン</CardTitle>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">部門:</span>
              <select
                aria-label="絞り込む部門"
                value={selectedDivisionId}
                onChange={(e) => handleDivisionChange(e.target.value)}
                className="h-7 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">全て</option>
                {sortedDivisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
                <option value="__unaffiliated__">未所属</option>
              </select>
              {availableSections.length > 0 && (
                <>
                  <span className="text-xs text-muted-foreground">課:</span>
                  <select
                    aria-label="絞り込む課"
                    value={selectedSectionId}
                    onChange={(e) => setSelectedSectionId(e.target.value)}
                    className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="">全て</option>
                    {availableSections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <MemberAssignmentChart
            members={filteredMembers}
            assignments={assignments}
            fiscalYear={selectedFiscalYear}
            fiscalYearStartMonth={fiscalYearStartMonth}
          />
        </CardContent>
      </Card>

      {/* Utilization Rate Chart */}
      <Card data-tour="dashboard-utilization-chart">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            アサイン充足率
            <span className="text-xs font-normal text-muted-foreground">
              （年間平均、部門・課フィルタ連動）
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm bg-[#3b82f6]" />
              〜50%
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm bg-[#eab308]" />
              50〜89%
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm bg-[#22c55e]" />
              90〜100%
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm bg-[#ef4444]" />
              100%超
            </span>
          </div>
          <UtilizationRateChart
            members={filteredMembers}
            assignments={assignments}
            fiscalYear={selectedFiscalYear}
            fiscalYearStartMonth={fiscalYearStartMonth}
          />
        </CardContent>
      </Card>

      {/* 要員需要 vs 供給キャパシティ（非公開の設計文書） */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            要員の需要と供給
            <span className="text-xs font-normal text-muted-foreground">
              月次アサイン合計と、在籍メンバーの稼働率上限合計の対比
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResourceDemandSupplyChart
            members={filteredMembers}
            assignments={assignments}
            monthKeys={resourceMonthKeys}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            棒（需要）が線（供給）を超えている月は要員が不足しています。採用・調達や、案件の時期調整の判断材料になります
          </p>
        </CardContent>
      </Card>

      {/* Skill Distribution Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              スキルマップ概況
              <span className="text-xs font-normal text-muted-foreground">
                （カテゴリ×レベル別人数、部門・課フィルタ連動）
              </span>
            </CardTitle>
            <span
              className={
                staleSkillReviewCount > 0
                  ? 'rounded-full bg-budget-actual/10 px-2 py-1 text-xs font-medium text-destructive'
                  : 'rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground'
              }
            >
              四半期レビュー未実施: {staleSkillReviewCount}件
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <SkillDistributionChart
            members={filteredMembers}
            techTags={techTags}
            techTagCategories={techTagCategories}
            skillEvaluations={skillEvaluations}
          />
        </CardContent>
      </Card>

      {/* EVM Panel（FR-002。既存EvmPanelを流用し、専用の部門セレクタで対象部門を選択する）
          PV/EV/AC・BACは金額情報のため、可視性がない場合はパネルごと非表示 */}
      {canViewFinancials && (
        <Card data-tour="dashboard-evm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>EVM（計画・出来高・実コスト）</CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">部門:</span>
                <select
                  aria-label="EVMを表示する部門"
                  value={evmDivisionId}
                  onChange={(e) => setEvmDivisionId(e.target.value)}
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                >
                  {sortedDivisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {evmDivisionId ? (
              <EvmPanel
                divisionId={evmDivisionId}
                fiscalYear={selectedFiscalYear}
                startMonth={fiscalYearStartMonth}
                readOnly
              />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                部門が登録されていません。
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
