import { describe, expect, it, vi } from 'vitest'

// ルートファイルは DB クライアントを import するため、純関数の検証では接続を作らない
vi.mock('../../../db/client.js', () => ({ db: {} }))

const { filterPreferencesForViewer } = await import('../org-design.js')

const ME = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'
const rows = [{ memberId: ME }, { memberId: OTHER }]

describe('filterPreferencesForViewer（担当者の希望の閲覧範囲）', () => {
  it('admin / manager は全件を見られる', () => {
    expect(filterPreferencesForViewer(rows, 'admin', null)).toEqual(rows)
    expect(filterPreferencesForViewer(rows, 'manager', OTHER)).toEqual(rows)
  })

  it('それ以外のロールは本人分だけ見られる', () => {
    for (const role of ['editor', 'viewer', 'partner'] as const) {
      expect(filterPreferencesForViewer(rows, role, ME)).toEqual([
        { memberId: ME },
      ])
    }
  })

  // 反証: 担当者に紐づいていないユーザーは他人の希望を1件も見られない（フェイルクローズ）
  it('反証: 担当者に未紐づけなら0件', () => {
    expect(filterPreferencesForViewer(rows, 'editor', null)).toEqual([])
    expect(filterPreferencesForViewer(rows, 'viewer', undefined)).toEqual([])
  })

  it('反証: 金額を読める editor / viewer でも他人の希望は見られない（financials:read とは別軸）', () => {
    expect(
      filterPreferencesForViewer(rows, 'viewer', ME).map((r) => r.memberId),
    ).not.toContain(OTHER)
  })
})
