import { Settings } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/shared/components/ui/button'
import { Combobox } from '@/shared/components/ui/combobox'
import type { DependencyType } from '@/shared/types/schedule'
import { createDefaultPhaseSettings } from '@/shared/types/schedule'
import { resolveInitialProjectId } from '@/shared/utils/navigation-utils'
import { calcPhaseProgress } from '@/shared/utils/task-phase-utils'
import {
  useEffortsStore,
  useProjectsStore,
  useScheduleSettingsStore,
  useScheduleStore,
  useWbsSettingsStore,
} from '@/stores'
import { ScheduleGantt } from '../components/ScheduleGantt'

export function SchedulePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const projects = useProjectsStore((s) => s.projects)
  const loadProjects = useProjectsStore((s) => s.loadProjects)
  const scheduleSettingsEntries = useScheduleSettingsStore((s) => s.entries)
  const getScheduleSettings = useScheduleSettingsStore((s) => s.getSettings)
  const reorderPhase = useScheduleSettingsStore((s) => s.reorderPhase)
  const loadSchedule = useScheduleStore((s) => s.loadSchedule)
  const entries = useScheduleStore((s) => s.entries)
  const dependencies = useScheduleStore((s) => s.dependencies)
  const upsertEntry = useScheduleStore((s) => s.upsertEntry)
  const addDependency = useScheduleStore((s) => s.addDependency)
  const deleteDependency = useScheduleStore((s) => s.deleteDependency)
  // ガントバーへWBS進捗をロールアップするための入力
  const efforts = useEffortsStore((s) => s.efforts)
  const loadEfforts = useEffortsStore((s) => s.loadEfforts)
  const wbsSettingsEntries = useWbsSettingsStore((s) => s.entries)
  const getWbsSettings = useWbsSettingsStore((s) => s.getSettings)

  // Filter to top-level projects only (level === 0)
  const topLevelProjects = useMemo(
    () => projects.filter((p) => p.level === 0),
    [projects],
  )

  // クエリパラメータ（?projectId=xxx）を優先し、location.stateへフォールバックする
  // （NFR-004: WBS/スケジュール/アサインの3画面で優先順位を統一）。
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

  // Load data on mount
  useEffect(() => {
    loadProjects()
    loadSchedule()
    loadEfforts()
  }, [loadProjects, loadSchedule, loadEfforts])

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

  // 案件別の工程設定
  const settings = useMemo(
    () =>
      selectedProjectId
        ? getScheduleSettings(selectedProjectId)
        : createDefaultPhaseSettings(),
    [scheduleSettingsEntries, getScheduleSettings, selectedProjectId],
  )

  // Enabled phases sorted by sortOrder
  const enabledPhases = useMemo(
    () =>
      [...settings.phases]
        .filter((p) => p.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [settings.phases],
  )

  // Entries and dependencies for selected project
  const projectEntries = useMemo(
    () => entries.filter((e) => e.projectId === selectedProjectId),
    [entries, selectedProjectId],
  )

  /**
   * ガントバーへ描く工程進捗の解決関数。
   * WBSの完了チェックを`Project.phaseKey`経由でロールアップする。
   * 工程にタスクが紐づいていない場合はnull＝進捗を描かない
   */
  const progressOf = useCallback(
    (phaseKey: string) => {
      if (!selectedProjectId) return null
      const columnIds = getWbsSettings(selectedProjectId)
        .effortColumns.filter((column) => column.enabled)
        .map((column) => column.id)
      return calcPhaseProgress(
        selectedProjectId,
        phaseKey,
        projects,
        columnIds,
        efforts,
      )
    },
    // wbsSettingsEntriesはgetWbsSettingsが内部で読む実データ（列設定の変更を反映するため）
    [selectedProjectId, projects, efforts, getWbsSettings, wbsSettingsEntries],
  )

  const projectDependencies = useMemo(
    () => dependencies.filter((d) => d.projectId === selectedProjectId),
    [dependencies, selectedProjectId],
  )

  // 日付変更ハンドラー
  const handleDateChange = useCallback(
    (phaseKey: string, startDate: string, endDate: string) => {
      if (!selectedProjectId) return
      if (startDate && endDate && startDate <= endDate) {
        upsertEntry(selectedProjectId, phaseKey, startDate, endDate)
      }
    },
    [selectedProjectId, upsertEntry],
  )

  // 行並び替えハンドラー
  const handleReorder = useCallback(
    (fromKey: string, toKey: string) => {
      if (!selectedProjectId) return
      reorderPhase(selectedProjectId, fromKey, toKey)
    },
    [selectedProjectId, reorderPhase],
  )

  // 依存関係追加ハンドラー
  const handleAddDependency = useCallback(
    (fromPhaseKey: string, toPhaseKey: string, type: DependencyType) => {
      if (!selectedProjectId) return
      addDependency(selectedProjectId, fromPhaseKey, toPhaseKey, type)
    },
    [selectedProjectId, addDependency],
  )

  // エントリ作成ハンドラー（ダブルクリック時）
  const handleCreateEntry = useCallback(
    (phaseKey: string, startDate: string, endDate: string) => {
      if (!selectedProjectId) return
      upsertEntry(selectedProjectId, phaseKey, startDate, endDate)
    },
    [selectedProjectId, upsertEntry],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">スケジュール</h1>
          <p className="text-sm text-muted-foreground">
            プロジェクトごとの工程スケジュールをガントチャートで管理します。
            タイムライン上のダブルクリック、または開始日・終了日セルのダブルクリックで工程バーを新規作成できます。
          </p>
        </div>
        <Button
          data-tour="schedule-settings"
          variant="ghost"
          size="icon"
          disabled={!selectedProjectId}
          onClick={() => navigate(`/schedule-settings/${selectedProjectId}`)}
          title="工程設定"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      {/* Project selector */}
      <div
        data-tour="schedule-project-selector"
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

      {!selectedProjectId && (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          プロジェクトを選択してください
        </div>
      )}

      {selectedProjectId && enabledPhases.length === 0 && (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          有効な工程がありません。工程設定画面で工程を有効にしてください。
        </div>
      )}

      {selectedProjectId && enabledPhases.length > 0 && (
        <div data-tour="schedule-gantt">
          <ScheduleGantt
            phases={enabledPhases}
            entries={projectEntries}
            dependencies={projectDependencies}
            progressOf={progressOf}
            onDateChange={handleDateChange}
            onReorder={handleReorder}
            onAddDependency={handleAddDependency}
            onDeleteDependency={deleteDependency}
            onCreateEntry={handleCreateEntry}
          />
        </div>
      )}
    </div>
  )
}
