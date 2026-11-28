import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Member } from '@/shared/types/member'
import type { MemberPreference } from '@/shared/types/member-preference'
import type { OrgDesignTeam } from '@/shared/types/org-design'
import type { Project } from '@/shared/types/project'
import type { Section } from '@/shared/types/section'
import { calcRevenueBudget, getFiscalYearMonthKeys } from './budget-utils'
import { isMemberActiveInMonth } from './resource-histogram-utils'

/**
 * 組織設計の試算（/org-design）のコアロジック。すべて純関数で、本番データは読むだけ。
 *
 * 定義（output/design/org-design-simulator.md §2）:
 * - 兼務: 年度内に値>0のアサインがあるルート案件のうち、所属チームの受け持ちに含まれないもの。
 *   受け持ち未設定のチーム・未配置の担当者は判定できないため数えない
 * - 稼働率: Σアサイン ÷ Σ在籍者の capacityRatio。年度は12か月の合計どうしの比（月平均の平均ではない）。
 *   分母0は null。小数第2位で四捨五入
 * - 過負荷: いずれかの月で、月合計が capacityRatio を 0.001 超えて上回る
 * - コスト: calcRevenueBudget（単価履歴×在籍月、フル稼働前提）の合計（万円）
 * - 希望の充足: 希望（重複除去）のうち、所属チームの受け持ちプロダクト／扱う技術に含まれる割合
 */

const OVERLOAD_EPSILON = 0.001

export interface OrgDesign {
  teams: OrgDesignTeam[]
  /** memberId → teamId（null=未配置） */
  placements: Record<string, string | null>
}

export interface OrgDesignContext {
  members: Member[]
  projects: Pick<Project, 'id' | 'parentId'>[]
  assignments: AssignmentEntry[]
  preferences: MemberPreference[]
  fiscalYear: number
  startMonth: number
}

export type PreferenceStatus = 'met' | 'partial' | 'unmet' | 'none'

export interface MemberDesignInfo {
  memberId: string
  teamId: string | null
  /** 受け持ち外で関与しているルート案件ID */
  crossProductIds: string[]
  overloaded: boolean
  preferenceMet: number
  preferenceTotal: number
  preferenceStatus: PreferenceStatus
}

export interface MonthlyUtilization {
  month: string
  utilization: number | null
}

export interface TeamMetrics {
  teamId: string
  memberIds: string[]
  memberCount: number
  /** 受け持ちプロダクトが未設定（兼務を判定できない） */
  productsUnset: boolean
  utilization: number | null
  monthly: MonthlyUtilization[]
  crossProductMemberCount: number
  overloadedMemberCount: number
  annualCost: number
  preferenceMet: number
  preferenceTotal: number
}

export interface OrgDesignMetrics {
  teams: TeamMetrics[]
  members: Record<string, MemberDesignInfo>
  /** 在籍中だが、どのチームにも配置されていない担当者 */
  unplacedMemberIds: string[]
  /** 配置に残っているが本番に存在しない担当者 */
  missingMemberIds: string[]
  overall: {
    crossProductMemberCount: number
    overloadedMemberCount: number
    annualCost: number
    preferenceRate: number | null
  }
}

const round2 = (v: number) => Math.round(v * 100) / 100

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? round2(numerator / denominator) : null
}

function buildRootResolver(projects: Pick<Project, 'id' | 'parentId'>[]) {
  const parentById = new Map(projects.map((p) => [p.id, p.parentId]))
  const cache = new Map<string, string>()
  return (projectId: string): string => {
    const cached = cache.get(projectId)
    if (cached) return cached
    let current = projectId
    const seen = new Set<string>()
    // 循環データでも止まるよう訪問済みを見る
    while (!seen.has(current)) {
      seen.add(current)
      const parent = parentById.get(current)
      if (!parent) break
      current = parent
    }
    cache.set(projectId, current)
    return current
  }
}

export function computeOrgDesignMetrics(
  design: OrgDesign,
  ctx: OrgDesignContext,
): OrgDesignMetrics {
  const months = getFiscalYearMonthKeys(ctx.fiscalYear, ctx.startMonth)
  const monthSet = new Set(months)
  const activeMembers = ctx.members.filter((m) => m.isActive)
  const knownMemberIds = new Set(ctx.members.map((m) => m.id))
  const teamById = new Map(design.teams.map((t) => [t.id, t]))
  const toRoot = buildRootResolver(ctx.projects)

  // 担当者ごとの月合計と関与ルート案件（年度内・値>0）
  const monthlyTotals = new Map<string, Map<string, number>>()
  const involvedProducts = new Map<string, Set<string>>()
  for (const a of ctx.assignments) {
    for (const [month, value] of Object.entries(a.monthlyValues)) {
      if (!monthSet.has(month) || !(value > 0)) continue
      let totals = monthlyTotals.get(a.memberId)
      if (!totals) {
        totals = new Map()
        monthlyTotals.set(a.memberId, totals)
      }
      totals.set(month, (totals.get(month) ?? 0) + value)
      let products = involvedProducts.get(a.memberId)
      if (!products) {
        products = new Set()
        involvedProducts.set(a.memberId, products)
      }
      products.add(toRoot(a.projectId))
    }
  }

  const prefByMember = new Map(ctx.preferences.map((p) => [p.memberId, p]))

  const members: Record<string, MemberDesignInfo> = {}
  const unplacedMemberIds: string[] = []
  for (const m of activeMembers) {
    const placed = design.placements[m.id]
    const t = placed ? teamById.get(placed) : undefined
    const teamId = t ? t.id : null
    if (!teamId) unplacedMemberIds.push(m.id)

    const products = [...(involvedProducts.get(m.id) ?? [])]
    const crossProductIds =
      t && t.productIds.length > 0
        ? products.filter((p) => !t.productIds.includes(p)).sort()
        : []

    const capacity = m.capacityRatio ?? 1
    const totals = monthlyTotals.get(m.id)
    const overloaded = totals
      ? [...totals.values()].some((v) => v > capacity + OVERLOAD_EPSILON)
      : false

    const p = prefByMember.get(m.id)
    const desiredProducts = [...new Set(p?.desiredProductIds ?? [])]
    const desiredTags = [...new Set(p?.desiredTechTagIds ?? [])]
    const preferenceTotal = desiredProducts.length + desiredTags.length
    const preferenceMet = t
      ? desiredProducts.filter((id) => t.productIds.includes(id)).length +
        desiredTags.filter((id) => t.techTagIds.includes(id)).length
      : 0
    const preferenceStatus: PreferenceStatus =
      preferenceTotal === 0
        ? 'none'
        : preferenceMet === preferenceTotal
          ? 'met'
          : preferenceMet > 0
            ? 'partial'
            : 'unmet'

    members[m.id] = {
      memberId: m.id,
      teamId,
      crossProductIds,
      overloaded,
      preferenceMet,
      preferenceTotal,
      preferenceStatus,
    }
  }

  const costByMember = new Map(
    activeMembers.map((m) => [
      m.id,
      calcRevenueBudget(m, ctx.fiscalYear, ctx.startMonth),
    ]),
  )

  const teams: TeamMetrics[] = design.teams.map((t) => {
    const teamMembers = activeMembers.filter(
      (m) => members[m.id]?.teamId === t.id,
    )
    let demandTotal = 0
    let supplyTotal = 0
    const monthly = months.map((month) => {
      let demand = 0
      let supply = 0
      for (const m of teamMembers) {
        demand += monthlyTotals.get(m.id)?.get(month) ?? 0
        if (isMemberActiveInMonth(m, month)) supply += m.capacityRatio ?? 1
      }
      demandTotal += demand
      supplyTotal += supply
      return { month, utilization: ratio(demand, supply) }
    })
    const infos = teamMembers.map((m) => members[m.id] as MemberDesignInfo)
    return {
      teamId: t.id,
      memberIds: teamMembers.map((m) => m.id),
      memberCount: teamMembers.length,
      productsUnset: t.productIds.length === 0,
      utilization: ratio(demandTotal, supplyTotal),
      monthly,
      crossProductMemberCount: infos.filter((i) => i.crossProductIds.length > 0)
        .length,
      overloadedMemberCount: infos.filter((i) => i.overloaded).length,
      annualCost: round2(
        teamMembers.reduce((sum, m) => sum + (costByMember.get(m.id) ?? 0), 0),
      ),
      preferenceMet: infos.reduce((sum, i) => sum + i.preferenceMet, 0),
      preferenceTotal: infos.reduce((sum, i) => sum + i.preferenceTotal, 0),
    }
  })

  const infos = Object.values(members)
  const preferenceTotal = infos.reduce((s, i) => s + i.preferenceTotal, 0)
  const preferenceMet = infos.reduce((s, i) => s + i.preferenceMet, 0)

  return {
    teams,
    members,
    unplacedMemberIds,
    missingMemberIds: Object.keys(design.placements).filter(
      (memberId) => !knownMemberIds.has(memberId),
    ),
    overall: {
      crossProductMemberCount: infos.filter((i) => i.crossProductIds.length > 0)
        .length,
      overloadedMemberCount: infos.filter((i) => i.overloaded).length,
      annualCost: round2(
        [...costByMember.values()].reduce((sum, v) => sum + v, 0),
      ),
      preferenceRate: ratio(preferenceMet, preferenceTotal),
    },
  }
}

/** 現在の課構成を複製して案の初期状態を作る（本番データは変えない） */
export function createDesignFromCurrentOrg(
  sections: Section[],
  members: Member[],
  newId: () => string = () => crypto.randomUUID(),
): OrgDesign {
  const teamIdBySection = new Map<string, string>()
  const teams: OrgDesignTeam[] = sections.map((s) => {
    const teamId = newId()
    teamIdBySection.set(s.id, teamId)
    return {
      id: teamId,
      sourceSectionId: s.id,
      divisionId: s.divisionId,
      name: s.name,
      sortOrder: s.sortOrder,
      productIds: [],
      techTagIds: [],
    }
  })
  const placements: Record<string, string | null> = {}
  for (const m of members) {
    if (!m.isActive) continue
    placements[m.id] = m.sectionId
      ? (teamIdBySection.get(m.sectionId) ?? null)
      : null
  }
  return { teams, placements }
}

export function moveMember(
  design: OrgDesign,
  memberId: string,
  teamId: string | null,
): OrgDesign {
  return { ...design, placements: { ...design.placements, [memberId]: teamId } }
}

/** チームを消す。所属していた担当者は未配置に戻す（人は消さない） */
export function removeTeam(design: OrgDesign, teamId: string): OrgDesign {
  const placements: Record<string, string | null> = {}
  for (const [memberId, placed] of Object.entries(design.placements)) {
    placements[memberId] = placed === teamId ? null : placed
  }
  return {
    teams: design.teams.filter((t) => t.id !== teamId),
    placements,
  }
}

/**
 * 現組織を案と同じ形で導出する（保存しない）。チームID=課ID。受け持ちの概念は案にしかないため、
 * 受け持ちプロダクト・技術は案の同じ複製元を持つチームから借りる（output/design §1.2【仮定】）
 */
export function deriveCurrentOrgDesign(
  draftTeams: OrgDesignTeam[],
  sections: Section[],
  members: Member[],
): OrgDesign {
  const draftBySource = new Map(
    draftTeams
      .filter((t) => t.sourceSectionId)
      .map((t) => [t.sourceSectionId as string, t]),
  )
  const teams: OrgDesignTeam[] = sections.map((s) => {
    const borrowed = draftBySource.get(s.id)
    return {
      id: s.id,
      sourceSectionId: s.id,
      divisionId: s.divisionId,
      name: s.name,
      sortOrder: s.sortOrder,
      productIds: borrowed?.productIds ?? [],
      techTagIds: borrowed?.techTagIds ?? [],
    }
  })
  const placements: Record<string, string | null> = {}
  for (const m of members) {
    if (m.isActive) placements[m.id] = m.sectionId
  }
  return { teams, placements }
}

export interface ComparedValue<T> {
  current: T | null
  draft: T | null
  /** 両側に値があるときだけ（案 − 現組織） */
  delta: T | null
}

export interface ComparisonRow {
  key: string
  name: string
  divisionId: string
  /** kept=両方にある / added=案で新設 / removed=案で廃止 */
  kind: 'kept' | 'added' | 'removed'
  memberCount: ComparedValue<number>
  utilization: ComparedValue<number>
  crossProductMemberCount: ComparedValue<number>
  overloadedMemberCount: ComparedValue<number>
  annualCost: ComparedValue<number>
  preferenceRate: ComparedValue<number>
}

interface DesignWithMetrics {
  design: OrgDesign
  metrics: OrgDesignMetrics
}

function compared(
  current: number | null | undefined,
  draft: number | null | undefined,
): ComparedValue<number> {
  const c = current ?? null
  const d = draft ?? null
  return {
    current: c,
    draft: d,
    delta: c !== null && d !== null ? round2(d - c) : null,
  }
}

/** 現組織と案をチーム単位で並べる。対応づけは複製元の課（sourceSectionId） */
export function compareOrgDesigns(
  current: DesignWithMetrics,
  draft: DesignWithMetrics,
): ComparisonRow[] {
  const metricsOf = (m: OrgDesignMetrics, teamId: string) =>
    m.teams.find((t) => t.teamId === teamId)
  const row = (
    key: string,
    team: OrgDesignTeam,
    kind: ComparisonRow['kind'],
    c: TeamMetrics | undefined,
    d: TeamMetrics | undefined,
  ): ComparisonRow => ({
    key,
    name: team.name,
    divisionId: team.divisionId,
    kind,
    memberCount: compared(c?.memberCount, d?.memberCount),
    utilization: compared(c?.utilization, d?.utilization),
    crossProductMemberCount: compared(
      c?.crossProductMemberCount,
      d?.crossProductMemberCount,
    ),
    overloadedMemberCount: compared(
      c?.overloadedMemberCount,
      d?.overloadedMemberCount,
    ),
    annualCost: compared(c?.annualCost, d?.annualCost),
    preferenceRate: compared(
      c ? ratio(c.preferenceMet, c.preferenceTotal) : null,
      d ? ratio(d.preferenceMet, d.preferenceTotal) : null,
    ),
  })

  const rows: ComparisonRow[] = []
  const matchedDraftIds = new Set<string>()
  const currentTeams = [...current.design.teams].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )
  for (const ct of currentTeams) {
    const dt = draft.design.teams.find((t) => t.sourceSectionId === ct.id)
    if (dt) matchedDraftIds.add(dt.id)
    rows.push(
      row(
        ct.id,
        dt ?? ct,
        dt ? 'kept' : 'removed',
        metricsOf(current.metrics, ct.id),
        dt ? metricsOf(draft.metrics, dt.id) : undefined,
      ),
    )
  }
  const added = draft.design.teams
    .filter((t) => !matchedDraftIds.has(t.id))
    .sort((a, b) => a.sortOrder - b.sortOrder)
  for (const dt of added) {
    rows.push(
      row(dt.id, dt, 'added', undefined, metricsOf(draft.metrics, dt.id)),
    )
  }
  return rows
}
