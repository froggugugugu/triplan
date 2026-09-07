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
import { toast } from '@/shared/hooks/use-toast'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Member } from '@/shared/types/member'
import type { Project } from '@/shared/types/project'
import { parseCsv } from '@/shared/utils/csv-utils'
import { useCsvMappingStore } from '@/stores'
import {
  ACTUALS_IMPORT_SOURCE_KEY,
  mappingToProfileColumns,
  profileToMapping,
  unitFromProfile,
} from '../utils/csv-import-profile-utils'
import {
  buildImportPlan,
  type CsvColumnMapping,
  EFFORT_UNIT_LABELS,
  type EffortUnit,
  type ImportPlan,
  suggestColumnMapping,
} from '../utils/csv-import-utils'

interface CsvImportWizardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  members: Member[]
  projects: Project[]
  assignments: AssignmentEntry[]
  workdaysPerMonth: number
  hoursPerDay: number
  /** 締め済み月（P1-b）。該当月の行はドライランでスキップになる */
  closedMonths: Set<string>
  /** ドライラン確認後の適用。書込みは呼び出し元（ページ）がストア経由で行う */
  onApply: (plan: ImportPlan, fileName: string) => void
}

type WizardStep = 1 | 2 | 3

/** 列マッピングの選択UI行の定義。taskのみ任意 */
const MAPPING_ROLES: Array<{
  role: keyof CsvColumnMapping
  label: string
  required: boolean
}> = [
  { role: 'member', label: 'メンバー（email推奨／氏名）', required: true },
  {
    role: 'project',
    label: 'プロジェクト（コード推奨／名称）',
    required: true,
  },
  { role: 'task', label: 'タスク（コード／名称、任意）', required: false },
  { role: 'period', label: '期間（YYYY-MM または日付）', required: true },
  { role: 'value', label: '工数値', required: true },
]

/** 未選択を表す内部センチネル（Radix SelectItemは空文字valueを許容しないため） */
const UNSELECTED = '__unselected__'

/**
 * 汎用CSV取込ウィザード（P1-a Phase 2。DESIGN §5.2）。
 * 3ステップ: ①ファイル選択（先頭5行プレビュー）→②列マッピング＋単位→
 * ③突合プレビュー（ドライラン）→適用。適用前に必ずドライランを挟む。
 * スキップ行があっても適用可能な行は適用する（per-row skip。全滅時のみ適用不可）。
 */
export function CsvImportWizardDialog({
  open,
  onOpenChange,
  members,
  projects,
  assignments,
  workdaysPerMonth,
  hoursPerDay,
  closedMonths,
  onApply,
}: CsvImportWizardDialogProps) {
  const [step, setStep] = useState<WizardStep>(1)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Partial<CsvColumnMapping>>({})
  const [unit, setUnit] = useState<EffortUnit>('manMonth')
  const [fileError, setFileError] = useState<string | null>(null)
  // 取込プロファイル（Phase C）: 列名ベースのマッピング＋単位を保存・適用
  const [profileId, setProfileId] = useState('')
  const [profileName, setProfileName] = useState('')
  const importProfiles = useCsvMappingStore(
    (st) => st.csvMappingProfiles,
  ).filter(
    (p) =>
      p.sourceKey === ACTUALS_IMPORT_SOURCE_KEY && p.direction === 'import',
  )
  const loadCsvMappingProfiles = useCsvMappingStore(
    (st) => st.loadCsvMappingProfiles,
  )
  const addCsvMappingProfile = useCsvMappingStore(
    (st) => st.addCsvMappingProfile,
  )
  const updateCsvMappingProfile = useCsvMappingStore(
    (st) => st.updateCsvMappingProfile,
  )

  const headers = rows[0] ?? []
  const dataRows = useMemo(() => rows.slice(1), [rows])

  const reset = () => {
    setStep(1)
    setFileName('')
    setRows([])
    setMapping({})
    setUnit('manMonth')
    setFileError(null)
    setProfileId('')
    setProfileName('')
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
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
    setMapping(suggestColumnMapping(parsed[0] ?? []))
  }

  const mappingComplete =
    mapping.member !== undefined &&
    mapping.project !== undefined &&
    mapping.period !== undefined &&
    mapping.value !== undefined

  const handleApplyProfile = (id: string) => {
    setProfileId(id)
    const profile = importProfiles.find((p) => p.id === id)
    if (!profile) return
    const applied = profileToMapping(profile, headers)
    setMapping(applied.mapping)
    setUnit(unitFromProfile(profile))
    setProfileName(profile.name)
    if (applied.missing.length > 0) {
      toast({
        title: 'プロファイルの一部の列が見つかりません',
        description: `${applied.missing.join('、')} は今回のファイルに無いため手動で選択してください`,
        variant: 'destructive',
      })
    }
  }

  const handleSaveProfile = () => {
    const name = profileName.trim()
    if (!name) {
      toast({
        title: 'プロファイル名を入力してください',
        variant: 'destructive',
      })
      return
    }
    const columns = mappingToProfileColumns(mapping, headers)
    if (profileId) {
      updateCsvMappingProfile(profileId, {
        name,
        columns,
        options: { unit },
      })
      toast({ title: `取込プロファイル「${name}」を更新しました` })
    } else {
      const created = addCsvMappingProfile({
        name,
        sourceKey: ACTUALS_IMPORT_SOURCE_KEY,
        direction: 'import',
        columns,
        includeHeader: true,
        options: { unit },
      })
      setProfileId(created.id)
      toast({ title: `取込プロファイル「${name}」を保存しました` })
    }
  }

  // ドライラン（ステップ3表示時のみ計算）
  const plan: ImportPlan | null = useMemo(() => {
    if (step !== 3 || !mappingComplete) return null
    return buildImportPlan(dataRows, mapping as CsvColumnMapping, unit, {
      members,
      projects,
      assignments,
      workdaysPerMonth,
      hoursPerDay,
      closedMonths,
    })
  }, [
    step,
    mappingComplete,
    dataRows,
    mapping,
    unit,
    members,
    projects,
    assignments,
    workdaysPerMonth,
    hoursPerDay,
    closedMonths,
  ])

  const handleApply = () => {
    if (!plan || plan.candidates.length === 0) return
    onApply(plan, fileName)
    handleOpenChange(false)
  }

  const variance = plan
    ? Math.round((plan.totalValue - plan.totalPlanned) * 100) / 100
    : 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>CSV取込（ステップ {step}/3）</DialogTitle>
          <DialogDescription>
            {step === 1 &&
              '実績データのCSVファイルを選択します（ヘッダ行必須・UTF-8、BOM可）'}
            {step === 2 &&
              '各項目に対応する列と、工数値の単位を指定します（ヘッダ名から自動推定済み）'}
            {step === 3 &&
              '適用前の突合結果です。実績（人月）へ書き込まれるのは以下の行だけで、計画には一切書き込みません'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground hover:bg-muted/40">
              <FileUp className="h-6 w-6" />
              <span>{fileName || 'CSVファイルを選択'}</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                aria-label="CSVファイル"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </label>
            {fileError && (
              <p className="text-sm text-destructive">{fileError}</p>
            )}
            {rows.length >= 2 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {dataRows.length}行のデータ・{headers.length}
                  列を検出（先頭5行プレビュー）
                </p>
                <div className="max-h-48 overflow-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {headers.map((h, i) => (
                          <TableHead key={`${i}-${h}`} className="text-xs">
                            {h}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dataRows.slice(0, 5).map((r, ri) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: プレビュー専用の読み取り行で並べ替えなし
                        <TableRow key={ri}>
                          {headers.map((_, ci) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: 同上
                            <TableCell key={ci} className="text-xs">
                              {r[ci] ?? ''}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-2">
              <Select
                value={profileId || '__none__'}
                onValueChange={(v) => {
                  if (v === '__none__') {
                    setProfileId('')
                    setProfileName('')
                    return
                  }
                  handleApplyProfile(v)
                }}
              >
                <SelectTrigger
                  className="h-8 w-56"
                  aria-label="取込プロファイル"
                  onPointerDown={() => loadCsvMappingProfiles()}
                >
                  <SelectValue placeholder="取込プロファイルを適用" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    （プロファイルを使わない）
                  </SelectItem>
                  {importProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="h-8 w-48"
                placeholder="プロファイル名（保存用）"
                aria-label="取込プロファイル名"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveProfile}
                title="現在の列マッピングと単位を保存し、次回の取込で使い回せます（列名で保存するため列の並びが変わっても適用できます）"
              >
                {profileId ? 'プロファイルを更新' : 'プロファイルとして保存'}
              </Button>
            </div>
            {MAPPING_ROLES.map(({ role, label, required }) => (
              <div key={role} className="flex items-center gap-3">
                <Label className="w-64 shrink-0 text-sm">
                  {label}
                  {required && <span className="text-destructive"> *</span>}
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
                    {!required && (
                      <SelectItem value={UNSELECTED}>（使用しない）</SelectItem>
                    )}
                    {headers.map((h, i) => (
                      <SelectItem key={`${i}-${h}`} value={String(i)}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <Label className="w-64 shrink-0 text-sm">
                工数値の単位<span className="text-destructive"> *</span>
              </Label>
              <Select
                value={unit}
                onValueChange={(v) => setUnit(v as EffortUnit)}
              >
                <SelectTrigger className="h-8 flex-1" aria-label="工数値の単位">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.entries(EFFORT_UNIT_LABELS) as Array<
                      [EffortUnit, string]
                    >
                  ).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {unit !== 'manMonth' && (
              <p className="text-xs text-muted-foreground">
                換算: 1人月={workdaysPerMonth}人日
                {unit === 'hour' && `、1人日=${hoursPerDay}時間`}
                （システム設定の値。日次・週次の行は月へ合算されます）
              </p>
            )}
          </div>
        )}

        {step === 3 && plan && (
          <div className="space-y-3">
            <p className="text-sm">
              適用予定{' '}
              <span className="font-medium">{plan.candidates.length}件</span>
              （既存アサインへの上書き {plan.overrideCount}件／計画外の新規{' '}
              {plan.unplannedCount}件）／スキップ{' '}
              <span
                className={
                  plan.skips.length > 0 ? 'font-medium text-destructive' : ''
                }
              >
                {plan.skips.length}件
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              取込値合計 {plan.totalValue.toFixed(2)}人月 ／ 対応する計画合計{' '}
              {plan.totalPlanned.toFixed(2)}人月 ／ 乖離{' '}
              {variance > 0 ? '+' : ''}
              {variance.toFixed(2)}人月
            </p>
            {plan.candidates.length > 0 && (
              <div className="max-h-56 overflow-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">担当者</TableHead>
                      <TableHead className="text-xs">プロジェクト</TableHead>
                      <TableHead className="text-xs">タスク</TableHead>
                      <TableHead className="text-xs">月</TableHead>
                      <TableHead className="text-right text-xs">
                        実績（人月）
                      </TableHead>
                      <TableHead className="text-xs">種別</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plan.candidates.map((c) => (
                      <TableRow key={`${c.memberId}-${c.taskId}-${c.month}`}>
                        <TableCell className="text-xs">
                          {c.memberName}
                        </TableCell>
                        <TableCell className="text-xs">
                          {c.projectLabel}
                        </TableCell>
                        <TableCell className="text-xs">{c.taskName}</TableCell>
                        <TableCell className="text-xs">{c.month}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {c.value.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {c.assignmentId ? '上書き' : '計画外'}
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
            {plan.candidates.length === 0 && (
              <p className="text-sm text-destructive">
                適用可能な行がありません。列マッピング・単位を見直してください
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
              disabled={!plan || plan.candidates.length === 0}
            >
              適用（{plan?.candidates.length ?? 0}件）
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
