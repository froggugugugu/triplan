import { Download } from 'lucide-react'
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
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import type { Project } from '@/shared/types/project'
import { CSV_BOM, toCsvContent } from '@/shared/utils/csv-utils'
import {
  buildWbsExportRows,
  TASK_SYNC_EXPORT_FORMATS,
  TASK_SYNC_TOOL_LABELS,
  type TaskSyncExportFormat,
} from '../utils/task-sync-utils'

interface TaskSyncExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 選択中のトップレベルプロジェクト */
  rootProject: Project | null
  projects: Project[]
}

/**
 * 連携用WBSエクスポート（非公開の設計文書）。
 * リーフタスクを「[コード] タスク名」の件名＋直近親のグループ列で出力し、
 * 外部ツールの標準CSVインポートへ渡す（行きの初手）。帰りの完了同期は
 * 件名内のコードが突合キーになる。
 */
export function TaskSyncExportDialog({
  open,
  onOpenChange,
  rootProject,
  projects,
}: TaskSyncExportDialogProps) {
  const [format, setFormat] = useState<TaskSyncExportFormat>('generic')

  const rows = useMemo(() => {
    if (!open || !rootProject) return []
    return buildWbsExportRows(rootProject.id, projects, format)
  }, [open, rootProject, projects, format])

  const taskCount = Math.max(rows.length - 1, 0)

  const handleDownload = () => {
    if (!rootProject || taskCount === 0) return
    const csv = CSV_BOM + toCsvContent(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wbs-${rootProject.code}-${format}.csv`
    a.click()
    URL.revokeObjectURL(url)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>連携用CSVエクスポート</DialogTitle>
          <DialogDescription>
            {rootProject
              ? `「${rootProject.code} ${rootProject.name}」のリーフタスク${taskCount}件を、外部ツールのインポート形式で出力します。件名の [コード] が完了同期の突合キーになるため削除しないでください`
              : 'プロジェクトを選択してください'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3">
          <Label className="w-32 shrink-0 text-sm">出力形式</Label>
          <Select
            value={format}
            onValueChange={(v) => setFormat(v as TaskSyncExportFormat)}
          >
            <SelectTrigger className="h-8 flex-1" aria-label="出力形式">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_SYNC_EXPORT_FORMATS.map((value) => (
                <SelectItem key={value} value={value}>
                  {TASK_SYNC_TOOL_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          階層は直近親のグループ列（Backlog=カテゴリー／Asana=Section／Jira=Epic
          Link）として出力されます。期日列は空で出力されるため、必要に応じて取込後に設定してください
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button onClick={handleDownload} disabled={taskCount === 0}>
            <Download className="h-3.5 w-3.5" />
            ダウンロード
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
