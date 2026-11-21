import { describe, expect, it } from 'vitest'
import type { Division } from '@/shared/types/division'
import type { OrgDesignTeam } from '@/shared/types/org-design'
import type { OrgDesign } from '@/shared/utils/org-design-utils'
import {
  addTeam,
  formatDelta,
  formatUtilization,
  groupTeamsByDivision,
  renameTeam,
  updateTeamScope,
} from '../org-design-view'

const DIV_A = '00000000-0000-4000-8000-0000000000a1'
const DIV_B = '00000000-0000-4000-8000-0000000000b1'
const DIV_GONE = '00000000-0000-4000-8000-0000000000c1'

function team(
  id: string,
  divisionId: string,
  sortOrder: number,
): OrgDesignTeam {
  return {
    id,
    sourceSectionId: null,
    divisionId,
    name: `team-${id}`,
    sortOrder,
    productIds: [],
    techTagIds: [],
  }
}

function division(id: string, name: string, sortOrder: number): Division {
  return {
    id,
    name,
    sortOrder,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as Division
}

describe('formatUtilization', () => {
  it('割合を%整数で表示する', () => {
    expect(formatUtilization(0.85)).toBe('85%')
    expect(formatUtilization(1.234)).toBe('123%')
  })
  it('null（分母0）は「—」', () => {
    expect(formatUtilization(null)).toBe('—')
  })
  it('0は「0%」であり「—」ではない', () => {
    expect(formatUtilization(0)).toBe('0%')
  })
})

describe('formatDelta', () => {
  it('増加は▲、減少は▼、差なしは±0（色に頼らず記号で示す）', () => {
    expect(formatDelta(2, 'count')).toEqual({ text: '▲2', direction: 'up' })
    expect(formatDelta(-1, 'count')).toEqual({ text: '▼1', direction: 'down' })
    expect(formatDelta(0, 'count')).toEqual({ text: '±0', direction: 'flat' })
  })
  it('割合はポイント表記（%整数）', () => {
    expect(formatDelta(0.125, 'percent')).toEqual({
      text: '▲13pt',
      direction: 'up',
    })
    expect(formatDelta(-0.05, 'percent')).toEqual({
      text: '▼5pt',
      direction: 'down',
    })
  })
  it('四捨五入で0になる微小差は±0扱い（▲0ptを出さない）', () => {
    expect(formatDelta(0.004, 'percent')).toEqual({
      text: '±0pt',
      direction: 'flat',
    })
  })
  it('金額は万円の小数第2位', () => {
    expect(formatDelta(1234.5, 'cost')).toEqual({
      text: '▲1,234.50万円',
      direction: 'up',
    })
  })
  it('片側にしか値がない（null）は「—」', () => {
    expect(formatDelta(null, 'count')).toEqual({ text: '—', direction: null })
  })
})

describe('groupTeamsByDivision', () => {
  it('部門の並び順→チームの並び順で並べ、チーム0件の部門も残す', () => {
    const groups = groupTeamsByDivision(
      [team('t2', DIV_A, 2), team('t1', DIV_A, 1)],
      [division(DIV_B, 'B', 2), division(DIV_A, 'A', 1)],
    )
    expect(groups.map((g) => g.divisionId)).toEqual([DIV_A, DIV_B])
    expect(groups[0]?.teams.map((t) => t.id)).toEqual(['t1', 't2'])
    expect(groups[1]?.teams).toEqual([])
  })
  it('本番から消えた部門のチームは末尾の「名前なし」グループへ（チームを落とさない）', () => {
    const groups = groupTeamsByDivision(
      [team('t1', DIV_GONE, 0)],
      [division(DIV_A, 'A', 1)],
    )
    expect(groups.map((g) => g.divisionId)).toEqual([DIV_A, DIV_GONE])
    expect(groups[1]?.divisionName).toBeNull()
    expect(groups[1]?.teams.map((t) => t.id)).toEqual(['t1'])
  })
})

describe('案の編集', () => {
  const base: OrgDesign = {
    teams: [team('t1', DIV_A, 0), team('t2', DIV_A, 5)],
    placements: { m1: 't1' },
  }

  it('addTeam: 新設チームは複製元null・並び順は既存の最大+1・受け持ちは空', () => {
    const next = addTeam(base, DIV_A, '  新チーム  ', () => 'new-id')
    const added = next.teams.find((t) => t.id === 'new-id')
    expect(added).toEqual({
      id: 'new-id',
      sourceSectionId: null,
      divisionId: DIV_A,
      name: '新チーム',
      sortOrder: 6,
      productIds: [],
      techTagIds: [],
    })
    expect(next.placements).toEqual(base.placements)
  })
  it('addTeam: チーム0件の案では並び順0から', () => {
    const next = addTeam({ teams: [], placements: {} }, DIV_A, 'x', () => 'id')
    expect(next.teams[0]?.sortOrder).toBe(0)
  })
  it('addTeam / renameTeam: 空白のみ・100文字超の名前は変更しない', () => {
    expect(addTeam(base, DIV_A, '   ', () => 'id')).toBe(base)
    expect(renameTeam(base, 't1', 'a'.repeat(101))).toBe(base)
  })
  it('renameTeam: 対象チームだけ前後空白を除いて改名する', () => {
    const next = renameTeam(base, 't1', ' 改名 ')
    expect(next.teams.map((t) => t.name)).toEqual(['改名', 'team-t2'])
    expect(base.teams[0]?.name).toBe('team-t1')
  })
  it('updateTeamScope: 受け持ちの重複を除いて保存する', () => {
    const next = updateTeamScope(base, 't2', {
      productIds: ['p1', 'p1', 'p2'],
    })
    expect(next.teams[1]?.productIds).toEqual(['p1', 'p2'])
    expect(next.teams[1]?.techTagIds).toEqual([])
  })
  it('存在しないチームIDへの編集は何も変えない', () => {
    expect(renameTeam(base, 'nope', 'x')).toBe(base)
    expect(updateTeamScope(base, 'nope', { productIds: ['p'] })).toBe(base)
  })
})
