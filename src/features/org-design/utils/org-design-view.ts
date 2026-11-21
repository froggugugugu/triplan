import type { Division } from '@/shared/types/division'
import {
  type OrgDesignTeam,
  OrgDesignTeamSchema,
} from '@/shared/types/org-design'
import { manYenFormatter } from '@/shared/utils/budget-utils'
import type { OrgDesign } from '@/shared/utils/org-design-utils'

/**
 * /org-design 画面の表示と案の編集操作（純関数）。指標の計算そのものは shared/utils/org-design-utils。
 * 編集操作は不正な入力・存在しない対象のとき、受け取った案をそのまま返す（参照が変わらない）。
 */

const TeamNameSchema = OrgDesignTeamSchema.shape.name

/** 稼働率・充足率を%整数で表示する。null（分母0・対象なし）は「—」 */
export function formatUtilization(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`
}

export type DeltaKind = 'count' | 'percent' | 'cost'

export interface FormattedDelta {
  text: string
  /** 色だけに頼らないよう、記号（▲▼±）を text に含める */
  direction: 'up' | 'down' | 'flat' | null
}

/** 案 − 現組織 の差分を ▲▼ 付きで表示する */
export function formatDelta(
  delta: number | null,
  kind: DeltaKind,
): FormattedDelta {
  if (delta === null) return { text: '—', direction: null }
  // 表示上の丸め後で符号を決める（▲0pt のような表示を出さない）
  const shown =
    kind === 'percent'
      ? Math.round(delta * 100)
      : kind === 'cost'
        ? Math.round(delta * 100) / 100
        : delta
  const unit = kind === 'percent' ? 'pt' : kind === 'cost' ? '万円' : ''
  if (shown === 0) return { text: `±0${unit}`, direction: 'flat' }
  const abs = Math.abs(shown)
  const body = kind === 'cost' ? manYenFormatter.format(abs) : String(abs)
  return shown > 0
    ? { text: `▲${body}${unit}`, direction: 'up' }
    : { text: `▼${body}${unit}`, direction: 'down' }
}

export interface DivisionGroup {
  divisionId: string
  /** 本番から消えた第1階層は null */
  divisionName: string | null
  teams: OrgDesignTeam[]
}

/** 第1階層ごとにチームを並べる。チーム0件の第1階層も残し、消えた第1階層のチームは末尾へ */
export function groupTeamsByDivision(
  teams: OrgDesignTeam[],
  divisions: Division[],
): DivisionGroup[] {
  const sortedTeams = [...teams].sort((a, b) => a.sortOrder - b.sortOrder)
  const known = new Set(divisions.map((d) => d.id))
  const groups: DivisionGroup[] = [...divisions]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((d) => ({
      divisionId: d.id,
      divisionName: d.name,
      teams: sortedTeams.filter((t) => t.divisionId === d.id),
    }))
  const orphanDivisionIds = [
    ...new Set(
      sortedTeams
        .filter((t) => !known.has(t.divisionId))
        .map((t) => t.divisionId),
    ),
  ]
  for (const divisionId of orphanDivisionIds) {
    groups.push({
      divisionId,
      divisionName: null,
      teams: sortedTeams.filter((t) => t.divisionId === divisionId),
    })
  }
  return groups
}

export function addTeam(
  design: OrgDesign,
  divisionId: string,
  name: string,
  newId: () => string = () => crypto.randomUUID(),
): OrgDesign {
  const parsed = TeamNameSchema.safeParse(name)
  if (!parsed.success) return design
  const maxOrder = design.teams.reduce(
    (max, t) => Math.max(max, t.sortOrder),
    -1,
  )
  return {
    ...design,
    teams: [
      ...design.teams,
      {
        id: newId(),
        sourceSectionId: null,
        divisionId,
        name: parsed.data,
        sortOrder: maxOrder + 1,
        productIds: [],
        techTagIds: [],
      },
    ],
  }
}

function updateTeam(
  design: OrgDesign,
  teamId: string,
  change: (t: OrgDesignTeam) => OrgDesignTeam,
): OrgDesign {
  if (!design.teams.some((t) => t.id === teamId)) return design
  return {
    ...design,
    teams: design.teams.map((t) => (t.id === teamId ? change(t) : t)),
  }
}

export function renameTeam(
  design: OrgDesign,
  teamId: string,
  name: string,
): OrgDesign {
  const parsed = TeamNameSchema.safeParse(name)
  if (!parsed.success) return design
  return updateTeam(design, teamId, (t) => ({ ...t, name: parsed.data }))
}

/** 受け持ちプロダクト・扱う技術を差し替える（重複は除く） */
export function updateTeamScope(
  design: OrgDesign,
  teamId: string,
  scope: { productIds?: string[]; techTagIds?: string[] },
): OrgDesign {
  return updateTeam(design, teamId, (t) => ({
    ...t,
    ...(scope.productIds && { productIds: [...new Set(scope.productIds)] }),
    ...(scope.techTagIds && { techTagIds: [...new Set(scope.techTagIds)] }),
  }))
}
