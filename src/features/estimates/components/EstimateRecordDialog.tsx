import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
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
import { NumericInput } from '@/shared/components/ui/numeric-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { Textarea } from '@/shared/components/ui/textarea'
import type {
  ChangeRequest,
  EstimateBasis,
  EstimateMethod,
  EstimateStage,
  EstimateWbsDetail,
  FpItem,
  FpItemType,
  FpMethod,
} from '@/shared/types'
import {
  ESTIMATE_METHODS,
  ESTIMATE_STAGES,
  FP_METHODS,
} from '@/shared/types/estimate-snapshot'
import { manYenFormatter } from '@/shared/utils/budget-utils'
import type { CalibrationHint } from '@/shared/utils/estimate-retrospective-utils'
import { ESTIMATE_METHOD_LABELS } from '@/shared/utils/estimate-snapshot-utils'
import {
  buildFpEstimate,
  calcEstimateAmount,
  FP_ITEM_TYPE_LABELS,
  FP_METHOD_LABELS,
  getCountableFpItemTypes,
  isFpItemTypeCountable,
  roundEffortDays,
} from '@/shared/utils/function-point-utils'
import {
  ESTIMATE_STAGE_LABELS,
  formatConeWidth,
} from '@/shared/utils/uncertainty-cone'
import type { RecordEstimateInput } from '@/stores/estimate-store'
import { UncertaintyConeInfo } from './UncertaintyConeInfo'

export type EstimateRecordDraft = Omit<RecordEstimateInput, 'projectId'>

interface EstimateRecordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectName: string
  /** 記録時点の設定値（凍結する） */
  basis: EstimateBasis & { hoursPerFunctionPoint: number }
  /** 現在のWBS概算（WBS法の読み取り専用表示） */
  wbsSummary: EstimateWbsDetail
  /** 紐づけ候補（承認済みの変更要求） */
  approvedChangeRequests: readonly ChangeRequest[]
  /** 前回のFP版の項目（コピーして開始できる）。無ければnull */
  previousFpItems: readonly FpItem[] | null
  /** 実績の記録の初期値（現在の実績） */
  currentActual: { effortDays: number; amount: number }
  calibration: CalibrationHint
  /** 初期の方法（振り返りタブの「実績を記録」からはactual） */
  initialMethod?: EstimateMethod
  /** 記録できたらtrueを返す（ダイアログを閉じる） */
  onSubmit: (draft: EstimateRecordDraft) => boolean
}

interface FpItemDraft {
  key: string
  name: string
  type: FpItemType
  count: number
}

function newItem(type: FpItemType = 'ILF'): FpItemDraft {
  return { key: crypto.randomUUID(), name: '', type, count: 1 }
}

/**
 * 見積の記録ダイアログ（非公開の設計文書）。
 * 方法=簡易FP: 方法選択＋項目行（名前／種別／件数）。合計FP・人日・人月・万円をライブ表示。
 * 方法=WBS: 現在のWBS概算を読み取り専用で表示し、段階とラベルを選ぶだけ。
 * 方法=手入力／実績: 人日と万円を直接入力。承認済みCRを選ぶと紐づけ、ラベルに表題を補完する。
 */
export function EstimateRecordDialog({
  open,
  onOpenChange,
  projectName,
  basis,
  wbsSummary,
  approvedChangeRequests,
  previousFpItems,
  currentActual,
  calibration,
  initialMethod = 'function_point',
  onSubmit,
}: EstimateRecordDialogProps) {
  const [method, setMethod] = useState<EstimateMethod>(initialMethod)
  const [stage, setStage] = useState<EstimateStage>(
    initialMethod === 'actual' ? 'completed' : 'product_definition',
  )
  const [label, setLabel] = useState('')
  const [fpMethod, setFpMethod] = useState<FpMethod>('nesma_indicative')
  const [items, setItems] = useState<FpItemDraft[]>([newItem()])
  const [manualEffortDays, setManualEffortDays] = useState(
    initialMethod === 'actual' ? currentActual.effortDays : 0,
  )
  const [manualAmount, setManualAmount] = useState(
    initialMethod === 'actual' ? currentActual.amount : 0,
  )
  const [changeRequestId, setChangeRequestId] = useState('')
  const [note, setNote] = useState('')

  const resetForm = () => {
    setMethod(initialMethod)
    setStage(initialMethod === 'actual' ? 'completed' : 'product_definition')
    setLabel('')
    setFpMethod('nesma_indicative')
    setItems([newItem()])
    setManualEffortDays(
      initialMethod === 'actual' ? currentActual.effortDays : 0,
    )
    setManualAmount(initialMethod === 'actual' ? currentActual.amount : 0)
    setChangeRequestId('')
    setNote('')
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm()
    onOpenChange(next)
  }

  const handleMethodChange = (next: EstimateMethod) => {
    setMethod(next)
    if (next === 'actual') {
      setStage('completed')
      setManualEffortDays(currentActual.effortDays)
      setManualAmount(currentActual.amount)
    } else if (stage === 'completed') {
      setStage('product_definition')
    }
  }

  const countableTypes = useMemo(
    () => getCountableFpItemTypes(fpMethod),
    [fpMethod],
  )
  const validItems = useMemo<FpItem[]>(
    () =>
      items
        .filter((i) => i.name.trim().length > 0 && i.count >= 1)
        .map((i) => ({ name: i.name.trim(), type: i.type, count: i.count })),
    [items],
  )
  const uncountableRows = useMemo(
    () => items.filter((i) => !isFpItemTypeCountable(fpMethod, i.type)),
    [items, fpMethod],
  )
  const fpResult = useMemo(
    () => buildFpEstimate(fpMethod, validItems, basis),
    [fpMethod, validItems, basis],
  )
  const wbsEffortDays = roundEffortDays(wbsSummary.totalEffortDays)
  const wbsAmount = calcEstimateAmount(wbsEffortDays, basis)

  const preview =
    method === 'function_point'
      ? { effortDays: fpResult.effortDays, amount: fpResult.amount }
      : method === 'wbs'
        ? { effortDays: wbsEffortDays, amount: wbsAmount }
        : {
            effortDays: roundEffortDays(manualEffortDays),
            amount: Math.round(manualAmount),
          }
  const effortMonths =
    basis.workdaysPerMonth > 0 ? preview.effortDays / basis.workdaysPerMonth : 0

  const canSubmit =
    label.trim().length > 0 &&
    (method !== 'function_point' ||
      (validItems.length > 0 &&
        validItems.length === items.length &&
        uncountableRows.length === 0))

  const handleSubmit = () => {
    if (!canSubmit) return
    const common = {
      stage,
      label: label.trim(),
      basis,
      changeRequestId: changeRequestId || null,
      note: note.trim() || undefined,
    }
    let draft: EstimateRecordDraft
    if (method === 'function_point') {
      draft = {
        ...common,
        method,
        effortDays: fpResult.effortDays,
        amount: fpResult.amount,
        fp: { method: fpMethod, items: validItems, totalFp: fpResult.totalFp },
      }
    } else if (method === 'wbs') {
      draft = {
        ...common,
        method,
        effortDays: wbsEffortDays,
        amount: wbsAmount,
        wbs: wbsSummary,
      }
    } else {
      draft = {
        ...common,
        method,
        stage: method === 'actual' ? 'completed' : stage,
        effortDays: preview.effortDays,
        amount: preview.amount,
      }
    }
    if (onSubmit(draft)) {
      resetForm()
      onOpenChange(false)
    }
  }

  const updateItem = (key: string, patch: Partial<FpItemDraft>) =>
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    )

  const crOptions = useMemo(
    () => [
      { value: '', label: '（紐づけない）' },
      ...approvedChangeRequests.map((cr) => ({
        value: cr.id,
        label: cr.title,
      })),
    ],
    [approvedChangeRequests],
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>見積を記録 — {projectName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>方法</Label>
              <Select
                value={method}
                onValueChange={(v) => handleMethodChange(v as EstimateMethod)}
              >
                <SelectTrigger aria-label="方法">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTIMATE_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {ESTIMATE_METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Label>段階</Label>
                <UncertaintyConeInfo />
              </div>
              <Select
                value={stage}
                onValueChange={(v) => setStage(v as EstimateStage)}
                disabled={method === 'actual'}
              >
                <SelectTrigger aria-label="段階">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTIMATE_STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ESTIMATE_STAGE_LABELS[s]}（{formatConeWidth(s)}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="estimate-label">ラベル</Label>
            <Input
              id="estimate-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例: 引合時の超概算 ／ 要件確定後のWBS"
              maxLength={100}
            />
          </div>

          {method === 'function_point' && (
            <div className="space-y-2 rounded border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Label>FPの方法</Label>
                  <Select
                    value={fpMethod}
                    onValueChange={(v) => setFpMethod(v as FpMethod)}
                  >
                    <SelectTrigger className="w-44" aria-label="FPの方法">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FP_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {FP_METHOD_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {previousFpItems && previousFpItems.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setItems(
                        previousFpItems.map((item) => ({
                          key: crypto.randomUUID(),
                          name: item.name,
                          type: item.type,
                          count: item.count,
                        })),
                      )
                    }
                  >
                    前回のFP項目をコピー
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {fpMethod === 'nesma_indicative'
                  ? 'データの塊（ILF・EIF）だけを数えます。画面・帳票が挙がったら推定法へ。'
                  : '画面・帳票（EI・EO・EQ）とデータ（ILF・EIF）を数えます。複雑度は評価しません。'}
              </p>
              <div className="space-y-1.5">
                {items.map((item) => (
                  <div key={item.key} className="flex items-center gap-2">
                    <Input
                      value={item.name}
                      onChange={(e) =>
                        updateItem(item.key, { name: e.target.value })
                      }
                      placeholder="機能・データの名前"
                      aria-label="FP項目の名前"
                      maxLength={200}
                    />
                    <Select
                      value={item.type}
                      onValueChange={(v) =>
                        updateItem(item.key, { type: v as FpItemType })
                      }
                    >
                      <SelectTrigger className="w-56" aria-label="FP項目の種別">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {countableTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {FP_ITEM_TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <NumericInput
                      className="w-20 text-right"
                      value={item.count}
                      onValueChange={(v) =>
                        updateItem(item.key, { count: Math.round(v) })
                      }
                      aria-label="FP項目の件数"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label="FP項目を削除"
                      onClick={() =>
                        setItems((prev) =>
                          prev.filter((i) => i.key !== item.key),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              {uncountableRows.length > 0 && (
                <p className="text-xs text-destructive">
                  概算法ではILF・EIFのみ数えます。EI・EO・EQの行は種別を変えるか、推定法へ切り替えてください。
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setItems((prev) => [...prev, newItem(countableTypes[0])])
                }
              >
                <Plus className="mr-1 h-4 w-4" />
                行を追加
              </Button>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                <span className="text-muted-foreground">合計FP</span>
                <span className="text-right tabular-nums">
                  {fpResult.totalFp}
                </span>
                <span className="text-muted-foreground">人時/FP</span>
                <span className="text-right tabular-nums">
                  {basis.hoursPerFunctionPoint}
                </span>
              </div>
              {calibration.medianHoursPerFp !== null && (
                <p className="text-xs text-muted-foreground">
                  完了案件{calibration.sampleCount}件の実績 人時/FP 中央値:{' '}
                  {calibration.medianHoursPerFp.toFixed(2)}（設定値:{' '}
                  {basis.hoursPerFunctionPoint}）
                </p>
              )}
            </div>
          )}

          {method === 'wbs' && (
            <div className="space-y-1 rounded border border-border p-3 text-sm">
              <p className="text-muted-foreground text-xs">
                現在のWBS概算をそのまま記録します（WBS画面の概算予算と同じ数字）
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                <span className="text-muted-foreground">リーフタスク</span>
                <span className="text-right tabular-nums">
                  {wbsSummary.leafCount}件
                </span>
                <span className="text-muted-foreground">WBS工数</span>
                <span className="text-right tabular-nums">
                  {wbsEffortDays.toFixed(2)}人日
                </span>
              </div>
            </div>
          )}

          {(method === 'manual' || method === 'actual') && (
            <div className="grid gap-3 rounded border border-border p-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="estimate-effort-days">
                  {method === 'actual' ? '実績工数（人日）' : '工数（人日）'}
                </Label>
                <NumericInput
                  id="estimate-effort-days"
                  className="text-right"
                  value={manualEffortDays}
                  onValueChange={setManualEffortDays}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="estimate-amount">
                  {method === 'actual' ? '実コスト（万円）' : '金額（万円）'}
                </Label>
                <NumericInput
                  id="estimate-amount"
                  className="text-right"
                  value={manualAmount}
                  onValueChange={setManualAmount}
                />
              </div>
              {method === 'actual' && (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  初期値は現在の実績（アサインの実績優先の合算と実コスト）です。完了時の確定値へ直して記録してください。
                </p>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>変更要求（承認済み）との紐づけ</Label>
              <Combobox
                value={changeRequestId}
                onValueChange={(value) => {
                  setChangeRequestId(value)
                  const cr = approvedChangeRequests.find((c) => c.id === value)
                  if (cr && label.trim().length === 0) setLabel(cr.title)
                }}
                options={crOptions}
                placeholder="（紐づけない）"
                aria-label="変更要求との紐づけ"
                disabled={approvedChangeRequests.length === 0}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="estimate-note">メモ</Label>
              <Textarea
                id="estimate-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={1000}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted/50 px-3 py-2 text-sm">
            <span className="tabular-nums">
              {preview.effortDays.toFixed(2)}人日（{effortMonths.toFixed(2)}
              人月）／ {manYenFormatter.format(preview.amount)}万円
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              幅 {formatConeWidth(method === 'actual' ? 'completed' : stage)}
            </span>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
              記録
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
