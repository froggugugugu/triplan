import type {
  CellKeyDownEvent,
  CellValueChangedEvent,
  ColDef,
  ICellRendererParams,
  RowDragEndEvent,
} from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { gridTheme } from '@/shared/ag-grid-theme'

ModuleRegistry.registerModules([AllCommunityModule])

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ExternalLink,
  GripVertical,
  Info,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ExternalTool } from '@/shared/api/external-tools-api'
import { Button } from '@/shared/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/components/ui/popover'
import { useToast } from '@/shared/hooks/use-toast'
import type { Project, ProjectLevel, ProjectTreeNode } from '@/shared/types'
import { MAX_PROJECT_LEVEL, PROJECT_LEVEL_LABELS } from '@/shared/types/project'
import { getThemeColor } from '@/shared/types/theme-color'
import {
  createDefaultWbsSettings,
  DEFAULT_LEVEL_COLORS,
} from '@/shared/types/wbs-settings'
import {
  computeEffortDisplayValues,
  formatEffort,
  parseEffortInput,
} from '@/shared/utils/effort-utils'
import { formatDateOnly } from '@/shared/utils/iso-week-utils'
import { generateProjectCode } from '@/shared/utils/project-code-generator'
import { formatProjectNameWithConfidence } from '@/shared/utils/project-display'
import {
  formatTaskAssignee,
  type TaskAssignee,
} from '@/shared/utils/task-assignee-utils'
import {
  useAppStore,
  useEffortsStore,
  useProjectsStore,
  useTechTagsStore,
  useWbsSettingsStore,
} from '@/stores'
import { buildExternalTaskUrl } from '../utils/external-task-url'
import {
  calcWbsProgress,
  calcWbsProgressWeighted,
  getIncompleteVisibleIds,
  getMatchingVisibleIds,
} from '../utils/wbs-progress-utils'

interface ProjectTreeGridProps {
  tree: ProjectTreeNode[]
  projectId?: string
  onAddChild: (parent: Project, childLevel: ProjectLevel) => void
  onEdit: (project: Project) => void
  onDelete: (project: Project) => void
  /**
   * ツール→baseUrlのマップ（外部タスクリンクの解決用）。
   * 未指定・解決不能なツールはリンクを出さずバッジのみに縮退する
   */
  toolBaseUrls?: Partial<Record<ExternalTool, string | null>>
  /**
   * タスクid → 担当者表示 のマップ（アサインからの派生表示）。
   * タスク自身は担当者を持たないため、呼び出し側が対象期間の配分から
   * 一度だけ構築して渡す（行ごとに解決するとO(タスク数 × アサイン数)になる）
   */
  assigneeOf?: Map<string, TaskAssignee>
}

interface FlatRowData {
  id: string
  code: string
  name: string
  confidence: string | null
  level: ProjectLevel
  parentId: string | null
  description: string
  completionCriteria: string
  depth: number
  hasChildren: boolean
  isExpanded: boolean
  _node: ProjectTreeNode
  /** Dynamic effort display values keyed by columnId */
  [key: `effort_${string}`]: number
  /** 全工数列の行小計（人日） */
  effortSubtotal: number
  /** 最下層タスクの完了フラグ（FR-004） */
  completed: boolean
  /** 進捗率（0.0〜1.0）。最下層は自身のcompletedをそのまま、親/level0はロールアップ集計値 */
  progress: number
  /** 起票元ツールのスラッグ（未起票はnull） */
  externalSource: string | null
  /** 外部ツール側のタスクID（未起票はnull） */
  externalTaskId: string | null
}

type SortOrder = 'asc' | 'desc' | null

function flattenTree(
  nodes: ProjectTreeNode[],
  expanded: Set<string>,
  nameSortOrder: SortOrder = null,
  visibleIds?: Set<string> | null,
  // 進捗率の算出方法を注入する（既定はタスク数ベース）。呼び出し元は工数加重版を渡す
  progressOf: (node: ProjectTreeNode) => number = calcWbsProgress,
): FlatRowData[] {
  const rows: FlatRowData[] = []
  // ルートノード（案件）をソート（子孫はそのまま付いてくる）
  const sorted = nameSortOrder
    ? [...nodes].sort((a, b) => {
        const cmp = a.name.localeCompare(b.name, 'ja')
        return nameSortOrder === 'desc' ? -cmp : cmp
      })
    : nodes
  function walk(items: ProjectTreeNode[], depth: number) {
    for (const node of items) {
      // 「未完了のみ表示」フィルタ有効時、対象外のノードは配下ごと非表示にする
      // （getIncompleteVisibleIdsは未完了リーフの祖先を全て含むため、対象外＝
      // 配下が全て完了済みのブランチであり子孫を辿る必要がない）
      if (visibleIds && !visibleIds.has(node.id)) continue
      const isExpanded = expanded.has(node.id)
      rows.push({
        id: node.id,
        code: node.code,
        name: node.name,
        confidence: node.confidence ?? null,
        level: node.level,
        parentId: node.parentId,
        description: node.description ?? '',
        completionCriteria: node.completionCriteria ?? '',
        effortSubtotal: 0,
        depth,
        hasChildren: node.children.length > 0,
        isExpanded,
        _node: node,
        completed: node.completed ?? false,
        progress: progressOf(node),
        externalSource: node.externalSource ?? null,
        externalTaskId: node.externalTaskId ?? null,
      })
      if (isExpanded && node.children.length > 0) {
        walk(node.children, depth + 1)
      }
    }
  }
  walk(sorted, 0)
  return rows
}

function getChildLevel(level: ProjectLevel): ProjectLevel | null {
  return level < MAX_PROJECT_LEVEL ? level + 1 : null
}

function getParentLevel(level: ProjectLevel): ProjectLevel | null {
  return level > 0 ? level - 1 : null
}

/**
 * サブツリー内の最大相対深度を計算
 */
function getMaxSubtreeDepth(projectId: string, projects: Project[]): number {
  let maxDepth = 0
  function walk(parentId: string, depth: number) {
    for (const p of projects) {
      if (p.parentId === parentId) {
        if (depth + 1 > maxDepth) maxDepth = depth + 1
        walk(p.id, depth + 1)
      }
    }
  }
  walk(projectId, 0)
  return maxDepth
}

const NameCellRenderer = memo(function NameCellRenderer(
  props: ICellRendererParams<FlatRowData>,
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
      <span
        className={cn(
          'truncate',
          (data.hasChildren || data.level === 0) && 'font-semibold',
          data.level === 0 && 'text-base',
          (data.level === 1 || data.level === 2) && 'text-sm',
          data.level >= 3 && 'text-xs',
        )}
      >
        {formatProjectNameWithConfidence(data.name, data.confidence)}
      </span>
    </div>
  )
})

const LevelCellRenderer = memo(function LevelCellRenderer(
  props: ICellRendererParams<FlatRowData>,
) {
  const data = props.data
  if (!data) return null
  const label = PROJECT_LEVEL_LABELS[data.level] ?? `レベル${data.level}`
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        data.level === 0
          ? 'bg-blue-800 text-white dark:bg-blue-300 dark:text-blue-900'
          : data.level === 1
            ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-800'
            : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
      )}
    >
      {label}
    </span>
  )
})

const DragCellRenderer = memo(function DragCellRenderer(
  props: ICellRendererParams<FlatRowData>,
) {
  const data = props.data
  if (!data || data.level === 0) return null
  return (
    <div className="flex h-full items-center justify-center cursor-grab">
      <GripVertical className="h-4 w-4 text-muted-foreground" />
    </div>
  )
})

const ActionsCellRenderer = memo(function ActionsCellRenderer(
  props: ICellRendererParams<FlatRowData>,
) {
  const data = props.data
  if (!data) return null
  const context = props.context as {
    onAddChild: (parent: Project, childLevel: ProjectLevel) => void
    onEdit: (project: Project) => void
    onDelete: (project: Project) => void
  }

  const childLevel = getChildLevel(data.level)
  const node = data._node

  return (
    <div className="flex h-full items-center justify-center gap-0.5">
      {childLevel != null && (
        <button
          type="button"
          className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-600"
          onClick={() => context.onAddChild(node, childLevel)}
          title={`${PROJECT_LEVEL_LABELS[childLevel] ?? `レベル${childLevel}`}を追加`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-600"
        onClick={() => context.onEdit(node)}
        title="編集"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="rounded p-1 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
        onClick={() => context.onDelete(node)}
        title="削除"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
})

/**
 * 外部ツールへの起票状態を示すセル。
 * 起票済みでURLを解決できたときだけリンクにし、解決できない場合はバッジのみへ縮退する
 * （別スペース・別リポジトリの同名課題へ誤って飛ばさないため）。
 */
/**
 * 担当者セル。アサインの配分から導出した主担当（＋他N名）を表示する。
 * 非リーフ（工程・中間ノード）は配下タスクに担当が付くため何も出さない。
 */
const AssigneeCellRenderer = memo(function AssigneeCellRenderer(
  props: ICellRendererParams<FlatRowData>,
) {
  const data = props.data
  if (!data) return null
  const context = props.context as {
    assigneeOf?: Map<string, TaskAssignee>
  }
  const label = formatTaskAssignee(context.assigneeOf?.get(data.id))
  if (!label) {
    return (
      <div className="flex h-full items-center text-muted-foreground/50">—</div>
    )
  }
  return (
    <div className="flex h-full items-center truncate" title={label}>
      {label}
    </div>
  )
})

const ExternalLinkCellRenderer = memo(function ExternalLinkCellRenderer(
  props: ICellRendererParams<FlatRowData>,
) {
  const data = props.data
  if (!data) return null
  const context = props.context as {
    toolBaseUrls?: Partial<Record<ExternalTool, string | null>>
  }

  const { externalSource, externalTaskId } = data
  if (!externalSource || !externalTaskId) {
    return (
      <div
        className="flex h-full items-center justify-center text-muted-foreground/50"
        title="未起票"
      >
        —
      </div>
    )
  }

  const baseUrl = context.toolBaseUrls?.[externalSource as ExternalTool] ?? null
  const url = buildExternalTaskUrl(externalSource, externalTaskId, baseUrl)
  const label = `${externalSource}: ${externalTaskId}`

  if (!url) {
    return (
      <div
        className="flex h-full items-center justify-center"
        title={`${label}（接続情報が無いためリンクを表示できません）`}
      >
        <span className="truncate rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {externalTaskId}
        </span>
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-xs text-primary hover:bg-accent hover:underline"
        title={`${label} を外部ツールで開く`}
      >
        <ExternalLink className="h-3 w-3 shrink-0" />
        <span className="truncate">{externalTaskId}</span>
      </a>
    </div>
  )
})

const EffortCellRenderer = memo(function EffortCellRenderer(
  props: ICellRendererParams<FlatRowData>,
) {
  const data = props.data
  if (!data) return null
  const colId = (props.colDef?.field ?? '').replace('effort_', '')
  const key = `effort_${colId}` as `effort_${string}`
  const value = data[key] ?? 0
  const isLeaf = !data.hasChildren

  return (
    <div
      className={cn(
        'flex h-full items-center justify-end pr-2 tabular-nums',
        !isLeaf && 'text-[17px] font-semibold',
      )}
    >
      {formatEffort(value)}
    </div>
  )
})

const SubtotalCellRenderer = memo(function SubtotalCellRenderer(
  props: ICellRendererParams<FlatRowData>,
) {
  const data = props.data
  if (!data) return null
  const days = data.effortSubtotal ?? 0
  const months = (days / 20).toFixed(2)
  const isLeaf = !data.hasChildren

  return (
    <div
      className={cn(
        'flex h-full items-center justify-end pr-2 tabular-nums',
        !isLeaf && 'text-[17px] font-semibold',
      )}
    >
      {formatEffort(days)}
      <span className="text-muted-foreground text-xs ml-1">({months})</span>
    </div>
  )
})

const ProgressCellRenderer = memo(function ProgressCellRenderer(
  props: ICellRendererParams<FlatRowData>,
) {
  const data = props.data
  if (!data) return null
  const context = props.context as {
    onToggleCompleted: (id: string, completed: boolean) => void
  }
  const isLeaf = !data.hasChildren

  // 最下層タスクのみ完了フラグを直接操作できる（FR-004）
  if (isLeaf) {
    return (
      <div className="flex h-full items-center gap-1.5">
        <input
          type="checkbox"
          checked={data.completed}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            context.onToggleCompleted(data.id, e.target.checked)
          }}
          className="h-4 w-4 cursor-pointer accent-primary"
          aria-label={`${data.name}を完了にする`}
        />
        <span className="text-xs text-muted-foreground">
          {data.completed ? '完了' : '未完了'}
        </span>
      </div>
    )
  }

  // 親・最上位（level0）は配下最下層タスクの完了数/総数から算出した進捗率を読み取り専用で表示する
  const percent = Math.round(data.progress * 100)
  return (
    <div className="flex h-full items-center justify-end pr-2 tabular-nums text-[13px] font-semibold">
      {percent}%
    </div>
  )
})

const EffortHeaderRenderer = memo(function EffortHeaderRenderer(props: {
  displayName: string
  techTagIds?: string[]
}) {
  const techTags = useTechTagsStore((s) => s.techTags)
  const linkedTags = useMemo(
    () =>
      (props.techTagIds ?? [])
        .map((id) => techTags.find((t) => t.id === id))
        .filter((t): t is NonNullable<typeof t> => t != null),
    [props.techTagIds, techTags],
  )

  return (
    <div className="flex items-center gap-1 w-full">
      <span className="truncate">{props.displayName}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="shrink-0 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            onClick={(e) => e.stopPropagation()}
          >
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-48" align="start">
          <div className="space-y-2">
            <p className="text-sm font-medium">技術タグ</p>
            {linkedTags.length === 0 ? (
              <p className="text-xs text-muted-foreground">設定なし</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {linkedTags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                    }}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
})

/**
 * Generate next auto-name based on siblings' names.
 */
function generateAutoName(baseName: string, siblingNames: string[]): string {
  const pattern = new RegExp(
    `^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`,
  )
  const numbers = siblingNames
    .map((n) => {
      const m = n.match(pattern)
      return m?.[1] ? Number.parseInt(m[1], 10) : 0
    })
    .filter((n) => n > 0)

  if (siblingNames.includes(baseName) && !numbers.includes(1)) {
    numbers.push(1)
  }

  const nextNum = numbers.length > 0 ? Math.max(...numbers) + 1 : 1
  return `${baseName}-${nextNum}`
}

function NameSortHeader(props: {
  nameSortOrder: SortOrder
  setNameSortOrder: (v: SortOrder) => void
}) {
  const { nameSortOrder, setNameSortOrder } = props
  const handleClick = () => {
    if (nameSortOrder === null) setNameSortOrder('asc')
    else if (nameSortOrder === 'asc') setNameSortOrder('desc')
    else setNameSortOrder(null)
  }
  return (
    <button
      type="button"
      className="flex items-center gap-1 w-full h-full text-left"
      onClick={handleClick}
    >
      <span>プロジェクト名</span>
      {nameSortOrder === null && (
        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      {nameSortOrder === 'asc' && <ArrowUp className="h-3.5 w-3.5" />}
      {nameSortOrder === 'desc' && <ArrowDown className="h-3.5 w-3.5" />}
    </button>
  )
}

export function ProjectTreeGrid({
  tree,
  projectId,
  onAddChild,
  onEdit,
  onDelete,
  toolBaseUrls,
  assigneeOf,
}: ProjectTreeGridProps) {
  const { toast } = useToast()
  const projects = useProjectsStore((state) => state.projects)
  const addProject = useProjectsStore((state) => state.addProject)
  const updateProject = useProjectsStore((state) => state.updateProject)
  const updateProjectsBatch = useProjectsStore(
    (state) => state.updateProjectsBatch,
  )
  const gridRef = useRef<AgGridReact<FlatRowData>>(null)
  const theme = useAppStore((s) => s.theme)

  const wbsSettingsEntries = useWbsSettingsStore((s) => s.entries)
  const getWbsSettings = useWbsSettingsStore((s) => s.getSettings)
  const settings = useMemo(() => {
    const id = projectId ?? tree[0]?.id
    if (id) return getWbsSettings(id)
    return createDefaultWbsSettings()
  }, [projectId, tree, wbsSettingsEntries, getWbsSettings])

  const effortColumns = settings.effortColumns
  const enabledColumns = useMemo(
    () =>
      effortColumns.filter((c) => c.enabled).sort((a, b) => a.order - b.order),
    [effortColumns],
  )
  const efforts = useEffortsStore((s) => s.efforts)
  const loadEfforts = useEffortsStore((s) => s.loadEfforts)
  const upsertEffort = useEffortsStore((s) => s.upsertEffort)
  const loadTechTags = useTechTagsStore((s) => s.loadTechTags)

  useEffect(() => {
    loadEfforts()
    loadTechTags()
  }, [loadEfforts, loadTechTags])

  const enabledColumnIds = useMemo(
    () => enabledColumns.map((c) => c.id),
    [enabledColumns],
  )

  const effortDisplayValues = useMemo(
    () => computeEffortDisplayValues(tree, enabledColumnIds, efforts),
    [tree, enabledColumnIds, efforts],
  )

  // 進捗率は工数加重で算出する（非公開の設計文書）。工数が未入力の案件は
  // calcWbsProgressWeighted 側でタスク数ベースへ自動フォールバックする
  const progressOf = useCallback(
    (node: ProjectTreeNode) =>
      calcWbsProgressWeighted(node, enabledColumnIds, efforts),
    [enabledColumnIds, efforts],
  )

  const [nameSortOrder, setNameSortOrder] = useState<SortOrder>(null)

  const STORAGE_KEY = 'wbs-tree-expanded'
  const INCOMPLETE_ONLY_STORAGE_KEY = 'wbs-tree-incomplete-only'

  const [showIncompleteOnly, setShowIncompleteOnly] = useState<boolean>(() => {
    try {
      return localStorage.getItem(INCOMPLETE_ONLY_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(
        INCOMPLETE_ONLY_STORAGE_KEY,
        String(showIncompleteOnly),
      )
    } catch {
      /* ignore */
    }
  }, [showIncompleteOnly])

  /** ツリー内絞り込み。名前・コードの部分一致 */
  const [filterQuery, setFilterQuery] = useState('')

  const visibleIds = useMemo(() => {
    const incomplete = showIncompleteOnly ? getIncompleteVisibleIds(tree) : null
    const matching = filterQuery.trim()
      ? getMatchingVisibleIds(tree, filterQuery)
      : null
    if (!incomplete) return matching
    if (!matching) return incomplete
    // 両方有効なら積集合（どちらの条件も満たす行だけ残す）
    return new Set([...matching].filter((id) => incomplete.has(id)))
  }, [showIncompleteOnly, filterQuery, tree])

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) return new Set(JSON.parse(saved) as string[])
    } catch {
      /* ignore */
    }
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

  // 直前のレンダーで「子を持つノード」だった集合のスナップショット。「新たに子を
  // 持つようになったノード」を判定する基準に使う（現在のexpanded=UI開閉状態とは
  // 独立させる必要がある。expandedを基準にすると、単に閉じているだけのノードが
  // 「新規に子を持つようになった」と誤判定され、無関係な操作（完了チェック等）で
  // projects配列が更新されtree参照が変わるたびに全ての閉じたノードが強制展開されてしまう）
  const prevParentsWithChildrenRef = useRef<Set<string> | null>(null)

  useEffect(() => {
    const allIds = new Set<string>()
    const parentsWithChildren = new Set<string>()
    function collect(nodes: ProjectTreeNode[]) {
      for (const n of nodes) {
        allIds.add(n.id)
        if (n.children.length > 0) {
          parentsWithChildren.add(n.id)
        }
        collect(n.children)
      }
    }
    collect(tree)

    const prevParentsWithChildren = prevParentsWithChildrenRef.current

    setExpanded((prev) => {
      const next = new Set<string>()
      // 既存の展開状態を維持（ただしツリーに存在し、子を持つノードのみ）
      for (const id of prev) {
        if (allIds.has(id) && parentsWithChildren.has(id)) {
          next.add(id)
        }
      }
      // 新しく子を持つようになったノード（直前のスナップショットに存在しなかった）は展開する。
      // 初回マウント時（スナップショットがnull）はexpandedの初期値をそのまま使うため対象外
      if (prevParentsWithChildren) {
        for (const id of parentsWithChildren) {
          if (!prevParentsWithChildren.has(id)) {
            next.add(id)
          }
        }
      }
      // 変更があった場合のみ更新
      if (next.size !== prev.size || [...next].some((id) => !prev.has(id))) {
        return next
      }
      return prev
    })

    prevParentsWithChildrenRef.current = parentsWithChildren
  }, [tree])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...expanded]))
    // expanded変更後にAG Gridのセルを強制リフレッシュ（シェブロンアイコン更新）
    gridRef.current?.api?.refreshCells({ force: true })
  }, [expanded])

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
    const ids = new Set<string>()
    function collectAll(nodes: ProjectTreeNode[]) {
      for (const n of nodes) {
        ids.add(n.id)
        collectAll(n.children)
      }
    }
    collectAll(tree)
    setExpanded(ids)
  }, [tree])

  const collapseAll = useCallback(() => {
    setExpanded(new Set<string>())
  }, [])

  const expandToLevel = useCallback(
    (targetLevel: number) => {
      const ids = new Set<string>()
      function collect(nodes: ProjectTreeNode[]) {
        for (const n of nodes) {
          // レベルがtargetLevel未満のノードを展開（そのレベルの子が見える）
          if (n.level < targetLevel) {
            ids.add(n.id)
          }
          collect(n.children)
        }
      }
      collect(tree)
      setExpanded(ids)
    },
    [tree],
  )

  const rowData = useMemo(() => {
    const rows = flattenTree(
      tree,
      expanded,
      nameSortOrder,
      visibleIds,
      progressOf,
    )
    // Inject effort display values and subtotal into each row
    for (const row of rows) {
      let subtotal = 0
      for (const col of enabledColumns) {
        const key = `effort_${col.id}` as `effort_${string}`
        const value = effortDisplayValues.get(`${row.id}:${col.id}`) ?? 0
        row[key] = value
        subtotal += value
      }
      row.effortSubtotal = subtotal
    }
    return rows
  }, [
    tree,
    expanded,
    nameSortOrder,
    visibleIds,
    enabledColumns,
    effortDisplayValues,
    progressOf,
  ])

  // rowData変更後にカスタムセルレンダラーを強制リフレッシュ（階層変更時のインデント更新）
  // biome-ignore lint/correctness/useExhaustiveDependencies: rowDataの変更をトリガーとして使用
  useEffect(() => {
    gridRef.current?.api?.refreshCells({ force: true })
  }, [rowData])

  const handleToggleCompleted = useCallback(
    (id: string, completed: boolean) => {
      // 完了フラグと同時に完了日を記録する（非公開の設計文書）。
      // この日付から任意の過去週時点のEVを再現できるため、週次スナップショットの
      // 記録操作が不要になる。完了を外したときはnullへ戻す
      updateProject({
        id,
        completed,
        completedAt: completed ? formatDateOnly(new Date()) : null,
      })
    },
    [updateProject],
  )

  const onCellKeyDown = useCallback(
    (event: CellKeyDownEvent<FlatRowData>) => {
      const rowData = event.data
      if (!rowData) return
      const e = event.event as KeyboardEvent | undefined
      if (!e) return
      // ストアから最新のプロジェクトデータを取得（AG Gridの行データは古い可能性がある）
      const data = projects.find((p) => p.id === rowData.id)
      if (!data) return
      const dataHasChildren = projects.some((p) => p.parentId === data.id)

      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        const childLevel = getChildLevel(data.level)
        if (childLevel == null) {
          toast({
            title: 'この階層には子項目を追加できません',
            variant: 'destructive',
          })
          return
        }
        const siblingNames = projects
          .filter((p) => p.parentId === data.id && p.level === childLevel)
          .map((p) => p.name)
        const name = generateAutoName(data.name, siblingNames)
        const code = generateProjectCode(
          childLevel,
          projects,
          data.id,
          data.code,
        )
        addProject({
          code,
          name,
          level: childLevel,
          parentId: data.id,
          status: 'not_started' as const,
          confidence: null,
          completed: false,
        })
        setExpanded((prev) => new Set(prev).add(data.id))
        toast({
          title: `${PROJECT_LEVEL_LABELS[childLevel] ?? `レベル${childLevel}`}を追加しました`,
        })
        return
      }

      if (e.key === 'Enter' && e.altKey) {
        e.preventDefault()
        e.stopPropagation()
        const siblingNames = projects
          .filter((p) => p.parentId === data.parentId && p.level === data.level)
          .map((p) => p.name)
        const name = generateAutoName(data.name, siblingNames)
        const parentProj = data.parentId
          ? projects.find((p) => p.id === data.parentId)
          : undefined
        const code = generateProjectCode(
          data.level,
          projects,
          data.parentId,
          parentProj?.code,
        )
        addProject({
          code,
          name,
          level: data.level,
          parentId: data.parentId,
          status: 'not_started' as const,
          confidence: null,
          completed: false,
        })
        toast({
          title: `${PROJECT_LEVEL_LABELS[data.level] ?? `レベル${data.level}`}を追加しました`,
        })
        return
      }

      if (e.key === 'ArrowLeft' && e.altKey) {
        e.preventDefault()
        e.stopPropagation()
        const upLevel = getParentLevel(data.level)
        if (upLevel == null || upLevel === 0) {
          toast({
            title: 'これ以上階層を上げられません',
            variant: 'destructive',
          })
          return
        }
        const descendants: Project[] = []
        function collectDesc(parentId: string) {
          for (const p of projects) {
            if (p.parentId === parentId) {
              descendants.push(p)
              collectDesc(p.id)
            }
          }
        }
        collectDesc(data.id)
        for (const d of descendants) {
          const dUp = getParentLevel(d.level)
          if (dUp == null || dUp === 0) {
            toast({
              title: '子項目をこれ以上上げられません',
              variant: 'destructive',
            })
            return
          }
        }
        const currentParent = data.parentId
          ? projects.find((p) => p.id === data.parentId)
          : undefined
        const newParentId = currentParent?.parentId ?? null
        const newParent = newParentId
          ? projects.find((p) => p.id === newParentId)
          : undefined
        const newCode = generateProjectCode(
          upLevel,
          projects,
          newParentId,
          newParent?.code,
        )
        // 更新後のコードマップを構築（子孫のコード生成で親の新コードを参照するため）
        const codeMap = new Map<string, string>()
        codeMap.set(data.id, newCode)
        const updates: {
          id: string
          level?: number
          parentId?: string | null
          code?: string
        }[] = [
          { id: data.id, level: upLevel, parentId: newParentId, code: newCode },
        ]
        for (const d of descendants) {
          const dUpLevel = getParentLevel(d.level) ?? d.level
          const parentCode =
            codeMap.get(d.parentId ?? '') ??
            projects.find((p) => p.id === d.parentId)?.code
          const dNewCode = generateProjectCode(
            dUpLevel,
            projects,
            d.parentId,
            parentCode,
          )
          codeMap.set(d.id, dNewCode)
          updates.push({ id: d.id, level: dUpLevel, code: dNewCode })
        }
        updateProjectsBatch(updates)
        toast({ title: '階層を上げました' })
        return
      }

      if (e.key === 'ArrowRight' && e.altKey) {
        e.preventDefault()
        e.stopPropagation()
        const downLevel = getChildLevel(data.level)
        if (downLevel == null) {
          toast({
            title: 'これ以上階層を下げられません',
            variant: 'destructive',
          })
          return
        }
        const descendants: Project[] = []
        function collectDesc(parentId: string) {
          for (const p of projects) {
            if (p.parentId === parentId) {
              descendants.push(p)
              collectDesc(p.id)
            }
          }
        }
        collectDesc(data.id)
        for (const d of descendants) {
          if (getChildLevel(d.level) == null) {
            toast({
              title: '子項目をこれ以上下げられません',
              variant: 'destructive',
            })
            return
          }
        }
        const siblings = projects
          .filter(
            (p) =>
              p.parentId === data.parentId &&
              p.level === data.level &&
              p.id !== data.id,
          )
          .sort((a, b) => a.code.localeCompare(b.code))
        const currentIndex = siblings.findIndex((s) => s.code > data.code)
        const prevSibling =
          currentIndex > 0
            ? siblings[currentIndex - 1]
            : currentIndex === -1 && siblings.length > 0
              ? siblings[siblings.length - 1]
              : undefined
        if (!prevSibling) {
          toast({
            title: '前の兄弟要素がないため階層を下げられません',
            variant: 'destructive',
          })
          return
        }
        const newCode = generateProjectCode(
          downLevel,
          projects,
          prevSibling.id,
          prevSibling.code,
        )
        const codeMap = new Map<string, string>()
        codeMap.set(data.id, newCode)
        const updates: {
          id: string
          level?: number
          parentId?: string | null
          code?: string
        }[] = [
          {
            id: data.id,
            level: downLevel,
            parentId: prevSibling.id,
            code: newCode,
          },
        ]
        for (const d of descendants) {
          const dDownLevel = getChildLevel(d.level) ?? d.level
          const parentCode =
            codeMap.get(d.parentId ?? '') ??
            projects.find((p) => p.id === d.parentId)?.code
          const dNewCode = generateProjectCode(
            dDownLevel,
            projects,
            d.parentId,
            parentCode,
          )
          codeMap.set(d.id, dNewCode)
          updates.push({ id: d.id, level: dDownLevel, code: dNewCode })
        }
        updateProjectsBatch(updates)
        setExpanded((prev) => new Set(prev).add(prevSibling.id))
        toast({ title: '階層を下げました' })
        return
      }

      // Enter（修飾キーなし）: 完了チェックボックス（進捗列、最下層タスクのみ）をON/OFFトグル
      if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
        if (event.colDef.field === 'progress' && !dataHasChildren) {
          e.preventDefault()
          e.stopPropagation()
          handleToggleCompleted(data.id, !data.completed)
        }
        return
      }

      // Space: 開閉トグル
      if (e.key === ' ') {
        e.preventDefault()
        e.stopPropagation()
        if (dataHasChildren) {
          toggleExpand(data.id)
        }
        return
      }

      // Shift+Left: 閉じる
      if (e.key === 'ArrowLeft' && e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        if (dataHasChildren && expanded.has(data.id)) {
          toggleExpand(data.id)
        }
        return
      }

      // Shift+Right: 開く
      if (e.key === 'ArrowRight' && e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        if (dataHasChildren && !expanded.has(data.id)) {
          toggleExpand(data.id)
        }
        return
      }
    },
    [
      projects,
      addProject,
      updateProjectsBatch,
      toast,
      expanded,
      toggleExpand,
      handleToggleCompleted,
    ],
  )

  /**
   * ドラッグ&ドロップ: ドロップ先を新しい親とする
   */
  const onRowDragEnd = useCallback(
    (event: RowDragEndEvent<FlatRowData>) => {
      const movingData = event.node.data
      const overData = event.overNode?.data
      if (!movingData || !overData) return
      // 案件（レベル0）はドラッグ不可
      if (movingData.level === 0) return
      // 自分自身にドロップした場合は無視
      if (movingData.id === overData.id) return
      // 自分の子孫にドロップした場合は無視
      function isDescendant(parentId: string, targetId: string): boolean {
        for (const p of projects) {
          if (p.parentId === parentId) {
            if (p.id === targetId) return true
            if (isDescendant(p.id, targetId)) return true
          }
        }
        return false
      }
      if (isDescendant(movingData.id, overData.id)) {
        toast({
          title: '自身の子孫にはドロップできません',
          variant: 'destructive',
        })
        return
      }
      // 新しいレベル = ドロップ先のレベル + 1
      const newLevel = overData.level + 1
      // サブツリーの最大相対深度を計算
      const subtreeMaxDepth = getMaxSubtreeDepth(movingData.id, projects)
      if (newLevel + subtreeMaxDepth > MAX_PROJECT_LEVEL) {
        toast({
          title: `最大${MAX_PROJECT_LEVEL}階層を超えるためドロップできません`,
          variant: 'destructive',
        })
        return
      }
      // レベル差を計算して移動ノードと全子孫を一括更新
      const levelDiff = newLevel - movingData.level
      const newCode = generateProjectCode(
        newLevel,
        projects,
        overData.id,
        overData.code,
      )
      const codeMap = new Map<string, string>()
      codeMap.set(movingData.id, newCode)
      const updates: {
        id: string
        level?: number
        parentId?: string | null
        code?: string
      }[] = [
        {
          id: movingData.id,
          level: newLevel,
          parentId: overData.id,
          code: newCode,
        },
      ]
      const descendants: Project[] = []
      function collectDesc(parentId: string) {
        for (const p of projects) {
          if (p.parentId === parentId) {
            descendants.push(p)
            collectDesc(p.id)
          }
        }
      }
      collectDesc(movingData.id)
      for (const d of descendants) {
        const dNewLevel = d.level + levelDiff
        const parentCode =
          codeMap.get(d.parentId ?? '') ??
          projects.find((p) => p.id === d.parentId)?.code
        const dNewCode = generateProjectCode(
          dNewLevel,
          projects,
          d.parentId,
          parentCode,
        )
        codeMap.set(d.id, dNewCode)
        updates.push({ id: d.id, level: dNewLevel, code: dNewCode })
      }
      updateProjectsBatch(updates)
      setExpanded((prev) => new Set(prev).add(overData.id))
      toast({ title: '移動しました' })
    },
    [projects, updateProjectsBatch, toast],
  )

  const handleEffortValueChanged = useCallback(
    (event: CellValueChangedEvent<FlatRowData>) => {
      const { data, colDef, newValue } = event
      if (!data || !colDef.field) return
      // field is like "effort_effort-1"
      const columnId = colDef.field.replace('effort_', '')
      const parsed = parseEffortInput(String(newValue ?? ''))
      if (parsed === null) {
        toast({ title: '無効な値です', variant: 'destructive' })
        gridRef.current?.api?.refreshCells({
          rowNodes: [event.node],
          force: true,
        })
        return
      }
      upsertEffort({ projectId: data.id, columnId, value: parsed })
      toast({ title: '工数を更新しました' })
    },
    [upsertEffort, toast],
  )

  const levelColors = settings.levelColors

  const columnDefs = useMemo<ColDef<FlatRowData>[]>(() => {
    const effortCols: ColDef<FlatRowData>[] = enabledColumns.map((col) => ({
      headerName: col.displayName,
      headerComponent: EffortHeaderRenderer,
      headerComponentParams: { techTagIds: col.techTagIds },
      field: `effort_${col.id}` as keyof FlatRowData & string,
      width: 120,
      editable: (params) => {
        // Level 0 is always read-only; non-leaf rows are read-only
        if (!params.data) return false
        if (params.data.level === 0) return false
        return !params.data.hasChildren
      },
      cellRenderer: EffortCellRenderer,
      cellStyle: col.backgroundColor
        ? { backgroundColor: getThemeColor(col.backgroundColor, theme) }
        : undefined,
      valueSetter: (params) => {
        if (params.data) {
          const key = `effort_${col.id}` as `effort_${string}`
          params.data[key] = Number(params.newValue)
        }
        return true
      },
    }))

    return [
      {
        headerName: '',
        field: 'id',
        width: 40,
        editable: false,
        sortable: false,
        filter: false,
        pinned: 'left',
        cellRenderer: DragCellRenderer,
        rowDrag: (params) => params.data?.level !== 0,
      },
      {
        headerName: 'タスク',
        field: 'name',
        minWidth: 300,
        flex: 2,
        editable: true,
        pinned: 'left',
        cellRenderer: NameCellRenderer,
        headerComponent: NameSortHeader,
        headerComponentParams: { nameSortOrder, setNameSortOrder },
      },
      {
        headerName: 'レベル',
        field: 'level',
        width: 90,
        editable: false,
        pinned: 'left',
        cellRenderer: LevelCellRenderer,
      },
      {
        headerName: '操作',
        field: 'id',
        width: 110,
        editable: false,
        sortable: false,
        filter: false,
        pinned: 'left',
        cellRenderer: ActionsCellRenderer,
      },
      {
        headerName: '小計',
        field: 'effortSubtotal',
        width: 140,
        editable: false,
        pinned: 'left',
        cellRenderer: SubtotalCellRenderer,
      },
      {
        headerName: '進捗',
        field: 'progress',
        width: 120,
        editable: false,
        pinned: 'left',
        cellRenderer: ProgressCellRenderer,
      },
      {
        headerName: '担当者',
        colId: 'assignee',
        width: 140,
        editable: false,
        pinned: 'left',
        cellRenderer: AssigneeCellRenderer,
      },
      ...effortCols,
      {
        headerName: '説明',
        field: 'description',
        minWidth: 150,
        flex: 1,
        editable: true,
        tooltipValueGetter: (params) => params.data?.description || undefined,
      },
      {
        headerName: '完了条件',
        field: 'completionCriteria',
        minWidth: 150,
        flex: 1,
        editable: true,
        tooltipValueGetter: (params) =>
          params.data?.completionCriteria || undefined,
      },
      {
        headerName: '連携',
        field: 'externalTaskId',
        width: 130,
        editable: false,
        // 右端固定。工数列が増えても横スクロールなしで起票状態を一覧できるようにする
        // （列仮想化により、非固定の末尾列はスクロールするまでDOMに存在しない）
        pinned: 'right',
        cellRenderer: ExternalLinkCellRenderer,
      },
    ]
  }, [nameSortOrder, enabledColumns, theme])

  const defaultColDef = useMemo<ColDef>(
    () => ({
      resizable: true,
      sortable: false,
      filter: false,
      suppressMovable: true,
      suppressKeyboardEvent: (params) => {
        const e = params.event
        if (e.key === 'Enter' && (e.shiftKey || e.altKey)) return true
        // 完了チェックボックス（進捗列）はプレーンEnterでON/OFFをトグルするため、
        // AG Grid標準のEnter動作（次行への移動）を抑止する
        if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
          return params.column.getColId() === 'progress'
        }
        if (
          (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
          (e.altKey || e.shiftKey)
        )
          return true
        if (e.key === ' ') return true
        return false
      },
    }),
    [],
  )

  const context = useMemo(
    () => ({
      toggleExpand,
      onAddChild,
      onEdit,
      onDelete,
      onToggleCompleted: handleToggleCompleted,
      toolBaseUrls,
      assigneeOf,
    }),
    [
      toggleExpand,
      onAddChild,
      onEdit,
      onDelete,
      handleToggleCompleted,
      toolBaseUrls,
      assigneeOf,
    ],
  )

  const onCellValueChanged = useCallback(
    (event: CellValueChangedEvent<FlatRowData>) => {
      const { data, colDef, newValue } = event
      if (!data || !colDef.field) return

      // Delegate effort column changes
      if (colDef.field.startsWith('effort_')) {
        handleEffortValueChanged(event)
        return
      }

      const field = colDef.field as
        | 'name'
        | 'description'
        | 'completionCriteria'

      if (field === 'name' && (!newValue || newValue.trim().length === 0)) {
        toast({ title: 'プロジェクト名は必須です', variant: 'destructive' })
        gridRef.current?.api?.refreshCells({
          rowNodes: [event.node],
          force: true,
        })
        return
      }

      updateProject({ id: data.id, [field]: newValue?.trim() ?? '' })
      toast({ title: '更新しました' })
    },
    [updateProject, toast, handleEffortValueChanged],
  )

  const getRowStyle = useCallback(
    (params: { data: FlatRowData | undefined }) => {
      if (!params.data) return undefined
      // 入力可能行（leaf かつ level !== 0）は背景色なし
      if (!params.data.hasChildren && params.data.level !== 0) return undefined
      const colors = levelColors ?? DEFAULT_LEVEL_COLORS
      const bg = colors[String(params.data.level)]
      if (bg) {
        return { backgroundColor: getThemeColor(bg, theme) }
      }
      return undefined
    },
    [levelColors, theme],
  )

  /** Issue 8: 総工数集計 */
  const totalEfforts = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const col of enabledColumns) {
      let sum = 0
      // level 0 の行だけ合計（ロールアップ済み値）
      for (const row of rowData) {
        if (row.level === 0) {
          const key = `effort_${col.id}` as `effort_${string}`
          sum += row[key] ?? 0
        }
      }
      totals[col.id] = sum
    }
    return totals
  }, [enabledColumns, rowData])

  const getRowId = useCallback(
    (params: { data: FlatRowData }) => params.data.id,
    [],
  )

  /**
   * Alt+矢印キーのブラウザデフォルト動作（戻る/進む）を防止
   */
  const handleWrapperKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.altKey) {
      e.preventDefault()
      e.stopPropagation()
    }
  }, [])

  if (tree.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        プロジェクトがありません。「新規プロジェクト」ボタンから追加してください。
      </div>
    )
  }

  const useAutoHeight = rowData.length <= 20

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Shift+Enter: 下位層追加 / Alt+Enter: 同階層追加 / Alt+←: 階層上げ /
          Alt+→: 階層下げ / Shift+←: 閉じる / Shift+→: 開く / Enter:
          完了チェック切替（進捗列）
        </p>
        <div className="flex items-center gap-2">
          {/* ツリー内絞り込み。列フィルタではなく「一致＋祖先を残す」方式に
              しているのは、平坦化した行を独立に絞ると階層が壊れるため */}
          <div className="relative">
            <Search className="-translate-y-1/2 absolute top-1/2 left-2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="search"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="タスク名・コードで絞り込み"
              aria-label="タスク名・コードで絞り込み"
              className="h-7 w-52 rounded-md border border-input bg-transparent pr-2 pl-7 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={showIncompleteOnly}
              onChange={(e) => setShowIncompleteOnly(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer accent-primary"
            />
            未完了のみ表示
          </label>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">レベル:</span>
            {[1, 2, 3, 4, 5].map((lv) => (
              <Button
                key={lv}
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => expandToLevel(lv)}
              >
                {lv}
              </Button>
            ))}
          </div>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={expandAll}>
              <ChevronsUpDown className="mr-1 h-3.5 w-3.5" />
              すべて開く
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll}>
              <ChevronsDownUp className="mr-1 h-3.5 w-3.5" />
              すべて閉じる
            </Button>
          </div>
        </div>
      </div>
      {/* 総工数表示（テーブル形式） */}
      {(() => {
        const grandTotalDays = Object.values(totalEfforts).reduce(
          (a, b) => a + b,
          0,
        )
        const grandTotalMonths = (grandTotalDays / 20).toFixed(2)
        return (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-1.5 text-left font-semibold">
                    全プロジェクト合計
                  </th>
                  {enabledColumns.map((col) => (
                    <th
                      key={col.id}
                      className="px-3 py-1.5 text-right font-medium"
                    >
                      {col.displayName}
                    </th>
                  ))}
                  <th className="px-3 py-1.5 text-right font-semibold bg-muted">
                    合計
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    人日（人月）
                  </td>
                  {enabledColumns.map((col) => {
                    const days = totalEfforts[col.id] ?? 0
                    const months = (days / 20).toFixed(2)
                    return (
                      <td
                        key={col.id}
                        className="px-3 py-1.5 text-right tabular-nums"
                      >
                        {formatEffort(days)}
                        <span className="text-muted-foreground text-xs ml-1">
                          ({months})
                        </span>
                      </td>
                    )
                  })}
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold bg-muted">
                    {formatEffort(grandTotalDays)}
                    <span className="text-muted-foreground text-xs ml-1">
                      ({grandTotalMonths})
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      })()}
      {/* onKeyDownでAlt+矢印のブラウザデフォルト動作を防止 */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: AG Gridのラッパーとしてキーボードイベントを捕捉 */}
      <div
        role="presentation"
        style={useAutoHeight ? undefined : { height: 600 }}
        onKeyDown={handleWrapperKeyDown}
      >
        <AgGridReact<FlatRowData>
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
          getRowStyle={getRowStyle}
          tooltipShowDelay={300}
          rowDragManaged={false}
          rowHeight={40}
          headerHeight={40}
          animateRows={false}
          rowBuffer={10}
          debounceVerticalScrollbar={true}
          singleClickEdit={false}
          stopEditingWhenCellsLoseFocus
          suppressCellFocus={false}
          domLayout={useAutoHeight ? 'autoHeight' : 'normal'}
        />
      </div>
    </div>
  )
}
