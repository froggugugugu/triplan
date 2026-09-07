import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileUp,
  Lock,
  LockOpen,
  Plus,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent } from '@/shared/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { useToast } from '@/shared/hooks/use-toast'
import { hasPermission } from '@/shared/types'
import {
  useActualsStore,
  useAssignmentStore,
  useAuthStore,
  useBudgetStore,
  useMembersStore,
  useProjectsStore,
} from '@/stores'
import { AddUnplannedActualDialog } from '../components/AddUnplannedActualDialog'
import { CsvImportWizardDialog } from '../components/CsvImportWizardDialog'
import { MonthlyActualsGrid } from '../components/MonthlyActualsGrid'
import type { ImportPlan } from '../utils/csv-import-utils'
import {
  buildMonthlyActualsRows,
  formatMonthLabel,
  getDefaultTargetMonth,
  shiftMonthKey,
  summarizeMonthlyActuals,
} from '../utils/monthly-actuals-utils'

/**
 * 月次実績メンテナンス画面（P1-a。非公開の設計文書）。
 * 単月フォーカスで「選んだ月の実績を確認・修正して確定する」ことだけを行う。
 * 年間俯瞰・随時修正は既存のアサイン画面（計画/実績トグル）が引き続き担う。
 * 金額は一切表示しない（工数・人月のみ）。
 */
export function MonthlyActualsPage() {
  const { toast } = useToast()
  const assignments = useAssignmentStore((s) => s.assignments)
  const loadAssignments = useAssignmentStore((s) => s.loadAssignments)
  const updateActualMonthlyValue = useAssignmentStore(
    (s) => s.updateActualMonthlyValue,
  )
  const addActualEntry = useAssignmentStore((s) => s.addActualEntry)
  const members = useMembersStore((s) => s.members)
  const loadMembers = useMembersStore((s) => s.loadMembers)
  const projects = useProjectsStore((s) => s.projects)
  const loadProjects = useProjectsStore((s) => s.loadProjects)
  const monthlyActualsConfirmations = useActualsStore(
    (s) => s.monthlyActualsConfirmations,
  )
  const loadActualsData = useActualsStore((s) => s.loadActualsData)
  const confirmMonth = useActualsStore((s) => s.confirmMonth)
  const actualsImportLogs = useActualsStore((s) => s.actualsImportLogs)
  const addImportLog = useActualsStore((s) => s.addImportLog)
  const monthlyCloseEvents = useActualsStore((s) => s.monthlyCloseEvents)
  const closeMonthAction = useActualsStore((s) => s.closeMonth)
  const reopenMonthAction = useActualsStore((s) => s.reopenMonth)
  const workdaysPerMonth = useBudgetStore((s) => s.workdaysPerMonth)
  const hoursPerDay = useBudgetStore((s) => s.hoursPerDay)
  const loadBudgetData = useBudgetStore((s) => s.loadBudgetData)

  useEffect(() => {
    loadAssignments()
    loadMembers()
    loadProjects()
    loadActualsData()
    // CSV取込の単位換算（workdaysPerMonth/hoursPerDay）に必要
    loadBudgetData()
  }, [
    loadAssignments,
    loadMembers,
    loadProjects,
    loadActualsData,
    loadBudgetData,
  ])

  // 既定は「前月」（月初に先月分を確定する実務動線。DESIGN §4.3）
  const [month, setMonth] = useState(() => getDefaultTargetMonth(new Date()))
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [closeReason, setCloseReason] = useState('')
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false)
  const [reopenReason, setReopenReason] = useState('')

  // 締め・解除の実行権限（P1-b）。localモード=常時可（認証なし・単一ユーザー）、
  // postgresモード=governance:approve（admin/manager）。Layout.tsxのcanManageSettingsと同じ整理
  const currentUser = useAuthStore((s) => s.currentUser)
  const isLocalMode =
    (import.meta.env.VITE_STORAGE_MODE ?? 'local') !== 'postgres'
  const canGovern =
    isLocalMode ||
    (currentUser
      ? hasPermission(currentUser.role, 'governance:approve')
      : false)

  // 対象月の締め状態（月ごとの最新イベントから導出）。getState()経由の参照は
  // Biomeが依存として検出できないが、monthlyCloseEventsの変更での再計算は意図的
  // biome-ignore lint/correctness/useExhaustiveDependencies: isMonthClosedはmonthlyCloseEventsから導出される
  const isClosed = useMemo(
    () => useActualsStore.getState().isMonthClosed(month),
    [monthlyCloseEvents, month],
  )
  // biome-ignore lint/correctness/useExhaustiveDependencies: 同上
  const latestCloseEvent = useMemo(
    () => useActualsStore.getState().getLatestCloseEvent(month),
    [monthlyCloseEvents, month],
  )
  // CSV取込のドライランで締め済み月の行をスキップさせるための全締め月集合
  const closedMonths = useMemo(() => {
    const state = useActualsStore.getState()
    const closed = new Set<string>()
    for (const m of new Set(monthlyCloseEvents.map((e) => e.month))) {
      if (state.isMonthClosed(m)) closed.add(m)
    }
    return closed
  }, [monthlyCloseEvents])

  const rows = useMemo(
    () => buildMonthlyActualsRows(month, assignments, members, projects),
    [month, assignments, members, projects],
  )
  const summary = useMemo(() => summarizeMonthlyActuals(rows), [rows])

  const confirmation = useMemo(
    () => monthlyActualsConfirmations.find((c) => c.month === month),
    [monthlyActualsConfirmations, month],
  )

  const handleActualChange = useCallback(
    (assignmentId: string, value: number | null) => {
      updateActualMonthlyValue(assignmentId, month, value)
      // ソフトロック（DESIGN §2.2）: 確定済み月の編集は拒否せず、再確定を促す
      if (confirmation) {
        toast({
          title: '確定済みの月の実績を変更しました',
          description: '内容を確認のうえ、必要なら再確定してください',
        })
      }
    },
    [updateActualMonthlyValue, month, confirmation, toast],
  )

  const handleConfirm = useCallback(() => {
    confirmMonth(month)
    setConfirmDialogOpen(false)
    toast({ title: `${formatMonthLabel(month)}の実績を確定しました` })
  }, [confirmMonth, month, toast])

  const handleClose = useCallback(() => {
    closeMonthAction(month, closeReason)
    setCloseDialogOpen(false)
    setCloseReason('')
    toast({ title: `${formatMonthLabel(month)}を締めました` })
  }, [closeMonthAction, month, closeReason, toast])

  const handleReopen = useCallback(() => {
    reopenMonthAction(month, reopenReason)
    setReopenDialogOpen(false)
    setReopenReason('')
    toast({ title: `${formatMonthLabel(month)}の締めを解除しました` })
  }, [reopenMonthAction, month, reopenReason, toast])

  const recentCloseEvents = useMemo(
    () =>
      [...monthlyCloseEvents]
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .slice(0, 5),
    [monthlyCloseEvents],
  )

  // CSV取込の適用（DESIGN §5.2）。実績（actualMonthlyValues）へのみ書き込み、
  // 計画（monthlyValues）には一切書き込まない。取込履歴を追記する
  const handleImportApply = useCallback(
    (plan: ImportPlan, fileName: string) => {
      for (const c of plan.candidates) {
        if (c.assignmentId) {
          updateActualMonthlyValue(c.assignmentId, c.month, c.value)
        } else {
          addActualEntry(c.projectId, c.taskId, c.memberId, c.month, c.value)
        }
      }
      addImportLog({
        importedAt: new Date().toISOString(),
        fileName,
        targetMonths: plan.targetMonths,
        appliedCount: plan.candidates.length,
        skippedCount: plan.skips.length,
        // ログのskippedReasonsは100件上限（スキーマ契約）で打ち切る
        skippedReasons: plan.skips.slice(0, 100),
        note: null,
      })
      const confirmedTargets = plan.targetMonths.filter((m) =>
        monthlyActualsConfirmations.some((c) => c.month === m),
      )
      toast({
        title: `${plan.candidates.length}件の実績を取り込みました`,
        description:
          confirmedTargets.length > 0
            ? `確定済みの月（${confirmedTargets.join('、')}）が含まれます。内容を確認のうえ、必要なら再確定してください`
            : plan.skips.length > 0
              ? `${plan.skips.length}件をスキップしました（取込履歴を参照）`
              : undefined,
      })
    },
    [
      updateActualMonthlyValue,
      addActualEntry,
      addImportLog,
      monthlyActualsConfirmations,
      toast,
    ],
  )

  const recentImportLogs = useMemo(
    () =>
      [...actualsImportLogs]
        .sort((a, b) => b.importedAt.localeCompare(a.importedAt))
        .slice(0, 5),
    [actualsImportLogs],
  )

  const handleAddUnplanned = useCallback(
    (projectId: string, taskId: string, memberId: string, value: number) => {
      addActualEntry(projectId, taskId, memberId, month, value)
      toast({ title: '計画外の実績を追加しました' })
    },
    [addActualEntry, month, toast],
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">月次実績</h1>
        <p className="text-sm text-muted-foreground">
          選んだ月の実績（人月）を確認・修正して確定します。未入力の行は計画どおりとして扱われ、EVM・損益・月次明細に反映されます
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setMonth((m) => shiftMonthKey(m, -1))}
            title="前月"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input
            type="month"
            value={month}
            onChange={(e) => {
              if (e.target.value) setMonth(e.target.value)
            }}
            className="h-8 w-40"
            aria-label="対象月"
          />
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setMonth((m) => shiftMonthKey(m, 1))}
            title="翌月"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {isClosed ? (
          <Badge className="gap-1">
            <Lock className="h-3 w-3" />
            {latestCloseEvent?.occurredAt.slice(0, 10)} 締め済み
            {latestCloseEvent?.actorName
              ? `（${latestCloseEvent.actorName}）`
              : ''}
          </Badge>
        ) : confirmation ? (
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {confirmation.confirmedAt.slice(0, 10)} 確定済み
          </Badge>
        ) : (
          <Badge variant="outline">未確定</Badge>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportDialogOpen(true)}
          >
            <FileUp className="h-3.5 w-3.5" />
            CSV取込
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddDialogOpen(true)}
            disabled={isClosed}
          >
            <Plus className="h-3.5 w-3.5" />
            計画外の実績を追加
          </Button>
          <Button
            size="sm"
            onClick={() => setConfirmDialogOpen(true)}
            disabled={summary.totalRows === 0 || isClosed}
          >
            この月を確定
          </Button>
          {canGovern && !isClosed && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCloseDialogOpen(true)}
              disabled={summary.totalRows === 0}
            >
              <Lock className="h-3.5 w-3.5" />
              この月を締める
            </Button>
          )}
          {canGovern && isClosed && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReopenDialogOpen(true)}
            >
              <LockOpen className="h-3.5 w-3.5" />
              締めを解除
            </Button>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        対象 {summary.totalRows}行 ／ 計画どおり {summary.plannedRows}行 ／
        上書き {summary.overriddenRows}行
      </p>

      {isClosed && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <Lock className="h-4 w-4 shrink-0" />
          この月は締め済みです。実績・計画とも編集できません。修正が必要な場合は締めを解除してください（理由の記録が必要です）
        </div>
      )}

      {summary.totalRows === 0 ? (
        <Card>
          <CardContent>
            <p className="py-8 text-center text-muted-foreground">
              この月のアサインがありません。アサイン画面で計画を作成するか、「計画外の実績を追加」で実績を登録してください。
            </p>
          </CardContent>
        </Card>
      ) : (
        <MonthlyActualsGrid
          rows={rows}
          onActualChange={handleActualChange}
          readOnly={isClosed}
        />
      )}

      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {formatMonthLabel(month)}の実績を確定しますか？
            </DialogTitle>
            <DialogDescription>
              計画どおり{summary.plannedRows}行・上書き{summary.overriddenRows}
              行を、この月の実績として確定します。未入力の行は計画値がそのまま実績として扱われます（データは書き込まれません。後から計画を修正すると実績も連動します）。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button onClick={handleConfirm}>確定する</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {recentImportLogs.length > 0 && (
        <div className="space-y-1">
          <h2 className="text-sm font-medium">CSV取込履歴（直近5件）</h2>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {recentImportLogs.map((log) => (
              <li key={log.id}>
                {log.importedAt.slice(0, 10)} {log.fileName} — 対象月{' '}
                {log.targetMonths.join('、')} ／ 適用 {log.appliedCount}件 ／
                スキップ {log.skippedCount}件
                {log.skippedCount > 0 &&
                  `（${log.skippedReasons
                    .slice(0, 3)
                    .map((r) => `${r.row}行目: ${r.reason}`)
                    .join(
                      '、',
                    )}${log.skippedReasons.length > 3 ? ' ほか' : ''}）`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recentCloseEvents.length > 0 && (
        <div className="space-y-1">
          <h2 className="text-sm font-medium">締め・解除の履歴（直近5件）</h2>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {recentCloseEvents.map((event) => (
              <li key={event.id}>
                {event.occurredAt.slice(0, 10)} {formatMonthLabel(event.month)}
                を{event.action === 'close' ? '締め' : '解除'}
                {event.actorName ? `（${event.actorName}）` : ''}
                {event.reason ? ` — 理由: ${event.reason}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{formatMonthLabel(month)}を締めますか？</DialogTitle>
            <DialogDescription>
              締め済みの月は実績・計画とも編集できなくなります（アサイン画面・CSV取込を含む）。解除には理由の記録が必要です
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-sm" htmlFor="close-reason">
              理由（任意）
            </label>
            <Input
              id="close-reason"
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              placeholder="例: 10月分の支払確定"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleClose}>締める</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {formatMonthLabel(month)}の締めを解除しますか？
            </DialogTitle>
            <DialogDescription>
              解除すると実績・計画を再び編集できるようになります。「なぜ戻したか」を監査記録として必ず残すため、理由の入力が必要です
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-sm" htmlFor="reopen-reason">
              解除の理由<span className="text-destructive"> *</span>
            </label>
            <Textarea
              id="reopen-reason"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="例: 検収差戻しに伴う再集計のため"
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReopenDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleReopen}
              disabled={reopenReason.trim() === ''}
            >
              解除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddUnplannedActualDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        month={month}
        members={members}
        projects={projects}
        onAdd={handleAddUnplanned}
      />

      <CsvImportWizardDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        members={members}
        projects={projects}
        assignments={assignments}
        workdaysPerMonth={workdaysPerMonth}
        hoursPerDay={hoursPerDay}
        closedMonths={closedMonths}
        onApply={handleImportApply}
      />
    </div>
  )
}
