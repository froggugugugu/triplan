import type {
  CellValueChangedEvent,
  ColDef,
  ICellRendererParams,
  ValueSetterParams,
} from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { CalendarClock, Receipt } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { budgetBreakdownFormSchema } from '@/infrastructure/validation/schemas'
import { cn } from '@/lib/utils'
import { gridTheme } from '@/shared/ag-grid-theme'
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
import { useToast } from '@/shared/hooks/use-toast'
import type {
  BudgetBreakdown,
  BudgetBreakdownCategory,
} from '@/shared/types/budget'
import {
  calcEstimateBreakdownAmount,
  manYenFormatter as currencyFormatter,
} from '@/shared/utils/budget-utils'
import { formatProjectNameWithConfidence } from '@/shared/utils/project-display'
import { useBudgetStore, useProjectsStore, useTeamStore } from '@/stores'
import {
  getCalendarMonthLabel,
  getFiscalYearMonthKeys,
} from '../utils/expense-budget-utils'
import { OtherExpenseActualDialog } from './OtherExpenseActualDialog'

ModuleRegistry.registerModules([AllCommunityModule])

const CATEGORY_LABELS: Record<BudgetBreakdownCategory, string> = {
  project_personnel: 'プロジェクト（人件費）',
  project_expense: 'プロジェクト（付帯費用）',
  general_expense: '一般経費',
}

// 「その他のPJ予算」= WBS概算以外の案件関連予算
const PROJECT_BREAKDOWN_CATEGORIES: BudgetBreakdownCategory[] = [
  'project_personnel',
  'project_expense',
]

function isSameCategorySet(
  a: BudgetBreakdownCategory[],
  b: BudgetBreakdownCategory[],
): boolean {
  return a.length === b.length && a.every((c) => b.includes(c))
}

interface DialogHeading {
  title: string
  description: string
  emptyText: string
  listLabel: string
}

function resolveDialogHeading(
  allowedCategories: BudgetBreakdownCategory[] | undefined,
): DialogHeading {
  if (
    allowedCategories?.length === 1 &&
    allowedCategories[0] === 'general_expense'
  ) {
    return {
      title: 'その他費用',
      description:
        'のその他費用を記録します。登録済みの費用は再編集・削除できます（運用ルールに基づき適切に管理してください）。',
      emptyText: 'その他費用はまだありません',
      listLabel: 'その他費用の一覧',
    }
  }
  if (
    allowedCategories &&
    isSameCategorySet(allowedCategories, PROJECT_BREAKDOWN_CATEGORIES)
  ) {
    return {
      title: 'その他のPJ予算',
      description:
        'のその他のPJ予算（WBS概算以外の追加調整予算）を記録します。登録済みの内訳は再編集・削除でき、実績明細も登録できます。',
      emptyText: 'その他のPJ予算はまだありません',
      listLabel: 'その他のPJ予算の一覧',
    }
  }
  return {
    title: '部門予算の内訳',
    description:
      'の予算内訳を記録します。登録済みの内訳は再編集・削除できます（運用ルールに基づき適切に管理してください）。AI利用費・SaaS費用は各機能の登録値から自動集計されます。',
    emptyText: '内訳はまだありません',
    listLabel: 'プロジェクト予算の内訳',
  }
}

function getTodayDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

interface BudgetBreakdownDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  budgetId: string | null
  divisionId: string | null
  fiscalYear: number
  startMonth: number
  divisionName: string
  // 指定時は種別選択・一覧をこの区分の集合に絞り込む（未指定時は全区分を対象とする）。
  // 1件のみの場合は種別セレクタを固定表示にする（その他費用タブからの再利用時等）
  allowedCategories?: BudgetBreakdownCategory[]
}

export function BudgetBreakdownDialog({
  open,
  onOpenChange,
  budgetId,
  divisionId,
  fiscalYear,
  startMonth,
  divisionName,
  allowedCategories,
}: BudgetBreakdownDialogProps) {
  const heading = useMemo(
    () => resolveDialogHeading(allowedCategories),
    [allowedCategories],
  )
  const lockedCategory =
    allowedCategories?.length === 1 ? allowedCategories[0] : undefined
  const { toast } = useToast()
  const addBudgetBreakdown = useBudgetStore((s) => s.addBudgetBreakdown)
  const updateBudgetBreakdown = useBudgetStore((s) => s.updateBudgetBreakdown)
  const deleteBudgetBreakdown = useBudgetStore((s) => s.deleteBudgetBreakdown)
  const budgetBreakdowns = useBudgetStore((s) => s.budgetBreakdowns)
  const getAiUsageBudgetTotal = useBudgetStore((s) => s.getAiUsageBudgetTotal)
  const getSaasAnnualCostTotal = useBudgetStore((s) => s.getSaasAnnualCostTotal)
  // AI利用費（＄建て）の万円換算に使う為替レートの変更を検知して再計算されるよう購読する
  // （requirements10）
  useBudgetStore((s) => s.exchangeRateHistory)
  const projects = useProjectsStore((s) => s.projects)
  const divisions = useTeamStore((s) => s.divisions)
  const [actualTargetId, setActualTargetId] = useState<string | null>(null)
  const [actualRecordsTarget, setActualRecordsTarget] =
    useState<BudgetBreakdown | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const defaultCategory =
    lockedCategory ?? allowedCategories?.[0] ?? 'project_personnel'
  const [category, setCategory] =
    useState<BudgetBreakdownCategory>(defaultCategory)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState(0)
  const [recordedAt, setRecordedAt] = useState(getTodayDate)
  const [projectId, setProjectId] = useState<string>('')
  // estimateAmount/coefficientが両方0より大きい値のときのみ超概算モードになる（0は「未入力」を意味する）
  const [estimateAmount, setEstimateAmount] = useState(0)
  const [coefficient, setCoefficient] = useState(0)

  const resetForm = useCallback(() => {
    setEditingId(null)
    setCategory(defaultCategory)
    setLabel('')
    setAmount(0)
    setEstimateAmount(0)
    setCoefficient(0)
    setProjectId('')
    setRecordedAt(getTodayDate())
  }, [defaultCategory])

  const isProjectCategory =
    category === 'project_personnel' || category === 'project_expense'
  const isEstimateMode = estimateAmount > 0 && coefficient > 0
  const computedAmount = isEstimateMode
    ? calcEstimateBreakdownAmount(estimateAmount, coefficient)
    : amount

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.code.localeCompare(b.code)),
    [projects],
  )
  const projectOptions = useMemo(
    () =>
      sortedProjects.map((p) => ({
        value: p.id,
        label: `${p.code} ${p.name}`,
      })),
    [sortedProjects],
  )

  // 選択中案件の担当部門（Project.divisionId）。の連動UI（自動選択・固定は
  // 行わず、計上先の現在の部門と案件の担当部門が異なる場合に気付けるようヒント表示する。
  // BudgetBreakdownDialogのdivisionId/budgetIdは呼び出し元(DivisionBudgetPanel等)が固定して
  // 渡す設計のため、ダイアログ内でDivisionBudget自体を切り替えることはしない
  const selectedProject = useMemo(
    () => sortedProjects.find((p) => p.id === projectId) ?? null,
    [sortedProjects, projectId],
  )
  const selectedProjectDivisionName = useMemo(() => {
    if (!selectedProject?.divisionId) return null
    return (
      divisions.find((d) => d.id === selectedProject.divisionId)?.name ?? null
    )
  }, [selectedProject, divisions])
  const isDivisionMismatch =
    !!selectedProject?.divisionId && selectedProject.divisionId !== divisionId

  const handleCategoryChange = useCallback((value: BudgetBreakdownCategory) => {
    setCategory(value)
    if (value === 'general_expense') {
      setProjectId('')
    }
  }, [])

  const handleProjectSelect = useCallback(
    (value: string) => {
      setProjectId(value)
      const project = sortedProjects.find((p) => p.id === value)
      if (project) {
        setLabel(
          formatProjectNameWithConfidence(project.name, project.confidence),
        )
      }
    },
    [sortedProjects],
  )

  const history = useMemo(() => {
    if (!budgetId) return []
    return budgetBreakdowns
      .filter((b) => b.budgetId === budgetId)
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
  }, [budgetBreakdowns, budgetId])

  // allowedCategories指定時は一覧表示を当該区分の集合のみに絞り込む（小計等は全区分のhistoryのまま算出する）
  const visibleHistory = useMemo(
    () =>
      allowedCategories
        ? history.filter((h) => allowedCategories.includes(h.category))
        : history,
    [history, allowedCategories],
  )

  const projectBreakdownTotal = useMemo(
    () =>
      history
        .filter((b) => b.category !== 'general_expense')
        .reduce((sum, b) => sum + b.amount, 0),
    [history],
  )
  const generalExpenseTotal = useMemo(
    () =>
      history
        .filter((b) => b.category === 'general_expense')
        .reduce((sum, b) => sum + b.amount, 0),
    [history],
  )

  const aiUsageTotal = divisionId
    ? getAiUsageBudgetTotal(divisionId, fiscalYear)
    : 0
  const saasTotal = divisionId ? getSaasAnnualCostTotal(divisionId) : 0
  const grandTotal =
    projectBreakdownTotal + generalExpenseTotal + aiUsageTotal + saasTotal

  const handleSubmit = useCallback(() => {
    if (!budgetId) return

    const result = budgetBreakdownFormSchema.safeParse({
      category,
      label,
      amount: computedAmount,
      recordedAt,
      ...(isEstimateMode ? { estimateAmount, coefficient } : {}),
      projectId: isProjectCategory && projectId ? projectId : null,
    })
    if (!result.success) {
      toast({
        title: result.error.issues[0]?.message ?? '入力内容を確認してください',
        variant: 'destructive',
      })
      return
    }

    if (editingId) {
      updateBudgetBreakdown({ id: editingId, ...result.data, budgetId })
      toast({ title: '内訳を更新しました' })
    } else {
      addBudgetBreakdown({ ...result.data, budgetId })
      toast({ title: '内訳を追加しました' })
    }
    resetForm()
  }, [
    budgetId,
    category,
    label,
    computedAmount,
    isEstimateMode,
    estimateAmount,
    coefficient,
    isProjectCategory,
    projectId,
    recordedAt,
    editingId,
    addBudgetBreakdown,
    updateBudgetBreakdown,
    resetForm,
    toast,
  ])

  const handleEdit = useCallback((breakdown: BudgetBreakdown) => {
    setEditingId(breakdown.id)
    setCategory(breakdown.category)
    setLabel(breakdown.label)
    setAmount(breakdown.amount)
    setEstimateAmount(breakdown.estimateAmount ?? 0)
    setCoefficient(breakdown.coefficient ?? 0)
    setProjectId(breakdown.projectId ?? '')
    setRecordedAt(breakdown.recordedAt)
  }, [])

  const handleDelete = useCallback(
    (id: string) => {
      deleteBudgetBreakdown(id)
      if (editingId === id) {
        resetForm()
      }
      toast({ title: '内訳を削除しました' })
    },
    [deleteBudgetBreakdown, editingId, resetForm, toast],
  )

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{heading.title}</DialogTitle>
            <DialogDescription>
              {divisionName}
              {heading.description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {lockedCategory ? (
                <div className="space-y-2">
                  <Label>種別</Label>
                  <p className="rounded border border-border bg-muted/30 px-2 py-1.5 text-sm">
                    {CATEGORY_LABELS[lockedCategory]}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="breakdown-category">種別</Label>
                  <select
                    id="breakdown-category"
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                    value={category}
                    onChange={(e) =>
                      handleCategoryChange(
                        e.target.value as BudgetBreakdownCategory,
                      )
                    }
                  >
                    {Object.entries(CATEGORY_LABELS)
                      .filter(
                        ([value]) =>
                          !allowedCategories ||
                          allowedCategories.includes(
                            value as BudgetBreakdownCategory,
                          ),
                      )
                      .map(([value, text]) => (
                        <option key={value} value={value}>
                          {text}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="breakdown-date">計上日</Label>
                <Input
                  id="breakdown-date"
                  type="date"
                  value={recordedAt}
                  onChange={(e) => setRecordedAt(e.target.value)}
                />
              </div>
            </div>

            {isProjectCategory && (
              <div className="space-y-2">
                <Label htmlFor="breakdown-project">プロジェクト（任意）</Label>
                <Combobox
                  value={projectId}
                  onValueChange={handleProjectSelect}
                  options={projectOptions}
                  placeholder="プロジェクトを選択（未選択も可）"
                  searchPlaceholder="プロジェクトを検索..."
                />
                {selectedProjectDivisionName && (
                  <p
                    className={cn(
                      'text-xs',
                      isDivisionMismatch
                        ? 'text-destructive'
                        : 'text-muted-foreground',
                    )}
                  >
                    {isDivisionMismatch
                      ? `このプロジェクトの担当部門は「${selectedProjectDivisionName}」です。現在計上先の部門「${divisionName}」と異なります。`
                      : `担当部門「${selectedProjectDivisionName}」の予算として計上します。`}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="breakdown-label">
                ラベル（プロジェクト名等）
              </Label>
              <Input
                id="breakdown-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="例: プロジェクトA"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 rounded-md border border-border p-3">
              <div className="space-y-2">
                <Label htmlFor="breakdown-estimate">概算額（万円・任意）</Label>
                <NumericInput
                  id="breakdown-estimate"
                  value={estimateAmount}
                  onValueChange={setEstimateAmount}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="breakdown-coefficient">係数（任意）</Label>
                <NumericInput
                  id="breakdown-coefficient"
                  value={coefficient}
                  onValueChange={setCoefficient}
                />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">
                概算額×係数を両方入力すると、超概算額が下の金額欄に自動反映されます（整数・万円に四捨五入）。
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="breakdown-amount">
                {isEstimateMode ? '超概算額（万円・自動計算）' : '金額（万円）'}
              </Label>
              <NumericInput
                id="breakdown-amount"
                value={isEstimateMode ? computedAmount : amount}
                disabled={isEstimateMode}
                onValueChange={setAmount}
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={handleSubmit} className="w-full">
                {editingId ? '内訳を更新' : '内訳を追加'}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  キャンセル
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label>{heading.listLabel}</Label>
              {visibleHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {heading.emptyText}
                </p>
              ) : (
                <div className="divide-y divide-border rounded-md border border-border">
                  {visibleHistory.map((h) => (
                    <div key={h.id}>
                      <div className="flex items-center justify-between px-3 py-2 text-sm">
                        <div>
                          <p>{h.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {CATEGORY_LABELS[h.category]} ・ {h.recordedAt}
                          </p>
                          {h.estimateAmount != null &&
                            h.coefficient != null && (
                              <p className="text-xs text-muted-foreground">
                                概算{currencyFormatter.format(h.estimateAmount)}
                                万円 × 係数{h.coefficient}
                              </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {currencyFormatter.format(h.amount)}万円
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="月次実績"
                            onClick={() =>
                              setActualTargetId((prev) =>
                                prev === h.id ? null : h.id,
                              )
                            }
                          >
                            <CalendarClock className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={() => setActualRecordsTarget(h)}
                          >
                            <Receipt className="h-3.5 w-3.5" />
                            実績明細
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={() => handleEdit(h)}
                          >
                            編集
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(h.id)}
                          >
                            削除
                          </Button>
                        </div>
                      </div>
                      {actualTargetId === h.id && (
                        <div className="border-t border-border bg-budget-actual/10 p-2">
                          <BudgetBreakdownActualGrid
                            breakdown={h}
                            fiscalYear={fiscalYear}
                            startMonth={startMonth}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1 rounded-md border border-budget-planned/30 bg-budget-planned/10 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  プロジェクト予算 小計
                </span>
                <span>
                  {currencyFormatter.format(projectBreakdownTotal)}万円
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">一般経費 小計</span>
                <span>{currencyFormatter.format(generalExpenseTotal)}万円</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  AI利用費（自動集計）
                </span>
                <span>{currencyFormatter.format(aiUsageTotal)}万円</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  SaaS費用（自動集計）
                </span>
                <span>{currencyFormatter.format(saasTotal)}万円</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-border pt-1 font-medium">
                <span>初期予算合計</span>
                <span>{currencyFormatter.format(grandTotal)}万円</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OtherExpenseActualDialog
        open={actualRecordsTarget !== null}
        onOpenChange={(next) => {
          if (!next) setActualRecordsTarget(null)
        }}
        breakdown={actualRecordsTarget}
      />
    </>
  )
}

interface BudgetBreakdownActualRow {
  monthKey: string
  monthLabel: string
  actualAmount: number | null
}

function BreakdownActualAmountRenderer(
  props: ICellRendererParams<BudgetBreakdownActualRow>,
) {
  if (!props.data) return null
  const value = props.data.actualAmount
  if (value === null) {
    return <span className="text-muted-foreground">未記録</span>
  }
  return <span>{currencyFormatter.format(value)}</span>
}

/**
 * 案件予算内訳（BudgetBreakdown）の月次実績入力グリッド。
 * 追記専用原則の限定的な例外として、setBudgetBreakdownActual経由でのみ更新する。
 */
function BudgetBreakdownActualGrid({
  breakdown,
  fiscalYear,
  startMonth,
}: {
  breakdown: BudgetBreakdown
  fiscalYear: number
  startMonth: number
}) {
  const setBudgetBreakdownActual = useBudgetStore(
    (s) => s.setBudgetBreakdownActual,
  )

  const rowData = useMemo<BudgetBreakdownActualRow[]>(() => {
    const monthKeys = getFiscalYearMonthKeys(fiscalYear, startMonth)
    const monthlyActuals = breakdown.monthlyActuals ?? {}
    return monthKeys.map((monthKey) => ({
      monthKey,
      monthLabel: getCalendarMonthLabel(monthKey),
      actualAmount: monthlyActuals[monthKey] ?? null,
    }))
  }, [breakdown, fiscalYear, startMonth])

  const columnDefs = useMemo<ColDef<BudgetBreakdownActualRow>[]>(
    () => [
      {
        field: 'monthLabel',
        headerName: '月',
        pinned: 'left',
        width: 90,
        editable: false,
      },
      {
        field: 'actualAmount',
        headerName: '実績額（万円）',
        editable: true,
        cellClass: 'text-right tabular-nums',
        cellRenderer: BreakdownActualAmountRenderer,
        valueSetter: (params: ValueSetterParams<BudgetBreakdownActualRow>) => {
          if (!params.data) return false
          const raw = params.newValue
          params.data.actualAmount =
            raw === '' || raw === null || raw === undefined ? null : Number(raw)
          return true
        },
      },
    ],
    [],
  )

  const handleCellValueChanged = useCallback(
    (event: CellValueChangedEvent<BudgetBreakdownActualRow>) => {
      if (!event.data) return
      const { monthKey, actualAmount } = event.data
      // actualAmount === null の場合は当該月のキーを削除して「未記録」に戻す
      setBudgetBreakdownActual(breakdown.id, monthKey, actualAmount)
    },
    [breakdown.id, setBudgetBreakdownActual],
  )

  return (
    <div style={{ height: 300 }}>
      <AgGridReact<BudgetBreakdownActualRow>
        theme={gridTheme}
        rowData={rowData}
        columnDefs={columnDefs}
        getRowId={(params) => params.data.monthKey}
        onCellValueChanged={handleCellValueChanged}
      />
    </div>
  )
}
