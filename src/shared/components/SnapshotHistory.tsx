import { Download, Save, Trash2 } from 'lucide-react'
import { useCallback, useState } from 'react'
import { jsonStorage, snapshotStorage } from '@/infrastructure/storage'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table'
import { useToast } from '@/shared/hooks/use-toast'
import type { SnapshotMeta } from '@/shared/types'
import { SnapshotTagSchema } from '@/shared/types/snapshot'

/**
 * SnapshotHistoryは`features/reports`から`shared/components`へ移設した。
 * 管理画面（features/admin）の「データ管理」から使うため。
 * features間の直接importは依存方向ルールで禁止されており、
 * 本コンポーネントはshared/infrastructureにしか依存していないので共有層へ置ける。
 */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}

function formatDateTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function SnapshotHistory() {
  const { toast } = useToast()
  const [metaList, setMetaList] = useState<SnapshotMeta[]>(() =>
    snapshotStorage.getMetaList(),
  )
  const [dialogOpen, setDialogOpen] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [tagError, setTagError] = useState('')

  const refreshList = useCallback(() => {
    setMetaList(snapshotStorage.getMetaList())
  }, [])

  const handleOpenDialog = useCallback(() => {
    setTagInput('')
    setTagError('')
    setDialogOpen(true)
  }, [])

  const handleCloseDialog = useCallback((open: boolean) => {
    if (!open) {
      setTagInput('')
      setTagError('')
    }
    setDialogOpen(open)
  }, [])

  const handleSave = useCallback(() => {
    // クライアント側バリデーション
    const tagResult = SnapshotTagSchema.safeParse(tagInput)
    if (!tagResult.success) {
      setTagError(tagResult.error.errors[0]?.message ?? 'タグが不正です')
      return
    }

    const db = jsonStorage.load()
    const result = snapshotStorage.saveSnapshot(tagInput, db, db.version)

    if (!result.success) {
      setTagError(result.error)
      return
    }

    setDialogOpen(false)
    setTagInput('')
    setTagError('')
    refreshList()
    toast({ title: `スナップショット「${tagInput}」を保存しました` })
  }, [tagInput, refreshList, toast])

  const handleDownload = useCallback(
    (meta: SnapshotMeta) => {
      const entry = snapshotStorage.getSnapshotById(meta.id)
      if (!entry) {
        toast({
          title: 'スナップショットが見つかりません',
          variant: 'destructive',
        })
        return
      }

      const json = JSON.stringify(entry.data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `v${meta.version}-${meta.tag}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast({
        title: `v${meta.version}-${meta.tag}.json をダウンロードしました`,
      })
    },
    [toast],
  )

  const handleDelete = useCallback(
    (meta: SnapshotMeta) => {
      if (!window.confirm(`スナップショット「${meta.tag}」を削除しますか？`)) {
        return
      }

      const deleted = snapshotStorage.deleteSnapshot(meta.id)
      if (deleted) {
        refreshList()
        toast({ title: `スナップショット「${meta.tag}」を削除しました` })
      }
    },
    [refreshList, toast],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {metaList.length} / 20 件
        </p>
        <Button onClick={handleOpenDialog} variant="outline">
          <Save className="h-4 w-4" />
          タグ付き保存
        </Button>
      </div>

      {metaList.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>タグ名</TableHead>
              <TableHead>バージョン</TableHead>
              <TableHead>年度</TableHead>
              <TableHead>保存日時</TableHead>
              <TableHead>サイズ</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metaList.map((meta) => (
              <TableRow key={meta.id}>
                <TableCell className="font-medium">{meta.tag}</TableCell>
                <TableCell>{meta.version}</TableCell>
                <TableCell>{meta.fiscalYear}</TableCell>
                <TableCell>{formatDateTime(meta.createdAt)}</TableCell>
                <TableCell>{formatBytes(meta.dataSize)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDownload(meta)}
                      title="ダウンロード"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(meta)}
                      title="削除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="py-4 text-center text-sm text-muted-foreground">
          スナップショットはまだありません
        </p>
      )}

      <Dialog open={dialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>タグ付き保存</DialogTitle>
            <DialogDescription>
              現在のデータのスナップショットをタグ名を付けて保存します。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="snapshot-tag">タグ名</Label>
            <Input
              id="snapshot-tag"
              value={tagInput}
              onChange={(e) => {
                setTagInput(e.target.value)
                setTagError('')
              }}
              placeholder="例: release-1.0, sprint-3"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSave()
                }
              }}
            />
            {tagError ? (
              <p className="text-sm text-destructive">{tagError}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                半角英数字・ドット・ハイフン・アンダースコアが使用できます
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleCloseDialog(false)}>
              キャンセル
            </Button>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
