import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'

interface NameInputDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  defaultValue?: string
  onSubmit: (name: string) => void
}

export function NameInputDialog({
  open,
  onOpenChange,
  title,
  defaultValue = '',
  onSubmit,
}: NameInputDialogProps) {
  const [name, setName] = useState(defaultValue)

  useEffect(() => {
    if (open) {
      setName(defaultValue)
    }
  }, [open, defaultValue])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = name.trim()
      if (trimmed.length === 0) return
      onSubmit(trimmed)
      onOpenChange(false)
    },
    [name, onSubmit, onOpenChange],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">名称</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="名称を入力"
              maxLength={100}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={name.trim().length === 0}>
              {defaultValue ? '更新' : '追加'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
