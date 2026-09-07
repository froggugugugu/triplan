import { useMemo, useState } from 'react'
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
import { Label } from '@/shared/components/ui/label'
import { NumericInput } from '@/shared/components/ui/numeric-input'
import type { Member } from '@/shared/types/member'
import type { Project } from '@/shared/types/project'
import { formatMonthLabel } from '../utils/monthly-actuals-utils'

interface AddUnplannedActualDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  month: string
  members: Member[]
  projects: Project[]
  onAdd: (
    projectId: string,
    taskId: string,
    memberId: string,
    value: number,
  ) => void
}

/**
 * 計画外の実績を追加するダイアログ（DESIGN §4.4）。
 * 計画（monthlyValues）に配分の無い案件×タスクへ実績だけを記録する。
 * AC算出は既に計画・実績キーの和集合を走査するため、計算側の変更は不要。
 */
export function AddUnplannedActualDialog({
  open,
  onOpenChange,
  month,
  members,
  projects,
  onAdd,
}: AddUnplannedActualDialogProps) {
  const [memberId, setMemberId] = useState('')
  const [rootId, setRootId] = useState('')
  const [taskId, setTaskId] = useState('')
  const [value, setValue] = useState(0)

  const rootProjects = useMemo(
    () => projects.filter((p) => p.level === 0),
    [projects],
  )

  // 選択したトップレベル案件配下のリーフタスク（子を持たないlevel>0ノード）
  const leafTasks = useMemo(() => {
    if (!rootId) return []
    const byParent = new Map<string | null, Project[]>()
    for (const p of projects) {
      const list = byParent.get(p.parentId) ?? []
      list.push(p)
      byParent.set(p.parentId, list)
    }
    const result: Project[] = []
    const walk = (parentId: string) => {
      for (const child of byParent.get(parentId) ?? []) {
        const grandChildren = byParent.get(child.id) ?? []
        if (grandChildren.length === 0) {
          result.push(child)
        } else {
          walk(child.id)
        }
      }
    }
    walk(rootId)
    return result
  }, [projects, rootId])

  const canSubmit = memberId && rootId && taskId && value > 0

  const handleSubmit = () => {
    if (!canSubmit) return
    onAdd(rootId, taskId, memberId, value)
    onOpenChange(false)
    setMemberId('')
    setRootId('')
    setTaskId('')
    setValue(0)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>計画外の実績を追加</DialogTitle>
          <DialogDescription>
            {formatMonthLabel(month)}
            に、アサイン計画のない稼働実績を記録します（計画には影響しません）。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>担当者</Label>
            <Combobox
              value={memberId}
              onValueChange={setMemberId}
              options={members
                .filter((m) => m.isActive)
                .map((m) => ({ value: m.id, label: m.name }))}
              placeholder="担当者を選択"
              searchPlaceholder="担当者を検索..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>プロジェクト</Label>
            <Combobox
              value={rootId}
              onValueChange={(v) => {
                setRootId(v)
                setTaskId('')
              }}
              options={rootProjects.map((p) => ({
                value: p.id,
                label: `${p.code} ${p.name}`,
              }))}
              placeholder="プロジェクトを選択"
              searchPlaceholder="プロジェクトを検索..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>タスク</Label>
            <Combobox
              value={taskId}
              onValueChange={setTaskId}
              options={leafTasks.map((t) => ({
                value: t.id,
                label: `${t.code} ${t.name}`,
              }))}
              placeholder={
                rootId ? 'タスクを選択' : '先にプロジェクトを選択してください'
              }
              searchPlaceholder="タスクを検索..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>実績（人月）</Label>
            <NumericInput
              value={value}
              onValueChange={setValue}
              className="w-32"
              placeholder="0.50"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            追加
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
