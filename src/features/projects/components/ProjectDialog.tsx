import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  type ProjectFormValues,
  projectFormSchema,
} from '@/infrastructure/validation/schemas'
import {
  EXTERNAL_TOOL_LABELS,
  type ExternalToolConnection,
  listExternalToolConnections,
} from '@/shared/api/external-tools-api'
import { Button } from '@/shared/components/ui/button'
import { Combobox } from '@/shared/components/ui/combobox'
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
import { NumericInput } from '@/shared/components/ui/numeric-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { useToast } from '@/shared/hooks/use-toast'
import type { Project, ProjectLevel } from '@/shared/types'
import {
  CONFIDENCE_OPTIONS,
  PRIORITY_OPTIONS,
  PROJECT_LEVEL_LABELS,
  STATUS_OPTIONS,
} from '@/shared/types/project'
import { generateProjectCode } from '@/shared/utils/project-code-generator'
import {
  findRootProjectId,
  resolveTaskPhaseKey,
} from '@/shared/utils/task-phase-utils'
import {
  useProjectsStore,
  useScheduleSettingsStore,
  useTeamStore,
} from '@/stores'

interface ProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project?: Project | null
  parentProject?: Project | null
  defaultLevel?: ProjectLevel
}

export function ProjectDialog({
  open,
  onOpenChange,
  project,
  parentProject,
  defaultLevel = 0,
}: ProjectDialogProps) {
  const { toast } = useToast()
  const projects = useProjectsStore((state) => state.projects)
  const addProject = useProjectsStore((state) => state.addProject)
  const updateProject = useProjectsStore((state) => state.updateProject)
  const divisions = useTeamStore((state) => state.divisions)

  const isEditing = !!project

  const level = useMemo(() => {
    if (project) return project.level
    return defaultLevel
  }, [project, defaultLevel])

  // 起票先の接続。サーバー専用エンティティのためpostgresモードのみ。
  // 取得失敗（権限不足・未設定）は握り潰す＝選択肢が出ないだけでダイアログは成立する
  const isPostgresMode =
    (import.meta.env.VITE_STORAGE_MODE ?? 'local') === 'postgres'
  const [connections, setConnections] = useState<ExternalToolConnection[]>([])
  useEffect(() => {
    // 接続はトップレベル案件（level===0）にだけ設定する。
    // タスク編集で無駄なリクエストを飛ばさない
    if (!isPostgresMode || !open || level !== 0) return
    let cancelled = false
    listExternalToolConnections()
      .then((list) => {
        if (!cancelled) setConnections(list)
      })
      .catch(() => {
        /* 接続を引けなくても案件の編集自体は行える */
      })
    return () => {
      cancelled = true
    }
    // isPostgresModeはビルド時定数で不変のため依存に含めない
  }, [open, level])

  const autoCode = useMemo(() => {
    if (project) return project.code
    const parentCode = parentProject?.code
    return generateProjectCode(
      level,
      projects,
      parentProject?.id ?? null,
      parentCode,
    )
  }, [project, level, projects, parentProject])

  const sortedDivisions = useMemo(
    () => [...divisions].sort((a, b) => a.sortOrder - b.sortOrder),
    [divisions],
  )

  // 工程（phaseKey）の選択肢と継承元。工程定義はLayoutマウント時に
  // ロード済みのため、ここでは購読と参照のみ行う（entriesは変更検知のための購読）
  const getPhaseSettings = useScheduleSettingsStore(
    (state) => state.getSettings,
  )
  const phaseSettingsEntries = useScheduleSettingsStore(
    (state) => state.entries,
  )

  /** タスクが属するルート案件（工程定義・スケジュールは案件単位のため必要） */
  const rootProjectId = useMemo(() => {
    const anchorId = project?.id ?? parentProject?.id
    if (!anchorId) return null
    return findRootProjectId(anchorId, projects)
  }, [project?.id, parentProject?.id, projects])

  const phaseOptions = useMemo(() => {
    if (!rootProjectId) return []
    return getPhaseSettings(rootProjectId)
      .phases.filter((phase) => phase.enabled)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((phase) => ({ value: phase.phaseKey, label: phase.name }))
    // phaseSettingsEntriesはgetPhaseSettingsが内部で読む実データ。
    // 依存に含めないと工程定義の変更が選択肢へ反映されない
  }, [rootProjectId, getPhaseSettings, phaseSettingsEntries])

  /** 自身に設定が無いとき、どの工程を継承するか（親から解決）。表示ヒント用 */
  const inheritedPhaseLabel = useMemo(() => {
    const parentId = project?.parentId ?? parentProject?.id
    if (!parentId) return null
    const inheritedKey = resolveTaskPhaseKey(parentId, projects)
    if (!inheritedKey) return null
    return (
      phaseOptions.find((option) => option.value === inheritedKey)?.label ??
      null
    )
  }, [project?.parentId, parentProject?.id, projects, phaseOptions])

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      code: autoCode,
      name: project?.name ?? '',
      description: project?.description ?? '',
      background: project?.background ?? '',
      purpose: project?.purpose ?? '',
      completionCriteria: project?.completionCriteria ?? '',
      parentId: project?.parentId ?? parentProject?.id ?? null,
      level,
      status: project?.status ?? 'not_started',
      confidence: project?.confidence ?? null,
      divisionId: project?.divisionId ?? null,
      clientName: project?.clientName ?? null,
      contractAmount: project?.contractAmount ?? null,
      priority: project?.priority ?? null,
      evmUnitPriceMode: project?.evmUnitPriceMode ?? 'frozen',
      contractType: project?.contractType ?? null,
      externalConnectionId: project?.externalConnectionId ?? null,
      masterDueDate: project?.masterDueDate ?? null,
      phaseKey: project?.phaseKey ?? null,
    },
  })

  useEffect(() => {
    if (open) {
      reset({
        code: autoCode,
        name: project?.name ?? '',
        description: project?.description ?? '',
        background: project?.background ?? '',
        purpose: project?.purpose ?? '',
        completionCriteria: project?.completionCriteria ?? '',
        parentId: project?.parentId ?? parentProject?.id ?? null,
        level,
        status: project?.status ?? 'not_started',
        confidence: project?.confidence ?? null,
        divisionId: project?.divisionId ?? null,
        clientName: project?.clientName ?? null,
        contractAmount: project?.contractAmount ?? null,
        priority: project?.priority ?? null,
        evmUnitPriceMode: project?.evmUnitPriceMode ?? 'frozen',
        contractType: project?.contractType ?? null,
        externalConnectionId: project?.externalConnectionId ?? null,
        masterDueDate: project?.masterDueDate ?? null,
        phaseKey: project?.phaseKey ?? null,
      })
    }
  }, [open, autoCode, project, parentProject, level, reset])

  const onSubmit = useCallback(
    (data: ProjectFormValues) => {
      // コード一意性の検証（非公開の設計文書）。
      // コードは外部連携の突合キーのため新たな重複を作らせない。編集時にコードが
      // 不変なら検証しない（既存データに重複が既にある場合、無関係な編集をブロック
      // しないため＝新たに生まれる重複のみ拒否）
      const codeChanged = !isEditing || project?.code !== data.code
      if (codeChanged) {
        const allProjects = useProjectsStore.getState().projects
        const duplicated = allProjects.some(
          (p) => p.code === data.code && p.id !== project?.id,
        )
        if (duplicated) {
          toast({
            title: `コード「${data.code}」は既に使われています`,
            description: '外部連携の突合キーになるため重複できません',
            variant: 'destructive',
          })
          return
        }
      }

      // 担当部門・発注元・受注金額・優先度はトップレベル案件（level===0）のみ対象。
      // タスク（level>0）はUI非表示のため常にnull送信
      const submitData: ProjectFormValues = {
        ...data,
        divisionId: level === 0 ? (data.divisionId ?? null) : null,
        clientName: level === 0 ? (data.clientName ?? null) : null,
        contractAmount: level === 0 ? (data.contractAmount ?? null) : null,
        priority: level === 0 ? (data.priority ?? null) : null,
        evmUnitPriceMode:
          level === 0 ? (data.evmUnitPriceMode ?? 'frozen') : undefined,
        contractType: level === 0 ? (data.contractType ?? null) : null,
        externalConnectionId:
          level === 0 ? (data.externalConnectionId ?? null) : null,
        masterDueDate: level === 0 ? (data.masterDueDate ?? null) : null,
        // 工程はタスク（level>0）のみ設定対象。案件自身は工程に属さない
        phaseKey: level === 0 ? null : (data.phaseKey ?? null),
      }
      if (isEditing && project) {
        updateProject({ id: project.id, ...submitData })
        toast({ title: 'プロジェクトを更新しました' })
      } else {
        // 完了フラグは本ダイアログの対象外。
        // WBSグリッドのチェックボックスで個別に操作するため、新規作成時は常にfalseで送信する
        addProject({ ...submitData, completed: false })
        toast({ title: 'プロジェクトを追加しました' })
      }
      onOpenChange(false)
    },
    [isEditing, project, level, addProject, updateProject, onOpenChange, toast],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? `${level > 0 ? 'タスク' : 'プロジェクト'}を編集`
              : level > 0
                ? '新規タスク'
                : '新規プロジェクト'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? `${level > 0 ? 'タスク' : 'プロジェクト'}の情報を編集します。`
              : `${PROJECT_LEVEL_LABELS[level]}を追加します。`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">プロジェクトコード</Label>
              <Input
                id="code"
                {...register('code')}
                disabled={!isEditing}
                className="font-mono"
              />
              {errors.code ? (
                <p className="text-sm text-destructive">
                  {errors.code.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>レベル</Label>
              <Select
                value={String(level)}
                onValueChange={(v) => setValue('level', Number(v))}
                disabled
              >
                <SelectTrigger aria-label="レベル">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3, 4, 5].map((l) => (
                    <SelectItem key={l} value={String(l)}>
                      {PROJECT_LEVEL_LABELS[l] ?? `レベル${l}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">
              {level > 0 ? 'タスク名' : 'プロジェクト名'}
            </Label>
            <Input
              id="name"
              {...register('name')}
              placeholder={
                level > 0 ? 'タスク名を入力' : 'プロジェクト名を入力'
              }
            />
            {errors.name ? (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            ) : null}
          </div>

          <div className={level > 0 ? '' : 'grid grid-cols-2 gap-4'}>
            <div className="space-y-2">
              <Label>ステータス</Label>
              <Combobox
                value={watch('status')}
                onValueChange={(v) =>
                  setValue(
                    'status',
                    v as 'not_started' | 'active' | 'completed',
                  )
                }
                options={STATUS_OPTIONS.map((opt) => ({
                  value: opt.value,
                  label: opt.label,
                }))}
                searchPlaceholder="ステータスを検索..."
              />
            </div>

            {level === 0 && (
              <div className="space-y-2">
                <Label>プロジェクト確度</Label>
                <Combobox
                  value={watch('confidence') ?? '__null__'}
                  onValueChange={(v) =>
                    setValue(
                      'confidence',
                      v === '__null__' ? null : (v as 'S' | 'A' | 'B' | 'C'),
                    )
                  }
                  options={[
                    { value: '__null__', label: '未設定' },
                    ...CONFIDENCE_OPTIONS.map((opt) => ({
                      value: opt.value,
                      label: `${opt.label}（${opt.description}）`,
                    })),
                  ]}
                  searchPlaceholder="確度を検索..."
                />
              </div>
            )}
          </div>

          {level === 0 && (
            <div className="space-y-2">
              <Label>担当部門</Label>
              <Combobox
                value={watch('divisionId') ?? '__null__'}
                onValueChange={(v) =>
                  setValue('divisionId', v === '__null__' ? null : v)
                }
                options={[
                  { value: '__null__', label: '未設定' },
                  ...sortedDivisions.map((d) => ({
                    value: d.id,
                    label: d.name,
                  })),
                ]}
                placeholder="担当部門を選択"
                searchPlaceholder="部門を検索..."
              />
            </div>
          )}

          {level === 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clientName">発注元</Label>
                <Input
                  id="clientName"
                  value={watch('clientName') ?? ''}
                  onChange={(e) =>
                    setValue('clientName', e.target.value || null)
                  }
                  placeholder="発注元（対外クライアント）名を入力"
                />
                {errors.clientName ? (
                  <p className="text-sm text-destructive">
                    {errors.clientName.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>優先度</Label>
                <Combobox
                  value={watch('priority') ?? '__null__'}
                  onValueChange={(v) =>
                    setValue(
                      'priority',
                      v === '__null__'
                        ? null
                        : (v as 'high' | 'medium' | 'low'),
                    )
                  }
                  options={[
                    { value: '__null__', label: '未設定' },
                    ...PRIORITY_OPTIONS.map((opt) => ({
                      value: opt.value,
                      label: opt.label,
                    })),
                  ]}
                  searchPlaceholder="優先度を検索..."
                />
              </div>
            </div>
          )}

          {/* 商流属性（PROPOSAL §2.1）: 契約形態・マスター納期 */}
          {level === 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>契約形態</Label>
                <Combobox
                  value={watch('contractType') ?? '__null__'}
                  onValueChange={(v) =>
                    setValue(
                      'contractType',
                      v === '__null__'
                        ? null
                        : (v as '請負' | '準委任' | '派遣' | '混在'),
                    )
                  }
                  options={[
                    { value: '__null__', label: '未設定' },
                    { value: '請負', label: '請負' },
                    { value: '準委任', label: '準委任' },
                    { value: '派遣', label: '派遣' },
                    { value: '混在', label: '混在（準委任＋一部請負等）' },
                  ]}
                  searchPlaceholder="契約形態を検索..."
                />
                <p className="text-xs text-muted-foreground">
                  案件単位の契約形態です（担当者個人の契約形態とは別）
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="masterDueDate">マスター納期</Label>
                <Input
                  id="masterDueDate"
                  type="date"
                  value={watch('masterDueDate') ?? ''}
                  onChange={(e) =>
                    setValue('masterDueDate', e.target.value || null)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  契約上動かせない最終期日。納期超過・遅延予測アラートの起点になります
                </p>
              </div>
            </div>
          )}

          {/* 起票先の既定接続。案件ごとに使う外部ツールが違う運用で、
              起票のたびに接続を選び間違えて別ツールへ起票する事故を防ぐ。
              接続はサーバー専用エンティティのためpostgresモードのみ */}
          {level === 0 && isPostgresMode && (
            <div className="space-y-2">
              <Label>起票先の接続</Label>
              <Combobox
                value={watch('externalConnectionId') ?? '__null__'}
                onValueChange={(v) =>
                  setValue('externalConnectionId', v === '__null__' ? null : v)
                }
                options={[
                  { value: '__null__', label: '未設定（起票時に選ぶ）' },
                  ...connections.map((c) => ({
                    value: c.id,
                    label: `${c.name}（${EXTERNAL_TOOL_LABELS[c.tool]}）`,
                  })),
                ]}
                searchPlaceholder="接続を検索..."
              />
              <p className="text-xs text-muted-foreground">
                この案件のタスクをAPI起票するときの既定の接続です。
                設定しておくと起票ダイアログで自動選択され、外部タスクへのリンクも確定します
              </p>
            </div>
          )}

          {level === 0 && (
            <div className="space-y-2">
              <Label htmlFor="contractAmount">受注金額（万円）</Label>
              <NumericInput
                id="contractAmount"
                value={watch('contractAmount') ?? 0}
                onValueChange={(v) =>
                  setValue('contractAmount', v === 0 ? null : v)
                }
                placeholder="受注金額（未定の場合は空欄のまま）"
              />
              {errors.contractAmount ? (
                <p className="text-sm text-destructive">
                  {errors.contractAmount.message}
                </p>
              ) : null}
            </div>
          )}

          {/* EVMのPV算出における単価の扱い（非公開の設計文書）。
              表示の切替ではなく計算方式の変更である点を説明文で明示する */}
          {level === 0 && (
            <div className="space-y-2">
              <Label>EVMの単価の扱い</Label>
              <Combobox
                value={watch('evmUnitPriceMode') ?? 'frozen'}
                onValueChange={(v) =>
                  setValue('evmUnitPriceMode', v as 'frozen' | 'latest')
                }
                options={[
                  { value: 'frozen', label: '凍結時の単価で固定（既定）' },
                  { value: 'latest', label: '最新の単価で再計算' },
                ]}
                searchPlaceholder="単価の扱いを検索..."
              />
              <p className="text-xs text-muted-foreground">
                PV（計画値）の計算方式です。「最新の単価で再計算」にすると、単価改定の影響がPVとACの双方へ等しく効き、コスト差異には稼働量の差だけが残ります
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="background">背景</Label>
            <textarea
              id="background"
              {...register('background')}
              placeholder="プロジェクトの背景を入力"
              rows={2}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            {errors.background ? (
              <p className="text-sm text-destructive">
                {errors.background.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="purpose">目的</Label>
            <textarea
              id="purpose"
              {...register('purpose')}
              placeholder="プロジェクトの目的を入力"
              rows={2}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            {errors.purpose ? (
              <p className="text-sm text-destructive">
                {errors.purpose.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">説明</Label>
            <textarea
              id="description"
              {...register('description')}
              placeholder="プロジェクトの説明を入力"
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            {errors.description ? (
              <p className="text-sm text-destructive">
                {errors.description.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="completionCriteria">完了条件</Label>
            <textarea
              id="completionCriteria"
              {...register('completionCriteria')}
              placeholder="完了条件を入力"
              rows={2}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            {errors.completionCriteria ? (
              <p className="text-sm text-destructive">
                {errors.completionCriteria.message}
              </p>
            ) : null}
          </div>

          {/* 所属工程: WBSとスケジュールの接続点。タスクのみ設定対象 */}
          {level > 0 && phaseOptions.length > 0 && (
            <div className="space-y-2">
              <Label>所属工程</Label>
              <Combobox
                value={watch('phaseKey') ?? '__inherit__'}
                onValueChange={(v) =>
                  setValue('phaseKey', v === '__inherit__' ? null : v)
                }
                options={[
                  {
                    value: '__inherit__',
                    label: inheritedPhaseLabel
                      ? `上位から継承（${inheritedPhaseLabel}）`
                      : '未設定（上位から継承）',
                  },
                  ...phaseOptions,
                ]}
                searchPlaceholder="工程を検索..."
              />
              <p className="text-xs text-muted-foreground">
                スケジュール（ガント）で引いた工程の期間を、このタスクの期日として使います。
                配下のタスクにも継承されます
              </p>
            </div>
          )}

          {parentProject ? (
            <div className="space-y-2">
              <Label>親プロジェクト</Label>
              <Input
                value={`${parentProject.code} - ${parentProject.name}`}
                disabled
              />
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button type="submit">{isEditing ? '更新' : '追加'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
