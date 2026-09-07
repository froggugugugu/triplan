import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CompanyBreakdownHoverCard } from '@/features/team/components/CompanyBreakdownHoverCard'
import type { Company } from '@/shared/types/company'
import type { Member } from '@/shared/types/member'

afterEach(() => cleanup())

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

describe('CompanyBreakdownHoverCard', () => {
  it('トリガーアイコンが存在する', () => {
    render(<CompanyBreakdownHoverCard members={[]} companies={[]} />)
    expect(screen.getByRole('button', { name: '所属会社別内訳' })).toBeDefined()
  })

  it('内訳リストの合計が渡された人数と一致する(defaultOpenで内容を検証)', () => {
    const companyA = makeCompany({ id: 'company-a', name: 'A社' })
    const companyB = makeCompany({ id: 'company-b', name: 'B社' })
    const members = [
      makeMember({ companyId: 'company-a' }),
      makeMember({ companyId: 'company-a' }),
      makeMember({ companyId: 'company-b' }),
      makeMember({ companyId: null }),
    ]
    render(
      <CompanyBreakdownHoverCard
        members={members}
        companies={[companyA, companyB]}
        defaultOpen
      />,
    )
    expect(screen.getByText('A社')).toBeDefined()
    expect(screen.getByText('B社')).toBeDefined()
    expect(screen.getByText('未設定')).toBeDefined()
    expect(screen.getByText('2名')).toBeDefined()
    expect(screen.getAllByText('1名')).toHaveLength(2)
  })

  it('メンバー0件の場合は案内メッセージを表示する', () => {
    render(
      <CompanyBreakdownHoverCard members={[]} companies={[]} defaultOpen />,
    )
    expect(screen.getByText('メンバーがいません')).toBeDefined()
  })
})
