import { AlertTriangle, FileUp, Plus } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table'
import { parseCsv } from '@/shared/utils/csv-utils'
import {
  type ImportSkip,
  KIND_LABELS,
  type MasterImportKind,
} from '@/shared/utils/master-import-core'
import {
  PREVIEW_ROW_LIMIT,
  type PreviewTable,
} from '@/shared/utils/master-import-preview'

/**
 * マスタCSV一括登録のウィザード。
 *
 * ①ファイル選択 →②ドライラン結果を見てから適用、の2ステップ。
 * 実績CSV取込（3ステップ）と違って**列マッピングの段を持たない**——
 * テンプレートで列名を配っており、`normalizeHeader`が並び順とゆらぎを吸収するため。
 *
 * 突合・検証はすべて`build*ImportPlan`（純関数）が済ませ、
 * このコンポーネントは表示と、`onApply`への委譲だけを行う。
 */

export interface MasterImportPreview {
  /** 取り込む件数 */
  candidateCount: number
  skips: ImportSkip[]
  /** 自動作成されるマスタの説明（「部門: 新規部」など） */
  newMasters: string[]
  /** 種別ごとの補足（アサインの対象月など） */
  notes: string[]
  /** 実際に登録される内容。件数だけでは列の取り違えに気づけないため必ず見せる */
  table: PreviewTable
}

interface Props {
  kind: MasterImportKind
  open: boolean
  onOpenChange: (open: boolean) => void
  /** CSVの行列からドライラン結果を作る */
  onDryRun: (
    rows: string[][],
    autoCreateMasters: boolean,
  ) => MasterImportPreview
  /** 適用する。実際の書き込みは呼び出し側の責務 */
  onApply: (rows: string[][], autoCreateMasters: boolean) => void
  /** この種別が自動作成の対象になるマスタを持つか */
  supportsAutoCreate?: boolean
}

export function MasterCsvImportDialog({
  kind,
  open,
  onOpenChange,
  onDryRun,
  onApply,
  supportsAutoCreate = true,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<string[][] | null>(null)
  const [autoCreate, setAutoCreate] = useState(true)
  const [preview, setPreview] = useState<MasterImportPreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setStep(1)
    setFileName('')
    setRows(null)
    setAutoCreate(true)
    setPreview(null)
    setError(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setFileName(file.name)
    try {
      const parsed = parseCsv(await file.text())
      if (parsed.length === 0) {
        setError('CSVに行がありません')
        setRows(null)
        return
      }
      setRows(parsed)
    } catch {
      setError('CSVを読み込めませんでした')
      setRows(null)
    }
  }

  const goToPreview = () => {
    if (!rows) return
    setPreview(onDryRun(rows, autoCreate))
    setStep(2)
  }

  const refreshPreview = (nextAutoCreate: boolean) => {
    setAutoCreate(nextAutoCreate)
    if (rows) setPreview(onDryRun(rows, nextAutoCreate))
  }

  const handleApply = () => {
    if (!rows) return
    onApply(rows, autoCreate)
    handleOpenChange(false)
  }

  const label = KIND_LABELS[kind]

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {label}の一括登録（ステップ {step}/2）
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? 'テンプレートに沿って記入したCSVを選びます（ヘッダ行必須・UTF-8、BOM可）'
              : '適用前の確認です。取り込むのは以下の行だけで、既存のデータは変更しません'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-border border-dashed p-6 text-muted-foreground text-sm hover:bg-muted/40">
              <FileUp className="h-6 w-6" />
              <span>{fileName || 'CSVファイルを選択'}</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
            </label>
            {error && <p className="text-destructive text-sm">{error}</p>}
            {rows && !error && (
              <div className="space-y-1">
                <p className="text-muted-foreground text-sm">
                  データ行 {Math.max(rows.length - 1, 0)} 件・
                  {rows[0]?.length ?? 0} 列を読み込みました（先頭5行）
                </p>
                {/* 解釈する前の生データ。列がずれていないか・文字化けしていないかを
                    ここで確かめてもらう */}
                <PreviewGrid
                  columns={rows[0] ?? []}
                  rows={rows.slice(1, 6)}
                  maxHeight="max-h-48"
                />
              </div>
            )}
          </div>
        )}

        {step === 2 && preview && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                登録 {preview.candidateCount} 件
              </Badge>
              {preview.skips.length > 0 && (
                <Badge variant="outline">
                  取り込まない {preview.skips.length} 件
                </Badge>
              )}
            </div>

            {preview.notes.length > 0 && (
              <ul className="space-y-1 text-muted-foreground text-sm">
                {preview.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}

            {supportsAutoCreate && (
              <div className="rounded-md border border-border p-3">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={autoCreate}
                    onChange={(e) => refreshPreview(e.target.checked)}
                  />
                  <span>
                    <span className="font-medium">
                      未登録の部門・課・所属会社を作成する
                    </span>
                    <span className="block text-muted-foreground text-xs">
                      外すと、登録されていないマスタを参照する行は取り込みません
                    </span>
                  </span>
                </label>

                {preview.newMasters.length > 0 && (
                  <ul className="mt-2 space-y-1 border-border border-t pt-2 text-sm">
                    {preview.newMasters.map((m) => (
                      <li key={m} className="flex items-center gap-1.5">
                        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                        {m}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {preview.table.rows.length > 0 && (
              <div className="space-y-1">
                <p className="font-medium text-sm">登録される内容</p>
                <PreviewGrid
                  columns={preview.table.columns}
                  rows={preview.table.rows.slice(0, PREVIEW_ROW_LIMIT)}
                  maxHeight="max-h-72"
                />
                {preview.table.rows.length > PREVIEW_ROW_LIMIT && (
                  <p className="text-muted-foreground text-xs">
                    ほか {preview.table.rows.length - PREVIEW_ROW_LIMIT} 件（
                    {preview.table.rows.length} 件すべてが登録されます）
                  </p>
                )}
              </div>
            )}

            {preview.skips.length > 0 && (
              <div className="rounded-md border border-border">
                <p className="flex items-center gap-1.5 border-border border-b px-3 py-2 font-medium text-sm">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  取り込まない行
                </p>
                <ul className="max-h-48 overflow-y-auto px-3 py-2 text-sm">
                  {preview.skips.map((s) => (
                    <li
                      key={`${s.row}-${s.reason}`}
                      className="text-muted-foreground"
                    >
                      <span className="tabular-nums">{s.row}行目</span>:{' '}
                      {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.candidateCount === 0 && (
              <p className="text-destructive text-sm">
                取り込める行がありません。上の理由を確認してCSVを直してください
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 1 && (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                キャンセル
              </Button>
              <Button onClick={goToPreview} disabled={!rows}>
                内容を確認
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                戻る
              </Button>
              <Button
                onClick={handleApply}
                disabled={!preview || preview.candidateCount === 0}
              >
                {preview?.candidateCount ?? 0} 件を登録
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * 読み取り専用のプレビュー表。ステップ1（生データ）とステップ2（登録される内容）で
 * 同じ見た目を使う。行の並べ替えが無いのでindexをkeyにしてよい。
 */
function PreviewGrid({
  columns,
  rows,
  maxHeight,
}: {
  columns: string[]
  rows: string[][]
  maxHeight: string
}) {
  return (
    <div
      className={`${maxHeight} overflow-auto rounded-md border border-border`}
    >
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c, i) => (
              <TableHead
                key={`${i}-${c}`}
                className="whitespace-nowrap text-xs"
              >
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, ri) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 同上
            <TableRow key={ri}>
              {columns.map((_, ci) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 同上
                <TableCell key={ci} className="whitespace-nowrap text-xs">
                  {row[ci] ?? ''}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
