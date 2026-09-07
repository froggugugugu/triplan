import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TeamMemberFilterBar } from '@/features/team/components/TeamMemberFilterBar'
import type { Company } from '@/shared/types/company'

afterEach(() => cleanup())

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

describe('TeamMemberFilterBar', () => {
  it('所属会社を選択するとonCompanyIdsChangeが選択後の配列で呼ばれる', () => {
    const companyA = makeCompany({ id: 'company-a', name: 'A社' })
    const companyB = makeCompany({ id: 'company-b', name: 'B社' })
    const onCompanyIdsChange = vi.fn()
    render(
      <TeamMemberFilterBar
        companies={[companyA, companyB]}
        selectedCompanyIds={[]}
        onCompanyIdsChange={onCompanyIdsChange}
        internalFilter="all"
        onInternalFilterChange={vi.fn()}
      />,
    )
    fireEvent.click(
      screen.getByRole('combobox', { name: '所属会社で絞り込み' }),
    )
    fireEvent.click(screen.getByText('A社'))
    expect(onCompanyIdsChange).toHaveBeenCalledWith(['company-a'])
  })

  it('内部/外部リソースセレクトを操作するとonInternalFilterChangeが呼ばれる', () => {
    const onInternalFilterChange = vi.fn()
    render(
      <TeamMemberFilterBar
        companies={[]}
        selectedCompanyIds={[]}
        onCompanyIdsChange={vi.fn()}
        internalFilter="all"
        onInternalFilterChange={onInternalFilterChange}
      />,
    )
    const select = screen.getByLabelText('内部/外部リソース')
    fireEvent.change(select, { target: { value: 'internal' } })
    expect(onInternalFilterChange).toHaveBeenCalledWith('internal')
  })
})
