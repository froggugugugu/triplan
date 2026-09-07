import { ArrowDown, ArrowUp, Download, Save, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
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
import { useToast } from '@/shared/hooks/use-toast'
import type { CsvMappingColumn } from '@/shared/types/csv-mapping'
import {
  applyMappingProfile,
  buildDefaultColumns,
  buildMappedCsv,
  type CsvExportRow,
  type CsvSourceDefinition,
} from '@/shared/utils/csv-mapping-utils'
import { CSV_BOM } from '@/shared/utils/csv-utils'
import { useCsvMappingStore } from '@/stores'

const NEW_PROFILE_VALUE = '__default__'

interface CsvMappingExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  source: CsvSourceDefinition
  rows: CsvExportRow[]
  /** 拡張子なしのダウンロードファイル名（例: `請求データ_2026年度`） */
  fileName: string
}

/**
 * 汎用CSVエクスポートのマッピングエディタ（非公開の設計文書 Phase B、
 *）。列の有効/無効・並び替え・ヘッダ名変更（外部システム側の列名へ改名）を
 * GUIで編集し、プロファイルとして保存して使い回す。呼び出し側（各機能）は
 * データソース定義と行データを渡すだけ（汎用機能＋機能別特化の分担）。
 */
export function CsvMappingExportDialog({
  open,
  onOpenChange,
  source,
  rows,
  fileName,
}: CsvMappingExportDialogProps) {
  const { toast } = useToast()
  const profiles = useCsvMappingStore((s) => s.csvMappingProfiles)
  const loadProfiles = useCsvMappingStore((s) => s.loadCsvMappingProfiles)
  const addProfile = useCsvMappingStore((s) => s.addCsvMappingProfile)
  const updateProfile = useCsvMappingStore((s) => s.updateCsvMappingProfile)
  const deleteProfile = useCsvMappingStore((s) => s.deleteCsvMappingProfile)

  const sourceProfiles = useMemo(
    () =>
      profiles
        .filter((p) => p.sourceKey === source.key && p.direction === 'export')
        .sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    [profiles, source.key],
  )

  const [selectedProfileId, setSelectedProfileId] = useState(NEW_PROFILE_VALUE)
  const [columns, setColumns] = useState<CsvMappingColumn[]>([])
  const [includeHeader, setIncludeHeader] = useState(true)
  const [profileName, setProfileName] = useState('')

  useEffect(() => {
    if (!open) return
    loadProfiles()
    setSelectedProfileId(NEW_PROFILE_VALUE)
    setColumns(buildDefaultColumns(source.fields))
    setIncludeHeader(true)
    setProfileName('')
  }, [open, source, loadProfiles])

  const handleSelectProfile = useCallback(
    (value: string) => {
      setSelectedProfileId(value)
      if (value === NEW_PROFILE_VALUE) {
        setColumns(buildDefaultColumns(source.fields))
        setIncludeHeader(true)
        setProfileName('')
        return
      }
      const profile = profiles.find((p) => p.id === value)
      if (!profile) return
      // プロファイル作成後にカタログへ追加されたフィールドは、無効状態で末尾に補完する
      // （保存済みプロファイルがソースの進化で壊れない=弱参照の編集面）
      const known = new Set(profile.columns.map((c) => c.field))
      const maxOrder = profile.columns.reduce(
        (max, c) => Math.max(max, c.order),
        -1,
      )
      const missing = source.fields
        .filter((f) => !known.has(f.key))
        .map((f, i) => ({
          field: f.key,
          header: f.label,
          enabled: false,
          order: maxOrder + 1 + i,
        }))
      setColumns([...profile.columns, ...missing])
      setIncludeHeader(profile.includeHeader)
      setProfileName(profile.name)
    },
    [profiles, source.fields],
  )

  const sortedColumns = useMemo(
    () => [...columns].sort((a, b) => a.order - b.order),
    [columns],
  )

  const updateColumn = useCallback(
    (field: string, patch: Partial<CsvMappingColumn>) => {
      setColumns((prev) =>
        prev.map((c) => (c.field === field ? { ...c, ...patch } : c)),
      )
    },
    [],
  )

  const moveColumn = useCallback((field: string, direction: -1 | 1) => {
    setColumns((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order)
      const index = sorted.findIndex((c) => c.field === field)
      const targetIndex = index + direction
      if (index < 0 || targetIndex < 0 || targetIndex >= sorted.length) {
        return prev
      }
      // 並びを正規化してから隣接要素とorderを入れ替える
      const reordered = sorted.map((c, i) => ({ ...c, order: i }))
      const self = reordered[index]
      const target = reordered[targetIndex]
      if (!self || !target) return prev
      self.order = targetIndex
      target.order = index
      return reordered
    })
  }, [])

  const preview = useMemo(
    () =>
      applyMappingProfile(rows.slice(0, 5), {
        columns,
        includeHeader: true,
      }),
    [rows, columns],
  )

  const enabledCount = columns.filter((c) => c.enabled).length

  const handleSave = useCallback(() => {
    const name = profileName.trim()
    if (!name) {
      toast({
        title: 'プロファイル名を入力してください',
        variant: 'destructive',
      })
      return
    }
    if (selectedProfileId === NEW_PROFILE_VALUE) {
      const created = addProfile({
        name,
        sourceKey: source.key,
        direction: 'export',
        columns,
        includeHeader,
      })
      setSelectedProfileId(created.id)
      toast({ title: `プロファイル「${name}」を保存しました` })
    } else {
      updateProfile(selectedProfileId, { name, columns, includeHeader })
      toast({ title: `プロファイル「${name}」を更新しました` })
    }
  }, [
    profileName,
    selectedProfileId,
    columns,
    includeHeader,
    source.key,
    addProfile,
    updateProfile,
    toast,
  ])

  const handleDelete = useCallback(() => {
    if (selectedProfileId === NEW_PROFILE_VALUE) return
    deleteProfile(selectedProfileId)
    handleSelectProfile(NEW_PROFILE_VALUE)
    toast({ title: 'プロファイルを削除しました' })
  }, [selectedProfileId, deleteProfile, handleSelectProfile, toast])

  const handleDownload = useCallback(() => {
    const csv = buildMappedCsv(rows, { columns, includeHeader })
    const blob = new Blob([CSV_BOM + csv], {
      type: 'text/csv;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${fileName}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast({ title: `${fileName}.csv をダウンロードしました` })
  }, [rows, columns, includeHeader, fileName, toast])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>CSVエクスポート: {source.label}</DialogTitle>
          <DialogDescription>
            外部システムの取込レイアウトに合わせて、列の有効/無効・並び・ヘッダ名を調整できます。プロファイルとして保存すると次回から使い回せます
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedProfileId} onValueChange={handleSelectProfile}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NEW_PROFILE_VALUE}>
                既定（全列・元の並び）
              </SelectItem>
              {sourceProfiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="w-56"
            placeholder="プロファイル名（保存用）"
            aria-label="プロファイル名"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
          />
          <Button variant="outline" size="sm" onClick={handleSave}>
            <Save className="h-4 w-4" />
            {selectedProfileId === NEW_PROFILE_VALUE ? '保存' : '更新'}
          </Button>
          {selectedProfileId !== NEW_PROFILE_VALUE && (
            <Button
              variant="outline"
              size="sm"
              title="このプロファイルを削除"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">出力</TableHead>
                <TableHead>元の列</TableHead>
                <TableHead>出力ヘッダ名</TableHead>
                <TableHead className="w-24">並び</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedColumns.map((column, index) => {
                const field = source.fields.find((f) => f.key === column.field)
                return (
                  <TableRow key={column.field}>
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`${field?.label ?? column.field}を出力する`}
                        checked={column.enabled}
                        onChange={(e) =>
                          updateColumn(column.field, {
                            enabled: e.target.checked,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {field?.label ?? `（廃止列: ${column.field}）`}
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8"
                        aria-label={`${field?.label ?? column.field}のヘッダ名`}
                        value={column.header}
                        onChange={(e) =>
                          updateColumn(column.field, {
                            header: e.target.value,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="上へ"
                          disabled={index === 0}
                          onClick={() => moveColumn(column.field, -1)}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="下へ"
                          disabled={index === sortedColumns.length - 1}
                          onClick={() => moveColumn(column.field, 1)}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeHeader}
            onChange={(e) => setIncludeHeader(e.target.checked)}
          />
          ヘッダ行を出力する（ヘッダ無し取込を要求する外部システム向けにOFFにできます）
        </label>

        <div>
          <p className="mb-1 text-sm font-medium">
            プレビュー（先頭5行・{rows.length}行中）
          </p>
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  {(preview[0] ?? []).map((header, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: プレビューは読み取り専用の一時表示
                    <TableHead key={i} className="whitespace-nowrap text-xs">
                      {String(header)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.slice(1).map((row, rowIndex) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 同上
                  <TableRow key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: 同上
                      <TableCell key={cellIndex} className="text-xs">
                        {String(cell)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {enabledCount}列を出力（UTF-8 BOM付き・Excelでそのまま開けます）
          </p>
          <Button onClick={handleDownload} disabled={enabledCount === 0}>
            <Download className="h-4 w-4" />
            CSVをダウンロード
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
