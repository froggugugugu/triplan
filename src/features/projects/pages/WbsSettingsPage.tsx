import { ArrowDown, ArrowUp, Check, ChevronLeft, Pencil, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { ThemeColorPicker } from '@/shared/components/ui/theme-color-picker'
import { PROJECT_LEVEL_LABELS } from '@/shared/types/project'
import { getThemeColor } from '@/shared/types/theme-color'
import { DEFAULT_LEVEL_COLORS } from '@/shared/types/wbs-settings'
import { pickReadableTextColor } from '@/shared/utils/color-contrast'
import {
  useAppStore,
  useProjectsStore,
  useTechTagsStore,
  useWbsSettingsStore,
} from '@/stores'
import { TechTagSelectDialog } from '../components/TechTagSelectDialog'

export function WbsSettingsPage() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()

  const projects = useProjectsStore((s) => s.projects)
  const project = projects.find((p) => p.id === projectId)
  const theme = useAppStore((s) => s.theme)

  const wbsSettingsEntries = useWbsSettingsStore((s) => s.entries)
  const getWbsSettings = useWbsSettingsStore((s) => s.getSettings)
  const settings = useMemo(
    () => (projectId ? getWbsSettings(projectId) : undefined),
    [wbsSettingsEntries, getWbsSettings, projectId],
  )
  const updateColumnName = useWbsSettingsStore((s) => s.updateColumnName)
  const toggleColumnEnabled = useWbsSettingsStore((s) => s.toggleColumnEnabled)
  const moveColumn = useWbsSettingsStore((s) => s.moveColumn)
  const updateColumnBackgroundColor = useWbsSettingsStore(
    (s) => s.updateColumnBackgroundColor,
  )
  const updateColumnTechTags = useWbsSettingsStore(
    (s) => s.updateColumnTechTags,
  )
  const updateLevelColor = useWbsSettingsStore((s) => s.updateLevelColor)

  const techTags = useTechTagsStore((s) => s.techTags)
  const loadTechTags = useTechTagsStore((s) => s.loadTechTags)

  const [tagDialogOpen, setTagDialogOpen] = useState(false)
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null)

  useEffect(() => {
    loadTechTags()
  }, [loadTechTags])

  // projectIdが無効なら /wbs にリダイレクト
  if (!projectId || !settings) {
    return <Navigate to="/wbs" replace />
  }

  const sortedColumns = [...settings.effortColumns].sort(
    (a, b) => a.order - b.order,
  )

  const levelColors = settings.levelColors ?? DEFAULT_LEVEL_COLORS

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() =>
              navigate('/wbs', { state: { selectedProjectId: projectId } })
            }
            title="WBSに戻る"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">
            WBS工数列 設定 — {project?.name ?? '不明なプロジェクト'}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground ml-10">
          WBSグリッドに表示する工数列の名前・有効/無効・表示順序・背景色を設定します（最大10列）
        </p>
      </div>

      <div className="rounded-md border border-border">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-2 text-left text-sm font-medium">順序</th>
              <th className="px-4 py-2 text-left text-sm font-medium">ID</th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                表示名
              </th>
              <th className="px-4 py-2 text-center text-sm font-medium">
                背景色
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                技術タグ
              </th>
              <th className="px-4 py-2 text-center text-sm font-medium">
                有効
              </th>
              <th className="px-4 py-2 text-center text-sm font-medium">
                並び替え
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedColumns.map((col, idx) => (
              <tr
                key={col.id}
                className={cn(
                  'border-b border-border last:border-b-0',
                  !col.enabled && 'opacity-50',
                )}
              >
                <td className="px-4 py-2 text-sm text-muted-foreground">
                  {idx + 1}
                </td>
                <td className="px-4 py-2 text-sm font-mono">{col.id}</td>
                <td className="px-4 py-2">
                  <Input
                    value={col.displayName}
                    onChange={(e) =>
                      updateColumnName(projectId, col.id, e.target.value)
                    }
                    className="h-8 max-w-[200px]"
                  />
                </td>
                <td className="px-4 py-2">
                  {col.backgroundColor ? (
                    <ThemeColorPicker
                      value={col.backgroundColor}
                      onChange={(newColor) =>
                        updateColumnBackgroundColor(projectId, col.id, newColor)
                      }
                      disabled={!col.enabled}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      未設定
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(col.techTagIds ?? []).map((tagId) => {
                      const tag = techTags.find((t) => t.id === tagId)
                      if (!tag) return null
                      return (
                        <Badge
                          key={tag.id}
                          style={{
                            backgroundColor: tag.color,
                            color: pickReadableTextColor(tag.color),
                          }}
                          className="border-transparent text-[11px] px-1.5 py-0"
                        >
                          {tag.name}
                        </Badge>
                      )
                    })}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => {
                        setEditingColumnId(col.id)
                        setTagDialogOpen(true)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
                <td className="px-4 py-2 text-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => toggleColumnEnabled(projectId, col.id)}
                  >
                    {col.enabled ? (
                      <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </td>
                <td className="px-4 py-2 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={idx === 0}
                      onClick={() => moveColumn(projectId, col.id, 'up')}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={idx === sortedColumns.length - 1}
                      onClick={() => moveColumn(projectId, col.id, 'down')}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        有効な列のみWBSグリッドに表示されます。列の順序はグリッド内の左から右の並びに反映されます。
      </p>

      {/* レベル別背景色設定 (Issue 7) */}
      <div>
        <h1 className="text-xl font-bold">レベル別背景色</h1>
        <p className="text-sm text-muted-foreground">
          各レベルの行の背景色を設定します
        </p>
      </div>

      <div className="rounded-md border border-border">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-2 text-left text-sm font-medium">
                レベル
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                背景色
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                プレビュー
              </th>
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2, 3, 4, 5].map((level) => (
              <tr
                key={level}
                className="border-b border-border last:border-b-0"
              >
                <td className="px-4 py-2 text-sm font-medium">
                  {PROJECT_LEVEL_LABELS[level] ?? `レベル${level}`}
                </td>
                <td className="px-4 py-2">
                  <ThemeColorPicker
                    value={
                      levelColors[String(level)] ??
                      DEFAULT_LEVEL_COLORS[level] ??
                      '#ffffff'
                    }
                    onChange={(newColor) =>
                      updateLevelColor(projectId, level, newColor)
                    }
                  />
                </td>
                <td className="px-4 py-2">
                  <div
                    className="h-8 w-32 rounded border border-border"
                    style={{
                      backgroundColor: getThemeColor(
                        levelColors[String(level)] ??
                          DEFAULT_LEVEL_COLORS[level] ??
                          '#ffffff',
                        theme,
                      ),
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingColumnId && (
        <TechTagSelectDialog
          open={tagDialogOpen}
          onOpenChange={(open) => {
            setTagDialogOpen(open)
            if (!open) setEditingColumnId(null)
          }}
          selectedTagIds={
            settings.effortColumns.find((c) => c.id === editingColumnId)
              ?.techTagIds ?? []
          }
          onSave={(tagIds) =>
            updateColumnTechTags(projectId, editingColumnId, tagIds)
          }
          columnName={
            settings.effortColumns.find((c) => c.id === editingColumnId)
              ?.displayName ?? ''
          }
        />
      )}
    </div>
  )
}
