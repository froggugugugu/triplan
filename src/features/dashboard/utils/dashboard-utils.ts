import { CATEGORY_DEFAULT_COLORS } from '@/shared/data/tech-tag-master'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Member } from '@/shared/types/member'
import type { SkillEvaluation, SkillLevel } from '@/shared/types/skill'
import type { TechTag } from '@/shared/types/tech-tag'
import type { TechTagCategory } from '@/shared/types/tech-tag-category'
import { getActiveFiscalMonths } from '@/shared/utils/budget-utils'
import {
  getCurrentSkillLevel,
  isSkillEvaluationStale,
  SKILL_LEVEL_ORDER,
} from '@/shared/utils/skill-utils'

/**
 * 年度の12ヶ月リストを "YYYY-MM" 形式で生成
 * @param fiscalYear 年度（例: 2025 → 2025年4月〜2026年3月）
 * @param fiscalYearStartMonth 年度開始月（デフォルト: 4 = 4月始まり）
 */
export function getFiscalYearMonths(
  fiscalYear: number,
  fiscalYearStartMonth = 4,
): string[] {
  const months: string[] = []
  for (let i = 0; i < 12; i++) {
    const calendarMonth = ((i + fiscalYearStartMonth - 1) % 12) + 1
    const year =
      calendarMonth >= fiscalYearStartMonth ? fiscalYear : fiscalYear + 1
    months.push(`${year}-${String(calendarMonth).padStart(2, '0')}`)
  }
  return months
}

/**
 * アサインをプロジェクト×月で集計
 * @param assignments アサインエントリ配列
 * @param fiscalYear 年度
 * @param fiscalYearStartMonth 年度開始月（デフォルト: 4）
 * @returns { month: string, [projectId]: number }[] の12要素配列
 */
export function getProjectMonthlyAssignments(
  assignments: AssignmentEntry[],
  fiscalYear: number,
  fiscalYearStartMonth = 4,
): Record<string, string | number>[] {
  const months = getFiscalYearMonths(fiscalYear, fiscalYearStartMonth)
  const monthSet = new Set(months)

  // Initialize result with month keys only
  const resultMap = new Map<string, Record<string, string | number>>()
  for (const month of months) {
    resultMap.set(month, { month })
  }

  // Aggregate assignment values by projectId x month
  for (const assignment of assignments) {
    for (const [monthKey, value] of Object.entries(assignment.monthlyValues)) {
      if (!monthSet.has(monthKey) || value === 0) continue
      const row = resultMap.get(monthKey)
      if (!row) continue
      const current = (row[assignment.projectId] as number) ?? 0
      row[assignment.projectId] = current + value
    }
  }

  return months.flatMap((m) => {
    const row = resultMap.get(m)
    return row ? [row] : []
  })
}

export interface MemberAssignmentSummary {
  memberId: string
  memberName: string
  monthlyTotals: Record<string, number>
}

/**
 * 担当者別アサインサマリーを集計
 * アクティブかつ対象年度にアサインがある担当者のみ返す
 * @param members 担当者配列
 * @param assignments アサインエントリ配列
 * @param fiscalYear 年度
 * @param fiscalYearStartMonth 年度開始月（デフォルト: 4）
 */
export function getMemberAssignmentSummary(
  members: Member[],
  assignments: AssignmentEntry[],
  fiscalYear: number,
  fiscalYearStartMonth = 4,
): MemberAssignmentSummary[] {
  const months = getFiscalYearMonths(fiscalYear, fiscalYearStartMonth)
  const monthSet = new Set(months)

  // Filter to active members only
  const activeMembers = members.filter((m) => m.isActive)

  const result: MemberAssignmentSummary[] = []

  for (const member of activeMembers) {
    const memberAssignments = assignments.filter(
      (a) => a.memberId === member.id,
    )

    // Aggregate monthly totals within the fiscal year
    const monthlyTotals: Record<string, number> = {}
    for (const assignment of memberAssignments) {
      for (const [monthKey, value] of Object.entries(
        assignment.monthlyValues,
      )) {
        if (!monthSet.has(monthKey) || value === 0) continue
        monthlyTotals[monthKey] = (monthlyTotals[monthKey] ?? 0) + value
      }
    }

    // Only include members with at least one assignment in the fiscal year
    if (Object.keys(monthlyTotals).length > 0) {
      result.push({
        memberId: member.id,
        memberName: member.name,
        monthlyTotals,
      })
    }
  }

  return result
}

export interface MemberUtilizationRate {
  memberId: string
  memberName: string
  rate: number
  activeMonths: number
}

/**
 * メンバーごとの年間平均アサイン充足率を算出する
 * startDate=nullのメンバーは除外（アクティブ月が算出できないため）
 */
export function getMemberUtilizationRates(
  members: Member[],
  assignments: AssignmentEntry[],
  fiscalYear: number,
  fiscalYearStartMonth = 4,
): MemberUtilizationRate[] {
  const months = getFiscalYearMonths(fiscalYear, fiscalYearStartMonth)
  const monthSet = new Set(months)

  const activeMembers = members.filter(
    (m) => m.isActive && m.startDate !== null,
  )

  return activeMembers
    .map((member) => {
      const activeMonthsList = getActiveFiscalMonths(
        member.startDate,
        member.endDate,
        fiscalYear,
        fiscalYearStartMonth,
      )
      const activeMonths = activeMonthsList.length
      if (activeMonths === 0) return null

      const memberAssignments = assignments.filter(
        (a) => a.memberId === member.id,
      )
      let totalAssignment = 0
      for (const assignment of memberAssignments) {
        for (const [monthKey, value] of Object.entries(
          assignment.monthlyValues,
        )) {
          if (!monthSet.has(monthKey) || value === 0) continue
          totalAssignment += value
        }
      }

      return {
        memberId: member.id,
        memberName: member.name,
        rate: totalAssignment / activeMonths,
        activeMonths,
      }
    })
    .filter((item): item is MemberUtilizationRate => item !== null)
}

export interface SkillDistributionItem {
  categoryId: string
  categoryName: string
  memberCount: number
  color: string
}

/**
 * カテゴリ別のスキル分布（ユニークメンバー数）を集計する
 */
export function getSkillDistribution(
  members: Member[],
  techTags: TechTag[],
  categories: TechTagCategory[],
): SkillDistributionItem[] {
  const activeMembers = members.filter((m) => m.isActive)

  // タグID → カテゴリID のマッピング
  const tagToCategoryMap = new Map<string, string>()
  for (const tag of techTags) {
    tagToCategoryMap.set(tag.id, tag.categoryId)
  }

  // カテゴリ別にユニークメンバーIDを集計
  const categoryMembersMap = new Map<string, Set<string>>()
  for (const member of activeMembers) {
    const tagIds = member.techTagIds ?? []
    for (const tagId of tagIds) {
      const categoryId = tagToCategoryMap.get(tagId)
      if (!categoryId) continue
      const memberSet = categoryMembersMap.get(categoryId)
      if (memberSet) {
        memberSet.add(member.id)
      } else {
        categoryMembersMap.set(categoryId, new Set([member.id]))
      }
    }
  }

  return [...categories]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((c) => categoryMembersMap.has(c.id))
    .map((c) => ({
      categoryId: c.id,
      categoryName: c.name,
      memberCount: categoryMembersMap.get(c.id)?.size ?? 0,
      color: CATEGORY_DEFAULT_COLORS[c.name] ?? '#6b7280',
    }))
}

export interface SkillLevelDistributionItem {
  categoryId: string
  categoryName: string
  color: string
  // 未評価（representativeLevelがnull）のメンバーは含まない（requirements-skill-growth.md設計判断③）
  levelCounts: Partial<Record<SkillLevel, number>>
}

/**
 * カテゴリ×レベル別のスキル分布（アクティブメンバーの代表レベル別人数）を集計する。
 * 代表レベルは「上長評価を優先し、未記録の場合のみ自己評価を採用」（設計判断③、
 * MemberSkillPanelのロードマップ進捗算出と同じ方針）。1メンバーがカテゴリ内に複数タグを
 * 持つ場合は、その中で最も高い代表レベルを採用する（積み上げ棒グラフで二重計上しないため）。
 * 自己評価・上長評価のいずれも記録がないメンバーはこの分布から除外する
 * （保有人数自体は既存のgetSkillDistributionで引き続きカウントされる）。
 */
export function getSkillLevelDistribution(
  members: Member[],
  techTags: TechTag[],
  categories: TechTagCategory[],
  skillEvaluations: SkillEvaluation[],
): SkillLevelDistributionItem[] {
  const activeMembers = members.filter((m) => m.isActive)

  const tagToCategoryMap = new Map<string, string>()
  for (const tag of techTags) {
    tagToCategoryMap.set(tag.id, tag.categoryId)
  }

  const categoryLevelCounts = new Map<
    string,
    Partial<Record<SkillLevel, number>>
  >()

  for (const member of activeMembers) {
    const tagIdsByCategory = new Map<string, string[]>()
    for (const tagId of member.techTagIds ?? []) {
      const categoryId = tagToCategoryMap.get(tagId)
      if (!categoryId) continue
      const list = tagIdsByCategory.get(categoryId) ?? []
      list.push(tagId)
      tagIdsByCategory.set(categoryId, list)
    }

    for (const [categoryId, tagIds] of tagIdsByCategory) {
      let representativeLevel: SkillLevel | null = null
      for (const tagId of tagIds) {
        const managerLevel = getCurrentSkillLevel(
          skillEvaluations,
          member.id,
          tagId,
          'manager',
        )
        const selfLevel = getCurrentSkillLevel(
          skillEvaluations,
          member.id,
          tagId,
          'self',
        )
        const level = managerLevel ?? selfLevel
        if (level === null) continue
        if (
          representativeLevel === null ||
          SKILL_LEVEL_ORDER[level] > SKILL_LEVEL_ORDER[representativeLevel]
        ) {
          representativeLevel = level
        }
      }
      if (representativeLevel === null) continue

      const counts = categoryLevelCounts.get(categoryId) ?? {}
      counts[representativeLevel] = (counts[representativeLevel] ?? 0) + 1
      categoryLevelCounts.set(categoryId, counts)
    }
  }

  return [...categories]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((c) => categoryLevelCounts.has(c.id))
    .map((c) => ({
      categoryId: c.id,
      categoryName: c.name,
      color: CATEGORY_DEFAULT_COLORS[c.name] ?? '#6b7280',
      levelCounts: categoryLevelCounts.get(c.id) ?? {},
    }))
}

/**
 * 定期評価の見直しが必要な（member×techTag）件数を集計する
 * （requirements-skill-growth.md設計判断④、ダッシュボードの「四半期レビュー未実施」
 * サマリーカードに使用）。アクティブメンバーが保有する各タグについて、評価者区分を問わず
 * 最新の評価日を基準にisSkillEvaluationStaleで判定する。一度も評価されていないタグも含む。
 */
export function getStaleSkillReviewCount(
  members: Member[],
  skillEvaluations: SkillEvaluation[],
  baseDate: Date,
  // レビュー周期（月）。省略時は従来の固定値3（P0-a設定化）
  cycleMonths?: number,
): number {
  const activeMembers = members.filter((m) => m.isActive)
  let count = 0

  for (const member of activeMembers) {
    for (const tagId of member.techTagIds ?? []) {
      const relevant = skillEvaluations.filter(
        (e) => e.memberId === member.id && e.techTagId === tagId,
      )
      const lastEvaluatedAt =
        relevant.length === 0
          ? null
          : ([...relevant].sort((a, b) =>
              b.evaluatedAt.localeCompare(a.evaluatedAt),
            )[0]?.evaluatedAt ?? null)
      if (isSkillEvaluationStale(lastEvaluatedAt, baseDate, cycleMonths)) {
        count++
      }
    }
  }

  return count
}
