import { Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { NumericInput } from '@/shared/components/ui/numeric-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { useToast } from '@/shared/hooks/use-toast'
import { generateProjectCode } from '@/shared/utils/project-code-generator'
import { applyWbsTemplate } from '@/shared/utils/wbs-template-apply'
import {
  clearAllBusinessData,
  loadDemoData,
  useAppStore,
  useBudgetStore,
  useMembersStore,
  useProjectsStore,
  useTeamStore,
} from '@/stores'

type WizardStep =
  | 'welcome'
  | 'basics'
  | 'organization'
  | 'members'
  | 'project'
  | 'done'

/** 進捗表示用の入力ステップ順（welcome/doneは含めない） */
const INPUT_STEPS: WizardStep[] = [
  'basics',
  'organization',
  'members',
  'project',
]

const STEP_TITLES: Record<WizardStep, string> = {
  welcome: 'ようこそ',
  basics: '基本設定',
  organization: '組織をつくる',
  members: '担当者を登録する',
  project: '最初のプロジェクト',
  done: 'セットアップ完了',
}

interface MemberRow {
  name: string
  sectionId: string
  unitPrice: number
}

/** 現在の暦月キー（"YYYY-MM"）。単価履歴の適用開始年月に使う */
function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * 初期設定ウィザード。クローン直後の空環境でも迷わないよう、
 * S0→S1の時系列（基本設定→組織→担当者→最初のプロジェクト）を1本の動線で案内する。
 * - 各ステップは「次へ」で即コミット（既存storeアクション経由）・スキップ可
 * - デモデータ分岐: 空のときのみ「デモデータで試す」を表示（実データがある状態での
 *   誤爆上書きを防ぐ）。デモ試用中は「本番データへ切り替える」（全削除→基本設定から再開）
 * - 開閉状態はapp-store（isSetupWizardOpen、永続化なし）。DashboardPageがマウントする
 */
export function SetupWizardDialog() {
  const { toast } = useToast()
  const navigate = useNavigate()

  const isOpen = useAppStore((s) => s.isSetupWizardOpen)
  const initialStep = useAppStore((s) => s.setupWizardInitialStep)
  const closeSetupWizard = useAppStore((s) => s.closeSetupWizard)
  const demoDataActive = useAppStore((s) => s.demoDataActive)
  const fiscalYear = useAppStore((s) => s.fiscalYear)
  const fiscalYearStartMonth = useAppStore((s) => s.fiscalYearStartMonth)
  const setFiscalYearStartMonth = useAppStore((s) => s.setFiscalYearStartMonth)

  const estimatedUnitPrice = useBudgetStore((s) => s.estimatedUnitPrice)
  const setEstimatedUnitPrice = useBudgetStore((s) => s.setEstimatedUnitPrice)
  const workdaysPerMonth = useBudgetStore((s) => s.workdaysPerMonth)
  const setWorkdaysPerMonth = useBudgetStore((s) => s.setWorkdaysPerMonth)

  const divisions = useTeamStore((s) => s.divisions)
  const sections = useTeamStore((s) => s.sections)
  const addDivision = useTeamStore((s) => s.addDivision)
  const addSection = useTeamStore((s) => s.addSection)
  const members = useMembersStore((s) => s.members)
  const addMember = useMembersStore((s) => s.addMember)
  const projects = useProjectsStore((s) => s.projects)
  const addProject = useProjectsStore((s) => s.addProject)

  const isEmpty =
    projects.length === 0 && members.length === 0 && divisions.length === 0

  const [step, setStep] = useState<WizardStep>('welcome')
  const [confirmingSwitch, setConfirmingSwitch] = useState(false)

  // 入力state（各ステップの「次へ」でstoreへコミットする）
  const [startMonth, setStartMonth] = useState(fiscalYearStartMonth)
  const [unitPrice, setUnitPrice] = useState(estimatedUnitPrice)
  const [workdays, setWorkdays] = useState(workdaysPerMonth)
  const [divisionName, setDivisionName] = useState('')
  const [sectionNames, setSectionNames] = useState<string[]>([''])
  const [createdDivisionId, setCreatedDivisionId] = useState<string | null>(
    null,
  )
  const [memberRows, setMemberRows] = useState<MemberRow[]>([
    { name: '', sectionId: '', unitPrice: 0 },
  ])
  const [projectName, setProjectName] = useState('')
  const [applyTemplate, setApplyTemplate] = useState(true)
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null)
  const [summary, setSummary] = useState<string[]>([])

  // 開くたびに指定ステップから最新のstore値でやり直す
  useEffect(() => {
    if (!isOpen) return
    setStep(initialStep)
    setConfirmingSwitch(false)
    setStartMonth(useAppStore.getState().fiscalYearStartMonth)
    setUnitPrice(useBudgetStore.getState().estimatedUnitPrice)
    setWorkdays(useBudgetStore.getState().workdaysPerMonth)
    setDivisionName('')
    setSectionNames([''])
    setCreatedDivisionId(null)
    setMemberRows([{ name: '', sectionId: '', unitPrice: 0 }])
    setProjectName('')
    setApplyTemplate(true)
    setCreatedProjectId(null)
    setSummary([])
  }, [isOpen, initialStep])

  const stepNumber = INPUT_STEPS.indexOf(step)

  const goNextFrom = useCallback((current: WizardStep) => {
    const order: WizardStep[] = [
      'welcome',
      'basics',
      'organization',
      'members',
      'project',
      'done',
    ]
    const next = order[order.indexOf(current) + 1]
    if (next) setStep(next)
  }, [])

  // ── ようこそ: デモ分岐・本番切り替え ──────────────────────────────

  const handleStartDemo = useCallback(() => {
    try {
      loadDemoData(fiscalYear)
      toast({
        title: 'デモデータを投入しました',
        description:
          'ダッシュボードや各画面を自由に触ってみてください。本番データへの切り替えはいつでもできます',
      })
      closeSetupWizard()
    } catch (error) {
      toast({
        title: 'デモデータ投入エラー',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    }
  }, [fiscalYear, toast, closeSetupWizard])

  const handleSwitchToReal = useCallback(() => {
    try {
      clearAllBusinessData()
      setConfirmingSwitch(false)
      toast({ title: 'デモデータを削除しました' })
      setStep('basics')
    } catch (error) {
      toast({
        title: 'データクリアエラー',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    }
  }, [toast])

  // ── 各ステップのコミット ──────────────────────────────────────────

  const commitBasics = useCallback(() => {
    setFiscalYearStartMonth(startMonth)
    if (unitPrice > 0) setEstimatedUnitPrice(unitPrice)
    if (workdays > 0) setWorkdaysPerMonth(workdays)
    goNextFrom('basics')
  }, [
    startMonth,
    unitPrice,
    workdays,
    setFiscalYearStartMonth,
    setEstimatedUnitPrice,
    setWorkdaysPerMonth,
    goNextFrom,
  ])

  const commitOrganization = useCallback(() => {
    const name = divisionName.trim()
    if (name) {
      const division = addDivision(name)
      setCreatedDivisionId(division.id)
      for (const sectionName of sectionNames) {
        const trimmed = sectionName.trim()
        if (trimmed) addSection(division.id, trimmed)
      }
    }
    goNextFrom('organization')
  }, [divisionName, sectionNames, addDivision, addSection, goNextFrom])

  const commitMembers = useCallback(() => {
    let count = 0
    for (const row of memberRows) {
      const name = row.name.trim()
      if (!name) continue
      addMember({
        name,
        sectionId: row.sectionId || null,
        role: '',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory:
          row.unitPrice > 0
            ? [{ effectiveFrom: currentMonthKey(), amount: row.unitPrice }]
            : [],
      })
      count++
    }
    if (count > 0) {
      setSummary((prev) => [...prev, `担当者を${count}名登録しました`])
    }
    goNextFrom('members')
  }, [memberRows, addMember, goNextFrom])

  const commitProject = useCallback(() => {
    const name = projectName.trim()
    if (name) {
      const code = generateProjectCode(
        0,
        useProjectsStore.getState().projects,
        null,
      )
      const project = addProject({
        code,
        name,
        parentId: null,
        level: 0,
        status: 'not_started',
        confidence: null,
        completed: false,
        divisionId: createdDivisionId,
      })
      setCreatedProjectId(project.id)
      if (applyTemplate) {
        applyWbsTemplate(
          project,
          addProject,
          () => useProjectsStore.getState().projects,
        )
        setSummary((prev) => [
          ...prev,
          `プロジェクト「${name}」（${code}）を作成し、標準WBSテンプレート（14工程）を適用しました`,
        ])
      } else {
        setSummary((prev) => [
          ...prev,
          `プロジェクト「${name}」（${code}）を作成しました`,
        ])
      }
    }
    goNextFrom('project')
  }, [projectName, applyTemplate, createdDivisionId, addProject, goNextFrom])

  const handleClose = useCallback(() => {
    closeSetupWizard()
  }, [closeSetupWizard])

  // ── レンダリング ──────────────────────────────────────────────────

  const sectionOptions = useMemo(
    () =>
      sections.filter(
        (s) => !createdDivisionId || s.divisionId === createdDivisionId,
      ),
    [sections, createdDivisionId],
  )

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {stepNumber >= 0
              ? `初期設定（${stepNumber + 1}/${INPUT_STEPS.length}） ${STEP_TITLES[step]}`
              : STEP_TITLES[step]}
          </DialogTitle>
          {step === 'welcome' && !demoDataActive && (
            <DialogDescription>
              リソース計画をはじめましょう。まずデモデータで試すか、自分のデータでセットアップするかを選んでください
            </DialogDescription>
          )}
        </DialogHeader>

        {step === 'welcome' && demoDataActive && (
          <div className="space-y-3">
            <p className="text-sm">
              現在<span className="font-medium">デモデータで試用中</span>
              です。本番データへ切り替えると、デモデータをすべて削除して最初から設定します。
            </p>
            {confirmingSwitch ? (
              <div className="space-y-3 rounded-md border border-destructive/50 bg-destructive/5 p-3">
                <p className="text-sm">
                  デモデータ（プロジェクト・担当者・予算等すべて）を削除します。この操作は取り消せません。
                  残したいデータがある場合は、先に「レポート・データ管理」のJSONエクスポートで退避してください。
                </p>
                <div className="flex gap-2">
                  <Button variant="destructive" onClick={handleSwitchToReal}>
                    削除して本番データへ切り替える
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setConfirmingSwitch(false)}
                  >
                    キャンセル
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button onClick={() => setConfirmingSwitch(true)}>
                  本番データへ切り替える
                </Button>
                <Button variant="outline" onClick={handleClose}>
                  デモを続ける
                </Button>
              </div>
            )}
          </div>
        )}

        {step === 'welcome' && !demoDataActive && (
          <div className="grid gap-3 sm:grid-cols-2">
            {isEmpty && (
              <button
                type="button"
                className="rounded-lg border border-border p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
                onClick={handleStartDemo}
              >
                <p className="font-medium">デモデータで試す</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  サンプルの組織・プロジェクト・予算が入った状態で機能を体験できます。あとから本番データへ切り替えられます
                </p>
              </button>
            )}
            <button
              type="button"
              className="rounded-lg border border-border p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
              onClick={() => setStep('basics')}
            >
              <p className="font-medium">
                {isEmpty ? '自分のデータで始める' : '設定を続ける'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isEmpty
                  ? '基本設定 → 組織 → 担当者 → プロジェクトの順に、4ステップでセットアップします'
                  : '既にデータがあります。基本設定から順に見直せます'}
              </p>
            </button>
          </div>
        )}

        {step === 'basics' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              集計の前提になる全社共通の値です。あとからシステム設定（左下の歯車）で変更できます
            </p>
            <div className="flex items-center gap-3">
              <Label className="w-40 shrink-0">年度開始月</Label>
              <Select
                value={String(startMonth)}
                onValueChange={(v) => setStartMonth(Number(v))}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m}月
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Label htmlFor="wizard-unit-price" className="w-40 shrink-0">
                概算単価（1人月あたり）
              </Label>
              <NumericInput
                id="wizard-unit-price"
                aria-label="概算単価（万円）"
                value={unitPrice}
                onValueChange={setUnitPrice}
                className="w-28"
              />
              <span className="text-sm text-muted-foreground">万円</span>
            </div>
            <div className="flex items-center gap-3">
              <Label htmlFor="wizard-workdays" className="w-40 shrink-0">
                人月換算（1人月あたり）
              </Label>
              <NumericInput
                id="wizard-workdays"
                aria-label="人月換算（人日）"
                value={workdays}
                onValueChange={setWorkdays}
                className="w-28"
              />
              <span className="text-sm text-muted-foreground">人日</span>
            </div>
          </div>
        )}

        {step === 'organization' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              部門と課（チーム）を1つずつ作ります。組織が未確定ならスキップして、あとからチーム画面で作れます
            </p>
            <div className="flex items-center gap-3">
              <Label htmlFor="wizard-division" className="w-24 shrink-0">
                部門名
              </Label>
              <Input
                id="wizard-division"
                placeholder="例: 開発部"
                value={divisionName}
                onChange={(e) => setDivisionName(e.target.value)}
              />
            </div>
            {sectionNames.map((name, index) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: 入力行に安定idを持たない単純フォームのため
                key={index}
                className="flex items-center gap-3"
              >
                <Label className="w-24 shrink-0">
                  {index === 0 ? '課名' : ''}
                </Label>
                <Input
                  placeholder="例: 第1開発課"
                  aria-label={`課名${index + 1}`}
                  value={name}
                  onChange={(e) =>
                    setSectionNames((prev) =>
                      prev.map((n, i) => (i === index ? e.target.value : n)),
                    )
                  }
                />
                {sectionNames.length > 1 && (
                  <Button
                    variant="outline"
                    size="icon"
                    title="この課を削除"
                    onClick={() =>
                      setSectionNames((prev) =>
                        prev.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSectionNames((prev) => [...prev, ''])}
            >
              <Plus className="h-4 w-4" />
              課を追加
            </Button>
          </div>
        )}

        {step === 'members' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              まずは主要な担当者だけで大丈夫です。単価はアサイン・予算計算に使います（未入力可）
            </p>
            {memberRows.map((row, index) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: 入力行に安定idを持たない単純フォームのため
                key={index}
                className="flex items-center gap-2"
              >
                <Input
                  placeholder="氏名"
                  aria-label={`担当者名${index + 1}`}
                  value={row.name}
                  onChange={(e) =>
                    setMemberRows((prev) =>
                      prev.map((r, i) =>
                        i === index ? { ...r, name: e.target.value } : r,
                      ),
                    )
                  }
                />
                <Select
                  value={row.sectionId || '__none__'}
                  onValueChange={(v) =>
                    setMemberRows((prev) =>
                      prev.map((r, i) =>
                        i === index
                          ? { ...r, sectionId: v === '__none__' ? '' : v }
                          : r,
                      ),
                    )
                  }
                >
                  <SelectTrigger className="w-36 shrink-0">
                    <SelectValue placeholder="所属課" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">未所属</SelectItem>
                    {sectionOptions.map((section) => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <NumericInput
                  aria-label={`単価${index + 1}（万円）`}
                  placeholder="単価"
                  value={row.unitPrice}
                  onValueChange={(v) =>
                    setMemberRows((prev) =>
                      prev.map((r, i) =>
                        i === index ? { ...r, unitPrice: v } : r,
                      ),
                    )
                  }
                  className="w-24 shrink-0"
                />
                {memberRows.length > 1 && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    title="この行を削除"
                    onClick={() =>
                      setMemberRows((prev) =>
                        prev.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setMemberRows((prev) => [
                  ...prev,
                  { name: '', sectionId: '', unitPrice: 0 },
                ])
              }
            >
              <Plus className="h-4 w-4" />
              担当者を追加
            </Button>
          </div>
        )}

        {step === 'project' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              最初のプロジェクトを作ります。コードは自動採番されます
            </p>
            <div className="flex items-center gap-3">
              <Label htmlFor="wizard-project" className="w-32 shrink-0">
                プロジェクト名
              </Label>
              <Input
                id="wizard-project"
                placeholder="例: 基幹システム刷新"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={applyTemplate}
                onChange={(e) => setApplyTemplate(e.target.checked)}
              />
              標準WBSテンプレートを適用する（要求整理〜リリース判定の14工程を自動生成）
            </label>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-4">
            {summary.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {summary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                セットアップを終了しました。各画面からいつでもデータを作成できます
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              次はWBSで工数を見積もり、アサインで体制を組みましょう。操作に迷ったら左下の「？」からガイドツアーを起動できます
            </p>
            <div className="flex flex-wrap gap-2">
              {createdProjectId && (
                <Button
                  onClick={() => {
                    handleClose()
                    navigate(`/wbs?projectId=${createdProjectId}`)
                  }}
                >
                  WBSを開く
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  handleClose()
                  navigate('/assignment')
                }}
              >
                アサインを設定する
              </Button>
              <Button variant="outline" onClick={handleClose}>
                閉じる
              </Button>
            </div>
          </div>
        )}

        {stepNumber >= 0 && (
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="ghost"
              onClick={() => goNextFrom(step)}
              title="このステップを飛ばします（あとから各画面で設定できます）"
            >
              スキップ
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose}>
                中断する
              </Button>
              {step === 'basics' && (
                <Button onClick={commitBasics}>次へ</Button>
              )}
              {step === 'organization' && (
                <Button onClick={commitOrganization}>次へ</Button>
              )}
              {step === 'members' && (
                <Button onClick={commitMembers}>次へ</Button>
              )}
              {step === 'project' && (
                <Button onClick={commitProject}>
                  {projectName.trim() ? '作成して完了' : '完了'}
                </Button>
              )}
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
