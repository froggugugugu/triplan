import { cn } from '@/lib/utils'
import type { SkillLevel } from '@/shared/types'
import { SKILL_LEVEL_LABELS } from '@/shared/utils/skill-utils'

const LEVEL_COLOR_CLASSES: Record<SkillLevel, string> = {
  none: 'bg-muted text-muted-foreground',
  beginner: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  intermediate:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  advanced:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  expert:
    'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
}

interface SkillLevelBadgeProps {
  level: SkillLevel | null
  className?: string
}

/** スキル習熟度レベルの表示専用バッジ。levelがnullの場合は「未評価」を表示する */
export function SkillLevelBadge({ level, className }: SkillLevelBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        level === null ? LEVEL_COLOR_CLASSES.none : LEVEL_COLOR_CLASSES[level],
        className,
      )}
    >
      {level === null ? '未評価' : SKILL_LEVEL_LABELS[level]}
    </span>
  )
}
