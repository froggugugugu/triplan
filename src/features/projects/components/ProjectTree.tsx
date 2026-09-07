import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useState } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import type { Project, ProjectLevel, ProjectTreeNode } from '@/shared/types'
import { PROJECT_LEVEL_LABELS } from '@/shared/types/project'
import { formatProjectNameWithConfidence } from '@/shared/utils/project-display'

interface ProjectTreeProps {
  tree: ProjectTreeNode[]
  onAddChild: (parent: Project, childLevel: ProjectLevel) => void
  onEdit: (project: Project) => void
  onDelete: (project: Project) => void
}

function ProjectTreeItem({
  node,
  onAddChild,
  onEdit,
  onDelete,
}: {
  node: ProjectTreeNode
  onAddChild: (parent: Project, childLevel: ProjectLevel) => void
  onEdit: (project: Project) => void
  onDelete: (project: Project) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children.length > 0
  const canAddChild = node.level < 5

  const childLevel: ProjectLevel = node.level + 1

  const handleToggle = useCallback(() => {
    setExpanded((prev) => !prev)
  }, [])

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50',
          node.depth === 0 && 'font-medium',
        )}
        style={{ paddingLeft: `${node.depth * 24 + 8}px` }}
      >
        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-accent',
            !hasChildren && 'invisible',
          )}
          aria-label={expanded ? '折りたたむ' : '展開する'}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <Badge
          variant={node.level === 0 ? 'default' : 'secondary'}
          className="text-xs"
        >
          {PROJECT_LEVEL_LABELS[node.level]}
        </Badge>

        <span className="font-mono text-xs text-muted-foreground">
          {node.code}
        </span>
        <span className="flex-1 truncate">
          {formatProjectNameWithConfidence(node.name, node.confidence)}
        </span>

        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {canAddChild ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onAddChild(node, childLevel)}
              aria-label={`${PROJECT_LEVEL_LABELS[childLevel]}を追加`}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onEdit(node)}
            aria-label="編集"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onDelete(node)}
            aria-label="削除"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {expanded && hasChildren ? (
        <div>
          {node.children.map((child) => (
            <ProjectTreeItem
              key={child.id}
              node={child}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function ProjectTree({
  tree,
  onAddChild,
  onEdit,
  onDelete,
}: ProjectTreeProps) {
  if (tree.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Projectがありません。「新規Project」ボタンから追加してください。
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {tree.map((node) => (
        <ProjectTreeItem
          key={node.id}
          node={node}
          onAddChild={onAddChild}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
