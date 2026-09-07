import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import type { EffortEntry } from '@/shared/types/effort'
import type { ProjectTreeNode } from '@/shared/types/project'
import {
  createDefaultWbsSettings,
  type WbsSettings,
} from '@/shared/types/wbs-settings'
import {
  calcProjectEstimateBudget,
  manYenFormatter,
  WORKDAYS_PER_MONTH,
} from '@/shared/utils/budget-utils'
import {
  calcWhatIfTotalEffort,
  computeEffortDisplayValues,
  formatEffort,
} from '@/shared/utils/effort-utils'

interface WhatIfSimulationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: ProjectTreeNode | null
  efforts: EffortEntry[]
  settingsMap: Record<string, WbsSettings>
  estimatedUnitPrice: number
  // 人月換算の1人月あたり人日（P0-a設定化）。省略時は従来の固定値20
  workdaysPerMonth?: number
  coefficient: number
}

/**
 * 概算予算額（WBS工数ベース）が「高すぎる」と判断された際に、どのタスク（機能）を
 * 削ればどれだけ予算が減るかを試算するダイアログ。`ProjectsPage.tsx`から個別プロジェクトの
 * WBSタスクツリーを対象に起動する。チェックした（除外した）タスクとその配下は
 * `calcWhatIfTotalEffort`で集計から除外され、シミュレーション後の概算予算額を即座に表示する。
 * 実データ（efforts等）は一切変更しない、読み取り専用のシミュレーションに徹する
 * （`features/budget`は一切importしない。依存方向ルール遵守。`ProjectEvmDialog`と同じ設計方針）。
 */
export function WhatIfSimulationDialog({
  open,
  onOpenChange,
  project,
  efforts,
  settingsMap,
  estimatedUnitPrice,
  workdaysPerMonth = WORKDAYS_PER_MONTH,
  coefficient,
}: WhatIfSimulationDialogProps) {
  const [excludedTaskIds, setExcludedTaskIds] = useState<Set<string>>(new Set())

  // ダイアログを開くたび・対象プロジェクトが変わるたびに選択状態をリセットする。
  // project?.idはエフェクト本文で未参照だが、開いたまま対象プロジェクトが
  // 切り替わるケースを取りこぼさないため意図的に依存配列へ残す
  // （BiomeのuseExhaustiveDependenciesは誤検知として除去を提案するが適用しない）
  useEffect(() => {
    if (open) {
      setExcludedTaskIds(new Set())
    }
  }, [open, project?.id])

  const columnIds = useMemo(() => {
    if (!project) return []
    const settings = settingsMap[project.id] ?? createDefaultWbsSettings()
    return settings.effortColumns.filter((c) => c.enabled).map((c) => c.id)
  }, [project, settingsMap])

  // タスクごとの工数（配下ロールアップ後、人日）。チェックリストの各行に表示する参考値
  const nodeEffortMap = useMemo(() => {
    const result = new Map<string, number>()
    if (!project) return result
    const displayValues = computeEffortDisplayValues(
      [project],
      columnIds,
      efforts,
    )
    function walk(node: ProjectTreeNode): void {
      let total = 0
      for (const colId of columnIds) {
        total += displayValues.get(`${node.id}:${colId}`) ?? 0
      }
      result.set(node.id, total)
      for (const child of node.children) walk(child)
    }
    walk(project)
    return result
  }, [project, columnIds, efforts])

  const baselineEffortDays = project ? (nodeEffortMap.get(project.id) ?? 0) : 0

  const simulatedEffortDays = useMemo(() => {
    if (!project) return 0
    return calcWhatIfTotalEffort(project, columnIds, efforts, excludedTaskIds)
  }, [project, columnIds, efforts, excludedTaskIds])

  const baselineBudget = calcProjectEstimateBudget(
    baselineEffortDays / workdaysPerMonth,
    estimatedUnitPrice,
    coefficient,
  )
  const simulatedBudget = calcProjectEstimateBudget(
    simulatedEffortDays / workdaysPerMonth,
    estimatedUnitPrice,
    coefficient,
  )
  const savings = baselineBudget - simulatedBudget
  const savingsRate = baselineBudget > 0 ? (savings / baselineBudget) * 100 : 0

  const handleToggle = useCallback((nodeId: string) => {
    setExcludedTaskIds((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            What-ifシミュレーション - {project?.name ?? ''}
          </DialogTitle>
          <DialogDescription>
            削るタスク（機能）にチェックを入れると、概算予算額がどれだけ減るかを試算します。実データは変更されません。
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-card p-4">
          <div>
            <p className="text-xs text-muted-foreground">現在の概算予算</p>
            <p className="text-lg font-semibold tabular-nums">
              {`${manYenFormatter.format(baselineBudget)} 万円`}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">シミュレーション後</p>
            <p className="text-lg font-semibold tabular-nums">
              {`${manYenFormatter.format(simulatedBudget)} 万円`}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">削減額</p>
            <p
              className={cn(
                'text-lg font-semibold tabular-nums',
                savings > 0 && 'text-budget-planned',
              )}
            >
              {`${manYenFormatter.format(savings)} 万円（${savingsRate.toFixed(1)}%）`}
            </p>
          </div>
        </div>

        {!project || project.children.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            タスクが登録されていません。先にWBS画面でタスクを追加してください。
          </p>
        ) : (
          <div className="space-y-0.5 rounded-lg border border-border p-2">
            {project.children.map((child) => (
              <WhatIfTaskRow
                key={child.id}
                node={child}
                depth={0}
                excludedTaskIds={excludedTaskIds}
                ancestorExcluded={false}
                nodeEffortMap={nodeEffortMap}
                onToggle={handleToggle}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function WhatIfTaskRow({
  node,
  depth,
  excludedTaskIds,
  ancestorExcluded,
  nodeEffortMap,
  onToggle,
}: {
  node: ProjectTreeNode
  depth: number
  excludedTaskIds: Set<string>
  ancestorExcluded: boolean
  nodeEffortMap: Map<string, number>
  onToggle: (nodeId: string) => void
}) {
  const isDirectlyExcluded = excludedTaskIds.has(node.id)
  const isExcluded = ancestorExcluded || isDirectlyExcluded

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent/50"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <input
          type="checkbox"
          checked={isDirectlyExcluded}
          disabled={ancestorExcluded}
          onChange={() => onToggle(node.id)}
          className="h-4 w-4 rounded border-input"
          aria-label={`${node.name}を除外`}
        />
        <span
          className={cn(
            'flex-1 truncate text-sm',
            isExcluded && 'text-muted-foreground line-through',
          )}
        >
          {node.name}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {`${formatEffort(nodeEffortMap.get(node.id) ?? 0)} 人日`}
        </span>
      </div>
      {node.children.map((child) => (
        <WhatIfTaskRow
          key={child.id}
          node={child}
          depth={depth + 1}
          excludedTaskIds={excludedTaskIds}
          ancestorExcluded={isExcluded}
          nodeEffortMap={nodeEffortMap}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}
