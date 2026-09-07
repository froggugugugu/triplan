import { Trash2 } from 'lucide-react'
import { useState } from 'react'
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
import type {
  DependencyType,
  PhaseDefinition,
  PhaseDependency,
} from '@/shared/types/schedule'

const DEPENDENCY_TYPE_LABELS: Record<DependencyType, string> = {
  FS: 'FS（終了→開始）',
  SS: 'SS（開始→開始）',
  FF: 'FF（終了→終了）',
  SF: 'SF（開始→終了）',
}

interface DependencyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  phases: PhaseDefinition[]
  dependencies: PhaseDependency[]
  onAdd: (
    fromPhaseKey: string,
    toPhaseKey: string,
    type: DependencyType,
  ) => void
  onDelete: (id: string) => void
}

export function DependencyDialog({
  open,
  onOpenChange,
  phases,
  dependencies,
  onAdd,
  onDelete,
}: DependencyDialogProps) {
  const [fromPhase, setFromPhase] = useState('')
  const [toPhase, setToPhase] = useState('')
  const [depType, setDepType] = useState<DependencyType>('FS')

  const phaseNameMap = new Map(phases.map((p) => [p.phaseKey, p.name]))

  const canAdd =
    fromPhase &&
    toPhase &&
    fromPhase !== toPhase &&
    !dependencies.some(
      (d) => d.fromPhaseKey === fromPhase && d.toPhaseKey === toPhase,
    )

  const handleAdd = () => {
    if (!canAdd) return
    onAdd(fromPhase, toPhase, depType)
    setFromPhase('')
    setToPhase('')
    setDepType('FS')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>依存関係の管理</DialogTitle>
          <DialogDescription>
            工程間の依存関係を追加・削除します
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add form */}
          <div className="space-y-3 rounded-md border border-border p-3">
            <p className="text-sm font-medium">新規追加</p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="text-xs text-muted-foreground">元工程</span>
                <Combobox
                  value={fromPhase}
                  onValueChange={setFromPhase}
                  options={phases.map((p) => ({
                    value: p.phaseKey,
                    label: p.name,
                  }))}
                  placeholder="選択..."
                  searchPlaceholder="工程を検索..."
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <span className="text-xs text-muted-foreground">先工程</span>
                <Combobox
                  value={toPhase}
                  onValueChange={setToPhase}
                  options={phases.map((p) => ({
                    value: p.phaseKey,
                    label: p.name,
                  }))}
                  placeholder="選択..."
                  searchPlaceholder="工程を検索..."
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <span className="text-xs text-muted-foreground">タイプ</span>
                <Combobox
                  value={depType}
                  onValueChange={(v) => setDepType(v as DependencyType)}
                  options={(
                    Object.entries(DEPENDENCY_TYPE_LABELS) as [
                      DependencyType,
                      string,
                    ][]
                  ).map(([key, label]) => ({
                    value: key,
                    label,
                  }))}
                  searchPlaceholder="タイプを検索..."
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <Button size="sm" onClick={handleAdd} disabled={!canAdd}>
              追加
            </Button>
          </div>

          {/* Existing dependencies */}
          {dependencies.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">設定済み依存関係</p>
              <div className="space-y-1">
                {dependencies.map((dep) => (
                  <div
                    key={dep.id}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span>
                      {phaseNameMap.get(dep.fromPhaseKey) ?? dep.fromPhaseKey}
                      {' → '}
                      {phaseNameMap.get(dep.toPhaseKey) ?? dep.toPhaseKey}
                      <span className="ml-2 text-muted-foreground">
                        ({DEPENDENCY_TYPE_LABELS[dep.dependencyType]})
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => onDelete(dep.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dependencies.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              依存関係はまだ設定されていません
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            閉じる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
