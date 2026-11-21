import { describe, expect, it } from 'vitest'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Member } from '@/shared/types/member'
import type { MemberPreference } from '@/shared/types/member-preference'
import type { OrgDesignTeam } from '@/shared/types/org-design'
import type { Section } from '@/shared/types/section'
import {
  compareOrgDesigns,
  computeOrgDesignMetrics,
  createDesignFromCurrentOrg,
  deriveCurrentOrgDesign,
  moveMember,
  type OrgDesignContext,
  removeTeam,
} from '../org-design-utils'

// ─── fixtures ────────────────────────────────────────────────────────────────
const NOW = '2026-04-01T00:00:00.000Z'
let seq = 0
const id = () =>
  `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`

const DIV = id()
const PROD_A = id() // ルート案件A
const PROD_B = id() // ルート案件B
const TASK_A1 = id() // Aの子タスク
const TAG_TS = id()
const TAG_GO = id()

const projects = [
  { id: PROD_A, parentId: null },
  { id: PROD_B, parentId: null },
  { id: TASK_A1, parentId: PROD_A },
]

function member(overrides: Partial<Member> = {}): Member {
  return {
    id: id(),
    name: 'm',
    sectionId: null,
    role: 'dev',
    isActive: true,
    // コストは既存の calcRevenueBudget に従い「開始日 null＝0」になるため、在籍中の既定として過去日を置く
    startDate: '2020-04-01',
    endDate: null,
    unitPriceHistory: [{ effectiveFrom: '2026-04', amount: 100 }],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function assignment(
  memberId: string,
  projectId: string,
  monthlyValues: Record<string, number>,
): AssignmentEntry {
  return {
    id: id(),
    projectId,
    taskId: id(),
    memberId,
    monthlyValues,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function team(overrides: Partial<OrgDesignTeam> = {}): OrgDesignTeam {
  return {
    id: id(),
    sourceSectionId: null,
    divisionId: DIV,
    name: 't',
    sortOrder: 0,
    productIds: [],
    techTagIds: [],
    ...overrides,
  }
}

function pref(
  memberId: string,
  desiredProductIds: string[],
  desiredTechTagIds: string[] = [],
): MemberPreference {
  return {
    id: id(),
    memberId,
    desiredProductIds,
    desiredTechTagIds,
    consentedAt: '2026-04-01',
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function ctx(overrides: Partial<OrgDesignContext>): OrgDesignContext {
  return {
    members: [],
    projects,
    assignments: [],
    preferences: [],
    fiscalYear: 2026,
    startMonth: 4,
    ...overrides,
  }
}

// ─── computeOrgDesignMetrics ────────────────────────────────────────────────
describe('computeOrgDesignMetrics: 兼務', () => {
  it('受け持ち外のプロダクトにアサインされていれば兼務。子タスクのアサインはルート案件に寄せる', () => {
    const m = member()
    const t = team({ productIds: [PROD_A] })
    const result = computeOrgDesignMetrics(
      { teams: [t], placements: { [m.id]: t.id } },
      ctx({
        members: [m],
        assignments: [
          assignment(m.id, TASK_A1, { '2026-05': 0.5 }),
          assignment(m.id, PROD_B, { '2026-06': 0.2 }),
        ],
      }),
    )
    expect(result.members[m.id]?.crossProductIds).toEqual([PROD_B])
    expect(result.teams[0]?.crossProductMemberCount).toBe(1)
  })

  it('人を受け持ちチームへ動かすと兼務が消える（アサインは変えずに数字だけ変わる）', () => {
    const m = member()
    const tA = team({ productIds: [PROD_A] })
    const tB = team({ productIds: [PROD_B] })
    const c = ctx({
      members: [m],
      assignments: [assignment(m.id, PROD_B, { '2026-05': 1 })],
    })
    const before = computeOrgDesignMetrics(
      { teams: [tA, tB], placements: { [m.id]: tA.id } },
      c,
    )
    const after = computeOrgDesignMetrics(
      moveMember({ teams: [tA, tB], placements: { [m.id]: tA.id } }, m.id, tB.id),
      c,
    )
    expect(before.overall.crossProductMemberCount).toBe(1)
    expect(after.overall.crossProductMemberCount).toBe(0)
  })

  it('反証: 年度外の月・値0のアサインは関与として数えない', () => {
    const m = member()
    const t = team({ productIds: [PROD_A] })
    const result = computeOrgDesignMetrics(
      { teams: [t], placements: { [m.id]: t.id } },
      ctx({
        members: [m],
        assignments: [
          assignment(m.id, PROD_B, { '2026-03': 1, '2027-04': 1 }), // 2026年度外
          assignment(m.id, PROD_B, { '2026-05': 0 }),
        ],
      }),
    )
    expect(result.members[m.id]?.crossProductIds).toEqual([])
  })

  it('反証: 受け持ち未設定のチームは判定できないため兼務に数えず、未設定フラグを立てる', () => {
    const m = member()
    const t = team({ productIds: [] })
    const result = computeOrgDesignMetrics(
      { teams: [t], placements: { [m.id]: t.id } },
      ctx({ members: [m], assignments: [assignment(m.id, PROD_B, { '2026-05': 1 })] }),
    )
    expect(result.teams[0]?.productsUnset).toBe(true)
    expect(result.teams[0]?.crossProductMemberCount).toBe(0)
  })

  it('反証: 未配置の担当者は兼務に数えない', () => {
    const m = member()
    const result = computeOrgDesignMetrics(
      { teams: [], placements: {} },
      ctx({ members: [m], assignments: [assignment(m.id, PROD_B, { '2026-05': 1 })] }),
    )
    expect(result.unplacedMemberIds).toEqual([m.id])
    expect(result.overall.crossProductMemberCount).toBe(0)
  })
})

describe('computeOrgDesignMetrics: 稼働率', () => {
  it('年度の稼働率は「アサイン合計 ÷ 供給合計」（月平均の平均ではない）', () => {
    // m1: 4月だけ在籍（供給1）でアサイン1.0／m2: 通年在籍（供給12）でアサイン0
    const m1 = member({ endDate: '2026-04-30' })
    const m2 = member()
    const t = team()
    const result = computeOrgDesignMetrics(
      { teams: [t], placements: { [m1.id]: t.id, [m2.id]: t.id } },
      ctx({ members: [m1, m2], assignments: [assignment(m1.id, PROD_A, { '2026-04': 1 })] }),
    )
    // 合計比 = 1 / 13 = 0.0769 → 0.08。月平均の平均なら (0.5+0×11)/12 = 0.04 になる
    expect(result.teams[0]?.utilization).toBe(0.08)
    expect(result.teams[0]?.monthly[0]).toEqual({ month: '2026-04', utilization: 0.5 })
  })

  it('capacityRatio を供給に反映する', () => {
    const m = member({ capacityRatio: 0.5 })
    const t = team()
    const months = Object.fromEntries(
      ['04', '05', '06', '07', '08', '09', '10', '11', '12'].map((mm) => [`2026-${mm}`, 0.5]),
    )
    const result = computeOrgDesignMetrics(
      { teams: [t], placements: { [m.id]: t.id } },
      ctx({
        members: [m],
        assignments: [
          assignment(m.id, PROD_A, { ...months, '2027-01': 0.5, '2027-02': 0.5, '2027-03': 0.5 }),
        ],
      }),
    )
    expect(result.teams[0]?.utilization).toBe(1)
  })

  it('反証: 0人のチームは稼働率 null（0除算しない）', () => {
    const t = team()
    const result = computeOrgDesignMetrics({ teams: [t], placements: {} }, ctx({}))
    expect(result.teams[0]?.utilization).toBeNull()
    expect(result.teams[0]?.monthly.every((p) => p.utilization === null)).toBe(true)
    expect(result.teams[0]?.annualCost).toBe(0)
  })

  it('反証: 上限ちょうどは過負荷ではなく、わずかでも超えたら過負荷', () => {
    const exact = member({ capacityRatio: 0.5 })
    const over = member({ capacityRatio: 0.5 })
    const t = team()
    const result = computeOrgDesignMetrics(
      { teams: [t], placements: { [exact.id]: t.id, [over.id]: t.id } },
      ctx({
        members: [exact, over],
        assignments: [
          assignment(exact.id, PROD_A, { '2026-05': 0.3 }),
          assignment(exact.id, PROD_B, { '2026-05': 0.2 }), // 0.3+0.2 の浮動小数誤差でも上限ちょうど扱い
          assignment(over.id, PROD_A, { '2026-05': 0.51 }),
        ],
      }),
    )
    expect(result.members[exact.id]?.overloaded).toBe(false)
    expect(result.members[over.id]?.overloaded).toBe(true)
    expect(result.teams[0]?.overloadedMemberCount).toBe(1)
  })
})

describe('computeOrgDesignMetrics: コスト', () => {
  it('チームのコストは所属担当者の年度単価合計（在籍月のみ・フル稼働前提）', () => {
    const m1 = member() // 100 × 12
    const m2 = member({ startDate: '2027-01-01' }) // 100 × 3
    const t = team()
    const result = computeOrgDesignMetrics(
      { teams: [t], placements: { [m1.id]: t.id, [m2.id]: t.id } },
      ctx({ members: [m1, m2] }),
    )
    expect(result.teams[0]?.annualCost).toBe(1500)
  })

  it('反証: 開始日未設定の担当者はコスト0（チーム画面の売上予算と同じ扱い）', () => {
    const m = member({ startDate: null })
    const t = team()
    const result = computeOrgDesignMetrics(
      { teams: [t], placements: { [m.id]: t.id } },
      ctx({ members: [m] }),
    )
    expect(result.teams[0]?.annualCost).toBe(0)
  })

  it('人を動かしても全体コストは変わらない（未配置者も全体には含む）', () => {
    const m1 = member()
    const m2 = member()
    const t = team()
    const c = ctx({ members: [m1, m2] })
    const a = computeOrgDesignMetrics({ teams: [t], placements: { [m1.id]: t.id } }, c)
    const b = computeOrgDesignMetrics(
      { teams: [t], placements: { [m1.id]: t.id, [m2.id]: t.id } },
      c,
    )
    expect(a.overall.annualCost).toBe(2400)
    expect(b.overall.annualCost).toBe(2400)
  })
})

describe('computeOrgDesignMetrics: 希望の充足', () => {
  it('希望プロダクト・希望技術がチームの受け持ちに含まれる割合', () => {
    const m = member()
    const t = team({ productIds: [PROD_A], techTagIds: [TAG_TS] })
    const result = computeOrgDesignMetrics(
      { teams: [t], placements: { [m.id]: t.id } },
      ctx({ members: [m], preferences: [pref(m.id, [PROD_A, PROD_B], [TAG_TS, TAG_GO])] }),
    )
    expect(result.members[m.id]).toMatchObject({
      preferenceMet: 2,
      preferenceTotal: 4,
      preferenceStatus: 'partial',
    })
    expect(result.overall.preferenceRate).toBe(0.5)
  })

  it('全部満たせば met、ひとつも満たさなければ unmet、未配置も unmet', () => {
    const m1 = member()
    const m2 = member()
    const m3 = member()
    const t = team({ productIds: [PROD_A] })
    const result = computeOrgDesignMetrics(
      { teams: [t], placements: { [m1.id]: t.id, [m2.id]: t.id } },
      ctx({
        members: [m1, m2, m3],
        preferences: [pref(m1.id, [PROD_A]), pref(m2.id, [PROD_B]), pref(m3.id, [PROD_A])],
      }),
    )
    expect(result.members[m1.id]?.preferenceStatus).toBe('met')
    expect(result.members[m2.id]?.preferenceStatus).toBe('unmet')
    expect(result.members[m3.id]?.preferenceStatus).toBe('unmet')
  })

  it('反証: 希望が0件の担当者は充足率の分母に入れない。対象者0なら null', () => {
    const m = member()
    const t = team()
    const empty = computeOrgDesignMetrics(
      { teams: [t], placements: { [m.id]: t.id } },
      ctx({ members: [m], preferences: [pref(m.id, [], [])] }),
    )
    expect(empty.members[m.id]?.preferenceStatus).toBe('none')
    expect(empty.overall.preferenceRate).toBeNull()
  })

  it('反証: 希望の重複IDは1件として数える', () => {
    const m = member()
    const t = team({ productIds: [PROD_A] })
    const result = computeOrgDesignMetrics(
      { teams: [t], placements: { [m.id]: t.id } },
      ctx({ members: [m], preferences: [pref(m.id, [PROD_A, PROD_A, PROD_B])] }),
    )
    expect(result.members[m.id]).toMatchObject({ preferenceMet: 1, preferenceTotal: 2 })
  })
})

describe('computeOrgDesignMetrics: 本番データとのずれ', () => {
  it('反証: 本番で削除された担当者は指標から除き、missing として返す', () => {
    const m = member()
    const goneId = id()
    const t = team()
    const result = computeOrgDesignMetrics(
      { teams: [t], placements: { [m.id]: t.id, [goneId]: t.id } },
      ctx({ members: [m] }),
    )
    expect(result.missingMemberIds).toEqual([goneId])
    expect(result.teams[0]?.memberIds).toEqual([m.id])
  })

  it('反証: 案作成後に追加された担当者（配置キーなし）は未配置として扱う', () => {
    const m = member()
    const result = computeOrgDesignMetrics({ teams: [team()], placements: {} }, ctx({ members: [m] }))
    expect(result.unplacedMemberIds).toEqual([m.id])
  })

  it('反証: 存在しないチームIDへの配置は未配置として扱う', () => {
    const m = member()
    const result = computeOrgDesignMetrics(
      { teams: [], placements: { [m.id]: id() } },
      ctx({ members: [m] }),
    )
    expect(result.unplacedMemberIds).toEqual([m.id])
  })

  it('反証: 無効（isActive=false）の担当者は一覧にも指標にも出さない', () => {
    const m = member({ isActive: false })
    const t = team()
    const result = computeOrgDesignMetrics(
      { teams: [t], placements: { [m.id]: t.id } },
      ctx({ members: [m] }),
    )
    expect(result.teams[0]?.memberIds).toEqual([])
    expect(result.unplacedMemberIds).toEqual([])
    expect(result.missingMemberIds).toEqual([])
  })
})

// ─── 案の作成・操作 ───────────────────────────────────────────────────────────
function section(overrides: Partial<Section> = {}): Section {
  return {
    id: id(),
    divisionId: DIV,
    name: '第1課',
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

describe('createDesignFromCurrentOrg', () => {
  it('現在の課をチームとして複製し、所属を配置に写す（未所属は未配置）', () => {
    const s1 = section({ name: '決済課', sortOrder: 1 })
    const m1 = member({ sectionId: s1.id })
    const m2 = member({ sectionId: null })
    const design = createDesignFromCurrentOrg([s1], [m1, m2], id)
    expect(design.teams).toHaveLength(1)
    expect(design.teams[0]).toMatchObject({
      sourceSectionId: s1.id,
      divisionId: DIV,
      name: '決済課',
      sortOrder: 1,
      productIds: [],
      techTagIds: [],
    })
    expect(design.teams[0]?.id).not.toBe(s1.id)
    expect(design.placements).toEqual({ [m1.id]: design.teams[0]?.id, [m2.id]: null })
  })

  it('反証: 元の配列（本番データ）を書き換えない', () => {
    const s1 = section()
    const m1 = member({ sectionId: s1.id })
    const snapshot = JSON.stringify([s1, m1])
    const design = createDesignFromCurrentOrg([s1], [m1], id)
    moveMember(design, m1.id, null)
    expect(JSON.stringify([s1, m1])).toBe(snapshot)
  })
})

describe('moveMember / removeTeam', () => {
  it('moveMember は新しいオブジェクトを返し、元の案を変えない', () => {
    const t = team()
    const m = member()
    const design = { teams: [t], placements: { [m.id]: null } }
    const moved = moveMember(design, m.id, t.id)
    expect(moved.placements[m.id]).toBe(t.id)
    expect(design.placements[m.id]).toBeNull()
  })

  it('removeTeam はチームを消し、所属していた人を未配置に戻す（人は消さない）', () => {
    const t1 = team()
    const t2 = team()
    const m1 = member()
    const m2 = member()
    const result = removeTeam(
      { teams: [t1, t2], placements: { [m1.id]: t1.id, [m2.id]: t2.id } },
      t1.id,
    )
    expect(result.teams.map((t) => t.id)).toEqual([t2.id])
    expect(result.placements).toEqual({ [m1.id]: null, [m2.id]: t2.id })
  })
})

// ─── 現組織との比較 ───────────────────────────────────────────────────────────
describe('deriveCurrentOrgDesign / compareOrgDesigns', () => {
  it('現組織は課と所属から導出し、受け持ちは案の対応チームから借りる', () => {
    const s1 = section()
    const m1 = member({ sectionId: s1.id })
    const draftTeam = team({ sourceSectionId: s1.id, productIds: [PROD_A], techTagIds: [TAG_TS] })
    const current = deriveCurrentOrgDesign([draftTeam], [s1], [m1])
    expect(current.teams[0]).toMatchObject({
      id: s1.id,
      sourceSectionId: s1.id,
      productIds: [PROD_A],
      techTagIds: [TAG_TS],
    })
    expect(current.placements).toEqual({ [m1.id]: s1.id })
  })

  it('比較行: 既存チームは差分、新設は案のみ、廃止は現組織のみ', () => {
    const kept = section({ name: '残す課', sortOrder: 0 })
    const dropped = section({ name: '廃止する課', sortOrder: 1 })
    const m1 = member({ sectionId: kept.id })
    const m2 = member({ sectionId: dropped.id })
    const keptTeam = team({ sourceSectionId: kept.id, name: '残す課' })
    const newTeam = team({ sourceSectionId: null, name: '新チーム', sortOrder: 2 })
    const draft = {
      teams: [keptTeam, newTeam],
      placements: { [m1.id]: keptTeam.id, [m2.id]: newTeam.id },
    }
    const c = ctx({ members: [m1, m2] })
    const current = deriveCurrentOrgDesign(draft.teams, [kept, dropped], [m1, m2])
    const rows = compareOrgDesigns(
      { design: current, metrics: computeOrgDesignMetrics(current, c) },
      { design: draft, metrics: computeOrgDesignMetrics(draft, c) },
    )
    expect(rows.map((r) => [r.name, r.kind])).toEqual([
      ['残す課', 'kept'],
      ['廃止する課', 'removed'],
      ['新チーム', 'added'],
    ])
    expect(rows[0]?.memberCount).toEqual({ current: 1, draft: 1, delta: 0 })
    expect(rows[1]?.memberCount).toEqual({ current: 1, draft: null, delta: null })
    expect(rows[2]?.memberCount).toEqual({ current: null, draft: 1, delta: null })
  })
})
