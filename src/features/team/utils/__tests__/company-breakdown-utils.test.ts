import { describe, expect, it } from 'vitest'
import { calcCompanyBreakdown } from '@/features/team/utils/company-breakdown-utils'
import type { Company } from '@/shared/types/company'
import type { Member } from '@/shared/types/member'

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: crypto.randomUUID(),
    name: 'テスト太郎',
    sectionId: null,
    companyId: null,
    role: '',
    isActive: true,
    techTagIds: [],
    startDate: null,
    endDate: null,
    unitPriceHistory: [],
    contractUnitPriceHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: crypto.randomUUID(),
    name: 'テスト会社',
    sortOrder: 0,
    isInternal: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('calcCompanyBreakdown', () => {
  it('会社ごとに正しく人数を集計する', () => {
    const companyA = makeCompany({ id: 'company-a', name: 'A社' })
    const companyB = makeCompany({ id: 'company-b', name: 'B社' })
    const members = [
      makeMember({ companyId: 'company-a' }),
      makeMember({ companyId: 'company-a' }),
      makeMember({ companyId: 'company-b' }),
    ]
    const result = calcCompanyBreakdown(members, [companyA, companyB])
    expect(result).toEqual([
      { companyId: 'company-a', companyName: 'A社', count: 2 },
      { companyId: 'company-b', companyName: 'B社', count: 1 },
    ])
  })

  it('companyId=nullのメンバーは「未設定」として独立集計される', () => {
    const companyA = makeCompany({ id: 'company-a', name: 'A社' })
    const members = [
      makeMember({ companyId: 'company-a' }),
      makeMember({ companyId: null }),
      makeMember({ companyId: null }),
    ]
    const result = calcCompanyBreakdown(members, [companyA])
    expect(result).toEqual([
      { companyId: 'company-a', companyName: 'A社', count: 1 },
      { companyId: null, companyName: '未設定', count: 2 },
    ])
  })

  it('内訳の合計人数が入力メンバー数と一致する', () => {
    const companyA = makeCompany({ id: 'company-a', name: 'A社' })
    const members = [
      makeMember({ companyId: 'company-a' }),
      makeMember({ companyId: null }),
      makeMember({ companyId: 'company-a' }),
    ]
    const result = calcCompanyBreakdown(members, [companyA])
    const total = result.reduce((sum, r) => sum + r.count, 0)
    expect(total).toBe(members.length)
  })

  it('メンバー0件の場合は空配列を返す', () => {
    expect(calcCompanyBreakdown([], [])).toEqual([])
  })

  it('全員同一会社の場合は1件のみ返す', () => {
    const companyA = makeCompany({ id: 'company-a', name: 'A社' })
    const members = [
      makeMember({ companyId: 'company-a' }),
      makeMember({ companyId: 'company-a' }),
    ]
    const result = calcCompanyBreakdown(members, [companyA])
    expect(result).toEqual([
      { companyId: 'company-a', companyName: 'A社', count: 2 },
    ])
  })

  it('会社マスタから削除済み(存在しない)companyIdを持つメンバーは会社名不明として集計される', () => {
    const members = [makeMember({ companyId: 'deleted-co' })]
    const result = calcCompanyBreakdown(members, [])
    expect(result).toEqual([
      { companyId: 'deleted-co', companyName: '不明な会社', count: 1 },
    ])
  })
})
