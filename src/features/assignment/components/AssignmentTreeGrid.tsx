import type {
  CellValueChangedEvent,
  ColDef,
  GridReadyEvent,
  ICellRendererParams,
  IHeaderParams,
} from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { Plus, Trash2 } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { gridTheme } from '@/shared/ag-grid-theme'
import { useToast } from '@/shared/hooks/use-toast'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Member } from '@/shared/types/member'
import type { ProjectTreeNode } from '@/shared/types/project'
import type { ScheduleEntry } from '@/shared/types/schedule'
import { getThemeColor, type ThemeColor } from '@/shared/types/theme-color'
import {
  useActualsStore,
  useAppStore,
  useAssignmentStore,
  useScheduleSettingsStore,
} from '@/stores'
import {
  formatAssignmentValue,
  formatProjectNameWithConfidence,
  isMonthWithinContractRange,
  parseAssignmentInput,
} from '../utils/assignment-utils'
import { resolveMemberRowArrowKeyAction } from '../utils/keyboard-navigation-utils'
import { MemberCellEditor } from './MemberCellEditor'

ModuleRegistry.registerModules([AllCommunityModule])

interface AssignmentTreeGridProps {
  projectId: string
  tree: ProjectTreeNode[]
  assignments: AssignmentEntry[]
  members: Member[]
  monthKeys: string[]
  taskEffortSubtotals: Map<string, number>
  scheduleEntries: ScheduleEntry[]
  /**
   * 実績モード（非公開の設計文書）。trueのとき月次セルは実績値
   * （未入力の月は計画値）を表示・編集する。既定false＝計画値の表示・編集
   */
  showActual?: boolean
}

interface MonthColumnLayout {
  monthKey: string
  left: number
  width: number
}

interface GanttBarInfo {
  phaseKey: string
  phaseName: string
  color: ThemeColor
  startDate: string
  endDate: string
}

// Row types for the tree grid
type RowType = 'task' | 'member' | 'new-member'

interface FlatRowData {
  rowId: string
  type: RowType
  taskId: string
  taskName: string
  taskCode: string
  taskConfidence: string | null
  taskLevel: number
  taskDepth: number
  taskHasChildren: boolean
  memberId: string
  memberName: string
  memberRole: string
  assignmentId: string
  isExpanded: boolean
  effortSubtotal?: number
  /** 月次アサイン値の行合計（人月） */
  assignSubtotal: number
  [key: `month_${string}`]: number | undefined
}

// 配下の末端タスクのアサイン月次値を集計（行生成なし）
/**
 * 表示モードに応じた月次配分を返す（非公開の設計文書）。
 * 実績モードでは、実績の例外入力がある月だけその値で上書きし、
 * 未入力の月は計画値をそのまま実績とみなす（無操作＝計画どおり）。
 */
function resolveMonthlyValues(
  assignment: AssignmentEntry,
  showActual: boolean,
): Record<string, number> {
  if (!showActual) return assignment.monthlyValues
  const actuals = assignment.actualMonthlyValues
  if (!actuals || Object.keys(actuals).length === 0) {
    return assignment.monthlyValues
  }
  return { ...assignment.monthlyValues, ...actuals }
}

function collectDescendantValues(
  nodes: ProjectTreeNode[],
  assignmentsByTask: Map<string, AssignmentEntry[]>,
  showActual: boolean,
): Record<string, number> {
  const acc: Record<string, number> = {}
  for (const node of nodes) {
    if (node.children.length === 0) {
      for (const a of assignmentsByTask.get(node.id) ?? []) {
        for (const [mk, v] of Object.entries(
          resolveMonthlyValues(a, showActual),
        )) {
          acc[mk] = (acc[mk] ?? 0) + v
        }
      }
    } else {
      const childVals = collectDescendantValues(
        node.children,
        assignmentsByTask,
        showActual,
      )
      for (const [mk, v] of Object.entries(childVals)) {
        acc[mk] = (acc[mk] ?? 0) + v
      }
    }
  }
  return acc
}

function flattenTreeForAssignment(
  nodes: ProjectTreeNode[],
  assignments: AssignmentEntry[],
  members: Member[],
  expanded: Set<string>,
  transientRows: Map<string, boolean>,
  taskEffortSubtotals?: Map<string, number>,
  showActual = false,
): FlatRowData[] {
  const memberMap = new Map(members.map((m) => [m.id, m]))
  // Pre-build taskId -> assignments lookup (O(assignments) once)
  const assignmentsByTask = new Map<string, AssignmentEntry[]>()
  for (const a of assignments) {
    const list = assignmentsByTask.get(a.taskId)
    if (list) {
      list.push(a)
    } else {
      assignmentsByTask.set(a.taskId, [a])
    }
  }
  const rows: FlatRowData[] = []

  // 戻り値: このサブツリーの月次合計（親へのロールアップ用）
  function walk(
    items: ProjectTreeNode[],
    depth: number,
  ): Record<string, number> {
    const subtreeAcc: Record<string, number> = {}

    for (const node of items) {
      const isExpanded = expanded.has(node.id)
      const isLeaf = node.children.length === 0

      const taskRow: FlatRowData = {
        rowId: `task-${node.id}`,
        type: 'task',
        taskId: node.id,
        taskName: node.name,
        taskCode: node.code,
        taskConfidence: node.confidence ?? null,
        taskLevel: node.level,
        taskDepth: depth,
        taskHasChildren: !isLeaf,
        memberId: '',
        memberName: '',
        memberRole: '',
        assignmentId: '',
        isExpanded,
        assignSubtotal: 0,
      }

      // タスク行にWBS工数小計をセット（人日）
      if (taskEffortSubtotals) {
        taskRow.effortSubtotal = taskEffortSubtotals.get(node.id) ?? 0
      }

      rows.push(taskRow)

      let nodeValues: Record<string, number> = {}

      if (isLeaf) {
        // 末端タスク: 直接アサインの合計
        const taskAssignments = assignmentsByTask.get(node.id) ?? []
        for (const a of taskAssignments) {
          for (const [mk, v] of Object.entries(
            resolveMonthlyValues(a, showActual),
          )) {
            nodeValues[mk] = (nodeValues[mk] ?? 0) + v
          }
        }

        // 展開時のみメンバー行を表示
        if (isExpanded) {
          for (const a of taskAssignments) {
            const member = memberMap.get(a.memberId)
            const memberRow: FlatRowData = {
              rowId: `member-${a.id}`,
              type: 'member',
              taskId: node.id,
              taskName: '',
              taskCode: '',
              taskConfidence: null,
              taskLevel: node.level,
              taskDepth: depth + 1,
              taskHasChildren: false,
              memberId: a.memberId,
              memberName: member?.name ?? '不明',
              memberRole: member?.role ?? '',
              assignmentId: a.id,
              isExpanded: false,
              assignSubtotal: 0,
            }

            let memberTotal = 0
            for (const [mk, v] of Object.entries(
              resolveMonthlyValues(a, showActual),
            )) {
              const key = `month_${mk}` as `month_${string}`
              memberRow[key] = v
              memberTotal += v
            }
            memberRow.assignSubtotal = memberTotal

            rows.push(memberRow)
          }

          // 新規メンバー追加行（末端タスクのみ）
          if (transientRows.has(node.id)) {
            rows.push({
              rowId: `new-member-${node.id}`,
              type: 'new-member',
              taskId: node.id,
              taskName: '',
              taskCode: '',
              taskConfidence: null,
              taskLevel: node.level,
              taskDepth: depth + 1,
              taskHasChildren: false,
              memberId: '',
              memberName: '',
              memberRole: '',
              assignmentId: '',
              isExpanded: false,
              assignSubtotal: 0,
            })
          }
        }
      } else {
        // 親タスク: 配下の末端タスクからロールアップ
        if (isExpanded) {
          nodeValues = walk(node.children, depth + 1)
        } else {
          nodeValues = collectDescendantValues(
            node.children,
            assignmentsByTask,
            showActual,
          )
        }
      }

      // タスク行にロールアップ値をセット
      let taskAssignTotal = 0
      for (const [mk, v] of Object.entries(nodeValues)) {
        const key = `month_${mk}` as `month_${string}`
        taskRow[key] = v
        taskAssignTotal += v
      }
      taskRow.assignSubtotal = taskAssignTotal

      // 親への集計用に蓄積
      for (const [mk, v] of Object.entries(nodeValues)) {
        subtreeAcc[mk] = (subtreeAcc[mk] ?? 0) + v
      }
    }

    return subtreeAcc
  }

  walk(nodes, 0)
  return rows
}

const TaskNameCellRenderer = memo(function TaskNameCellRenderer(
  props: ICellRendererParams<FlatRowData>,
) {
  const data = props.data
  if (!data) return null
  const context = props.context as {
    toggleExpand: (id: string) => void
    addMemberRow: (taskId: string) => void
  }

  if (data.type === 'task') {
    return (
      <div
        className="flex h-full items-center gap-1"
        style={{ paddingLeft: `${data.taskDepth * 24}px` }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            context.toggleExpand(data.taskId)
          }}
          aria-label={
            data.isExpanded ? 'タスクを折りたたむ' : 'タスクを展開する'
          }
          aria-expanded={data.isExpanded}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          {data.isExpanded ? (
            <span className="text-xs">-</span>
          ) : (
            <span className="text-xs">+</span>
          )}
        </button>
        <span className="truncate font-semibold text-sm">
          {formatProjectNameWithConfidence(data.taskName, data.taskConfidence)}
        </span>
        {data.isExpanded && !data.taskHasChildren && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              context.addMemberRow(data.taskId)
            }}
            aria-label="担当者を追加"
            className="ml-1 rounded p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600"
            title="担当者を追加"
          >
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>
    )
  }

  // Member or new-member row
  return (
    <div
      className="flex h-full items-center"
      style={{ paddingLeft: `${data.taskDepth * 24}px` }}
    >
      <span className="text-sm text-muted-foreground">
        {data.type === 'new-member' ? '(新規)' : ''}
      </span>
    </div>
  )
})

const MemberNameCellRenderer = memo(function MemberNameCellRenderer(
  props: ICellRendererParams<FlatRowData>,
) {
  const data = props.data
  if (!data) return null

  if (data.type === 'task') {
    return null
  }

  const context = props.context as {
    deleteMemberRow: (assignmentId: string) => void
  }

  return (
    <div className="group flex h-full items-center justify-between gap-1">
      <span className="truncate text-sm">
        {data.memberName
          ? `${data.memberName}${data.memberRole ? `（${data.memberRole}）` : ''}`
          : '-- 担当者を選択 --'}
      </span>
      {data.type === 'member' && data.assignmentId && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            context.deleteMemberRow(data.assignmentId)
          }}
          aria-label="担当者を削除"
          className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/30 transition-opacity"
          title="削除"
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </button>
      )}
    </div>
  )
})

const AssignSubtotalCellRenderer = memo(function AssignSubtotalCellRenderer(
  props: ICellRendererParams<FlatRowData>,
) {
  const data = props.data
  if (!data || data.type === 'new-member') return null

  const total = data.assignSubtotal ?? 0
  if (total === 0) return null

  return (
    <div
      className={cn(
        'flex h-full items-center justify-end pr-2 tabular-nums text-sm',
        data.type === 'task'
          ? 'font-semibold text-muted-foreground'
          : 'text-muted-foreground',
      )}
    >
      {formatAssignmentValue(total)}
    </div>
  )
})

const EffortUnassignedCellRenderer = memo(function EffortUnassignedCellRenderer(
  props: ICellRendererParams<FlatRowData>,
) {
  const data = props.data
  if (!data || data.type !== 'task') return null

  const effortDays = data.effortSubtotal ?? 0
  if (effortDays === 0) return null

  const effortMonths = effortDays / 20
  const assigned = data.assignSubtotal ?? 0
  const unassigned = effortMonths - assigned

  return (
    <div className="flex h-full items-center justify-end gap-0.5 pr-2 tabular-nums text-sm font-semibold">
      <span className="text-muted-foreground">
        {formatAssignmentValue(effortMonths)}
      </span>
      <span
        className={cn(
          unassigned > 1e-9
            ? 'text-orange-600 dark:text-orange-400'
            : unassigned < -1e-9
              ? 'text-red-600 dark:text-red-400'
              : 'text-green-600 dark:text-green-400',
        )}
      >
        ({formatAssignmentValue(unassigned)})
      </span>
    </div>
  )
})

function MonthHeaderComponent(props: IHeaderParams) {
  const colId = props.column.getColId()
  const mk = colId.replace('month_', '')
  const parts = mk.split('-')
  const shortYear = (parts[0] ?? '').slice(2)
  const month = Number.parseInt(parts[1] ?? '0', 10)
  // 締め済み月は🔒を表示する（P1-b月次締めハードロック）
  const isClosed = (
    props.context as { closedMonths?: Set<string> } | undefined
  )?.closedMonths?.has(mk)

  return (
    <div
      className="flex items-baseline justify-center w-full"
      title={isClosed ? '締め済み（編集不可）' : undefined}
    >
      {shortYear}/{month}月{isClosed ? ' 🔒' : ''}
    </div>
  )
}

const MonthCellRenderer = memo(function MonthCellRenderer(
  props: ICellRendererParams<FlatRowData>,
) {
  const data = props.data
  if (!data) return null

  const monthKey = (props.colDef?.field ?? '').replace('month_', '')
  const key = `month_${monthKey}` as `month_${string}`
  const rawValue = data[key]

  if (rawValue == null || rawValue === 0) return null

  // AG Grid's valueSetter may temporarily store a string before the store update provides a number
  const value = typeof rawValue === 'number' ? rawValue : Number(rawValue)
  if (Number.isNaN(value) || value === 0) return null

  return (
    <div
      className={cn(
        'flex h-full items-center justify-end pr-2 tabular-nums text-sm',
        data.type === 'task' && 'font-semibold text-muted-foreground',
      )}
    >
      {formatAssignmentValue(value)}
    </div>
  )
})

export function AssignmentTreeGrid({
  projectId,
  tree,
  assignments,
  members,
  monthKeys,
  taskEffortSubtotals,
  scheduleEntries,
  showActual = false,
}: AssignmentTreeGridProps) {
  const { toast } = useToast()
  const gridRef = useRef<AgGridReact<FlatRowData>>(null)
  const gridWrapperRef = useRef<HTMLDivElement>(null)
  const ganttScrollRef = useRef<HTMLDivElement>(null)
  const theme = useAppStore((s) => s.theme)
  const upsertAssignment = useAssignmentStore((s) => s.upsertAssignment)
  const updateMonthlyValue = useAssignmentStore((s) => s.updateMonthlyValue)
  const updateActualMonthlyValue = useAssignmentStore(
    (s) => s.updateActualMonthlyValue,
  )
  const deleteAssignment = useAssignmentStore((s) => s.deleteAssignment)

  // Gantt bar state
  const getPhaseSettings = useScheduleSettingsStore((s) => s.getSettings)
  const [monthColumnLayouts, setMonthColumnLayouts] = useState<
    MonthColumnLayout[]
  >([])
  const [pinnedLeftWidth, setPinnedLeftWidth] = useState(0)

  // Transient new-member rows (taskId -> true)
  const [transientRows, setTransientRows] = useState<Map<string, boolean>>(
    () => new Map(),
  )

  // Expand/collapse state
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const ids = new Set<string>()
    function collectAll(nodes: ProjectTreeNode[]) {
      for (const n of nodes) {
        ids.add(n.id)
        collectAll(n.children)
      }
    }
    collectAll(tree)
    return ids
  })

  // Sync expanded with new tree nodes
  useEffect(() => {
    setExpanded((prev) => {
      const newIds = new Set(prev)
      function collect(nodes: ProjectTreeNode[]) {
        for (const n of nodes) {
          if (!prev.has(n.id) && n.children.length > 0) {
            newIds.add(n.id)
          }
          collect(n.children)
        }
      }
      collect(tree)
      return newIds
    })
  }, [tree])

  const toggleExpand = useCallback((taskId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }, [])

  const addMemberRow = useCallback((taskId: string) => {
    setTransientRows((prev) => {
      const next = new Map(prev)
      next.set(taskId, true)
      return next
    })
  }, [])

  const removeTransientRow = useCallback((taskId: string) => {
    setTransientRows((prev) => {
      const next = new Map(prev)
      next.delete(taskId)
      return next
    })
  }, [])

  const deleteMemberRow = useCallback(
    (assignmentId: string) => {
      deleteAssignment(assignmentId)
      toast({ title: '担当者を削除しました' })
    },
    [deleteAssignment, toast],
  )

  const activeMembers = useMemo(
    () => members.filter((m) => m.isActive),
    [members],
  )

  const rowData = useMemo(
    () =>
      flattenTreeForAssignment(
        tree,
        assignments,
        members,
        expanded,
        transientRows,
        taskEffortSubtotals,
        showActual,
      ),
    [
      tree,
      assignments,
      members,
      expanded,
      transientRows,
      taskEffortSubtotals,
      showActual,
    ],
  )

  // AG Grid v33 with memo'd cell renderers needs explicit refresh for row data property changes.
  // Target only specific columns to minimize rendering cost.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh cells when rowData changes
  useEffect(() => {
    gridRef.current?.api?.refreshCells({
      columns: ['taskName', 'memberId', 'assignSubtotal', 'effortSubtotal'],
      force: true,
    })
  }, [rowData])

  // 担当者選択処理（MemberCellEditorのcontext経由で直接呼び出し）
  const onMemberSelected = useCallback(
    (data: FlatRowData, memberId: string) => {
      // 新規メンバー行の処理
      if (data.type === 'new-member') {
        if (!memberId) {
          toast({
            title: '担当者を選択してください',
            variant: 'destructive',
          })
          removeTransientRow(data.taskId)
          return
        }

        // 重複チェック
        const existingAssignment = assignments.find(
          (a) => a.taskId === data.taskId && a.memberId === memberId,
        )
        if (existingAssignment) {
          toast({
            title: 'この担当者は既にアサインされています',
            variant: 'destructive',
          })
          removeTransientRow(data.taskId)
          return
        }

        // アサイン作成
        upsertAssignment({
          projectId,
          taskId: data.taskId,
          memberId,
          monthlyValues: {},
        })
        removeTransientRow(data.taskId)
        toast({ title: '担当者を追加しました' })
        return
      }

      // 既存メンバー行の担当者変更
      if (data.type === 'member') {
        if (!memberId || !data.assignmentId) return

        // 重複チェック
        const existingAssignment = assignments.find(
          (a) =>
            a.taskId === data.taskId &&
            a.memberId === memberId &&
            a.id !== data.assignmentId,
        )
        if (existingAssignment) {
          toast({
            title: 'この担当者は既にアサインされています',
            variant: 'destructive',
          })
          gridRef.current?.api?.refreshCells({ force: true })
          return
        }

        const currentAssignment = assignments.find(
          (a) => a.id === data.assignmentId,
        )
        if (currentAssignment) {
          deleteAssignment(data.assignmentId)
          upsertAssignment({
            projectId,
            taskId: data.taskId,
            memberId,
            monthlyValues: currentAssignment.monthlyValues,
          })
        }
      }
    },
    [
      projectId,
      assignments,
      upsertAssignment,
      deleteAssignment,
      removeTransientRow,
      toast,
    ],
  )

  // 締め済み月の集合（P1-b月次締めハードロック）。actuals-storeの締めイベントから導出
  const monthlyCloseEvents = useActualsStore((st) => st.monthlyCloseEvents)
  const closedMonths = useMemo(() => {
    const state = useActualsStore.getState()
    const closed = new Set<string>()
    for (const m of new Set(monthlyCloseEvents.map((e) => e.month))) {
      if (state.isMonthClosed(m)) closed.add(m)
    }
    return closed
  }, [monthlyCloseEvents])

  const handleCellValueChanged = useCallback(
    (event: CellValueChangedEvent<FlatRowData>) => {
      const { data, colDef, newValue } = event
      if (!data || !colDef.field) return

      // 月次値の変更のみ処理（担当者選択はcontext経由で処理済み）
      if (
        colDef.field?.startsWith('month_') &&
        data.type === 'member' &&
        data.assignmentId
      ) {
        const monthKey = colDef.field.replace('month_', '')
        const fieldKey = colDef.field as `month_${string}`
        const parsed = parseAssignmentInput(String(newValue ?? ''))

        // AG GridのvalueSetterが入力値を即座にrow dataへ書き込んでいるため、
        // 保存を拒否する場合はrefreshCellsの前に元の値へ書き戻す必要がある
        // （書き戻さないとrefreshCellsは書き換わった後のrow dataを再描画するだけになる）
        const revertCell = () => {
          const original = useAssignmentStore
            .getState()
            .assignments.find((a) => a.id === data.assignmentId)
          data[fieldKey] = original
            ? resolveMonthlyValues(original, showActual)[monthKey]
            : undefined
          gridRef.current?.api?.refreshCells({
            rowNodes: [event.node],
            force: true,
          })
        }

        if (parsed === null) {
          toast({ title: '無効な値です (0.00-1.00)', variant: 'destructive' })
          revertCell()
          return
        }

        // 締め済み月は計画・実績とも編集拒否（P1-b月次締めハードロック。
        // ストア側にも同じガードがあるが、valueSetterが書き込んだ表示値の
        // 書き戻しはUI層でしかできないためここでも判定する）
        if (closedMonths.has(monthKey)) {
          toast({
            title: `${monthKey}は締め済みのため変更できません`,
            description:
              '修正が必要な場合は月次実績画面で締めを解除してください',
            variant: 'destructive',
          })
          revertCell()
          return
        }

        // 契約単価対象範囲外への新規アサインをブロック（0へのクリアは常に許可）。
        // 実績モードは「実際にどう動いたか」の記録であり、契約範囲の制約対象にしない
        if (parsed > 0 && !showActual) {
          const member = members.find((m) => m.id === data.memberId)
          if (member && !isMonthWithinContractRange(member, monthKey)) {
            toast({
              title: `${member.name}の${monthKey}月は契約単価の対象期間外のためアサインできません`,
              variant: 'destructive',
            })
            revertCell()
            return
          }
        }

        if (showActual) {
          updateActualMonthlyValue(data.assignmentId, monthKey, parsed)
        } else {
          updateMonthlyValue(data.assignmentId, monthKey, parsed)
        }

        // 超過チェック
        const memberId = data.memberId
        const allAssignments = useAssignmentStore.getState().assignments
        const total = allAssignments
          .filter((a) => a.memberId === memberId)
          .reduce(
            (sum, a) =>
              sum + (resolveMonthlyValues(a, showActual)[monthKey] ?? 0),
            0,
          )

        // 上限はメンバーごとの稼働率上限（capacityRatio、既定1.0）。時短・兼務・部分参画に対応する。
        // 浮動小数点の丸め誤差で誤検知しないようepsilonを許容する（development-patterns.md §3.2）
        const member = members.find((m) => m.id === memberId)
        const capacity = member?.capacityRatio ?? 1
        if (total > capacity + 0.001) {
          toast({
            title: `${member?.name ?? ''}の${monthKey}月合計が上限${formatAssignmentValue(capacity)}を超えています (${formatAssignmentValue(total)})`,
            variant: 'destructive',
          })
        }
        return
      }
    },
    [
      members,
      updateMonthlyValue,
      updateActualMonthlyValue,
      showActual,
      toast,
      closedMonths,
    ],
  )

  const columnDefs = useMemo<ColDef<FlatRowData>[]>(() => {
    const monthCols: ColDef<FlatRowData>[] = monthKeys.map((mk) => ({
      headerName: `${Number.parseInt(mk.split('-')[1] ?? '0', 10)}月`,
      headerComponent: MonthHeaderComponent,
      field: `month_${mk}` as keyof FlatRowData & string,
      width: 75,
      editable: (params) => params.data?.type === 'member',
      cellRenderer: MonthCellRenderer,
      valueSetter: (params) => {
        if (params.data) {
          const key = `month_${mk}` as `month_${string}`
          const num = Number(params.newValue)
          params.data[key] = Number.isNaN(num) ? params.newValue : num
        }
        return true
      },
      suppressKeyboardEvent: (params) => {
        const action = resolveMemberRowArrowKeyAction(
          params.event.key,
          params.data?.type,
          params.editing,
        )
        if (action.type === 'none') return false
        if (action.type === 'suppress') return true
        // navigate-row: 編集中の上下キーを手動で行移動として処理する
        // （AG Gridの既定では編集中の上下キーは行移動にならないため）
        const currentRowIndex = params.node.rowIndex
        if (currentRowIndex === null) return true
        params.event.preventDefault()
        params.api.stopEditing()
        params.api.setFocusedCell(
          currentRowIndex + action.direction,
          params.column.getColId(),
        )
        return true
      },
    }))

    return [
      {
        headerName: 'タスク',
        field: 'taskName',
        minWidth: 250,
        flex: 1,
        editable: false,
        pinned: 'left' as const,
        cellRenderer: TaskNameCellRenderer,
      },
      {
        headerName: '工数（未割当）',
        field: 'effortSubtotal',
        width: 140,
        editable: false,
        pinned: 'left' as const,
        cellRenderer: EffortUnassignedCellRenderer,
      },
      {
        headerName: '割当済',
        field: 'assignSubtotal',
        width: 100,
        editable: false,
        pinned: 'left' as const,
        cellRenderer: AssignSubtotalCellRenderer,
      },
      {
        headerName: '担当者',
        field: 'memberId',
        width: 160,
        pinned: 'left' as const,
        editable: (params) =>
          params.data?.type === 'member' || params.data?.type === 'new-member',
        cellRenderer: MemberNameCellRenderer,
        cellEditor: MemberCellEditor,
        cellEditorPopup: true,
        cellEditorParams: {
          members: activeMembers,
        },
      },
      ...monthCols,
    ]
  }, [monthKeys, activeMembers])

  const defaultColDef = useMemo<ColDef>(
    () => ({
      resizable: true,
      sortable: false,
      filter: false,
      suppressMovable: true,
    }),
    [],
  )

  const context = useMemo(
    () => ({
      toggleExpand,
      addMemberRow,
      deleteMemberRow,
      onMemberSelected,
      closedMonths,
    }),
    [
      toggleExpand,
      addMemberRow,
      deleteMemberRow,
      onMemberSelected,
      closedMonths,
    ],
  )

  const getRowId = useCallback(
    (params: { data: FlatRowData }) => params.data.rowId,
    [],
  )

  const getRowStyle = useCallback(
    (params: { data: FlatRowData | undefined }) => {
      if (!params.data) return undefined
      if (params.data.type === 'task') {
        return { backgroundColor: 'var(--color-muted)' }
      }
      return undefined
    },
    [],
  )

  // Gantt bar data
  const ganttBars = useMemo<GanttBarInfo[]>(() => {
    const settings = getPhaseSettings(projectId)
    const enabledPhases = settings.phases
      .filter((p) => p.enabled)
      .sort((a, b) => a.sortOrder - b.sortOrder)

    const bars: GanttBarInfo[] = []
    for (const phase of enabledPhases) {
      const entry = scheduleEntries.find(
        (e) => e.projectId === projectId && e.phaseKey === phase.phaseKey,
      )
      if (entry) {
        bars.push({
          phaseKey: phase.phaseKey,
          phaseName: phase.name,
          color: phase.color,
          startDate: entry.startDate,
          endDate: entry.endDate,
        })
      }
    }
    return bars
  }, [projectId, scheduleEntries, getPhaseSettings])

  // Sync AG Grid column layout for Gantt
  const updateColumnLayoutsImmediate = useCallback(() => {
    const api = gridRef.current?.api
    if (!api) return

    const allColumns = api.getAllDisplayedColumns()
    let leftWidth = 0
    const layouts: MonthColumnLayout[] = []

    for (const col of allColumns) {
      const colId = col.getColId()
      const width = col.getActualWidth()
      if (col.isPinned()) {
        leftWidth += width
      } else if (colId.startsWith('month_')) {
        const monthKey = colId.replace('month_', '')
        layouts.push({
          monthKey,
          left: col.getLeft() ?? 0,
          width,
        })
      }
    }

    setPinnedLeftWidth(leftWidth)
    setMonthColumnLayouts(layouts)
  }, [])

  // Debounced version for column resize events
  const resizeTimerRef = useRef(0)
  const updateColumnLayouts = useCallback(() => {
    cancelAnimationFrame(resizeTimerRef.current)
    resizeTimerRef.current = requestAnimationFrame(updateColumnLayoutsImmediate)
  }, [updateColumnLayoutsImmediate])

  // Scroll sync between Gantt and AG Grid body (with RAF + cleanup)
  useEffect(() => {
    const bodyViewport = gridWrapperRef.current?.querySelector(
      '.ag-body-horizontal-scroll-viewport',
    )
    const ganttEl = ganttScrollRef.current
    if (!bodyViewport || !ganttEl) return

    let rafId = 0
    let syncSource: 'grid' | 'gantt' | null = null

    const onGridScroll = () => {
      if (syncSource === 'gantt') return
      syncSource = 'grid'
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        ganttEl.scrollLeft = bodyViewport.scrollLeft
        syncSource = null
      })
    }

    const onGanttScroll = () => {
      if (syncSource === 'grid') return
      syncSource = 'gantt'
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        bodyViewport.scrollLeft = ganttEl.scrollLeft
        syncSource = null
      })
    }

    bodyViewport.addEventListener('scroll', onGridScroll, { passive: true })
    ganttEl.addEventListener('scroll', onGanttScroll, { passive: true })

    return () => {
      cancelAnimationFrame(rafId)
      bodyViewport.removeEventListener('scroll', onGridScroll)
      ganttEl.removeEventListener('scroll', onGanttScroll)
    }
  })

  const onGridReady = useCallback(
    (_event: GridReadyEvent) => {
      updateColumnLayoutsImmediate()
    },
    [updateColumnLayoutsImmediate],
  )

  // Update layout when columns resize or data changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: monthKeys変更時にレイアウト再計算
  useEffect(() => {
    // Delay to allow AG Grid to finish rendering
    const timer = setTimeout(updateColumnLayoutsImmediate, 100)
    return () => clearTimeout(timer)
  }, [updateColumnLayoutsImmediate, monthKeys, rowData])

  const useAutoHeight = rowData.length <= 30

  // Compute Gantt bar positions relative to month columns
  const ganttBarPositions = useMemo(() => {
    if (monthColumnLayouts.length === 0 || ganttBars.length === 0) return []

    return ganttBars.map((bar) => {
      const startMonth = bar.startDate.substring(0, 7) // "YYYY-MM"
      const endMonth = bar.endDate.substring(0, 7)

      // Find first matching month column
      const startCol = monthColumnLayouts.find((m) => m.monthKey >= startMonth)
      const endCol = [...monthColumnLayouts]
        .reverse()
        .find((m: MonthColumnLayout) => m.monthKey <= endMonth)

      if (!startCol || !endCol) return null

      // Calculate sub-month offset for start date
      const startDay = Number.parseInt(bar.startDate.substring(8, 10), 10)
      const daysInStartMonth = new Date(
        Number.parseInt(bar.startDate.substring(0, 4), 10),
        Number.parseInt(bar.startDate.substring(5, 7), 10),
        0,
      ).getDate()
      const startOffset = ((startDay - 1) / daysInStartMonth) * startCol.width

      // Calculate sub-month offset for end date
      const endDay = Number.parseInt(bar.endDate.substring(8, 10), 10)
      const daysInEndMonth = new Date(
        Number.parseInt(bar.endDate.substring(0, 4), 10),
        Number.parseInt(bar.endDate.substring(5, 7), 10),
        0,
      ).getDate()
      const endOffset = (endDay / daysInEndMonth) * endCol.width

      const left = startCol.left + startOffset
      const right = endCol.left + endOffset
      const width = Math.max(right - left, 4)

      return { ...bar, left, width }
    })
  }, [ganttBars, monthColumnLayouts])

  // Total scrollable width of month columns
  const ganttScrollWidth = useMemo(() => {
    if (monthColumnLayouts.length === 0) return 0
    const last = monthColumnLayouts[monthColumnLayouts.length - 1]
    if (!last) return 0
    return last.left + last.width
  }, [monthColumnLayouts])

  return (
    <div>
      {/* Gantt bar above grid */}
      {ganttBars.length > 0 && (
        <div className="mb-1 flex rounded-md border border-border bg-muted/30">
          {/* Pinned left label area */}
          <div
            className="shrink-0 border-r border-border"
            style={{ width: pinnedLeftWidth || 'auto', minWidth: 120 }}
          >
            {ganttBarPositions.map(
              (bar) =>
                bar && (
                  <div
                    key={bar.phaseKey}
                    className="flex h-6 items-center px-2 text-[10px] text-muted-foreground truncate"
                  >
                    <span
                      className="mr-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{
                        backgroundColor: getThemeColor(bar.color, theme),
                      }}
                    />
                    {bar.phaseName}
                  </div>
                ),
            )}
          </div>
          {/* Scrollable Gantt area */}
          <div ref={ganttScrollRef} className="flex-1 overflow-x-hidden">
            <div
              className="relative"
              style={{ width: ganttScrollWidth || '100%' }}
            >
              {ganttBarPositions.map(
                (bar) =>
                  bar && (
                    <div key={bar.phaseKey} className="relative h-6">
                      <div
                        className="absolute top-1 h-4 rounded-sm opacity-80"
                        style={{
                          left: bar.left,
                          width: bar.width,
                          backgroundColor: getThemeColor(bar.color, theme),
                        }}
                      />
                    </div>
                  ),
              )}
            </div>
          </div>
        </div>
      )}
      <div
        ref={gridWrapperRef}
        style={useAutoHeight ? undefined : { height: 600 }}
      >
        <AgGridReact<FlatRowData>
          theme={gridTheme}
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          context={context}
          getRowId={getRowId}
          getRowStyle={getRowStyle}
          onCellValueChanged={handleCellValueChanged}
          onGridReady={onGridReady}
          onColumnResized={updateColumnLayouts}
          rowHeight={36}
          headerHeight={36}
          animateRows={false}
          singleClickEdit={false}
          stopEditingWhenCellsLoseFocus
          suppressCellFocus={false}
          domLayout={useAutoHeight ? 'autoHeight' : 'normal'}
        />
      </div>
    </div>
  )
}
