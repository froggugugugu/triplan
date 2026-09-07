import type {
  CellKeyDownEvent,
  CellValueChangedEvent,
  ColDef,
  ICellRendererParams,
  RowDragEndEvent,
} from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FileText,
  GripVertical,
  Plus,
  Trash2,
} from 'lucide-react'
import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { gridTheme } from '@/shared/ag-grid-theme'
import { Button } from '@/shared/components/ui/button'
import { useToast } from '@/shared/hooks/use-toast'
import {
  addChildEditorNode,
  addRootEditorNode,
  addSiblingAfterEditorNode,
  demoteEditorNode,
  type EditorNode,
  isDescendantEditorNode,
  moveEditorNode,
  promoteEditorNode,
  updateEditorNode,
} from '../utils/wbs-template-editor-utils'

ModuleRegistry.registerModules([AllCommunityModule])

interface WbsTemplateTreeGridProps {
  nodes: EditorNode[]
  onChange: (nodes: EditorNode[]) => void
  onDeleteRequest: (node: EditorNode) => void
  /** ドキュメントテンプレート紐づけダイアログの起動 */
  onDocumentLinkRequest: (node: EditorNode) => void
  /**
   * 実在するドキュメントテンプレートのid集合。紐づけ数の表示から
   * 削除済みテンプレートへの参照（dangling id）を除外するために使う
   */
  knownDocumentTemplateIds?: Set<string>
}

interface FlatRow {
  id: string
  name: string
  completionCriteria: string
  documentCount: number
  depth: number
  hasChildren: boolean
  isExpanded: boolean
  _node: EditorNode
}

function flattenTree(
  nodes: EditorNode[],
  expanded: Set<string>,
  knownDocumentTemplateIds?: Set<string>,
): FlatRow[] {
  const rows: FlatRow[] = []
  function walk(items: EditorNode[], depth: number) {
    for (const node of items) {
      const isExpanded = expanded.has(node.id)
      const documentCount = knownDocumentTemplateIds
        ? node.documentTemplateIds.filter((id) =>
            knownDocumentTemplateIds.has(id),
          ).length
        : node.documentTemplateIds.length
      rows.push({
        id: node.id,
        name: node.name,
        completionCriteria: node.completionCriteria ?? '',
        documentCount,
        depth,
        hasChildren: node.children.length > 0,
        isExpanded,
        _node: node,
      })
      if (isExpanded && node.children.length > 0) {
        walk(node.children, depth + 1)
      }
    }
  }
  walk(nodes, 0)
  return rows
}

function collectAllIds(nodes: EditorNode[]): Set<string> {
  const ids = new Set<string>()
  function walk(items: EditorNode[]) {
    for (const n of items) {
      ids.add(n.id)
      walk(n.children)
    }
  }
  walk(nodes)
  return ids
}

const DragCellRenderer = memo(function DragCellRenderer(
  props: ICellRendererParams<FlatRow>,
) {
  if (!props.data) return null
  return (
    <div className="flex h-full items-center justify-center cursor-grab">
      <GripVertical className="h-4 w-4 text-muted-foreground" />
    </div>
  )
})

const NameCellRenderer = memo(function NameCellRenderer(
  props: ICellRendererParams<FlatRow>,
) {
  const data = props.data
  if (!data) return null
  const toggleExpand = props.context?.toggleExpand as
    | ((id: string) => void)
    | undefined

  return (
    <div
      className="flex h-full items-center gap-1"
      style={{ paddingLeft: `${data.depth * 24}px` }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          toggleExpand?.(data.id)
        }}
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-gray-200 dark:hover:bg-gray-600',
          !data.hasChildren && 'invisible',
        )}
      >
        {data.isExpanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>
      <span className="truncate">{data.name}</span>
    </div>
  )
})

const DocumentsCellRenderer = memo(function DocumentsCellRenderer(
  props: ICellRendererParams<FlatRow>,
) {
  const data = props.data
  if (!data) return null
  const context = props.context as {
    onEditDocuments: (node: EditorNode) => void
  }

  return (
    <div className="flex h-full items-center justify-center">
      <button
        type="button"
        className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-gray-200 dark:hover:bg-gray-600"
        onClick={() => context.onEditDocuments(data._node)}
        title="ドキュメントテンプレートを紐づけ"
      >
        <FileText
          className={cn(
            'h-3.5 w-3.5',
            data.documentCount === 0 && 'text-muted-foreground/50',
          )}
        />
        <span
          className={cn(
            'text-xs tabular-nums',
            data.documentCount === 0 && 'text-muted-foreground/50',
          )}
        >
          {data.documentCount}
        </span>
      </button>
    </div>
  )
})

const ActionsCellRenderer = memo(function ActionsCellRenderer(
  props: ICellRendererParams<FlatRow>,
) {
  const data = props.data
  if (!data) return null
  const context = props.context as {
    onAddChild: (id: string) => void
    onDelete: (node: EditorNode) => void
  }

  return (
    <div className="flex h-full items-center justify-center gap-0.5">
      <button
        type="button"
        className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-600"
        onClick={() => context.onAddChild(data.id)}
        title="子タスクを追加"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="rounded p-1 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
        onClick={() => context.onDelete(data._node)}
        title="削除"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
})

/**
 * WBSテンプレート編集用のAG Gridツリー（`ProjectTreeGrid`と同じUX: ドラッグでの親子変更、
 * 展開/折りたたみ、インライン編集、操作アイコンでの追加/削除）。
 * キーボードショートカットも`ProjectTreeGrid`（WBS画面）と同一体系を踏襲する:
 * Shift+Enter=下位層追加 / Alt+Enter=同階層追加 / Alt+←=階層上げ / Alt+→=階層下げ /
 * Shift+←=閉じる / Shift+→=開く（`promoteEditorNode`/`demoteEditorNode`等は
 * `wbs-template-editor-utils.ts`側の純粋関数）。
 * 対象データは`EditorNode`（`WbsTemplateNode`に編集用の安定id・childrenを常に配列化したもの）。
 * レベル上限やコード採番（`ProjectTreeGrid`のProject固有の関心事）は持たない
 * ＝テンプレートは深さ無制限で、識別子もコードではなくid（編集専用・保存時に除去）のみ。
 */
export function WbsTemplateTreeGrid({
  nodes,
  onChange,
  onDeleteRequest,
  onDocumentLinkRequest,
  knownDocumentTemplateIds,
}: WbsTemplateTreeGridProps) {
  const { toast } = useToast()
  const gridRef = useRef<AgGridReact<FlatRow>>(null)

  const [expanded, setExpanded] = useState<Set<string>>(() =>
    collectAllIds(nodes),
  )

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    setExpanded(collectAllIds(nodes))
  }, [nodes])

  const collapseAll = useCallback(() => {
    setExpanded(new Set())
  }, [])

  const rowData = useMemo(
    () => flattenTree(nodes, expanded, knownDocumentTemplateIds),
    [nodes, expanded, knownDocumentTemplateIds],
  )

  const handleAddRoot = useCallback(() => {
    onChange(addRootEditorNode(nodes))
  }, [nodes, onChange])

  const handleAddChild = useCallback(
    (id: string) => {
      onChange(addChildEditorNode(nodes, id))
      setExpanded((prev) => new Set(prev).add(id))
    },
    [nodes, onChange],
  )

  const handleDelete = useCallback(
    (node: EditorNode) => {
      onDeleteRequest(node)
    },
    [onDeleteRequest],
  )

  // Alt+Enter: 同階層追加（WBS画面のProjectTreeGridと同じキー体系）
  const handleAddSibling = useCallback(
    (id: string) => {
      onChange(addSiblingAfterEditorNode(nodes, id))
      toast({ title: '工程を追加しました' })
    },
    [nodes, onChange, toast],
  )

  // Alt+←: 階層上げ。promoteEditorNodeは対象外（既にルート階層）の場合、
  // 引数のnodesをそのまま返す（参照が同一）ため、それをもって失敗判定する
  const handlePromote = useCallback(
    (id: string) => {
      const result = promoteEditorNode(nodes, id)
      if (result === nodes) {
        toast({
          title: 'これ以上階層を上げられません',
          variant: 'destructive',
        })
        return
      }
      onChange(result)
      toast({ title: '階層を上げました' })
    },
    [nodes, onChange, toast],
  )

  // Alt+→: 階層下げ。直前の兄弟が存在しない場合はdemoteEditorNodeが
  // 引数のnodesをそのまま返すため、それをもって失敗判定する
  const handleDemote = useCallback(
    (id: string) => {
      const result = demoteEditorNode(nodes, id)
      if (result === nodes) {
        toast({
          title: '前の兄弟要素がないため階層を下げられません',
          variant: 'destructive',
        })
        return
      }
      onChange(result)
      toast({ title: '階層を下げました' })
    },
    [nodes, onChange, toast],
  )

  const handleEditDocuments = useCallback(
    (node: EditorNode) => {
      onDocumentLinkRequest(node)
    },
    [onDocumentLinkRequest],
  )

  const context = useMemo(
    () => ({
      toggleExpand,
      onAddChild: handleAddChild,
      onDelete: handleDelete,
      onEditDocuments: handleEditDocuments,
    }),
    [toggleExpand, handleAddChild, handleDelete, handleEditDocuments],
  )

  const onCellValueChanged = useCallback(
    (event: CellValueChangedEvent<FlatRow>) => {
      const { data, colDef, newValue } = event
      if (!data || !colDef.field) return

      if (colDef.field === 'name' && (!newValue || !String(newValue).trim())) {
        gridRef.current?.api?.refreshCells({
          rowNodes: [event.node],
          force: true,
        })
        return
      }

      const field = colDef.field as 'name' | 'completionCriteria'
      onChange(
        updateEditorNode(nodes, data.id, { [field]: String(newValue ?? '') }),
      )
    },
    [nodes, onChange],
  )

  const onRowDragEnd = useCallback(
    (event: RowDragEndEvent<FlatRow>) => {
      const movingData = event.node.data
      const overData = event.overNode?.data
      if (!movingData || !overData) return
      if (movingData.id === overData.id) return
      if (isDescendantEditorNode(nodes, movingData.id, overData.id)) return
      onChange(moveEditorNode(nodes, movingData.id, overData.id))
      setExpanded((prev) => new Set(prev).add(overData.id))
    },
    [nodes, onChange],
  )

  const onCellKeyDown = useCallback(
    (event: CellKeyDownEvent<FlatRow>) => {
      const data = event.data
      if (!data) return
      const e = event.event as KeyboardEvent | undefined
      if (!e) return

      // Shift+Enter: 下位層追加
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        handleAddChild(data.id)
        return
      }

      // Alt+Enter: 同階層追加
      if (e.key === 'Enter' && e.altKey) {
        e.preventDefault()
        e.stopPropagation()
        handleAddSibling(data.id)
        return
      }

      // Alt+←: 階層上げ
      if (e.key === 'ArrowLeft' && e.altKey) {
        e.preventDefault()
        e.stopPropagation()
        handlePromote(data.id)
        return
      }

      // Alt+→: 階層下げ
      if (e.key === 'ArrowRight' && e.altKey) {
        e.preventDefault()
        e.stopPropagation()
        handleDemote(data.id)
        return
      }

      // Shift+←: 閉じる
      if (e.key === 'ArrowLeft' && e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        if (data.hasChildren && expanded.has(data.id)) {
          toggleExpand(data.id)
        }
        return
      }

      // Shift+→: 開く
      if (e.key === 'ArrowRight' && e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        if (data.hasChildren && !expanded.has(data.id)) {
          toggleExpand(data.id)
        }
      }
    },
    [
      handleAddChild,
      handleAddSibling,
      handlePromote,
      handleDemote,
      expanded,
      toggleExpand,
    ],
  )

  const columnDefs = useMemo<ColDef<FlatRow>[]>(
    () => [
      {
        headerName: '',
        field: 'id',
        width: 40,
        editable: false,
        sortable: false,
        filter: false,
        pinned: 'left',
        cellRenderer: DragCellRenderer,
        rowDrag: true,
      },
      {
        headerName: '工程名',
        field: 'name',
        minWidth: 260,
        flex: 1,
        editable: true,
        pinned: 'left',
        cellRenderer: NameCellRenderer,
      },
      {
        headerName: '操作',
        field: 'id',
        width: 90,
        editable: false,
        sortable: false,
        filter: false,
        pinned: 'left',
        cellRenderer: ActionsCellRenderer,
      },
      {
        headerName: 'ドキュメント',
        field: 'documentCount',
        width: 110,
        editable: false,
        sortable: false,
        filter: false,
        cellRenderer: DocumentsCellRenderer,
      },
      {
        headerName: '完了条件',
        field: 'completionCriteria',
        minWidth: 260,
        flex: 2,
        editable: true,
      },
    ],
    [],
  )

  const defaultColDef = useMemo<ColDef>(
    () => ({
      resizable: true,
      sortable: false,
      filter: false,
      suppressMovable: true,
      suppressKeyboardEvent: (params) => {
        const e = params.event
        if (e.key === 'Enter' && (e.shiftKey || e.altKey)) return true
        if (
          (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
          (e.altKey || e.shiftKey)
        )
          return true
        return false
      },
    }),
    [],
  )

  const getRowId = useCallback(
    (params: { data: FlatRow }) => params.data.id,
    [],
  )

  // Alt+矢印キーのブラウザデフォルト動作（戻る/進む）を防止（ProjectTreeGridと同じ対策）
  const handleWrapperKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.altKey) {
      e.preventDefault()
      e.stopPropagation()
    }
  }, [])

  if (nodes.length === 0) {
    return (
      <div className="space-y-2">
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddRoot}
          >
            <Plus className="h-3.5 w-3.5" />
            工程を追加
          </Button>
        </div>
        <p className="py-8 text-center text-muted-foreground">
          工程がありません。「工程を追加」から追加してください。
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Shift+Enter: 下位層追加 / Alt+Enter: 同階層追加 / Alt+←: 階層上げ /
          Alt+→: 階層下げ / Shift+←: 閉じる / Shift+→: 開く
        </p>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddRoot}
          >
            <Plus className="h-3.5 w-3.5" />
            工程を追加
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={expandAll}>
            <ChevronsUpDown className="mr-1 h-3.5 w-3.5" />
            すべて開く
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={collapseAll}
          >
            <ChevronsDownUp className="mr-1 h-3.5 w-3.5" />
            すべて閉じる
          </Button>
        </div>
      </div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: AG Gridのラッパーとしてキーボードイベントを捕捉 */}
      <div
        role="presentation"
        style={{ height: Math.min(560, 60 + rowData.length * 42) }}
        onKeyDown={handleWrapperKeyDown}
      >
        <AgGridReact<FlatRow>
          theme={gridTheme}
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          context={context}
          getRowId={getRowId}
          onCellValueChanged={onCellValueChanged}
          onCellKeyDown={onCellKeyDown}
          onRowDragEnd={onRowDragEnd}
          rowDragManaged={false}
          rowHeight={40}
          headerHeight={40}
          animateRows={false}
          domLayout="normal"
        />
      </div>
    </div>
  )
}
