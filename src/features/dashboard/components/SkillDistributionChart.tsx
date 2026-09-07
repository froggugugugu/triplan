import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Member } from '@/shared/types/member'
import type { SkillEvaluation, SkillLevel } from '@/shared/types/skill'
import type { TechTag } from '@/shared/types/tech-tag'
import type { TechTagCategory } from '@/shared/types/tech-tag-category'
import { SKILL_LEVEL_LABELS } from '@/shared/utils/skill-utils'
import {
  getSkillDistribution,
  getSkillLevelDistribution,
} from '../utils/dashboard-utils'

interface SkillDistributionChartProps {
  members: Member[]
  techTags: TechTag[]
  techTagCategories: TechTagCategory[]
  // 渡すとレベル別積み上げ棒グラフに切り替わる（未指定時は単色棒グラフ）
  skillEvaluations?: SkillEvaluation[]
}

// レベル別積み上げ棒グラフの系列色（SkillLevelBadgeのTailwindカラーに準拠したhex値）
const LEVEL_BAR_COLORS: Record<SkillLevel, string> = {
  none: '#9ca3af',
  beginner: '#0ea5e9',
  intermediate: '#10b981',
  advanced: '#f59e0b',
  expert: '#8b5cf6',
}

const LEVEL_ORDER_FOR_STACK: SkillLevel[] = [
  'beginner',
  'intermediate',
  'advanced',
  'expert',
]

export function SkillDistributionChart({
  members,
  techTags,
  techTagCategories,
  skillEvaluations,
}: SkillDistributionChartProps) {
  const legacyChartData = useMemo(
    () => getSkillDistribution(members, techTags, techTagCategories),
    [members, techTags, techTagCategories],
  )
  const levelChartData = useMemo(
    () =>
      skillEvaluations
        ? getSkillLevelDistribution(
            members,
            techTags,
            techTagCategories,
            skillEvaluations,
          )
        : [],
    [members, techTags, techTagCategories, skillEvaluations],
  )

  const useLevelChart = skillEvaluations !== undefined

  if (useLevelChart) {
    if (levelChartData.length === 0) {
      return (
        <div className="flex h-[300px] items-center justify-center text-muted-foreground">
          スキル評価データがありません
        </div>
      )
    }

    const chartHeight = Math.max(300, levelChartData.length * 36 + 80)
    const chartRows = levelChartData.map((item) => ({
      categoryName: item.categoryName,
      ...item.levelCounts,
    }))

    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={chartRows} layout="vertical" margin={{ left: 40 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            type="number"
            allowDecimals={false}
            className="text-xs"
            tick={{ fill: 'var(--color-muted-foreground)' }}
            label={{
              value: '人数',
              position: 'insideBottomRight',
              offset: -5,
              fill: 'var(--color-muted-foreground)',
            }}
          />
          <YAxis
            type="category"
            dataKey="categoryName"
            width={160}
            className="text-xs"
            tick={{ fill: 'var(--color-muted-foreground)' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--color-popover)',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              color: 'var(--color-popover-foreground)',
            }}
            formatter={(value: number, name: string) => [
              `${value}人`,
              SKILL_LEVEL_LABELS[name as SkillLevel] ?? name,
            ]}
          />
          <Legend
            formatter={(value: string) =>
              SKILL_LEVEL_LABELS[value as SkillLevel] ?? value
            }
          />
          {LEVEL_ORDER_FOR_STACK.map((level, i) => (
            <Bar
              key={level}
              dataKey={level}
              stackId="level"
              fill={LEVEL_BAR_COLORS[level]}
              radius={
                i === LEVEL_ORDER_FOR_STACK.length - 1
                  ? [0, 4, 4, 0]
                  : undefined
              }
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (legacyChartData.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
        スキルデータがありません
      </div>
    )
  }

  const chartHeight = Math.max(300, legacyChartData.length * 36 + 60)

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={legacyChartData} layout="vertical" margin={{ left: 40 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          type="number"
          allowDecimals={false}
          className="text-xs"
          tick={{ fill: 'var(--color-muted-foreground)' }}
          label={{
            value: '人数',
            position: 'insideBottomRight',
            offset: -5,
            fill: 'var(--color-muted-foreground)',
          }}
        />
        <YAxis
          type="category"
          dataKey="categoryName"
          width={160}
          className="text-xs"
          tick={{ fill: 'var(--color-muted-foreground)' }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--color-popover)',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            color: 'var(--color-popover-foreground)',
          }}
          formatter={(value: number) => [`${value}人`, 'メンバー数']}
        />
        <Bar dataKey="memberCount" radius={[0, 4, 4, 0]}>
          {legacyChartData.map((entry) => (
            <Cell key={entry.categoryId} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
