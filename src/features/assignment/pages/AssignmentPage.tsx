import { Camera } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { Combobox } from '@/shared/components/ui/combobox'
import { computeEffortDisplayValues } from '@/shared/utils/effort-utils'
import { resolveInitialProjectId } from '@/shared/utils/navigation-utils'
import {
  useActualsStore,
  useAppStore,
  useAssignmentNoteStore,
  useAssignmentStore,
  useEffortsStore,
  useMembersStore,
  useProjectsStore,
  useScheduleStore,
  useTeamStore,
  useWbsSettingsStore,
} from '@/stores'
import { AssignmentNotesCard } from '../components/AssignmentNotesCard'
import { AssignmentSnapshotDialog } from '../components/AssignmentSnapshotDialog'
import { AssignmentTreeGrid } from '../components/AssignmentTreeGrid'
import { MemberProjectAssignmentGrid } from '../components/MemberProjectAssignmentGrid'
import { MemberSummaryGrid } from '../components/MemberSummaryGrid'
import {
  getMonthRangeFromSchedule,
  getScheduleMonthRange,
} from '../utils/assignment-utils'

export function AssignmentPage() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const fiscalYear = useAppStore((s) => s.fiscalYear)
  const fiscalYearStartMonth = useAppStore((s) => s.fiscalYearStartMonth)
  const projects = useProjectsStore((s) => s.projects)
  const loadProjects = useProjectsStore((s) => s.loadProjects)
  const getProjectTree = useProjectsStore((s) => s.getProjectTree)
  const members = useMembersStore((s) => s.members)
  const loadMembers = useMembersStore((s) => s.loadMembers)
  const assignments = useAssignmentStore((s) => s.assignments)
  const loadAssignments = useAssignmentStore((s) => s.loadAssignments)
  // 締め済み月の表示・編集ガード（P1-b）に締めイベントが必要
  const loadActualsData = useActualsStore((s) => s.loadActualsData)
  const entries = useScheduleStore((s) => s.entries)
  const loadSchedule = useScheduleStore((s) => s.loadSchedule)
  const efforts = useEffortsStore((s) => s.efforts)
  const loadEfforts = useEffortsStore((s) => s.loadEfforts)
  const wbsSettingsEntries = useWbsSettingsStore((s) => s.entries)
  const getWbsSettings = useWbsSettingsStore((s) => s.getSettings)
  const loadTeam = useTeamStore((s) => s.loadTeam)

  const topLevelProjects = useMemo(
    () => projects.filter((p) => p.level === 0),
    [projects],
  )

  // クエリパラメータ（?projectId=xxx）を優先し、location.stateへフォールバックする
  // （NFR-004: WBS/スケジュール/アサインの3画面で優先順位を統一。
  // アサイン画面は従来location.stateの受け皿を持たなかったため今回新規対応）。
  // projects storeはjsonStorageからloadProjects()で非同期的（useEffect経由）に読み込まれるため、
  // マウント時点のuseState初期化子ではtopLevelProjectsが常に空でバリデーションに失敗する
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
  // 実績モード（非公開の設計文書）。既定は計画の表示・編集
  const [showActual, setShowActual] = useState(false)
  const [snapshotDialogOpen, setSnapshotDialogOpen] = useState(false)

  // 体制メモ・スナップショット
  const assignmentNotes = useAssignmentNoteStore((s) => s.assignmentNotes)
  const assignmentSnapshots = useAssignmentNoteStore(
    (s) => s.assignmentSnapshots,
  )
  const loadAssignmentNotes = useAssignmentNoteStore(
    (s) => s.loadAssignmentNotes,
  )
  const addNote = useAssignmentNoteStore((s) => s.addNote)
  const updateNote = useAssignmentNoteStore((s) => s.updateNote)
  const deleteNote = useAssignmentNoteStore((s) => s.deleteNote)
  const takeSnapshot = useAssignmentNoteStore((s) => s.takeSnapshot)
  const deleteSnapshot = useAssignmentNoteStore((s) => s.deleteSnapshot)
  const [summarySelectedMemberIds, setSummarySelectedMemberIds] = useState<
    Set<string>
  >(() => new Set())
  const [summaryFiscalYear, setSummaryFiscalYear] = useState(fiscalYear)

  const handleMemberSelectionChange = useCallback((ids: Set<string>) => {
    setSummarySelectedMemberIds(ids)
  }, [])

  const handleFiscalYearChange = useCallback((year: number) => {
    setSummaryFiscalYear(year)
  }, [])

  //  FR-008: MemberProjectAssignmentGridのプロジェクト行クリック
  // →画面上部のプロジェクトセレクタと連動して選択状態を切り替える（双方向連携）
  const handleProjectSelect = useCallback((projectId: string) => {
    setSelectedProjectId(projectId)
  }, [])

  useEffect(() => {
    loadProjects()
    loadMembers()
    loadAssignments()
    loadSchedule()
    loadEfforts()
    loadTeam()
    loadActualsData()
    loadAssignmentNotes()
  }, [
    loadProjects,
    loadMembers,
    loadAssignments,
    loadAssignmentNotes,
    loadSchedule,
    loadEfforts,
    loadTeam,
    loadActualsData,
  ])

  // projectsストアのロード完了後、クエリパラメータ/location.state由来の初期選択候補を
  // 一度だけ反映する（topLevelProjectsに実在する場合のみ）
  useEffect(() => {
    if (
      !selectedProjectId &&
      initialProjectIdCandidate &&
      topLevelProjects.some((p) => p.id === initialProjectIdCandidate)
    ) {
      setSelectedProjectId(initialProjectIdCandidate)
    }
  }, [topLevelProjects, selectedProjectId, initialProjectIdCandidate])

  // Collect all descendant project IDs for the selected project
  const selectedProjectDescendantIds = useMemo(() => {
    if (!selectedProjectId) return new Set<string>()
    const ids = new Set<string>([selectedProjectId])
    for (const p of projects) {
      if (p.parentId && ids.has(p.parentId)) {
        ids.add(p.id)
      }
    }
    return ids
  }, [selectedProjectId, projects])

  // Editing grid: month columns derived from selected project's schedule entries (including descendants)
  const projectScheduleEntries = useMemo(
    () => entries.filter((e) => selectedProjectDescendantIds.has(e.projectId)),
    [entries, selectedProjectDescendantIds],
  )

  const editingMonthKeys = useMemo(
    () => getMonthRangeFromSchedule(projectScheduleEntries),
    [projectScheduleEntries],
  )

  // Summary grid: fiscal year 12-month range
  const summaryMonthKeys = useMemo(
    () => getScheduleMonthRange(fiscalYear, fiscalYearStartMonth),
    [fiscalYear, fiscalYearStartMonth],
  )

  // MemberProjectAssignmentGrid 用: サマリーグリッドの年度に連動
  const memberProjectMonthKeys = useMemo(
    () => getScheduleMonthRange(summaryFiscalYear, fiscalYearStartMonth),
    [summaryFiscalYear, fiscalYearStartMonth],
  )

  // 1名選択時のメンバー情報
  const singleSelectedMember = useMemo(() => {
    if (summarySelectedMemberIds.size !== 1) return null
    const memberId = [...summarySelectedMemberIds][0]
    return members.find((m) => m.id === memberId) ?? null
  }, [summarySelectedMemberIds, members])

  // biome-ignore lint/correctness/useExhaustiveDependencies: getProjectTree内部でprojectsを参照するため、projectsの変更をトリガーにする
  const fullTree = useMemo(() => getProjectTree(), [projects])

  const filteredTree = useMemo(() => {
    if (!selectedProjectId) return []
    return fullTree.filter((node) => node.id === selectedProjectId)
  }, [fullTree, selectedProjectId])

  // タスクごとのWBS工数小計（人日）を計算
  const wbsSettings = useMemo(
    () => (selectedProjectId ? getWbsSettings(selectedProjectId) : undefined),
    [wbsSettingsEntries, selectedProjectId, getWbsSettings],
  )
  const taskEffortSubtotals = useMemo(() => {
    if (!wbsSettings) return new Map<string, number>()
    const enabledCols = wbsSettings.effortColumns
      .filter((c) => c.enabled)
      .sort((a, b) => a.order - b.order)
    const colIds = enabledCols.map((c) => c.id)
    if (colIds.length === 0 || filteredTree.length === 0)
      return new Map<string, number>()

    const displayValues = computeEffortDisplayValues(
      filteredTree,
      colIds,
      efforts,
    )
    const subtotals = new Map<string, number>()
    // 全ノードのIDを収集
    function collectIds(nodes: typeof filteredTree): string[] {
      const ids: string[] = []
      for (const n of nodes) {
        ids.push(n.id)
        ids.push(...collectIds(n.children))
      }
      return ids
    }
    for (const taskId of collectIds(filteredTree)) {
      let sum = 0
      for (const colId of colIds) {
        sum += displayValues.get(`${taskId}:${colId}`) ?? 0
      }
      subtotals.set(taskId, sum)
    }
    return subtotals
  }, [filteredTree, wbsSettings, efforts])

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )
  const notesForProject = useMemo(
    () =>
      assignmentNotes
        .filter((n) => n.projectId === selectedProjectId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [assignmentNotes, selectedProjectId],
  )
  const snapshotsForProject = useMemo(
    () =>
      assignmentSnapshots
        .filter((s) => s.projectId === selectedProjectId)
        .sort((a, b) => b.takenAt.localeCompare(a.takenAt)),
    [assignmentSnapshots, selectedProjectId],
  )
  const taskLabelOf = useCallback(
    (taskId: string) => {
      const task = projects.find((p) => p.id === taskId)
      return task ? `${task.code} ${task.name}` : taskId
    },
    [projects],
  )
  const memberLabelOf = useCallback(
    (memberId: string) =>
      members.find((m) => m.id === memberId)?.name ?? '(削除済み)',
    [members],
  )

  const projectAssignments = useMemo(
    () => assignments.filter((a) => a.projectId === selectedProjectId),
    [assignments, selectedProjectId],
  )

  // Check if selected project has schedule entries
  const hasScheduleEntries = useMemo(() => {
    if (!selectedProjectId) return false
    return entries.some((e) => e.projectId === selectedProjectId)
  }, [entries, selectedProjectId])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">アサイン</h1>
          <p className="text-sm text-muted-foreground">
            プロジェクトごとのタスク別担当者アサインと月次配分（人月）を管理します。1担当者あたりのアサイン上限は1.00人月/月です。
          </p>
        </div>
        <span className="text-sm text-muted-foreground">
          {fiscalYear}年度（{fiscalYear}年{fiscalYearStartMonth}月〜
          {fiscalYearStartMonth === 1 ? fiscalYear : fiscalYear + 1}年
          {fiscalYearStartMonth === 1 ? 12 : fiscalYearStartMonth - 1}
          月）
        </span>
      </div>

      {/* Member summary (cross-project, full fiscal year) */}
      <div data-tour="assignment-member-summary">
        <MemberSummaryGrid
          monthColumns={summaryMonthKeys}
          assignments={assignments}
          members={members}
          projects={projects}
          fiscalYear={fiscalYear}
          fiscalYearStartMonth={fiscalYearStartMonth}
          onMemberSelectionChange={handleMemberSelectionChange}
          onFiscalYearChange={handleFiscalYearChange}
        />
      </div>

      {/* Member-Project Assignment Grid: サマリーで1名選択時のみ表示 */}
      {singleSelectedMember && (
        <div>
          <MemberProjectAssignmentGrid
            memberId={singleSelectedMember.id}
            memberName={singleSelectedMember.name}
            capacityRatio={singleSelectedMember.capacityRatio}
            monthColumns={memberProjectMonthKeys}
            assignments={assignments}
            projects={projects}
            onProjectSelect={handleProjectSelect}
          />
        </div>
      )}

      {/* Project selector */}
      <div
        data-tour="assignment-project-selector"
        className="flex items-center gap-4"
      >
        <span className="text-sm font-medium">対象プロジェクト</span>
        <Combobox
          value={selectedProjectId}
          onValueChange={setSelectedProjectId}
          options={topLevelProjects.map((p) => ({
            value: p.id,
            label: `${p.code} - ${p.name}（${p.confidence ?? '未設定'}）`,
          }))}
          placeholder="プロジェクトを選択してください"
          searchPlaceholder="プロジェクトを検索..."
          className="w-[480px]"
        />
      </div>

      {/* Assignment grid */}
      {!selectedProjectId && (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          プロジェクトを選択してください
        </div>
      )}

      {selectedProjectId && !hasScheduleEntries && (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          このプロジェクトにはスケジュールが設定されていません。先にスケジュール画面でスケジュールを設定してください。
        </div>
      )}

      {selectedProjectId && hasScheduleEntries && filteredTree.length === 0 && (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          選択したプロジェクトにタスクがありません。先にWBSでタスクを追加してください。
        </div>
      )}

      {selectedProjectId && hasScheduleEntries && filteredTree.length > 0 && (
        <Card data-tour="assignment-grid">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>
                タスク別アサイン -{' '}
                {topLevelProjects.find((p) => p.id === selectedProjectId)
                  ?.name ?? ''}
              </CardTitle>
              {/* 実績モード（非公開の設計文書）。既定は計画の表示・編集で、
                  計画と違った月だけ実績を入力する運用を想定する（無操作＝計画どおり） */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={showActual ? 'outline' : 'default'}
                  onClick={() => setShowActual(false)}
                >
                  計画
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={showActual ? 'default' : 'outline'}
                  onClick={() => setShowActual(true)}
                >
                  実績
                </Button>
              </div>
            </div>
            {showActual && (
              <p className="text-xs text-muted-foreground">
                実績モードです。計画と違った月だけ入力してください（未入力の月は計画どおりとして扱われ、EVMのACに反映されます）
              </p>
            )}
          </CardHeader>
          <CardContent>
            <AssignmentTreeGrid
              projectId={selectedProjectId}
              tree={filteredTree}
              assignments={projectAssignments}
              members={members}
              monthKeys={editingMonthKeys}
              taskEffortSubtotals={taskEffortSubtotals}
              scheduleEntries={entries}
              showActual={showActual}
            />
          </CardContent>
        </Card>
      )}

      {/* 体制メモ。アサインは外部ツールに無い本ツール固有のデータのため、
          「なぜこの配分か」の申し送りをここに残す */}
      {selectedProjectId && (
        <AssignmentNotesCard
          notes={notesForProject}
          headerAction={
            /* スナップショットはアサイン表グリッドの表示条件（スケジュール登録済み）に
               依存させない。記録の閲覧はグリッドが出せない状態でも行えるべきため */
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => setSnapshotDialogOpen(true)}
            >
              <Camera className="h-4 w-4" />
              スナップショット
              {snapshotsForProject.length > 0 && (
                <span className="ml-1 rounded-full bg-muted px-1.5 text-xs">
                  {snapshotsForProject.length}
                </span>
              )}
            </Button>
          }
          onAdd={(body) => addNote(selectedProjectId, body)}
          onUpdate={updateNote}
          onDelete={deleteNote}
        />
      )}

      {selectedProject && (
        <AssignmentSnapshotDialog
          open={snapshotDialogOpen}
          onOpenChange={setSnapshotDialogOpen}
          projectId={selectedProject.id}
          projectName={selectedProject.name}
          snapshots={snapshotsForProject}
          assignments={assignments}
          taskLabelOf={taskLabelOf}
          memberLabelOf={memberLabelOf}
          onTake={(label) =>
            takeSnapshot({
              projectId: selectedProject.id,
              label,
              assignments,
            })
          }
          onDelete={deleteSnapshot}
        />
      )}
    </div>
  )
}
