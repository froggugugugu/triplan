import { FileSpreadsheet } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { CsvMappingExportDialog } from '@/shared/components/CsvMappingExportDialog'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { NumericInput } from '@/shared/components/ui/numeric-input'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/ui/tabs'
import { useToast } from '@/shared/hooks/use-toast'
import {
  BILLING_MILESTONE_STATUS_LABELS,
  type BillingMilestoneStatus,
  type ChangeRequestDeltaType,
  type ChangeRequestStatus,
} from '@/shared/types'
import { manYenFormatter } from '@/shared/utils/budget-utils'
import {
  BILLING_SOURCE,
  buildBillingRows,
} from '@/shared/utils/csv-mapping-utils'
import { formatDateOnly } from '@/shared/utils/iso-week-utils'
import {
  useBillingMilestoneStore,
  useChangeRequestStore,
  useProjectsStore,
} from '@/stores'
import {
  calcBillingAllocationGap,
  calcBillingTotals,
  calcOrderBacklog,
} from '../utils/billing-milestone-utils'

interface ProjectCommerceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 対象のトップレベル案件ID。CR承認で受注額が変わるため、Projectはストアから都度解決する */
  projectId: string | null
}

const CR_STATUS_LABELS: Record<ChangeRequestStatus, string> = {
  pending: '申請中',
  approved: '承認済',
  rejected: '却下',
}

/**
 * 商流管理ダイアログ（非公開の設計文書/§4.4）。
 * 請求マイルストン（検収→請求→入金の追跡・売上計上・受注残）と
 * 変更管理（受注額・工数・納期の変更履歴と承認）を1つのダイアログに集約する。
 * ProjectsPageの行アイコンから起動する。
 */
export function ProjectCommerceDialog({
  open,
  onOpenChange,
  projectId,
}: ProjectCommerceDialogProps) {
  const { toast } = useToast()
  const projects = useProjectsStore((s) => s.projects)
  const project = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId],
  )

  const billingMilestones = useBillingMilestoneStore((s) => s.billingMilestones)
  const [csvExportOpen, setCsvExportOpen] = useState(false)
  const addBillingMilestone = useBillingMilestoneStore(
    (s) => s.addBillingMilestone,
  )
  const updateBillingMilestoneStatus = useBillingMilestoneStore(
    (s) => s.updateBillingMilestoneStatus,
  )
  const deleteBillingMilestone = useBillingMilestoneStore(
    (s) => s.deleteBillingMilestone,
  )

  const changeRequests = useChangeRequestStore((s) => s.changeRequests)
  const addChangeRequest = useChangeRequestStore((s) => s.addChangeRequest)
  const approveChangeRequest = useChangeRequestStore(
    (s) => s.approveChangeRequest,
  )
  const rejectChangeRequest = useChangeRequestStore(
    (s) => s.rejectChangeRequest,
  )
  const deleteChangeRequest = useChangeRequestStore(
    (s) => s.deleteChangeRequest,
  )

  const projectMilestones = useMemo(
    () =>
      billingMilestones
        .filter((m) => m.projectId === projectId)
        .sort((a, b) =>
          a.plannedAcceptanceDate < b.plannedAcceptanceDate ? -1 : 1,
        ),
    [billingMilestones, projectId],
  )
  const projectChangeRequests = useMemo(
    () =>
      changeRequests
        .filter((c) => c.projectId === projectId)
        .sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1)),
    [changeRequests, projectId],
  )

  const totals = useMemo(
    () => calcBillingTotals(projectMilestones),
    [projectMilestones],
  )
  const allocationGap = calcBillingAllocationGap(
    project?.contractAmount,
    totals.allocatedTotal,
  )
  const backlog = calcOrderBacklog(
    project?.contractAmount,
    totals.recognizedTotal,
  )

  // ── 請求マイルストン追加フォーム ──
  const [milestoneLabel, setMilestoneLabel] = useState('')
  const [milestoneAmount, setMilestoneAmount] = useState(0)
  const [milestoneDate, setMilestoneDate] = useState('')

  const handleAddMilestone = useCallback(() => {
    if (!projectId) return
    const label = milestoneLabel.trim()
    if (!label || !milestoneDate) {
      toast({
        title: 'マイルストン名と検収予定日を入力してください',
        variant: 'destructive',
      })
      return
    }
    addBillingMilestone({
      projectId,
      label,
      amount: milestoneAmount,
      plannedAcceptanceDate: milestoneDate,
      status: 'planned',
    })
    setMilestoneLabel('')
    setMilestoneAmount(0)
    setMilestoneDate('')
    toast({ title: '請求マイルストンを追加しました' })
  }, [
    projectId,
    milestoneLabel,
    milestoneAmount,
    milestoneDate,
    addBillingMilestone,
    toast,
  ])

  // ── 変更管理追加フォーム ──
  const [crTitle, setCrTitle] = useState('')
  const [crAmountDelta, setCrAmountDelta] = useState(0)
  const [crAmountDeltaType, setCrAmountDeltaType] =
    useState<ChangeRequestDeltaType>('increase')
  const [crEffortDelta, setCrEffortDelta] = useState(0)
  const [crEffortDeltaType, setCrEffortDeltaType] =
    useState<ChangeRequestDeltaType>('increase')
  const [crNewDueDate, setCrNewDueDate] = useState('')

  const handleAddChangeRequest = useCallback(() => {
    if (!projectId) return
    const title = crTitle.trim()
    if (!title) {
      toast({
        title: '変更内容の表題を入力してください',
        variant: 'destructive',
      })
      return
    }
    addChangeRequest({
      projectId,
      title,
      requestedAt: formatDateOnly(new Date()),
      contractAmountDelta: crAmountDelta,
      contractAmountDeltaType: crAmountDeltaType,
      effortDeltaDays: crEffortDelta,
      effortDeltaType: crEffortDeltaType,
      newDueDate: crNewDueDate || null,
    })
    setCrTitle('')
    setCrAmountDelta(0)
    setCrEffortDelta(0)
    setCrNewDueDate('')
    toast({ title: '変更申請を追加しました' })
  }, [
    projectId,
    crTitle,
    crAmountDelta,
    crAmountDeltaType,
    crEffortDelta,
    crEffortDeltaType,
    crNewDueDate,
    addChangeRequest,
    toast,
  ])

  const handleApprove = useCallback(
    (id: string) => {
      approveChangeRequest(id)
      toast({
        title: '変更を承認しました',
        description:
          '受注額・マスター納期へ反映しました。工数差分はWBSへ手動で反映し、ベースラインを再凍結してください',
      })
    },
    [approveChangeRequest, toast],
  )

  const deltaLabel = (
    amount: number,
    type: ChangeRequestDeltaType,
    unit: string,
  ) =>
    amount > 0 ? `${type === 'decrease' ? '−' : '＋'}${amount}${unit}` : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>商流管理 — {project?.name ?? ''}</DialogTitle>
        </DialogHeader>

        {/* 受注情報サマリー */}
        <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">受注金額</dt>
            <dd className="text-right font-bold tabular-nums">
              {(project?.contractAmount ?? 0) > 0
                ? `${manYenFormatter.format(project?.contractAmount ?? 0)} 万円`
                : '未設定'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">契約形態</dt>
            <dd className="text-right">{project?.contractType ?? '未設定'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">マスター納期</dt>
            <dd className="text-right tabular-nums">
              {project?.masterDueDate ?? '未設定'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">受注残</dt>
            <dd className="text-right font-bold tabular-nums">
              {backlog !== null
                ? `${manYenFormatter.format(backlog)} 万円`
                : '—'}
            </dd>
          </div>
        </dl>

        <Tabs defaultValue="billing">
          <TabsList>
            <TabsTrigger value="billing">請求マイルストン</TabsTrigger>
            <TabsTrigger value="change">変更管理</TabsTrigger>
          </TabsList>

          <TabsContent value="billing" className="space-y-3">
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                disabled={projectMilestones.length === 0}
                onClick={() => setCsvExportOpen(true)}
                title="請求書発行サービス・会計ソフトの取込レイアウトに合わせて列をマッピングしてCSV出力します"
              >
                <FileSpreadsheet className="h-4 w-4" />
                請求データをCSV出力
              </Button>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span>
                配分合計:{' '}
                <b className="tabular-nums">
                  {manYenFormatter.format(totals.allocatedTotal)}
                </b>{' '}
                万円
              </span>
              <span>
                売上計上（検収済以降）:{' '}
                <b className="tabular-nums">
                  {manYenFormatter.format(totals.recognizedTotal)}
                </b>{' '}
                万円
              </span>
              <span>
                入金済:{' '}
                <b className="tabular-nums">
                  {manYenFormatter.format(totals.paidTotal)}
                </b>{' '}
                万円
              </span>
            </div>
            {allocationGap !== null && allocationGap !== 0 && (
              <p className="text-sm text-destructive">
                配分合計が受注金額と一致していません（
                {allocationGap > 0
                  ? `${manYenFormatter.format(allocationGap)} 万円の配分超過`
                  : `${manYenFormatter.format(-allocationGap)} 万円が未配分`}
                ）
              </p>
            )}

            {projectMilestones.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">
                請求マイルストンがまだありません。受注額を検収時期に分割して登録すると、売上計上・入金予定・受注残を追跡できます
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-1.5 pr-2">検収予定日</th>
                    <th className="py-1.5 pr-2">名称</th>
                    <th className="py-1.5 pr-2 text-right">金額(万円)</th>
                    <th className="py-1.5 pr-2">ステータス</th>
                    <th className="py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {projectMilestones.map((milestone) => (
                    <tr key={milestone.id} className="border-b border-border">
                      <td className="py-1.5 pr-2 tabular-nums">
                        {milestone.plannedAcceptanceDate}
                      </td>
                      <td className="py-1.5 pr-2">{milestone.label}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {manYenFormatter.format(milestone.amount)}
                      </td>
                      <td className="py-1.5 pr-2">
                        <select
                          aria-label={`${milestone.label}のステータス`}
                          className="h-7 rounded border border-border bg-background px-1 text-sm"
                          value={milestone.status}
                          onChange={(e) =>
                            updateBillingMilestoneStatus(
                              milestone.id,
                              e.target.value as BillingMilestoneStatus,
                            )
                          }
                        >
                          {(
                            Object.entries(BILLING_MILESTONE_STATUS_LABELS) as [
                              BillingMilestoneStatus,
                              string,
                            ][]
                          ).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1.5 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteBillingMilestone(milestone.id)}
                        >
                          削除
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
              <div className="space-y-1">
                <Label htmlFor="milestone-label" className="text-xs">
                  名称
                </Label>
                <Input
                  id="milestone-label"
                  className="w-44"
                  value={milestoneLabel}
                  onChange={(e) => setMilestoneLabel(e.target.value)}
                  placeholder="中間金 / 検収時 等"
                  maxLength={200}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="milestone-date" className="text-xs">
                  検収予定日
                </Label>
                <Input
                  id="milestone-date"
                  type="date"
                  className="w-40"
                  value={milestoneDate}
                  onChange={(e) => setMilestoneDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="milestone-amount" className="text-xs">
                  金額（万円）
                </Label>
                <NumericInput
                  id="milestone-amount"
                  className="w-28"
                  value={milestoneAmount}
                  onValueChange={setMilestoneAmount}
                />
              </div>
              <Button type="button" size="sm" onClick={handleAddMilestone}>
                追加
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="change" className="space-y-3">
            {projectChangeRequests.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">
                変更申請がまだありません。追加要望・契約変更を記録すると、受注額・納期がなぜ動いたかを後から追跡できます
              </p>
            ) : (
              <ul className="space-y-2">
                {projectChangeRequests.map((changeRequest) => {
                  const deltas = [
                    deltaLabel(
                      changeRequest.contractAmountDelta,
                      changeRequest.contractAmountDeltaType,
                      '万円',
                    ),
                    deltaLabel(
                      changeRequest.effortDeltaDays,
                      changeRequest.effortDeltaType,
                      '人日',
                    ),
                    changeRequest.newDueDate
                      ? `納期→${changeRequest.newDueDate}`
                      : null,
                  ].filter((d): d is string => d !== null)
                  return (
                    <li
                      key={changeRequest.id}
                      className="rounded border border-border p-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={
                            changeRequest.status === 'approved'
                              ? 'rounded bg-[#71c598]/25 px-1.5 py-0.5 text-xs font-bold'
                              : changeRequest.status === 'rejected'
                                ? 'rounded bg-muted px-1.5 py-0.5 text-xs font-bold text-muted-foreground'
                                : 'rounded bg-[#ffd43d]/25 px-1.5 py-0.5 text-xs font-bold'
                          }
                        >
                          {CR_STATUS_LABELS[changeRequest.status]}
                        </span>
                        <span className="font-medium">
                          {changeRequest.title}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          申請 {changeRequest.requestedAt}
                          {changeRequest.decidedAt
                            ? ` ／ 決定 ${changeRequest.decidedAt}`
                            : ''}
                        </span>
                      </div>
                      {deltas.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                          {deltas.join(' ／ ')}
                        </p>
                      )}
                      {changeRequest.status === 'pending' && (
                        <div className="mt-1.5 flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleApprove(changeRequest.id)}
                          >
                            承認
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              rejectChangeRequest(changeRequest.id)
                            }
                          >
                            却下
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              deleteChangeRequest(changeRequest.id)
                            }
                          >
                            削除
                          </Button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="space-y-2 border-t border-border pt-3">
              <div className="space-y-1">
                <Label htmlFor="cr-title" className="text-xs">
                  変更内容
                </Label>
                <Input
                  id="cr-title"
                  value={crTitle}
                  onChange={(e) => setCrTitle(e.target.value)}
                  placeholder="追加画面3本の開発 等"
                  maxLength={200}
                />
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="cr-amount-type" className="text-xs">
                    受注額
                  </Label>
                  <div className="flex gap-1">
                    <select
                      id="cr-amount-type"
                      className="h-9 rounded border border-border bg-background px-1 text-sm"
                      value={crAmountDeltaType}
                      onChange={(e) =>
                        setCrAmountDeltaType(
                          e.target.value as ChangeRequestDeltaType,
                        )
                      }
                    >
                      <option value="increase">増額</option>
                      <option value="decrease">減額</option>
                    </select>
                    <NumericInput
                      aria-label="受注額差分（万円）"
                      className="w-24"
                      value={crAmountDelta}
                      onValueChange={setCrAmountDelta}
                      placeholder="万円"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cr-effort-type" className="text-xs">
                    工数
                  </Label>
                  <div className="flex gap-1">
                    <select
                      id="cr-effort-type"
                      className="h-9 rounded border border-border bg-background px-1 text-sm"
                      value={crEffortDeltaType}
                      onChange={(e) =>
                        setCrEffortDeltaType(
                          e.target.value as ChangeRequestDeltaType,
                        )
                      }
                    >
                      <option value="increase">増</option>
                      <option value="decrease">減</option>
                    </select>
                    <NumericInput
                      aria-label="工数差分（人日）"
                      className="w-24"
                      value={crEffortDelta}
                      onValueChange={setCrEffortDelta}
                      placeholder="人日"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cr-due-date" className="text-xs">
                    新納期（変更なしなら空欄）
                  </Label>
                  <Input
                    id="cr-due-date"
                    type="date"
                    className="w-40"
                    value={crNewDueDate}
                    onChange={(e) => setCrNewDueDate(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddChangeRequest}
                >
                  申請を追加
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                承認すると受注額・マスター納期がプロジェクトへ自動反映されます。工数差分はWBSへ手動で反映し、ベースラインを再凍結してください
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {project && (
          <CsvMappingExportDialog
            open={csvExportOpen}
            onOpenChange={setCsvExportOpen}
            source={BILLING_SOURCE}
            rows={buildBillingRows(projects, billingMilestones, project.id)}
            fileName={`請求データ_${project.code}`}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
