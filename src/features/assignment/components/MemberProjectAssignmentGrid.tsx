import { ChevronDown, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/shared/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/shared/components/ui/collapsible'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Project } from '@/shared/types/project'
import {
  formatAssignmentValue,
  getMonthLabelWithYear,
  isOverCapacity,
} from '../utils/assignment-utils'

interface MemberProjectAssignmentGridProps {
  memberId: string
  memberName: string
  /** 対象メンバーの稼働率上限（`Member.capacityRatio`）。未指定時は1.0として扱う */
  capacityRatio?: number
  monthColumns: string[]
  assignments: AssignmentEntry[]
  projects: Project[]
  // プロジェクト行クリック時に該当プロジェクトIDを通知する（FR-008、
  // 双方向連携。未指定時はクリックしても何も起きない）
  onProjectSelect?: (projectId: string) => void
}

/**
 * セル値に応じた背景色クラス（MemberSummaryGrid と同一基準）
 */
function getCellColorClass(value: number): string {
  if (value <= 0) return ''
  if (value < 0.5 - 1e-9) return 'bg-[#ffd43d]/10 dark:bg-[#ffd43d]/5'
  return 'bg-[#71c598]/15 dark:bg-[#71c598]/10'
}

export function MemberProjectAssignmentGrid({
  memberId,
  memberName,
  capacityRatio,
  monthColumns,
  assignments,
  projects,
  onProjectSelect,
}: MemberProjectAssignmentGridProps) {
  const [open, setOpen] = useState(true)

  const projectMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  )

  // 対象メンバーの案件別月次アサインデータを集計
  const projectRows = useMemo(() => {
    const byProject = new Map<string, Map<string, number>>()

    const memberAssignments = assignments.filter((a) => a.memberId === memberId)

    for (const a of memberAssignments) {
      if (!byProject.has(a.projectId)) {
        byProject.set(a.projectId, new Map())
      }
      const monthMap = byProject.get(a.projectId)
      if (!monthMap) continue

      for (const mk of monthColumns) {
        const value = a.monthlyValues[mk] ?? 0
        if (value > 0) {
          monthMap.set(mk, (monthMap.get(mk) ?? 0) + value)
        }
      }
    }

    // データがある案件のみ、案件名ソートで返す
    const rows: { project: Project; months: Map<string, number> }[] = []
    for (const [projectId, months] of byProject) {
      if (months.size === 0) continue
      const project = projectMap.get(projectId)
      if (!project) continue
      rows.push({ project, months })
    }
    rows.sort((a, b) => a.project.code.localeCompare(b.project.code))
    return rows
  }, [memberId, assignments, monthColumns, projectMap])

  // 月別合計
  const monthTotals = useMemo(() => {
    const totals = new Map<string, number>()
    for (const row of projectRows) {
      for (const [mk, val] of row.months) {
        totals.set(mk, (totals.get(mk) ?? 0) + val)
      }
    }
    return totals
  }, [projectRows])

  if (projectRows.length === 0) {
    return (
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-2 mb-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2">
              {open ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <span className="text-sm font-medium">
                担当者別プロジェクト別年間アサイン - {memberName}
              </span>
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <p className="text-xs text-muted-foreground text-center py-4">
            この担当者にはアサインがありません
          </p>
        </CollapsibleContent>
      </Collapsible>
    )
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-2 mb-2">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2">
            {open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <span className="text-sm font-medium">
              担当者別プロジェクト別年間アサイン - {memberName}
            </span>
          </Button>
        </CollapsibleTrigger>
        <span className="text-xs text-muted-foreground">
          ({projectRows.length}件のプロジェクト)
        </span>
      </div>
      <CollapsibleContent>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="border-collapse text-[11px] table-fixed">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="sticky left-0 z-10 bg-muted/50 px-2 py-1 text-left font-medium whitespace-nowrap w-[400px] min-w-[400px]">
                  プロジェクト
                </th>
                {monthColumns.map((mk) => (
                  <th
                    key={mk}
                    className="w-[75px] min-w-[75px] px-1 py-1 text-center font-medium"
                  >
                    {getMonthLabelWithYear(mk)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projectRows.map(({ project, months }) => (
                <tr
                  key={project.id}
                  className={cn(
                    'border-b border-border',
                    onProjectSelect && 'cursor-pointer hover:bg-muted/40',
                  )}
                  onClick={() => onProjectSelect?.(project.id)}
                >
                  <td className="sticky left-0 z-10 bg-background px-2 py-0.5 whitespace-nowrap w-[400px] min-w-[400px] overflow-hidden text-ellipsis">
                    <span className="font-medium">{project.code}</span>
                    <span className="ml-1">{project.name}</span>
                    {project.confidence && (
                      <span className="ml-1 text-muted-foreground">
                        ({project.confidence})
                      </span>
                    )}
                  </td>
                  {monthColumns.map((mk) => {
                    const value = months.get(mk) ?? 0
                    return (
                      <td
                        key={mk}
                        className={cn(
                          'px-1 py-0.5 text-center tabular-nums',
                          getCellColorClass(value),
                        )}
                      >
                        {value > 0 ? formatAssignmentValue(value) : ''}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {/* 合計行 */}
              <tr className="border-t-2 border-border bg-muted/30 font-medium">
                <td className="sticky left-0 z-10 bg-muted/30 px-2 py-1 whitespace-nowrap w-[400px] min-w-[400px]">
                  合計
                </td>
                {monthColumns.map((mk) => {
                  const total = monthTotals.get(mk) ?? 0
                  return (
                    <td
                      key={mk}
                      className={cn(
                        'px-1 py-1 text-center tabular-nums',
                        isOverCapacity(total, capacityRatio) &&
                          'text-red-700 dark:text-red-300 font-semibold',
                      )}
                    >
                      {total > 0 ? formatAssignmentValue(total) : ''}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
