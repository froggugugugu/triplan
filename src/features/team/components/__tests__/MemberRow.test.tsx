import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemberRow } from '@/features/team/components/MemberRow'
import type { Member } from '@/shared/types/member'
import type { TechTag } from '@/shared/types/tech-tag'

afterEach(() => cleanup())

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: crypto.randomUUID(),
    name: 'テスト太郎',
    sectionId: null,
    companyId: null,
    role: 'エンジニア',
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

function makeTag(overrides: Partial<TechTag> = {}): TechTag {
  return {
    id: crypto.randomUUID(),
    name: 'React',
    color: '#3b82f6',
    categoryId: crypto.randomUUID(),
    subCategoryId: null,
    note: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('MemberRow', () => {
  it('保有タグ全件がバッジとして表示される(多数タグでの非省略の反証を含む)', () => {
    const tags = Array.from({ length: 12 }, (_, i) =>
      makeTag({ name: `タグ${i}` }),
    )
    render(
      <MemberRow
        member={makeMember()}
        indent={1}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        currentPrice="-"
        tags={tags}
        companyName="-"
      />,
    )
    for (const tag of tags) {
      expect(screen.getByText(tag.name)).toBeDefined()
    }
  })

  it('保有タグ0件時はバッジ行を表示しない', () => {
    const { container } = render(
      <MemberRow
        member={makeMember()}
        indent={1}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        currentPrice="-"
        tags={[]}
        companyName="-"
      />,
    )
    expect(
      container.querySelector('[data-testid="member-tag-badges"]'),
    ).toBeNull()
  })

  it('所属会社名が表示される', () => {
    render(
      <MemberRow
        member={makeMember()}
        indent={1}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        currentPrice="-"
        tags={[]}
        companyName="株式会社サンプル"
      />,
    )
    expect(screen.getByText('株式会社サンプル')).toBeDefined()
  })

  it('companyId未設定時のフォールバック表示「-」が表示される', () => {
    render(
      <MemberRow
        member={makeMember({ companyId: null })}
        indent={1}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        currentPrice="-"
        tags={[]}
        companyName="-"
      />,
    )
    expect(screen.getAllByText('-').length).toBeGreaterThan(0)
  })

  it('契約形態が設定されている場合は表示される', () => {
    render(
      <MemberRow
        member={makeMember({ contractType: '準委任' })}
        indent={1}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        currentPrice="-"
        tags={[]}
        companyName="-"
      />,
    )
    expect(screen.getByText('準委任')).toBeDefined()
  })

  it('契約形態が未設定（null）の場合は表示されない', () => {
    render(
      <MemberRow
        member={makeMember({ contractType: null })}
        indent={1}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        currentPrice="-"
        tags={[]}
        companyName="-"
      />,
    )
    for (const type of ['請負', '準委任', '派遣', '正社員']) {
      expect(screen.queryByText(type)).toBeNull()
    }
  })
})
