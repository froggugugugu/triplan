import { MessageSquarePlus, Pencil, Trash2, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Textarea } from '@/shared/components/ui/textarea'
import type { AssignmentNote } from '@/shared/types'

/**
 * 体制メモ（案件単位の申し送り）。
 *
 * アサインは外部の実行管理ツールに存在しない本ツール固有のデータで、
 * 「なぜこの配分にしたか」「9月から増員する」を残す場所が無かった。
 * タスクのコメントを作らない（実行管理は餅は餅屋）判断とは別で、
 * **委譲先が無いデータの申し送り**をここに置く。
 */

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

interface Props {
  notes: AssignmentNote[]
  /** ヘッダー右側に置く操作（スナップショットボタン等） */
  headerAction?: ReactNode
  onAdd: (body: string) => void
  onUpdate: (id: string, body: string) => void
  onDelete: (id: string) => void
}

export function AssignmentNotesCard({
  notes,
  headerAction,
  onAdd,
  onUpdate,
  onDelete,
}: Props) {
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<AssignmentNote | null>(null)

  const submitDraft = () => {
    const body = draft.trim()
    if (!body) return
    onAdd(body)
    setDraft('')
  }

  const submitEdit = () => {
    const body = editingBody.trim()
    if (!body || !editingId) return
    onUpdate(editingId, body)
    setEditingId(null)
    setEditingBody('')
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            体制メモ
            {notes.length > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                {notes.length}件
              </span>
            )}
          </CardTitle>
          {headerAction}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="体制の申し送りを残す（例: 9月から2名増員、予算は変更なし）"
            className="min-h-[60px] flex-1"
            maxLength={2000}
          />
          <Button
            type="button"
            size="sm"
            aria-label="体制メモを追加"
            disabled={draft.trim().length === 0}
            onClick={submitDraft}
            className="gap-1"
          >
            <MessageSquarePlus className="h-4 w-4" />
            追加
          </Button>
        </div>

        {notes.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            まだメモはありません。配分を変えた理由や今後の増減の予定を残しておくと、
            後から「なぜこの体制なのか」を辿れます
          </p>
        ) : (
          <ul className="space-y-2">
            {notes.map((note) => (
              <li
                key={note.id}
                className="rounded-md border border-border bg-muted/30 p-3"
              >
                {editingId === note.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editingBody}
                      onChange={(e) => setEditingBody(e.target.value)}
                      className="min-h-[60px]"
                      maxLength={2000}
                      aria-label="メモを編集"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(null)}
                      >
                        キャンセル
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={editingBody.trim().length === 0}
                        onClick={submitEdit}
                      >
                        更新
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap text-sm">{note.body}</p>
                    <div className="mt-2 flex items-center gap-2 text-muted-foreground text-xs">
                      <span>{formatTimestamp(note.createdAt)}</span>
                      {note.authorName && <span>／ {note.authorName}</span>}
                      {note.updatedAt !== note.createdAt && (
                        <span>（編集済み）</span>
                      )}
                      <span className="flex-1" />
                      <button
                        type="button"
                        aria-label="このメモを編集"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setEditingId(note.id)
                          setEditingBody(note.body)
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="このメモを削除"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(note)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>このメモを削除しますか？</DialogTitle>
            <DialogDescription>この操作は取り消せません</DialogDescription>
          </DialogHeader>
          <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-sm">
            {deleteTarget?.body}
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              <X className="mr-1 h-4 w-4" />
              キャンセル
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (deleteTarget) onDelete(deleteTarget.id)
                setDeleteTarget(null)
              }}
            >
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
