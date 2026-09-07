import { FileUp, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table'
import type { Project } from '@/shared/types/project'
import { parseCsv } from '@/shared/utils/csv-utils'
import {
  buildTaskSyncPlan,
  suggestTaskSyncMapping,
  TASK_SYNC_TOOL_LABELS,
  TASK_SYNC_TOOL_PRESETS,
  type TaskSyncColumnMapping,
  type TaskSyncPlan,
  type TaskSyncTool,
} from '../utils/task-sync-utils'

interface TaskSyncImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: Project[]
  /** ドライラン確認後の適用。書込みは呼び出し元（ページ）がストア経由で行う */
  onApply: (plan: TaskSyncPlan, fileName: string, source: TaskSyncTool) => void
}

type WizardStep = 1 | 2 | 3

const MAPPING_ROLES: Array<{
  role: keyof TaskSyncColumnMapping
  label: string
  required: boolean
}> = [
  { role: 'subject', label: 'タスク（件名 or コード）', required: true },
  { role: 'status', label: '状態（任意）', required: false },
  { role: 'completedAt', label: '完了日（任意）', required: false },
  {
    role: 'externalKey',
    label: '外部ツールのキー/ID（任意）',
    required: false,
  },
]

const UNSELECTED = '__unselected__'

/**
 * 外部実行管理ツールの完了CSV取込ウィザード（非公開の設計文書、
 *）。3ステップ: ①ツール選択＋ファイル → ②列マッピング＋完了語彙 →
 * ③突合ドライラン → 適用。書き込むのはcompleted/completedAt（＋外部IDの学習）のみ。
 */
export function TaskSyncImportDialog({
  open,
  onOpenChange,
  projects,
  onApply,
}: TaskSyncImportDialogProps) {
  const [step, setStep] = useState<WizardStep>(1)
  const [tool, setTool] = useState<TaskSyncTool>('generic')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Partial<TaskSyncColumnMapping>>({})
  const [completedValuesText, setCompletedValuesText] = useState(
    TASK_SYNC_TOOL_PRESETS.generic.completedValues.join(', '),
  )
  const [fileError, setFileError] = useState<string | null>(null)

  const headers = rows[0] ?? []
  const dataRows = useMemo(() => rows.slice(1), [rows])
  const preset = TASK_SYNC_TOOL_PRESETS[tool]

  const reset = () => {
    setStep(1)
    setTool('generic')
    setFileName('')
    setRows([])
    setMapping({})
    setCompletedValuesText(
      TASK_SYNC_TOOL_PRESETS.generic.completedValues.join(', '),
    )
    setFileError(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const handleToolChange = (next: TaskSyncTool) => {
    setTool(next)
    setCompletedValuesText(
      TASK_SYNC_TOOL_PRESETS[next].completedValues.join(', '),
    )
    if (rows.length > 0) {
      setMapping(suggestTaskSyncMapping(rows[0] ?? [], next))
    }
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    const text = await file.text()
    const parsed = parseCsv(text)
    if (parsed.length < 2) {
      setFileError(
        'データ行がありません（ヘッダ行＋1行以上のデータが必要です）',
      )
      setRows([])
      setFileName(file.name)
      return
    }
    setFileError(null)
    setFileName(file.name)
    setRows(parsed)
    setMapping(suggestTaskSyncMapping(parsed[0] ?? [], tool))
  }

  const mappingComplete =
    mapping.subject !== undefined &&
    (preset.mode === 'completedAtPresence'
      ? mapping.completedAt !== undefined
      : mapping.status !== undefined)

  const plan: TaskSyncPlan | null = useMemo(() => {
    if (step !== 3 || !mappingComplete) return null
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    return buildTaskSyncPlan(dataRows, mapping as TaskSyncColumnMapping, {
      projects,
      source: tool,
      today,
      completedValues: completedValuesText
        .split(/[,、]/)
        .map((v) => v.trim())
        .filter((v) => v !== ''),
      mode: preset.mode,
    })
  }, [
    step,
    mappingComplete,
    dataRows,
    mapping,
    projects,
    tool,
    completedValuesText,
    preset.mode,
  ])

  const handleApply = () => {
    if (!plan || plan.changes.length === 0) return
    onApply(plan, fileName, tool)
    handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>完了CSV取込（ステップ {step}/3）</DialogTitle>
          <DialogDescription>
            {step === 1 &&
              '外部ツールからエクスポートした課題一覧CSVを選択します。書き込まれるのはWBSタスクの完了状態のみです'}
            {step === 2 &&
              '各項目に対応する列を指定します（取込元ツールから自動推定済み）'}
            {step === 3 &&
              '適用前の突合結果です。完了状態が変わるタスクだけが更新されます（工数・実績・計画には書き込みません）'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Label className="w-32 shrink-0 text-sm">取込元ツール</Label>
              <Select
                value={tool}
                onValueChange={(v) => handleToolChange(v as TaskSyncTool)}
              >
                <SelectTrigger className="h-8 flex-1" aria-label="取込元ツール">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.entries(TASK_SYNC_TOOL_LABELS) as Array<
                      [TaskSyncTool, string]
                    >
                  ).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground hover:bg-muted/40">
              <FileUp className="h-6 w-6" />
              <span>{fileName || 'CSVファイルを選択'}</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                aria-label="完了CSVファイル"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </label>
            {fileError && (
              <p className="text-sm text-destructive">{fileError}</p>
            )}
            {rows.length >= 2 && (
              <p className="text-xs text-muted-foreground">
                {dataRows.length}行のデータ・{headers.length}列を検出
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            {MAPPING_ROLES.map(({ role, label, required }) => {
              // Asana型（completedAtPresence）は完了日列が必須・状態列は不要
              const effectiveRequired =
                role === 'completedAt'
                  ? preset.mode === 'completedAtPresence'
                  : role === 'status'
                    ? preset.mode === 'status'
                    : required
              if (role === 'status' && preset.mode === 'completedAtPresence') {
                return null
              }
              return (
                <div key={role} className="flex items-center gap-3">
                  <Label className="w-64 shrink-0 text-sm">
                    {label}
                    {effectiveRequired && (
                      <span className="text-destructive"> *</span>
                    )}
                  </Label>
                  <Select
                    value={
                      mapping[role] !== undefined
                        ? String(mapping[role])
                        : UNSELECTED
                    }
                    onValueChange={(v) =>
                      setMapping((prev) => {
                        const next = { ...prev }
                        if (v === UNSELECTED) {
                          delete next[role]
                        } else {
                          next[role] = Number(v)
                        }
                        return next
                      })
                    }
                  >
                    <SelectTrigger
                      className="h-8 flex-1"
                      aria-label={`${label}の列`}
                    >
                      <SelectValue placeholder="列を選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {!effectiveRequired && (
                        <SelectItem value={UNSELECTED}>
                          （使用しない）
                        </SelectItem>
                      )}
                      {headers.map((h, i) => (
                        <SelectItem key={`${i}-${h}`} value={String(i)}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )
            })}
            {preset.mode === 'status' ? (
              <div className="flex items-center gap-3">
                <Label className="w-64 shrink-0 text-sm">
                  完了とみなす値（カンマ区切り）
                </Label>
                <Input
                  className="h-8 flex-1"
                  value={completedValuesText}
                  onChange={(e) => setCompletedValuesText(e.target.value)}
                  aria-label="完了とみなす値"
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {TASK_SYNC_TOOL_LABELS[tool]}
                は状態列を持たないため、完了日列が空でない行を「完了」として扱います
              </p>
            )}
          </div>
        )}

        {step === 3 && plan && (
          <div className="space-y-3">
            <p className="text-sm">
              完了へ変わる{' '}
              <span className="font-medium">{plan.completedCount}件</span>
              ／未完了へ戻る{' '}
              <span className="font-medium">{plan.reopenedCount}件</span>
              ／変化なし {plan.unchangedCount}件／スキップ{' '}
              <span
                className={
                  plan.skips.length > 0 ? 'font-medium text-destructive' : ''
                }
              >
                {plan.skips.length}件
              </span>
            </p>
            {plan.changes.length > 0 && (
              <div className="max-h-56 overflow-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">コード</TableHead>
                      <TableHead className="text-xs">タスク</TableHead>
                      <TableHead className="text-xs">変更</TableHead>
                      <TableHead className="text-xs">完了日</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plan.changes.map((c) => (
                      <TableRow key={c.taskId}>
                        <TableCell className="text-xs">{c.code}</TableCell>
                        <TableCell className="text-xs">{c.name}</TableCell>
                        <TableCell className="text-xs">
                          {c.after ? '未完了 → 完了' : '完了 → 未完了'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {c.completedAt ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {plan.skips.length > 0 && (
              <div className="space-y-1 rounded-md border border-border bg-muted/40 p-2">
                <p className="flex items-center gap-1 text-xs font-medium">
                  <TriangleAlert className="h-3.5 w-3.5 text-destructive" />
                  スキップされる行（適用可能な行のみ取り込みます）
                </p>
                <ul className="max-h-32 space-y-0.5 overflow-auto text-xs text-muted-foreground">
                  {plan.skips.slice(0, 20).map((s) => (
                    <li key={`${s.row}-${s.reason}`}>
                      {s.row}行目: {s.reason}
                    </li>
                  ))}
                  {plan.skips.length > 20 && (
                    <li>…ほか{plan.skips.length - 20}件</li>
                  )}
                </ul>
              </div>
            )}
            {plan.changes.length === 0 && (
              <p className="text-sm text-muted-foreground">
                完了状態が変わるタスクはありません
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {step > 1 && (
            <Button
              variant="outline"
              onClick={() => setStep((s) => (s - 1) as WizardStep)}
            >
              戻る
            </Button>
          )}
          {step === 1 && (
            <Button onClick={() => setStep(2)} disabled={rows.length < 2}>
              次へ
            </Button>
          )}
          {step === 2 && (
            <Button onClick={() => setStep(3)} disabled={!mappingComplete}>
              突合を確認
            </Button>
          )}
          {step === 3 && (
            <Button
              onClick={handleApply}
              disabled={!plan || plan.changes.length === 0}
            >
              適用（{plan?.changes.length ?? 0}件）
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
