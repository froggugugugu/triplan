import {
  Calculator,
  CalendarDays,
  Gauge,
  Info,
  ListTree,
  Pencil,
  Plus,
  Receipt,
  Scissors,
  ShieldAlert,
  Trash2,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/components/ui/popover'
import { useToast } from '@/shared/hooks/use-toast'
import type { Project } from '@/shared/types'
import { CONFIDENCE_OPTIONS, STATUS_OPTIONS } from '@/shared/types/project'
import { getThemeColor, type ThemeColor } from '@/shared/types/theme-color'
import {
  computeEffortDisplayValues,
  formatEffort,
} from '@/shared/utils/effort-utils'
import {
  useAppStore,
  useAssignmentStore,
  useBillingMilestoneStore,
  useBudgetStore,
  useChangeRequestStore,
  useEffortsStore,
  useMembersStore,
  useProjectProgressStore,
  useProjectsStore,
  useRiskStore,
  useScheduleSettingsStore,
  useScheduleStore,
  useWbsSettingsStore,
} from '@/stores'
import { ProjectCommerceDialog } from '../components/ProjectCommerceDialog'
import { ProjectDialog } from '../components/ProjectDialog'
import { ProjectEvmDialog } from '../components/ProjectEvmDialog'
import { RiskRegisterDialog } from '../components/RiskRegisterDialog'
import { WhatIfSimulationDialog } from '../components/WhatIfSimulationDialog'
import { getCurrentPhase } from '../utils/current-phase-utils'

/** 現在日付を "YYYY-MM-DD" で返す（タイムゾーン起因のズレを避けるためローカル日付要素から組み立てる） */
function getTodayDateString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

interface ProjectEffortSummary {
  total: number
  breakdown: {
    columnId: string
    displayName: string
    color?: ThemeColor
    value: number
  }[]
}

export function ProjectsPage() {
  const { toast } = useToast()
  const navigate = useNavigate()
  const appFiscalYear = useAppStore((s) => s.fiscalYear)
  const appFiscalYearStartMonth = useAppStore((s) => s.fiscalYearStartMonth)
  const loadProjects = useProjectsStore((state) => state.loadProjects)
  const getProjectTree = useProjectsStore((state) => state.getProjectTree)
  const deleteProject = useProjectsStore((state) => state.deleteProject)
  const projects = useProjectsStore((state) => state.projects)

  const efforts = useEffortsStore((s) => s.efforts)
  const loadEfforts = useEffortsStore((s) => s.loadEfforts)
  const wbsSettingsEntries = useWbsSettingsStore((s) => s.entries)
  const getWbsSettings = useWbsSettingsStore((s) => s.getSettings)
  // ProjectEvmDialogは旧settingsMap（Record<projectId, WbsSettings>）形式のpropを
  // 引き続き期待するため、entries配列からここで変換する
  const wbsSettingsRecordMap = useMemo(
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

  const assignments = useAssignmentStore((s) => s.assignments)
  const loadAssignments = useAssignmentStore((s) => s.loadAssignments)
  const members = useMembersStore((s) => s.members)

  const scheduleEntries = useScheduleStore((s) => s.entries)
  const loadSchedule = useScheduleStore((s) => s.loadSchedule)
  const scheduleSettingsEntries = useScheduleSettingsStore((s) => s.entries)
  const getScheduleSettings = useScheduleSettingsStore((s) => s.getSettings)

  const progressEntries = useProjectProgressStore(
    (s) => s.projectProgressEntries,
  )
  const loadProjectProgress = useProjectProgressStore(
    (s) => s.loadProjectProgress,
  )
  const estimatedUnitPrice = useBudgetStore((s) => s.estimatedUnitPrice)
  const workdaysPerMonth = useBudgetStore((s) => s.workdaysPerMonth)
  const getProjectCoefficient = useBudgetStore((s) => s.getProjectCoefficient)
  const loadBudgetData = useBudgetStore((s) => s.loadBudgetData)
  const loadMembers = useMembersStore((s) => s.loadMembers)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)
  const [evmDialogOpen, setEvmDialogOpen] = useState(false)
  const [evmProjectId, setEvmProjectId] = useState<string | null>(null)
  const [whatIfDialogOpen, setWhatIfDialogOpen] = useState(false)
  const [whatIfProjectId, setWhatIfProjectId] = useState<string | null>(null)
  const [commerceDialogOpen, setCommerceDialogOpen] = useState(false)
  const [riskDialogOpen, setRiskDialogOpen] = useState(false)
  const [riskProjectId, setRiskProjectId] = useState<string | null>(null)
  const [commerceProjectId, setCommerceProjectId] = useState<string | null>(
    null,
  )

  const loadBillingMilestones = useBillingMilestoneStore(
    (s) => s.loadBillingMilestones,
  )
  const loadRiskEntries = useRiskStore((s) => s.loadRiskEntries)
  const loadChangeRequests = useChangeRequestStore((s) => s.loadChangeRequests)

  useEffect(() => {
    loadProjects()
    loadEfforts()
    loadAssignments()
    loadSchedule()
    loadProjectProgress()
    loadBudgetData()
    loadMembers()
    loadBillingMilestones()
    loadRiskEntries()
    loadChangeRequests()
  }, [
    loadProjects,
    loadEfforts,
    loadAssignments,
    loadSchedule,
    loadProjectProgress,
    loadBudgetData,
    loadMembers,
    loadBillingMilestones,
    loadRiskEntries,
    loadChangeRequests,
  ])

  const majorProjects = useMemo(
    () =>
      projects
        .filter((p) => p.level === 0)
        .sort((a, b) => a.code.localeCompare(b.code)),
    [projects],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: getProjectTree内部でprojectsを参照するため、projectsの変更をトリガーにする
  const fullTree = useMemo(() => getProjectTree(), [projects])

  // 案件ごとの総工数を計算
  const effortSummaries = useMemo(() => {
    const result = new Map<string, ProjectEffortSummary>()
    for (const rootNode of fullTree) {
      const settings = getWbsSettings(rootNode.id)
      const enabledCols = settings.effortColumns
        .filter((c) => c.enabled)
        .sort((a, b) => a.order - b.order)
      const columnIds = enabledCols.map((c) => c.id)

      const displayValues = computeEffortDisplayValues(
        [rootNode],
        columnIds,
        efforts,
      )

      let total = 0
      const breakdown: ProjectEffortSummary['breakdown'] = []
      for (const col of enabledCols) {
        const value = displayValues.get(`${rootNode.id}:${col.id}`) ?? 0
        total += value
        breakdown.push({
          columnId: col.id,
          displayName: col.displayName,
          color: col.backgroundColor,
          value,
        })
      }
      result.set(rootNode.id, { total, breakdown })
    }
    return result
  }, [fullTree, efforts, wbsSettingsEntries, getWbsSettings])

  // Project別の割当済工数（人月）を計算
  const assignedEfforts = useMemo(() => {
    const result = new Map<string, number>()
    for (const project of majorProjects) {
      const projectAssignments = assignments.filter(
        (a) => a.projectId === project.id,
      )
      let total = 0
      for (const a of projectAssignments) {
        for (const v of Object.values(a.monthlyValues)) {
          total += v
        }
      }
      result.set(project.id, total)
    }
    return result
  }, [majorProjects, assignments])

  // プロジェクトごとのスケジュール日付範囲（最古開始日・最新終了日）
  const scheduleDateRanges = useMemo(() => {
    const result = new Map<string, { startDate: string; endDate: string }>()
    for (const project of majorProjects) {
      const projectEntries = scheduleEntries.filter(
        (e) =>
          e.projectId === project.id &&
          e.startDate &&
          e.endDate &&
          e.startDate <= e.endDate,
      )
      if (projectEntries.length === 0) continue

      // biome-ignore lint/style/noNonNullAssertion: length > 0 checked above
      let minStart = projectEntries[0]!.startDate
      // biome-ignore lint/style/noNonNullAssertion: length > 0 checked above
      let maxEnd = projectEntries[0]!.endDate
      for (const entry of projectEntries) {
        if (entry.startDate < minStart) minStart = entry.startDate
        if (entry.endDate > maxEnd) maxEnd = entry.endDate
      }
      result.set(project.id, { startDate: minStart, endDate: maxEnd })
    }
    return result
  }, [majorProjects, scheduleEntries])

  // プロジェクトごとの「現在の工程」名（FR-012）。
  // 現在日付を含む工程が複数該当する場合はsortOrder最小のものを採用する（決定論的）
  const currentPhaseNames = useMemo(() => {
    const today = getTodayDateString()
    const result = new Map<string, string | null>()
    for (const project of majorProjects) {
      const projectEntries = scheduleEntries.filter(
        (e) => e.projectId === project.id,
      )
      const phases = getScheduleSettings(project.id).phases
      const current = getCurrentPhase(projectEntries, phases, today)
      const phaseDef = current
        ? phases.find((p) => p.phaseKey === current.phaseKey)
        : undefined
      result.set(project.id, phaseDef?.name ?? null)
    }
    return result
  }, [
    majorProjects,
    scheduleEntries,
    scheduleSettingsEntries,
    getScheduleSettings,
  ])

  const handleNavigateToWbs = useCallback(
    (projectId: string) => {
      navigate(`/wbs?projectId=${projectId}`)
    },
    [navigate],
  )

  const handleNavigateToSchedule = useCallback(
    (projectId: string) => {
      navigate(`/schedule?projectId=${projectId}`)
    },
    [navigate],
  )

  const handleNavigateToAssignment = useCallback(
    (projectId: string) => {
      navigate(`/assignment?projectId=${projectId}`)
    },
    [navigate],
  )

  const handleOpenEvmDialog = useCallback((projectId: string) => {
    setEvmProjectId(projectId)
    setEvmDialogOpen(true)
  }, [])

  const evmProjectNode = useMemo(
    () => fullTree.find((p) => p.id === evmProjectId) ?? null,
    [fullTree, evmProjectId],
  )

  const handleOpenWhatIfDialog = useCallback((projectId: string) => {
    setWhatIfProjectId(projectId)
    setWhatIfDialogOpen(true)
  }, [])

  const handleOpenCommerceDialog = useCallback((projectId: string) => {
    setCommerceProjectId(projectId)
    setCommerceDialogOpen(true)
  }, [])

  const handleOpenRiskDialog = useCallback((projectId: string) => {
    setRiskProjectId(projectId)
    setRiskDialogOpen(true)
  }, [])

  const whatIfProjectNode = useMemo(
    () => fullTree.find((p) => p.id === whatIfProjectId) ?? null,
    [fullTree, whatIfProjectId],
  )

  const getChildCount = useCallback(
    (projectId: string) => {
      let count = 0
      const queue = [projectId]
      while (queue.length > 0) {
        const pid = queue.shift()
        if (!pid) continue
        for (const p of projects) {
          if (p.parentId === pid) {
            count++
            queue.push(p.id)
          }
        }
      }
      return count
    },
    [projects],
  )

  const handleAdd = useCallback(() => {
    setEditProject(null)
    setDialogOpen(true)
  }, [])

  const handleEdit = useCallback((project: Project) => {
    setEditProject(project)
    setDialogOpen(true)
  }, [])

  const handleDeleteClick = useCallback((project: Project) => {
    setProjectToDelete(project)
    setDeleteDialogOpen(true)
  }, [])

  const handleDeleteConfirm = useCallback(() => {
    if (projectToDelete) {
      deleteProject(projectToDelete.id)
      toast({ title: 'プロジェクトを削除しました（関連WBSも削除されました）' })
    }
    setDeleteDialogOpen(false)
    setProjectToDelete(null)
  }, [projectToDelete, deleteProject, toast])

  // 全案件の総合計工数（人日）
  const grandTotalDays = useMemo(() => {
    let sum = 0
    for (const s of effortSummaries.values()) {
      sum += s.total
    }
    return sum
  }, [effortSummaries])

  // 全案件の割当済・未割当合計（人月）
  const grandTotalAssigned = useMemo(() => {
    let sum = 0
    for (const v of assignedEfforts.values()) {
      sum += v
    }
    return sum
  }, [assignedEfforts])

  const grandTotalUnassigned = useMemo(
    () => grandTotalDays / 20 - grandTotalAssigned,
    [grandTotalDays, grandTotalAssigned],
  )

  const deleteChildCount = useMemo(() => {
    if (!projectToDelete) return 0
    return getChildCount(projectToDelete.id)
  }, [projectToDelete, getChildCount])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">プロジェクト</h1>
        <Button data-tour="projects-add" onClick={handleAdd}>
          <Plus className="h-4 w-4" />
          新規プロジェクト
        </Button>
      </div>

      <Card data-tour="projects-table">
        <CardHeader>
          <CardTitle>プロジェクト一覧（{majorProjects.length}件）</CardTitle>
        </CardHeader>
        <CardContent>
          {majorProjects.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              プロジェクトがありません。「新規プロジェクト」ボタンから追加してください。
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium">コード</th>
                    <th className="px-3 py-2 text-left font-medium">
                      プロジェクト名
                    </th>
                    <th className="px-3 py-2 text-center font-medium">確度</th>
                    <th className="px-3 py-2 text-center font-medium">
                      ステータス
                    </th>
                    <th className="px-3 py-2 text-center font-medium">
                      開始日
                    </th>
                    <th className="px-3 py-2 text-center font-medium">
                      終了日
                    </th>
                    <th className="px-3 py-2 text-right font-medium">総工数</th>
                    <th className="px-3 py-2 text-right font-medium">
                      割当済工数
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      未割当工数
                    </th>
                    <th className="px-3 py-2 text-center font-medium">WBS数</th>
                    <th className="px-3 py-2 text-center font-medium">EVM</th>
                    <th className="px-3 py-2 text-center font-medium">
                      What-if
                    </th>
                    <th className="px-3 py-2 text-center font-medium">商流</th>
                    <th className="px-3 py-2 text-center font-medium">
                      リスク
                    </th>
                    <th className="px-3 py-2 text-center font-medium">見積</th>
                    <th className="px-3 py-2 text-center font-medium">
                      スケジュール
                    </th>
                    <th className="w-24 px-3 py-2 text-center font-medium">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {majorProjects.map((project) => {
                    const summary = effortSummaries.get(project.id)
                    return (
                      <tr
                        key={project.id}
                        className={`group border-b border-border hover:bg-accent/30 ${project.status === 'completed' ? 'bg-gray-100/70 dark:bg-gray-800/50 text-muted-foreground' : ''}`}
                      >
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                          {project.code}
                        </td>
                        <td className="px-3 py-2 font-medium">
                          <div className="flex items-center gap-1">
                            <span>{project.name}</span>
                            <ProjectDetailInfoButton project={project} />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center text-xs">
                          {project.confidence
                            ? (CONFIDENCE_OPTIONS.find(
                                (o) => o.value === project.confidence,
                              )?.label ?? '-')
                            : '-'}
                        </td>
                        <td className="px-3 py-2 text-center text-xs">
                          {STATUS_OPTIONS.find(
                            (o) => o.value === project.status,
                          )?.label ?? '未着手'}
                        </td>
                        <td className="px-3 py-2 text-center text-xs tabular-nums text-muted-foreground">
                          {scheduleDateRanges
                            .get(project.id)
                            ?.startDate.replace(/-/g, '/') ?? '-'}
                        </td>
                        <td className="px-3 py-2 text-center text-xs tabular-nums text-muted-foreground">
                          {scheduleDateRanges
                            .get(project.id)
                            ?.endDate.replace(/-/g, '/') ?? '-'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <EffortCell summary={summary} />
                        </td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">
                          {(assignedEfforts.get(project.id) ?? 0).toFixed(2)}{' '}
                          人月
                        </td>
                        {(() => {
                          const assigned = assignedEfforts.get(project.id) ?? 0
                          const totalMonths = (summary?.total ?? 0) / 20
                          const unassigned = totalMonths - assigned
                          return (
                            <td
                              className={`px-3 py-2 text-right text-xs tabular-nums ${unassigned < 0 ? 'text-destructive' : ''}`}
                            >
                              <div className="flex items-center justify-end gap-1">
                                <span>{unassigned.toFixed(2)} 人月</span>
                                <button
                                  type="button"
                                  className="rounded p-0.5 hover:bg-accent"
                                  onClick={() =>
                                    handleNavigateToAssignment(project.id)
                                  }
                                  title="アサイン画面で配分する"
                                >
                                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                </button>
                              </div>
                            </td>
                          )
                        })()}
                        <td className="px-3 py-2 text-center text-xs">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-accent"
                            onClick={() => handleNavigateToWbs(project.id)}
                            title="WBS画面で確認する"
                          >
                            <span>{getChildCount(project.id)}</span>
                            <ListTree className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </td>
                        <td className="px-3 py-2 text-center text-xs">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-accent"
                            onClick={() => handleOpenEvmDialog(project.id)}
                            title="EVM（計画・出来高・実コスト）を表示"
                          >
                            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-accent"
                            onClick={() =>
                              navigate(
                                `/project-summary?projectId=${project.id}`,
                              )
                            }
                            title="プロジェクトサマリー（判定・金・モノ・人・商流を1画面で確認）"
                          >
                            <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </td>
                        <td className="px-3 py-2 text-center text-xs">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-accent"
                            onClick={() => handleOpenWhatIfDialog(project.id)}
                            title="What-ifシミュレーション（タスクを削った場合の概算予算を試算）"
                          >
                            <Scissors className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </td>
                        <td className="px-3 py-2 text-center text-xs">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-accent"
                            onClick={() => handleOpenCommerceDialog(project.id)}
                            title="商流管理（請求マイルストン・変更管理）"
                          >
                            <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </td>
                        <td className="px-3 py-2 text-center text-xs">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-accent"
                            onClick={() => handleOpenRiskDialog(project.id)}
                            title="リスク登録簿（識別・評価・対応・監視）"
                          >
                            <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </td>
                        <td className="px-3 py-2 text-center text-xs">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-accent"
                            onClick={() =>
                              navigate(`/estimates?projectId=${project.id}`)
                            }
                            title="見積（段階ごとの記録・不確実性コーン・振り返り）"
                          >
                            <Calculator className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </td>
                        <td className="px-3 py-2 text-center text-xs">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-accent"
                            onClick={() => handleNavigateToSchedule(project.id)}
                            title="スケジュール画面で確認する"
                          >
                            <span className="text-muted-foreground">
                              {currentPhaseNames.get(project.id) ?? '-'}
                            </span>
                            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleEdit(project)}
                              title="編集"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteClick(project)}
                              title="削除"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/50 font-medium">
                    <td colSpan={6} className="px-3 py-2 text-right text-sm">
                      全プロジェクト合計
                    </td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums">
                      {(grandTotalDays / 20).toFixed(2)} 人月
                    </td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums">
                      {grandTotalAssigned.toFixed(2)} 人月
                    </td>
                    <td
                      className={`px-3 py-2 text-right text-sm tabular-nums ${grandTotalUnassigned < 0 ? 'text-destructive' : ''}`}
                    >
                      {grandTotalUnassigned.toFixed(2)} 人月
                    </td>
                    <td />
                    <td />
                    <td />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        project={editProject}
        defaultLevel={0}
      />

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>プロジェクトの削除</DialogTitle>
            <DialogDescription>
              「{projectToDelete?.name}」を削除しますか？
              {deleteChildCount > 0
                ? `関連するWBS（${deleteChildCount}件）と配分データもすべて削除されます。`
                : '関連する配分データも削除されます。'}
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

      <ProjectEvmDialog
        open={evmDialogOpen}
        onOpenChange={setEvmDialogOpen}
        project={evmProjectNode}
        scheduleEntries={scheduleEntries}
        progressEntries={progressEntries}
        assignments={assignments}
        members={members}
        efforts={efforts}
        settingsMap={wbsSettingsRecordMap}
        estimatedUnitPrice={estimatedUnitPrice}
        workdaysPerMonth={workdaysPerMonth}
        coefficient={evmProjectId ? getProjectCoefficient(evmProjectId) : 1}
        fiscalYear={appFiscalYear}
        startMonth={appFiscalYearStartMonth}
      />

      <WhatIfSimulationDialog
        open={whatIfDialogOpen}
        onOpenChange={setWhatIfDialogOpen}
        project={whatIfProjectNode}
        efforts={efforts}
        settingsMap={wbsSettingsRecordMap}
        estimatedUnitPrice={estimatedUnitPrice}
        workdaysPerMonth={workdaysPerMonth}
        coefficient={
          whatIfProjectId ? getProjectCoefficient(whatIfProjectId) : 1
        }
      />

      <ProjectCommerceDialog
        open={commerceDialogOpen}
        onOpenChange={setCommerceDialogOpen}
        projectId={commerceProjectId}
      />

      <RiskRegisterDialog
        open={riskDialogOpen}
        onOpenChange={setRiskDialogOpen}
        projectId={riskProjectId}
      />
    </div>
  )
}

/**
 * プロジェクト名列の詳細情報アイコン（FR-010）。
 * 背景・目的・説明の3フィールドは一覧の列としては削除し、クリックでPopover表示に統合する
 * （データ・ProjectDialog.tsxの編集用テキストエリアは変更しない、表示のみの変更）。
 */
function ProjectDetailInfoButton({ project }: { project: Project }) {
  const hasDetail = Boolean(
    project.background || project.purpose || project.description,
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="shrink-0 rounded p-0.5 hover:bg-accent"
          title="背景・目的・説明を表示"
        >
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-2 p-3">
        {hasDetail ? (
          <>
            <DetailSection label="背景" value={project.background} />
            <DetailSection label="目的" value={project.purpose} />
            <DetailSection label="説明" value={project.description} />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            背景・目的・説明はまだ登録されていません。
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}

function DetailSection({
  label,
  value,
}: {
  label: string
  value: string | undefined
}) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap text-xs">{value}</p>
    </div>
  )
}

function EffortCell({
  summary,
}: {
  summary: ProjectEffortSummary | undefined
}) {
  const theme = useAppStore((s) => s.theme)

  if (!summary || summary.total === 0) {
    return <span className="text-xs text-muted-foreground">-</span>
  }

  const totalMonths = (summary.total / 20).toFixed(2)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs tabular-nums hover:bg-accent transition-colors"
        >
          <span className="font-medium">{totalMonths}</span>
          <span className="text-muted-foreground">人月</span>
          <Info className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          工数内訳（人日）
        </p>
        <table className="w-full text-xs">
          <tbody>
            {summary.breakdown.map((item) => (
              <tr
                key={item.columnId}
                className="border-b border-border/50 last:border-b-0"
              >
                <td className="py-1.5 pr-2">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm border border-border/50"
                      style={{
                        backgroundColor: item.color
                          ? getThemeColor(item.color, theme)
                          : 'transparent',
                      }}
                    />
                    {item.displayName}
                  </span>
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatEffort(item.value)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border font-medium">
              <td className="pt-1.5">合計</td>
              <td className="pt-1.5 text-right tabular-nums">
                {formatEffort(summary.total)}
                <span className="ml-1 text-muted-foreground font-normal">
                  ({totalMonths})
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </PopoverContent>
    </Popover>
  )
}
