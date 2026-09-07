import { describe, expect, it } from 'vitest'
import type { Company } from '@/shared/types/company'
import type { Member } from '@/shared/types/member'
import {
  filterMembersByCompanyIds,
  filterMembersByInternal,
} from '@/shared/utils/member-filter'

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

describe('filterMembersByCompanyIds', () => {
  it('空配列を渡した場合は全件を返す(絞り込みなし)', () => {
    const members = [
      makeMember({ companyId: 'company-a' }),
      makeMember({ companyId: null }),
    ]
    expect(filterMembersByCompanyIds(members, [])).toEqual(members)
  })

  it('指定したcompanyId群に一致するメンバーのみ返す', () => {
    const memberA = makeMember({ companyId: 'company-a' })
    const memberB = makeMember({ companyId: 'company-b' })
    const memberC = makeMember({ companyId: 'company-c' })
    const result = filterMembersByCompanyIds(
      [memberA, memberB, memberC],
      ['company-a', 'company-c'],
    )
    expect(result).toEqual([memberA, memberC])
  })

  it('companyId=nullのメンバーは指定companyIdsに含まれない限り除外される', () => {
    const memberA = makeMember({ companyId: 'company-a' })
    const memberNull = makeMember({ companyId: null })
    const result = filterMembersByCompanyIds(
      [memberA, memberNull],
      ['company-a'],
    )
    expect(result).toEqual([memberA])
  })

  it('複数選択(2社以上)で両方の会社のメンバーが含まれる', () => {
    const memberA = makeMember({ companyId: 'company-a' })
    const memberB = makeMember({ companyId: 'company-b' })
    const result = filterMembersByCompanyIds(
      [memberA, memberB],
      ['company-a', 'company-b'],
    )
    expect(result).toHaveLength(2)
  })
})

describe('filterMembersByInternal', () => {
  const internalCompany = makeCompany({ id: 'internal-co', isInternal: true })
  const externalCompany = makeCompany({ id: 'external-co', isInternal: false })
  const companies = [internalCompany, externalCompany]

  const memberNoCompany = makeMember({ companyId: null })
  const memberInternal = makeMember({ companyId: 'internal-co' })
  const memberExternal = makeMember({ companyId: 'external-co' })
  const members = [memberNoCompany, memberInternal, memberExternal]

  it("mode='all'の場合は全件を返す", () => {
    expect(filterMembersByInternal(members, companies, 'all')).toEqual(members)
  })

  it("mode='internal'の場合はcompanyId=nullまたはisInternal=trueの会社所属メンバーのみ返す", () => {
    const result = filterMembersByInternal(members, companies, 'internal')
    expect(result).toEqual([memberNoCompany, memberInternal])
  })

  it("mode='external'の場合はisInternal=falseの会社所属メンバーのみ返す", () => {
    const result = filterMembersByInternal(members, companies, 'external')
    expect(result).toEqual([memberExternal])
  })

  it('会社マスタから削除済み(存在しない)companyIdを持つメンバーはisProperMemberの既定(内部扱い)に従う', () => {
    const memberOrphan = makeMember({ companyId: 'deleted-co' })
    const result = filterMembersByInternal(
      [memberOrphan],
      companies,
      'internal',
    )
    expect(result).toEqual([memberOrphan])
  })
})
