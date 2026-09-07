import { useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type { EffortEntry } from '@/shared/types/effort'
import type { Member } from '@/shared/types/member'
import type { ProjectTreeNode } from '@/shared/types/project'
import type { ProjectProgressEntry } from '@/shared/types/project-progress'
import type { ScheduleEntry } from '@/shared/types/schedule'
import {
  createDefaultWbsSettings,
  type WbsSettings,
} from '@/shared/types/wbs-settings'
import {
  calcProjectEstimateBudget,
  getFiscalYearMonthKeys,
  WORKDAYS_PER_MONTH,
} from '@/shared/utils/budget-utils'
import { computeProjectTotalEffort } from '@/shared/utils/effort-utils'
import { calcEvmSeries, getFiscalYearWeekKeys } from '@/shared/utils/evm-utils'
import { hasAnyCompletedTask } from '@/shared/utils/wbs-progress-utils'
import { EvmLineChart, formatWeekLabel } from './EvmLineChart'
import { ProjectResourceHistogram } from './ProjectResourceHistogram'

interface ProjectEvmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: ProjectTreeNode | null
  scheduleEntries: ScheduleEntry[]
  progressEntries: ProjectProgressEntry[]
  assignments: AssignmentEntry[]
  members: Member[]
  efforts: EffortEntry[]
  settingsMap: Record<string, WbsSettings>
  estimatedUnitPrice: number
  // 人月換算の1人月あたり人日（P0-a設定化）。省略時は従来の固定値20
  workdaysPerMonth?: number
  coefficient: number
  fiscalYear: number
  startMonth: number
}

/**
 * プロジェクト一覧（`ProjectsPage.tsx`）から個別プロジェクトのEVM（PV/EV/AC）を確認する
 * 単一プロジェクト用ダイアログ（FR-014）。
 *
 * 部門文脈・書き込み操作を持つ`EvmPanel`（`shared/components/EvmPanel.tsx`）とは別の
 * 読み取り専用コンポーネントとして新規実装する。算出ロジックは`shared/utils/evm-utils.ts`の
 * `calcEvmSeries`をそのまま利用し、既存実装との計算結果の不一致を防ぐ
 * （`features/budget`は一切importしない。依存方向ルール遵守）。
 * オプトアウト条件（`ScheduleEntry`/`ProjectProgressEntry`が1件も無い場合の案内表示）は
 * `EvmPanel`が使う`isEvmInputEligible`/`isEvmChartEligible`と同一の判定基準
 * （スケジュール登録済み・進捗率入力済み）を踏襲するが、本ダイアログは常に単一の
 * 特定プロジェクトを対象にするため、部門一致判定（`selectedDivisionId`引数）は不要であり、
 * それらの関数をそのまま呼び出さず同一条件をインラインで再現する。
 */
export function ProjectEvmDialog({
  open,
  onOpenChange,
  project,
  scheduleEntries,
  progressEntries,
  assignments,
  members,
  efforts,
  settingsMap,
  estimatedUnitPrice,
  workdaysPerMonth = WORKDAYS_PER_MONTH,
  coefficient,
  fiscalYear,
  startMonth,
}: ProjectEvmDialogProps) {
  const projectScheduleEntries = useMemo(
    () =>
      project ? scheduleEntries.filter((e) => e.projectId === project.id) : [],
    [scheduleEntries, project],
  )
  const hasSchedule = projectScheduleEntries.length > 0

  const progressEntry = useMemo(
    () => progressEntries.find((e) => e.projectId === project?.id),
    [progressEntries, project],
  )
  // EVは週次の手入力が無くてもWBSの完了チェック（completedAt）から工数加重で導出できる
  // （非公開の設計文書）。どちらも無い案件のみ案内表示に切り替える
  const hasEvSource = useMemo(
    () =>
      Boolean(progressEntry) ||
      (project ? hasAnyCompletedTask(project) : false),
    [progressEntry, project],
  )

  const weekKeys = useMemo(
    () => getFiscalYearWeekKeys(fiscalYear, startMonth),
    [fiscalYear, startMonth],
  )

  const monthKeys = useMemo(
    () => getFiscalYearMonthKeys(fiscalYear, startMonth),
    [fiscalYear, startMonth],
  )

  const seriesData = useMemo(() => {
    if (!project || !hasSchedule || !hasEvSource) return []
    const settings = settingsMap[project.id] ?? createDefaultWbsSettings()
    const columnIds = settings.effortColumns
      .filter((c) => c.enabled)
      .map((c) => c.id)
    const totalEffortDays =
      computeProjectTotalEffort([project], columnIds, efforts).get(
        project.id,
      ) ?? 0
    const totalEffortMonths = totalEffortDays / workdaysPerMonth
    const budgetTotal = calcProjectEstimateBudget(
      totalEffortMonths,
      estimatedUnitPrice,
      coefficient,
    )
    return calcEvmSeries({
      weekKeys,
      projectId: project.id,
      scheduleEntries,
      weeklyProgress: progressEntry?.weeklyProgress ?? {},
      assignments,
      members,
      budgetTotal,
      wbsSource: { node: project, columnIds, efforts },
    }).map((point) => ({ ...point, weekLabel: formatWeekLabel(point.week) }))
  }, [
    project,
    hasSchedule,
    hasEvSource,
    settingsMap,
    efforts,
    estimatedUnitPrice,
    workdaysPerMonth,
    coefficient,
    weekKeys,
    scheduleEntries,
    progressEntry,
    assignments,
    members,
  ])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            EVM（計画・出来高・実コスト） - {project?.name ?? ''}
          </DialogTitle>
        </DialogHeader>

        {!hasSchedule && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            スケジュールが未設定のためEVM対象外です。先にスケジュール画面で工程期間を設定してください。
          </p>
        )}

        {hasSchedule && !hasEvSource && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            進捗がまだ記録されていません。WBS画面でタスクに完了チェックを入れるか、ダッシュボードのEVMパネルから週次の進捗率を記録すると、ここにグラフが表示されます。
          </p>
        )}

        {hasSchedule && hasEvSource && <EvmLineChart data={seriesData} />}

        {/* 案件内の要員山積み（非公開の設計文書）。
            PV曲線と同じアサイン計画データの別表現で、立ち上がり・ピーク・収束の形が見える */}
        {project && (
          <div className="space-y-1 border-t border-border pt-4">
            <p className="text-sm font-medium">要員の山積み（月×メンバー）</p>
            <ProjectResourceHistogram
              projectId={project.id}
              assignments={assignments}
              members={members}
              monthKeys={monthKeys}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
