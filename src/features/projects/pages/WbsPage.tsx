import {
  Download,
  FileUp,
  LayoutTemplate,
  Rocket,
  Settings,
  TrendingUp,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { ExternalTool } from '@/shared/api/external-tools-api'
import {
  executeTaskCreation,
  listExternalToolConnections,
} from '@/shared/api/external-tools-api'
import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { Combobox } from '@/shared/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Label } from '@/shared/components/ui/label'
import { useToast } from '@/shared/hooks/use-toast'
import type {
  Project,
  ProjectLevel,
  ProjectTreeNode,
  WbsTemplate,
} from '@/shared/types'
import {
  calcProjectEstimateBudget,
  getFiscalYearMonthKeys,
} from '@/shared/utils/budget-utils'
import { computeProjectTotalEffort } from '@/shared/utils/effort-utils'
import {
  buildBaselineSnapshot,
  getActiveBaseline,
  getFiscalYearWeekKeys,
  isBaselineStale,
} from '@/shared/utils/evm-utils'
import { getIsoWeekKey, getIsoWeekMonday } from '@/shared/utils/iso-week-utils'
import { resolveInitialProjectId } from '@/shared/utils/navigation-utils'
import { buildTaskAssigneeMap } from '@/shared/utils/task-assignee-utils'
import {
  useAppStore,
  useAssignmentStore,
  useBudgetStore,
  useEffortsStore,
  useMembersStore,
  useProjectBaselineStore,
  useProjectProgressStore,
  useProjectsStore,
  useScheduleStore,
  useTaskSyncStore,
  useWbsSettingsStore,
  useWbsTemplateStore,
} from '@/stores'
import { BaselineFreezeDialog } from '../components/BaselineFreezeDialog'
import { ProjectDialog } from '../components/ProjectDialog'
import { ProjectEvmDialog } from '../components/ProjectEvmDialog'
import { ProjectTreeGrid } from '../components/ProjectTreeGrid'
import { TaskCreationDialog } from '../components/TaskCreationDialog'
import { TaskSyncExportDialog } from '../components/TaskSyncExportDialog'
import { TaskSyncImportDialog } from '../components/TaskSyncImportDialog'
import { WbsTemplateDialog } from '../components/WbsTemplateDialog'
import { resolveToolBaseUrls } from '../utils/external-task-url'
import type { TaskSyncPlan, TaskSyncTool } from '../utils/task-sync-utils'
import { calcWbsProgressWeighted } from '../utils/wbs-progress-utils'
import { applyWbsTemplate } from '../utils/wbs-template'

function formatWeekOptionLabel(weekKey: string): string {
  const monday = getIsoWeekMonday(weekKey)
  return `${weekKey}（${monday.getMonth() + 1}/${monday.getDate()}〜）`
}

export function WbsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { toast } = useToast()
  const loadProjects = useProjectsStore((state) => state.loadProjects)
  const getProjectTree = useProjectsStore((state) => state.getProjectTree)
  const deleteProject = useProjectsStore((state) => state.deleteProject)
  const addProject = useProjectsStore((state) => state.addProject)
  const updateProjectsBatch = useProjectsStore(
    (state) => state.updateProjectsBatch,
  )
  const taskSyncLogs = useTaskSyncStore((s) => s.taskSyncLogs)
  const loadTaskSyncLogs = useTaskSyncStore((s) => s.loadTaskSyncLogs)
  const addTaskSyncLog = useTaskSyncStore((s) => s.addTaskSyncLog)
  const projects = useProjectsStore((state) => state.projects)

  const fiscalYear = useAppStore((s) => s.fiscalYear)
  const fiscalYearStartMonth = useAppStore((s) => s.fiscalYearStartMonth)
  const scheduleEntries = useScheduleStore((s) => s.entries)
  const loadSchedule = useScheduleStore((s) => s.loadSchedule)
  const setWeeklyProgress = useProjectProgressStore((s) => s.setWeeklyProgress)
  const progressEntries = useProjectProgressStore(
    (s) => s.projectProgressEntries,
  )
  const loadProjectProgress = useProjectProgressStore(
    (s) => s.loadProjectProgress,
  )

  // EVMグラフダイアログ表示用のデータ（ProjectEvmDialogへ渡す、と同じ組み立て）
  const efforts = useEffortsStore((s) => s.efforts)
  const loadEfforts = useEffortsStore((s) => s.loadEfforts)
  const wbsSettingsEntries = useWbsSettingsStore((s) => s.entries)
  // ProjectEvmDialogは旧settingsMap（Record<projectId, WbsSettings>）形式のpropを
  // 引き続き期待するため、entries配列からここで変換する
  const settingsMap = useMemo(
    () =>
      Object.fromEntries(
        wbsSettingsEntries.map((e) => [
          e.projectId,
          {
            effortColumns: e.effortColumns,
            levelColors: e.levelColors,
            lastModified: e.lastModified,
          },
        ]),
      ),
    [wbsSettingsEntries],
  )
  const getWbsSettings = useWbsSettingsStore((s) => s.getSettings)
  const projectBaselines = useProjectBaselineStore((s) => s.projectBaselines)
  const loadProjectBaselines = useProjectBaselineStore(
    (s) => s.loadProjectBaselines,
  )
  const freezeBaseline = useProjectBaselineStore((s) => s.freezeBaseline)
  const revokeLatestBaseline = useProjectBaselineStore(
    (s) => s.revokeLatestBaseline,
  )
  const assignments = useAssignmentStore((s) => s.assignments)
  const loadAssignments = useAssignmentStore((s) => s.loadAssignments)
  const members = useMembersStore((s) => s.members)
  const loadMembers = useMembersStore((s) => s.loadMembers)
  const estimatedUnitPrice = useBudgetStore((s) => s.estimatedUnitPrice)
  const workdaysPerMonth = useBudgetStore((s) => s.workdaysPerMonth)
  const baselineStaleThreshold = useBudgetStore((s) => s.baselineStaleThreshold)
  const getProjectCoefficient = useBudgetStore((s) => s.getProjectCoefficient)
  const loadBudgetData = useBudgetStore((s) => s.loadBudgetData)

  const loadWbsTemplates = useWbsTemplateStore((s) => s.loadWbsTemplates)
  const seedStandardTemplate = useWbsTemplateStore(
    (s) => s.seedStandardTemplate,
  )

  const [evmDialogOpen, setEvmDialogOpen] = useState(false)
  const [syncImportOpen, setSyncImportOpen] = useState(false)
  const [syncExportOpen, setSyncExportOpen] = useState(false)
  const [taskCreationOpen, setTaskCreationOpen] = useState(false)
  // API起票はサーバー（外部ツールへのfetch・トークン保管）を必要とするためpostgresモード専用
  const isPostgresMode =
    (import.meta.env.VITE_STORAGE_MODE ?? 'local') === 'postgres'

  // 外部タスクリンクの解決に使うツール→baseUrlマップ。
  // 取得できなくてもリンクを出さないだけで画面は成立するため、失敗は握り潰す
  // （viewer/partnerは接続一覧を参照できず403になるが、それは仕様どおり）
  const [toolConnections, setToolConnections] = useState<
    ReadonlyArray<{ id: string; tool: ExternalTool; baseUrl: string | null }>
  >([])
  useEffect(() => {
    if (!isPostgresMode) return
    let cancelled = false
    listExternalToolConnections()
      .then((connections) => {
        if (!cancelled) setToolConnections(connections)
      })
      .catch(() => {
        /* 権限不足・未設定は想定内。リンクなしで動作する */
      })
    return () => {
      cancelled = true
    }
    // isPostgresModeはVITE_STORAGE_MODE由来のビルド時定数で不変のため依存に含めない
  }, [])

  const majorProjects = useMemo(
    () =>
      projects
        .filter((p) => p.level === 0)
        .sort((a, b) => a.code.localeCompare(b.code)),
    [projects],
  )

  // クエリパラメータ（?projectId=xxx）を優先し、location.stateへフォールバックする
  // （NFR-004: WBS/スケジュール/アサインの3画面で優先順位を統一）。
  // projects storeはjsonStorageからloadProjects()で非同期的（useEffect経由）に読み込まれるため、
  // マウント時点のuseState初期化子ではmajorProjectsが常に空でバリデーションに失敗する
  // （URL直接アクセス時に初期選択されない不具合の原因）。そのため候補IDだけをここで一度確定し、
  // 実際の選択反映はprojectsストアのロード完了を待つ下記useEffectで行う
  const [initialProjectIdCandidate] = useState(() =>
    resolveInitialProjectId(
      searchParams.get('projectId'),
      (location.state as { selectedProjectId?: string } | null)
        ?.selectedProjectId ?? null,
      () => true,
    ),
  )
  const [selectedProjectId, setSelectedProjectId] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [parentProject, setParentProject] = useState<Project | null>(null)
  const [defaultLevel, setDefaultLevel] = useState<ProjectLevel>(2)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)

  // WBS完了フラグ由来の進捗率をEVM週次データへ反映する「対象週」セレクタ
  // （FR-016再設計）
  const [progressWeekKey, setProgressWeekKey] = useState(() =>
    getIsoWeekKey(new Date()),
  )

  useEffect(() => {
    loadProjects()
    loadTaskSyncLogs()
    loadSchedule()
    loadProjectProgress()
    loadProjectBaselines()
    loadEfforts()
    loadAssignments()
    loadMembers()
    loadBudgetData()
    loadWbsTemplates()
  }, [
    loadProjects,
    loadSchedule,
    loadProjectProgress,
    loadProjectBaselines,
    loadEfforts,
    loadAssignments,
    loadMembers,
    loadBudgetData,
    loadWbsTemplates,
    loadTaskSyncLogs,
  ])

  // wbsTemplatesストアの初期ロード完了後、1件もストックが無ければ標準テンプレートをシードする
  // （tech-tags-storeのseedFromMasterと同じパターン。loadWbsTemplates直後のuseEffectで一度だけ実行）
  useEffect(() => {
    seedStandardTemplate()
  }, [seedStandardTemplate])

  // projectsストアのロード完了後、クエリパラメータ/location.state由来の初期選択候補を
  // 一度だけ反映する（majorProjectsに実在する場合のみ）
  useEffect(() => {
    if (
      !selectedProjectId &&
      initialProjectIdCandidate &&
      majorProjects.some((p) => p.id === initialProjectIdCandidate)
    ) {
      setSelectedProjectId(initialProjectIdCandidate)
    }
  }, [majorProjects, selectedProjectId, initialProjectIdCandidate])

  // biome-ignore lint/correctness/useExhaustiveDependencies: getProjectTree内部でprojectsを参照するため、projectsの変更をトリガーにする
  const fullTree = useMemo(() => getProjectTree(), [projects])

  const filteredTree = useMemo<ProjectTreeNode[]>(() => {
    if (!selectedProjectId) return []
    return fullTree.filter((node) => node.id === selectedProjectId)
  }, [fullTree, selectedProjectId])

  const selectedProjectNode = filteredTree[0] ?? null

  // EVM対象条件: ScheduleEntryが1件以上存在すること
  // （選択中プロジェクトは常にlevel0のため、level0判定は不要）
  const hasScheduleEntries = useMemo(
    () =>
      Boolean(selectedProjectId) &&
      scheduleEntries.some((e) => e.projectId === selectedProjectId),
    [scheduleEntries, selectedProjectId],
  )

  const weekKeys = useMemo(
    () => getFiscalYearWeekKeys(fiscalYear, fiscalYearStartMonth),
    [fiscalYear, fiscalYearStartMonth],
  )

  // WBSの担当者列。タスク自身は担当者を持たないため、
  // 表示年度のアサイン配分から主担当を導出する（データ追加なしの派生表示）。
  // 行ごとに解決するとO(タスク数 × アサイン数)になるので一度だけ構築する
  const assigneeOf = useMemo(
    () =>
      buildTaskAssigneeMap(
        assignments,
        members,
        getFiscalYearMonthKeys(fiscalYear, fiscalYearStartMonth),
      ),
    [assignments, members, fiscalYear, fiscalYearStartMonth],
  )

  // 外部タスクリンクのbaseUrl（→56）。選択中案件に既定接続があれば
  // それで確定させる＝同一ツールに複数接続（別スペース）があってもリンクを出せる
  const toolBaseUrls = useMemo(
    () =>
      resolveToolBaseUrls(
        toolConnections,
        projects.find((p) => p.id === selectedProjectId)
          ?.externalConnectionId ?? null,
      ),
    [toolConnections, projects, selectedProjectId],
  )

  // 進捗率は工数加重で算出する（非公開の設計文書）。
  // 工数が未入力の案件は calcWbsProgressWeighted 側でタスク数ベースへ自動フォールバックする
  const enabledColumnIds = useMemo(() => {
    if (!selectedProjectId) return []
    return getWbsSettings(selectedProjectId)
      .effortColumns.filter((c) => c.enabled)
      .map((c) => c.id)
    // wbsSettingsEntriesは列設定変更時の再計算トリガーとして依存に含める
  }, [selectedProjectId, getWbsSettings, wbsSettingsEntries])

  const currentProgressRate = useMemo(
    () =>
      selectedProjectNode
        ? calcWbsProgressWeighted(
            selectedProjectNode,
            enabledColumnIds,
            efforts,
          )
        : 0,
    [selectedProjectNode, enabledColumnIds, efforts],
  )

  const handleUpdateWeeklyProgress = useCallback(() => {
    if (!selectedProjectId || !selectedProjectNode) return
    setWeeklyProgress(selectedProjectId, progressWeekKey, currentProgressRate)
    toast({
      title: `進捗率（${Math.round(currentProgressRate * 100)}%）を${progressWeekKey}に記録しました`,
    })
  }, [
    selectedProjectId,
    selectedProjectNode,
    progressWeekKey,
    currentProgressRate,
    setWeeklyProgress,
    toast,
  ])

  // ── ベースライン（EVMのPVの基準線）──
  const [freezeDialogOpen, setFreezeDialogOpen] = useState(false)
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false)

  const activeBaseline = useMemo(
    () =>
      selectedProjectId
        ? getActiveBaseline(projectBaselines, selectedProjectId)
        : null,
    [projectBaselines, selectedProjectId],
  )

  // 凍結時点のBAC。案件タブ・人員計画タブと同一の算出経路（WBS総工数×概算単価×係数）を使う
  const baselineBacAmount = useMemo(() => {
    if (!selectedProjectNode) return 0
    const totalEffortDays =
      computeProjectTotalEffort(
        [selectedProjectNode],
        enabledColumnIds,
        efforts,
      ).get(selectedProjectNode.id) ?? 0
    return calcProjectEstimateBudget(
      totalEffortDays / workdaysPerMonth,
      estimatedUnitPrice,
      getProjectCoefficient(selectedProjectNode.id),
    )
  }, [
    selectedProjectNode,
    enabledColumnIds,
    efforts,
    estimatedUnitPrice,
    workdaysPerMonth,
    getProjectCoefficient,
  ])

  const baselineSnapshot = useMemo(
    () =>
      selectedProjectId
        ? buildBaselineSnapshot(selectedProjectId, assignments, members)
        : null,
    [selectedProjectId, assignments, members],
  )

  // 凍結時BACと現行BACが±10%以上乖離していたら再ベースラインを促す
  // （放置するとEVがPVを上回り続けSPIが実態を示さなくなる、非公開の設計文書）
  const isBaselineOutdated = useMemo(
    () =>
      isBaselineStale(
        baselineBacAmount,
        activeBaseline,
        baselineStaleThreshold,
      ),
    [baselineBacAmount, activeBaseline, baselineStaleThreshold],
  )

  const handleFreezeBaseline = useCallback(
    (reason: string) => {
      if (!selectedProjectId || !baselineSnapshot) return
      const nextVersion = (activeBaseline?.version ?? 0) + 1
      freezeBaseline({
        projectId: selectedProjectId,
        reason,
        bacAmount: baselineBacAmount,
        snapshot: baselineSnapshot,
      })
      toast({ title: `ベースライン v${nextVersion} を凍結しました` })
    },
    [
      selectedProjectId,
      baselineSnapshot,
      activeBaseline,
      baselineBacAmount,
      freezeBaseline,
      toast,
    ],
  )

  const handleAddChild = useCallback(
    (parent: Project, childLevel: ProjectLevel) => {
      setEditProject(null)
      setParentProject(parent)
      setDefaultLevel(childLevel)
      setDialogOpen(true)
    },
    [],
  )

  const handleEdit = useCallback((project: Project) => {
    setEditProject(project)
    setParentProject(null)
    setDialogOpen(true)
  }, [])

  const handleDeleteClick = useCallback((project: Project) => {
    setProjectToDelete(project)
    setDeleteDialogOpen(true)
  }, [])

  const handleDeleteConfirm = useCallback(() => {
    if (projectToDelete) {
      deleteProject(projectToDelete.id)
      toast({ title: 'WBS項目を削除しました' })
    }
    setDeleteDialogOpen(false)
    setProjectToDelete(null)
  }, [projectToDelete, deleteProject, toast])

  // 完了CSV取込の適用（非公開の設計文書）。
  // completed/completedAtと外部ID学習のみを書き込み、同期ログを追記する
  const handleTaskSyncApply = useCallback(
    (plan: TaskSyncPlan, fileName: string, source: TaskSyncTool) => {
      updateProjectsBatch(
        plan.changes.map((c) => ({
          id: c.taskId,
          completed: c.after,
          completedAt: c.completedAt,
          ...(c.learnExternalId
            ? { externalSource: source, externalTaskId: c.learnExternalId }
            : {}),
        })),
      )
      addTaskSyncLog({
        syncedAt: new Date().toISOString(),
        channel: 'csv',
        source,
        fileName,
        completedCount: plan.completedCount,
        reopenedCount: plan.reopenedCount,
        unchangedCount: plan.unchangedCount,
        skippedCount: plan.skips.length,
        skippedReasons: plan.skips.slice(0, 100),
        note: null,
      })
      toast({
        title: `完了状態を${plan.changes.length}件同期しました`,
        description:
          plan.skips.length > 0
            ? `${plan.skips.length}件をスキップしました（同期履歴を参照）`
            : undefined,
      })
    },
    [updateProjectsBatch, addTaskSyncLog, toast],
  )

  // API起票の実行（API起票基盤 Phase 3）。対象抽出・外部ID学習・ログ追記は
  // すべてサーバー側で完結するため、ここでは結果の反映（projects再読込）のみを担う
  const handleTaskCreationExecute = useCallback(
    async (connectionId: string, taskIds: string[]) => {
      if (!selectedProjectId) {
        return { created: [], skipped: [], failed: [] }
      }
      const result = await executeTaskCreation({
        connectionId,
        rootProjectId: selectedProjectId,
        taskIds,
      })
      // サーバーが書き込んだ外部IDを画面へ反映する
      await loadProjects()
      await loadTaskSyncLogs()
      toast({
        title: `${result.created.length}件を起票しました`,
        description:
          result.failed.length > 0
            ? `${result.failed.length}件が失敗しました（起票履歴を参照）`
            : undefined,
        variant: result.failed.length > 0 ? 'destructive' : undefined,
      })
      return result
    },
    [selectedProjectId, loadProjects, loadTaskSyncLogs, toast],
  )

  const handleApplyTemplate = useCallback(
    (template: WbsTemplate) => {
      if (!selectedProjectNode) return
      applyWbsTemplate(
        selectedProjectNode,
        addProject,
        () => useProjectsStore.getState().projects,
        template.nodes,
      )
      toast({ title: `テンプレート「${template.name}」を適用しました` })
      setTemplateDialogOpen(false)
    },
    [selectedProjectNode, addProject, toast],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">WBS</h1>
          <p className="text-sm text-muted-foreground">
            プロジェクトごとのWBS（作業分解構成）を編集します
          </p>
        </div>
        <div className="flex items-center gap-1">
          {isPostgresMode && (
            <Button
              variant="outline"
              size="sm"
              disabled={!selectedProjectId}
              onClick={() => setTaskCreationOpen(true)}
              title="未起票のリーフタスクを外部ツールへAPIで作成（完了同期の行き）"
            >
              <Rocket className="h-4 w-4" />
              API起票
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!selectedProjectId}
            onClick={() => setSyncExportOpen(true)}
            title="外部ツール取込用のCSVを出力（完了同期の行き）"
          >
            <Download className="h-4 w-4" />
            連携CSV出力
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSyncImportOpen(true)}
            title="外部ツールの課題一覧CSVから完了状態を同期（完了同期の帰り）"
          >
            <FileUp className="h-4 w-4" />
            完了CSV取込
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!selectedProjectId}
            onClick={() => setTemplateDialogOpen(true)}
            title="WBSテンプレートを適用"
          >
            <LayoutTemplate className="h-4 w-4" />
            テンプレートを適用
          </Button>
          <Button
            data-tour="wbs-settings"
            variant="ghost"
            size="icon"
            disabled={!selectedProjectId}
            onClick={() => navigate(`/wbs-settings/${selectedProjectId}`)}
            title="WBS設定"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Project selector */}
      <div data-tour="wbs-project-selector" className="flex items-center gap-4">
        <span className="text-sm font-medium">対象プロジェクト</span>
        <Combobox
          value={selectedProjectId}
          onValueChange={setSelectedProjectId}
          options={majorProjects.map((p) => ({
            value: p.id,
            label: `${p.code} - ${p.name}（${p.confidence ?? '未設定'}）`,
          }))}
          placeholder="プロジェクトを選択してください"
          searchPlaceholder="プロジェクトを検索..."
          className="w-[480px]"
        />
      </div>

      {selectedProjectId && hasScheduleEntries && (
        <div className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
          <button
            type="button"
            className="inline-flex items-center gap-1 self-center rounded p-1.5 hover:bg-accent"
            onClick={() => setEvmDialogOpen(true)}
            title="EVM（計画・出来高・実コスト）を表示"
          >
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </button>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">現在の進捗率</span>
            <p className="text-2xl font-bold tabular-nums">
              {Math.round(currentProgressRate * 100)}%
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="wbs-progress-week" className="text-xs">
              対象週
            </Label>
            <select
              id="wbs-progress-week"
              className="h-8 w-56 rounded border border-border bg-background px-2 text-sm"
              value={progressWeekKey}
              onChange={(e) => setProgressWeekKey(e.target.value)}
            >
              {weekKeys.map((w) => (
                <option key={w} value={w}>
                  {formatWeekOptionLabel(w)}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleUpdateWeeklyProgress}
          >
            進捗率をEVMに反映
          </Button>
          <p className="text-xs text-muted-foreground">
            現在の完了率（プロジェクト全体、下記の「進捗」列と同じ集計値）を選択週のEVM週次データとして記録します
          </p>

          {/* ベースライン（EVMのPVの基準線）。凍結はPMがEVMのために行う唯一の操作 */}
          <div className="w-full border-t border-border pt-3" />
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">EVMの基準線</span>
            <p className="text-sm font-medium">
              {activeBaseline
                ? `v${activeBaseline.version}（${activeBaseline.approvedAt}・${activeBaseline.reason}）`
                : '未凍結'}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setFreezeDialogOpen(true)}
          >
            {activeBaseline ? '計画を再凍結' : '計画を凍結'}
          </Button>
          {activeBaseline && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setRevokeDialogOpen(true)}
            >
              最新版を取り消す
            </Button>
          )}
          {isBaselineOutdated ? (
            <p className="w-full text-xs text-destructive">
              WBSの工数が凍結時から大きく変わっています（凍結時{' '}
              {Math.round(activeBaseline?.bacAmount ?? 0)} 万円 → 現在{' '}
              {Math.round(baselineBacAmount)}{' '}
              万円）。計画を再凍結しないと、EVがPVを上回り続けて進捗が実態より良く見えます
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              現在のアサイン計画とBACを凍結してPV（計画値）の基準線にします。以降のPV・EV・ACは自動算出されます
            </p>
          )}
        </div>
      )}

      <ProjectEvmDialog
        open={evmDialogOpen}
        onOpenChange={setEvmDialogOpen}
        project={selectedProjectNode}
        scheduleEntries={scheduleEntries}
        progressEntries={progressEntries}
        assignments={assignments}
        members={members}
        efforts={efforts}
        settingsMap={settingsMap}
        estimatedUnitPrice={estimatedUnitPrice}
        workdaysPerMonth={workdaysPerMonth}
        coefficient={
          selectedProjectId ? getProjectCoefficient(selectedProjectId) : 1
        }
        fiscalYear={fiscalYear}
        startMonth={fiscalYearStartMonth}
      />

      <BaselineFreezeDialog
        open={freezeDialogOpen}
        onOpenChange={setFreezeDialogOpen}
        projectName={selectedProjectNode?.name ?? ''}
        nextVersion={(activeBaseline?.version ?? 0) + 1}
        bacAmount={baselineBacAmount}
        monthlyPlannedCost={baselineSnapshot?.monthlyPlannedCost ?? {}}
        onConfirm={handleFreezeBaseline}
      />

      {/* ベースライン最新版の取り消し確認（誤凍結の是正。最新版のみ・過去の版は取り消せない） */}
      <Dialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              ベースライン v{activeBaseline?.version} を取り消しますか？
            </DialogTitle>
            <DialogDescription>
              最新版（v{activeBaseline?.version}・{activeBaseline?.reason}
              ）を削除し、
              {activeBaseline && activeBaseline.version > 1
                ? `v${activeBaseline.version - 1} が有効な基準線に戻ります。`
                : '未凍結の状態へ戻ります。'}
              過去の版は取り消せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRevokeDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedProjectId) revokeLatestBaseline(selectedProjectId)
                setRevokeDialogOpen(false)
                toast({ title: 'ベースラインの最新版を取り消しました' })
              }}
            >
              取り消す
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card data-tour="wbs-grid">
        <CardHeader>
          <CardTitle>
            {selectedProjectId
              ? `WBS - ${majorProjects.find((p) => p.id === selectedProjectId)?.name ?? ''}`
              : 'WBS'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedProjectId ? (
            <p className="py-8 text-center text-muted-foreground">
              {majorProjects.length === 0
                ? 'プロジェクトがありません。先にプロジェクト画面からプロジェクトを登録してください。'
                : 'プロジェクトを選択してください。'}
            </p>
          ) : (
            <ProjectTreeGrid
              tree={filteredTree}
              projectId={selectedProjectId}
              onAddChild={handleAddChild}
              onEdit={handleEdit}
              onDelete={handleDeleteClick}
              toolBaseUrls={toolBaseUrls}
              assigneeOf={assigneeOf}
            />
          )}
        </CardContent>
      </Card>

      <ProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        project={editProject}
        parentProject={parentProject}
        defaultLevel={defaultLevel}
      />

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>WBS項目の削除</DialogTitle>
            <DialogDescription>
              「{projectToDelete?.name}
              」を削除しますか？子項目と関連する配分データもすべて削除されます。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WbsTemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        onApply={handleApplyTemplate}
      />

      <TaskSyncImportDialog
        open={syncImportOpen}
        onOpenChange={setSyncImportOpen}
        projects={projects}
        onApply={handleTaskSyncApply}
      />

      <TaskSyncExportDialog
        open={syncExportOpen}
        onOpenChange={setSyncExportOpen}
        rootProject={projects.find((p) => p.id === selectedProjectId) ?? null}
        projects={projects}
      />

      {isPostgresMode && (
        <TaskCreationDialog
          open={taskCreationOpen}
          onOpenChange={setTaskCreationOpen}
          rootProject={projects.find((p) => p.id === selectedProjectId) ?? null}
          projects={projects}
          scheduleEntries={scheduleEntries}
          onExecute={handleTaskCreationExecute}
        />
      )}

      {taskSyncLogs.length > 0 && (
        <div className="space-y-1">
          <h2 className="text-sm font-medium">完了同期履歴（直近5件）</h2>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {[...taskSyncLogs]
              .sort((a, b) => b.syncedAt.localeCompare(a.syncedAt))
              .slice(0, 5)
              .map((log) => (
                <li key={log.id}>
                  {log.syncedAt.slice(0, 10)} {log.fileName ?? log.channel}（
                  {log.source}） — 完了 {log.completedCount}件 ／ 戻し{' '}
                  {log.reopenedCount}件 ／ スキップ {log.skippedCount}件
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  )
}
