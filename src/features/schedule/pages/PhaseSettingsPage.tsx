import { Check, ChevronLeft, X } from 'lucide-react'
import { useMemo } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { ThemeColorPicker } from '@/shared/components/ui/theme-color-picker'
import { useProjectsStore, useScheduleSettingsStore } from '@/stores'
import { PhaseRow } from '../components/PhaseRow'

export function PhaseSettingsPage() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()

  const projects = useProjectsStore((s) => s.projects)
  const project = projects.find((p) => p.id === projectId)

  const scheduleSettingsEntries = useScheduleSettingsStore((s) => s.entries)
  const getScheduleSettings = useScheduleSettingsStore((s) => s.getSettings)
  const settings = useMemo(
    () => (projectId ? getScheduleSettings(projectId) : undefined),
    [scheduleSettingsEntries, getScheduleSettings, projectId],
  )
  const updatePhaseName = useScheduleSettingsStore((s) => s.updatePhaseName)
  const updatePhaseColor = useScheduleSettingsStore((s) => s.updatePhaseColor)
  const togglePhaseEnabled = useScheduleSettingsStore(
    (s) => s.togglePhaseEnabled,
  )
  const reorderPhase = useScheduleSettingsStore((s) => s.reorderPhase)

  if (!projectId || !settings) {
    return <Navigate to="/schedule" replace />
  }

  const sortedPhases = [...settings.phases].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() =>
              navigate('/schedule', {
                state: { selectedProjectId: projectId },
              })
            }
            title="スケジュールに戻る"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">
            工程設定 — {project?.name ?? '不明なプロジェクト'}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground ml-10">
          スケジュールに表示する工程の名前・色・有効/無効・表示順序を設定します（最大15件）
        </p>
      </div>

      <DndProvider backend={HTML5Backend}>
        <div className="rounded-md border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-2 py-2 w-8" />
                <th className="px-2 py-2 text-left text-sm font-medium w-8">
                  #
                </th>
                <th className="px-2 py-2 text-left text-sm font-medium">ID</th>
                <th className="px-2 py-2 text-left text-sm font-medium">
                  工程名
                </th>
                <th className="px-2 py-2 text-center text-sm font-medium">
                  色
                </th>
                <th className="px-2 py-2 text-center text-sm font-medium">
                  有効
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedPhases.map((phase, idx) => (
                <PhaseRow
                  key={phase.phaseKey}
                  phase={phase}
                  index={idx}
                  onDrop={(fromKey, toKey) =>
                    reorderPhase(projectId, fromKey, toKey)
                  }
                >
                  <td className="px-2 py-2 text-sm font-mono">
                    {phase.phaseKey}
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      value={phase.name}
                      onChange={(e) =>
                        updatePhaseName(
                          projectId,
                          phase.phaseKey,
                          e.target.value,
                        )
                      }
                      className={cn(
                        'h-8 max-w-[200px]',
                        !phase.enabled && 'opacity-50',
                      )}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <ThemeColorPicker
                      value={phase.color}
                      onChange={(newColor) =>
                        updatePhaseColor(projectId, phase.phaseKey, newColor)
                      }
                      disabled={!phase.enabled}
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        togglePhaseEnabled(projectId, phase.phaseKey)
                      }
                    >
                      {phase.enabled ? (
                        <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                      ) : (
                        <X className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </td>
                </PhaseRow>
              ))}
            </tbody>
          </table>
        </div>
      </DndProvider>

      <p className="text-xs text-muted-foreground">
        有効な工程のみスケジュール画面に表示されます。ドラッグ＆ドロップで表示順序を変更できます。
      </p>
    </div>
  )
}
