import { describe, expect, it } from 'vitest'
import { DatabaseSchema } from '../database'
import { CreateOrgDesignDraftSchema } from '../org-design'

const uuid = () => crypto.randomUUID()

describe('OrgDesignDraftSchema', () => {
  const team = () => ({
    id: uuid(),
    sourceSectionId: null,
    divisionId: uuid(),
    name: '決済チーム',
    sortOrder: 0,
    productIds: [],
    techTagIds: [],
  })

  it('チームと配置（未配置=null）を持つ案を受け付ける', () => {
    const t = team()
    const r = CreateOrgDesignDraftSchema.safeParse({
      name: '2027年度 案A',
      fiscalYear: 2027,
      teams: [t],
      placements: { [uuid()]: t.id, [uuid()]: null },
    })
    expect(r.success).toBe(true)
  })

  it('反証: 空白だけの案名・チーム名は拒否する', () => {
    expect(
      CreateOrgDesignDraftSchema.safeParse({
        name: '  ',
        fiscalYear: 2027,
        teams: [],
        placements: {},
      }).success,
    ).toBe(false)
    expect(
      CreateOrgDesignDraftSchema.safeParse({
        name: '案',
        fiscalYear: 2027,
        teams: [{ ...team(), name: ' ' }],
        placements: {},
      }).success,
    ).toBe(false)
  })

  it('反証: 配置のキーがUUIDでなければ拒否する', () => {
    expect(
      CreateOrgDesignDraftSchema.safeParse({
        name: '案',
        fiscalYear: 2027,
        teams: [],
        placements: { 'not-a-uuid': null },
      }).success,
    ).toBe(false)
  })

  it('DatabaseSchema: orgDesignDrafts / memberPreferences がない既存データも読める（後方互換）', () => {
    const r = DatabaseSchema.safeParse({
      version: '1.0.0',
      fiscalYear: 2025,
      projects: [],
      members: [],
      assignments: [],
      metadata: {
        lastModified: new Date().toISOString(),
        createdBy: 't',
        version: '1.0.0',
      },
    })
    expect(r.success).toBe(true)
  })
})
