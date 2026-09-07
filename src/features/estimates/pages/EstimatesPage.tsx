import { Gauge, ListTree, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
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
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/ui/tabs'
import type { EstimateMethod, ProjectTreeNode } from '@/shared/types'
import { computeProjectTotalEffort } from '@/shared/utils/effort-utils'
import {
  buildRetrospectiveRows,
  calcActualCostAmount,
  calcActualEffortDays,
  calcActualHoursPerFp,
  calcCalibrationHint,
  resolveActualReference,
} from '@/shared/utils/estimate-retrospective-utils'
import {
  getLatestFpSnapshot,
  getSnapshotsForProject,
} from '@/shared/utils/estimate-snapshot-utils'
import { resolveInitialProjectId } from '@/shared/utils/navigation-utils'
import {
  useAssignmentStore,
  useBudgetStore,
  useChangeRequestStore,
  useEffortsStore,
  useEstimateStore,
  useMembersStore,
  useProjectsStore,
  useWbsSettingsStore,
} from '@/stores'
import { EstimateHistoryTable } from '../components/EstimateHistoryTable'
import {
  EstimateRecordDialog,
  type EstimateRecordDraft,
} from '../components/EstimateRecordDialog'
import { EstimateRetrospectivePanel } from '../components/EstimateRetrospectivePanel'
import { UncertaintyConeChart } from '../components/UncertaintyConeChart'
import { UncertaintyConeInfo } from '../components/UncertaintyConeInfo'

/** ルート配下のリーフ（子を持たないタスク）の数。ルート自身は数えない */
function countLeafTasks(node: ProjectTreeNode): number {
  if (node.children.length === 0) return 0
  let count = 0
  for (const child of node.children) {
    count += child.children.length === 0 ? 1 : countLeafTasks(child)
  }
  return count
}

/**
 * 見積（/estimates）。1案件フォーカスで、記録／コーン／振り返りの3タブ。
 * 金額を持つためルート側で`FinancialAccessGuard`に包む（/budgetと同じ整理）。
 */
export function EstimatesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const projects = useProjectsStore((s) => s.projects)
  const getProjectTree = useProjectsStore((s) => s.getProjectTree)
  const loadProjects = useProjectsStore((s) => s.loadProjects)
  const efforts = useEffortsStore((s) => s.efforts)
  const loadEfforts = useEffortsStore((s) => s.loadEfforts)
  const wbsSettingsEntries = useWbsSettingsStore((s) => s.entries)
  const getWbsSettings = useWbsSettingsStore((s) => s.getSettings)
  const loadWbsSettings = useWbsSettingsStore((s) => s.loadWbsSettings)
  const assignments = useAssignmentStore((s) => s.assignments)
  const loadAssignments = useAssignmentStore((s) => s.loadAssignments)
  const members = useMembersStore((s) => s.members)
  const loadMembers = useMembersStore((s) => s.loadMembers)
  const changeRequests = useChangeRequestStore((s) => s.changeRequests)
  const loadChangeRequests = useChangeRequestStore((s) => s.loadChangeRequests)
  const estimateSnapshots = useEstimateStore((s) => s.estimateSnapshots)
  const loadEstimateSnapshots = useEstimateStore((s) => s.loadEstimateSnapshots)
  const recordEstimate = useEstimateStore((s) => s.recordEstimate)
  const revokeLatestEstimate = useEstimateStore((s) => s.revokeLatestEstimate)
  const loadBudgetData = useBudgetStore((s) => s.loadBudgetData)
  const estimatedUnitPrice = useBudgetStore((s) => s.estimatedUnitPrice)
  const workdaysPerMonth = useBudgetStore((s) => s.workdaysPerMonth)
  const hoursPerDay = useBudgetStore((s) => s.hoursPerDay)
  const hoursPerFunctionPoint = useBudgetStore((s) => s.hoursPerFunctionPoint)
  const getProjectCoefficient = useBudgetStore((s) => s.getProjectCoefficient)
  // セレクタが内部で参照するフィールドを購読して再計算を追従させる
  useBudgetStore((s) => s.projectCoefficients)
  useBudgetStore((s) => s.defaultCoefficient)

  useEffect(() => {
    loadProjects()
    loadEfforts()
    loadWbsSettings()
    loadAssignments()
    loadMembers()
    loadChangeRequests()
    loadEstimateSnapshots()
    loadBudgetData()
  }, [
    loadProjects,
    loadEfforts,
    loadWbsSettings,
    loadAssignments,
    loadMembers,
    loadChangeRequests,
    loadEstimateSnapshots,
    loadBudgetData,
  ])

  // 実績の基準日はマウント時に一度だけ確定する（レンダーごとに揺れない決定論）
  const [referenceDate] = useState(() => new Date())

  const majorProjects = useMemo(() => {
    void projects
    return getProjectTree()
  }, [projects, getProjectTree])

  // クエリパラメータ（?projectId=xxx）→ location.state の優先順位で初期選択する
  // （ストアの非同期ロード完了を待つ2段階パターン、/project-summaryと同型）
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

  const project = useMemo(
    () => majorProjects.find((p) => p.id === selectedProjectId) ?? null,
    [majorProjects, selectedProjectId],
  )

  const history = useMemo(
    () =>
      project ? getSnapshotsForProject(estimateSnapshots, project.id) : [],
    [estimateSnapshots, project],
  )

  const basis = useMemo(
    () => ({
      estimatedUnitPrice,
      coefficient: project ? getProjectCoefficient(project.id) : 1,
      workdaysPerMonth,
      hoursPerDay,
      hoursPerFunctionPoint,
    }),
    [
      estimatedUnitPrice,
      project,
      getProjectCoefficient,
      workdaysPerMonth,
      hoursPerDay,
      hoursPerFunctionPoint,
    ],
  )

  const wbsSummary = useMemo(() => {
    if (!project) return { leafCount: 0, totalEffortDays: 0 }
    void wbsSettingsEntries
    const columnIds = getWbsSettings(project.id)
      .effortColumns.filter((c) => c.enabled)
      .map((c) => c.id)
    const total =
      computeProjectTotalEffort([project], columnIds, efforts).get(
        project.id,
      ) ?? 0
    return { leafCount: countLeafTasks(project), totalEffortDays: total }
  }, [project, wbsSettingsEntries, getWbsSettings, efforts])

  const currentActual = useMemo(
    () =>
      project
        ? {
            effortDays: calcActualEffortDays(
              project.id,
              assignments,
              members,
              workdaysPerMonth,
              referenceDate,
            ),
            amount: calcActualCostAmount(
              project.id,
              assignments,
              members,
              referenceDate,
            ),
          }
        : { effortDays: 0, amount: 0 },
    [project, assignments, members, workdaysPerMonth, referenceDate],
  )
  const actualReference = useMemo(
    () => resolveActualReference(history, currentActual),
    [history, currentActual],
  )
  const retrospectiveRows = useMemo(
    () => buildRetrospectiveRows(history, actualReference),
    [history, actualReference],
  )
  const actualHoursPerFp = useMemo(
    () =>
      project
        ? calcActualHoursPerFp(
            project.id,
            history,
            actualReference.effortDays,
            hoursPerDay,
          )
        : null,
    [project, history, actualReference, hoursPerDay],
  )
  const calibration = useMemo(
    () => calcCalibrationHint(estimateSnapshots),
    [estimateSnapshots],
  )
  const approvedChangeRequests = useMemo(
    () =>
      project
        ? changeRequests.filter(
            (c) => c.projectId === project.id && c.status === 'approved',
          )
        : [],
    [changeRequests, project],
  )
  const previousFpItems = useMemo(
    () =>
      project
        ? (getLatestFpSnapshot(estimateSnapshots, project.id)?.fp?.items ??
          null)
        : null,
    [estimateSnapshots, project],
  )

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMethod, setDialogMethod] =
    useState<EstimateMethod>('function_point')
  const [revokeOpen, setRevokeOpen] = useState(false)
  const latest = history.at(-1) ?? null

  const openDialog = (method: EstimateMethod) => {
    setDialogMethod(method)
    setDialogOpen(true)
  }
  const handleSubmit = (draft: EstimateRecordDraft): boolean => {
    if (!project) return false
    return recordEstimate({ projectId: project.id, ...draft }) !== null
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">見積</h1>
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
          aria-label="プロジェクトを選択"
        />
        <UncertaintyConeInfo />
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
            プロジェクトを選択すると、段階ごとの見積の記録・不確実性コーン・実績との振り返りを確認できます。
          </CardContent>
        </Card>
      )}

      {project && (
        <>
          <Tabs defaultValue="history">
            <TabsList>
              <TabsTrigger value="history">記録</TabsTrigger>
              <TabsTrigger value="cone">コーン</TabsTrigger>
              <TabsTrigger value="retrospective">振り返り</TabsTrigger>
            </TabsList>

            <TabsContent value="history">
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
                  <CardTitle className="text-base">
                    見積の記録（{history.length}版）
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!latest}
                      onClick={() => setRevokeOpen(true)}
                    >
                      <Undo2 className="mr-1 h-4 w-4" />
                      最新版を取り消す
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => openDialog('function_point')}
                    >
                      見積を記録
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <EstimateHistoryTable
                    history={history}
                    changeRequests={changeRequests}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="cone">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1 text-base">
                    不確実性コーン
                    <UncertaintyConeInfo />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {history.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      見積を記録すると、段階ごとの見積と幅（実績が収まる範囲）を描きます。
                    </p>
                  ) : (
                    <UncertaintyConeChart
                      snapshots={history}
                      actualAmount={actualReference.amount}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="retrospective">
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
                  <CardTitle className="text-base">振り返り</CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openDialog('actual')}
                  >
                    実績を記録
                  </Button>
                </CardHeader>
                <CardContent>
                  <EstimateRetrospectivePanel
                    rows={retrospectiveRows}
                    actual={actualReference}
                    actualHoursPerFp={actualHoursPerFp}
                    hoursPerFunctionPoint={hoursPerFunctionPoint}
                    calibration={calibration}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

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
              onClick={() =>
                navigate(`/project-summary?projectId=${project.id}`)
              }
            >
              <Gauge className="mr-1 h-4 w-4" />
              プロジェクトサマリーを開く
            </Button>
          </div>

          <EstimateRecordDialog
            key={`${project.id}-${dialogMethod}-${dialogOpen ? 'open' : 'closed'}`}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            projectName={project.name}
            basis={basis}
            wbsSummary={wbsSummary}
            approvedChangeRequests={approvedChangeRequests}
            previousFpItems={previousFpItems}
            currentActual={currentActual}
            calibration={calibration}
            initialMethod={dialogMethod}
            onSubmit={handleSubmit}
          />

          <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>最新版を取り消しますか？</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                {latest
                  ? `v${latest.version}「${latest.label}」を削除します。過去の版は取り消せません（履歴の連番を保つため）。`
                  : '取り消せる版がありません。'}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRevokeOpen(false)}>
                  キャンセル
                </Button>
                <Button
                  variant="destructive"
                  disabled={!latest}
                  onClick={() => {
                    revokeLatestEstimate(project.id)
                    setRevokeOpen(false)
                  }}
                >
                  取り消す
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}
