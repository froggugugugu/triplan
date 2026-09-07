import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/shared/components/ui/button'
import { Combobox } from '@/shared/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { Textarea } from '@/shared/components/ui/textarea'
import type { RiskEntry, RiskLevel, RiskStatus } from '@/shared/types'
import { useMembersStore, useProjectsStore, useRiskStore } from '@/stores'
import {
  deriveRiskSeverity,
  RISK_LEVEL_LABELS,
  RISK_SEVERITY_LABELS,
  RISK_STATUS_LABELS,
  sortRiskEntries,
} from '../utils/risk-utils'

interface RiskRegisterDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 対象のトップレベル案件ID */
  projectId: string | null
}

const RISK_LEVEL_OPTIONS: RiskLevel[] = ['high', 'medium', 'low']
const RISK_STATUS_OPTIONS: RiskStatus[] = ['open', 'realized', 'closed']

/**
 * リスク登録簿ダイアログ（非公開の設計文書）。
 *
 * 案件単位のリスクを一覧・登録・編集・状態変更・削除する。
 * ProjectCommerceDialogと同型の「案件単位ダイアログ」で、ProjectsPageの
 * 行アイコンから起動する。重大度は確率×影響から都度導出して表示する。
 */
export function RiskRegisterDialog({
  open,
  onOpenChange,
  projectId,
}: RiskRegisterDialogProps) {
  const projects = useProjectsStore((s) => s.projects)
  const project = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId],
  )
  const members = useMembersStore((s) => s.members)
  const riskEntries = useRiskStore((s) => s.riskEntries)
  const addRiskEntry = useRiskStore((s) => s.addRiskEntry)
  const updateRiskEntry = useRiskStore((s) => s.updateRiskEntry)
  const deleteRiskEntry = useRiskStore((s) => s.deleteRiskEntry)

  const projectRisks = useMemo(
    () => sortRiskEntries(riskEntries.filter((r) => r.projectId === projectId)),
    [riskEntries, projectId],
  )

  // フォーム（新規追加と編集を兼用。editingId!==nullなら編集モード）
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [probability, setProbability] = useState<RiskLevel>('medium')
  const [impact, setImpact] = useState<RiskLevel>('medium')
  const [ownerMemberId, setOwnerMemberId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [response, setResponse] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const resetForm = () => {
    setEditingId(null)
    setTitle('')
    setProbability('medium')
    setImpact('medium')
    setOwnerMemberId('')
    setDueDate('')
    setResponse('')
    setDeleteConfirmId(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm()
    onOpenChange(next)
  }

  const startEdit = (risk: RiskEntry) => {
    setEditingId(risk.id)
    setTitle(risk.title)
    setProbability(risk.probability)
    setImpact(risk.impact)
    setOwnerMemberId(risk.ownerMemberId ?? '')
    setDueDate(risk.dueDate ?? '')
    setResponse(risk.response ?? '')
  }

  const handleSubmit = () => {
    if (!projectId || title.trim().length === 0) return
    const fields = {
      title: title.trim(),
      probability,
      impact,
      ownerMemberId: ownerMemberId || null,
      dueDate: dueDate || null,
      response,
    }
    if (editingId) {
      updateRiskEntry({ id: editingId, ...fields })
    } else {
      addRiskEntry({ projectId, ...fields })
    }
    resetForm()
  }

  const memberOptions = useMemo(
    () => [
      { value: '', label: '（未設定）' },
      ...members
        .filter((m) => m.isActive)
        .map((m) => ({ value: m.id, label: m.name })),
    ],
    [members],
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            リスク登録簿{project ? ` — ${project.name}` : ''}
          </DialogTitle>
        </DialogHeader>

        {/* 一覧（open→realized→closed、重大度順の決定論ソート） */}
        {projectRisks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            登録されたリスクはありません。まだ数字に出ていない懸念（仕様の未確定・キーパーソンの離任等）を、気づいた時点で登録しておくと、アラートセンターと判定が事前に知らせます。
          </p>
        ) : (
          <ul className="space-y-1.5">
            {projectRisks.map((risk) => {
              const severity = deriveRiskSeverity(risk.probability, risk.impact)
              const ownerName = risk.ownerMemberId
                ? (members.find((m) => m.id === risk.ownerMemberId)?.name ??
                  '（不明）')
                : null
              return (
                <li
                  key={risk.id}
                  className="rounded border border-border px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-bold',
                        (severity === 'critical' || severity === 'high') &&
                          'bg-destructive/15 text-destructive',
                        severity === 'medium' &&
                          'bg-[#ffd43d]/25 text-amber-700 dark:text-amber-300',
                        severity === 'low' && 'bg-muted text-muted-foreground',
                      )}
                    >
                      {RISK_SEVERITY_LABELS[severity]}
                    </span>
                    <span
                      className={cn(
                        'font-medium',
                        risk.status === 'closed' &&
                          'text-muted-foreground line-through',
                      )}
                    >
                      {risk.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      確率:{RISK_LEVEL_LABELS[risk.probability]}／影響:
                      {RISK_LEVEL_LABELS[risk.impact]}
                    </span>
                    {risk.dueDate && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        期限 {risk.dueDate}
                      </span>
                    )}
                    {ownerName && (
                      <span className="text-xs text-muted-foreground">
                        {ownerName}
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-1">
                      <Select
                        value={risk.status}
                        onValueChange={(value) =>
                          updateRiskEntry({
                            id: risk.id,
                            status: value as RiskStatus,
                          })
                        }
                      >
                        <SelectTrigger
                          className="h-7 w-24 text-xs"
                          aria-label={`「${risk.title}」の状態`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RISK_STATUS_OPTIONS.map((status) => (
                            <SelectItem key={status} value={status}>
                              {RISK_STATUS_LABELS[status]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => startEdit(risk)}
                      >
                        編集
                      </Button>
                      {deleteConfirmId === risk.id ? (
                        <>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              deleteRiskEntry(risk.id)
                              setDeleteConfirmId(null)
                            }}
                          >
                            削除する
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            取消
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-muted-foreground"
                          onClick={() => setDeleteConfirmId(risk.id)}
                        >
                          削除
                        </Button>
                      )}
                    </span>
                  </div>
                  {risk.response && (
                    <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                      対応: {risk.response}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {/* 追加・編集フォーム */}
        <div className="space-y-3 rounded border border-border p-3">
          <p className="text-sm font-medium">
            {editingId ? 'リスクを編集' : 'リスクを追加'}
          </p>
          <div className="space-y-1">
            <Label htmlFor="risk-title">内容</Label>
            <Input
              id="risk-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: ○○の仕様が未確定のまま設計が進んでいる"
              maxLength={200}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label>発生確率</Label>
              <Select
                value={probability}
                onValueChange={(v) => setProbability(v as RiskLevel)}
              >
                <SelectTrigger aria-label="発生確率">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RISK_LEVEL_OPTIONS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {RISK_LEVEL_LABELS[level]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>影響度</Label>
              <Select
                value={impact}
                onValueChange={(v) => setImpact(v as RiskLevel)}
              >
                <SelectTrigger aria-label="影響度">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RISK_LEVEL_OPTIONS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {RISK_LEVEL_LABELS[level]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>オーナー</Label>
              <Combobox
                value={ownerMemberId}
                onValueChange={setOwnerMemberId}
                options={memberOptions}
                placeholder="（未設定）"
                searchPlaceholder="氏名で検索"
                emptyMessage="該当するメンバーがいません"
                aria-label="オーナー"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="risk-due-date">対応期限</Label>
              <Input
                id="risk-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="risk-response">対応方針</Label>
            <Textarea
              id="risk-response"
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder="回避・軽減・転嫁・受容のいずれで臨むか、具体的なアクション"
              maxLength={2000}
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-2">
            {editingId && (
              <Button variant="ghost" onClick={resetForm}>
                編集をやめる
              </Button>
            )}
            <Button onClick={handleSubmit} disabled={title.trim().length === 0}>
              {editingId ? '保存' : '追加'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
