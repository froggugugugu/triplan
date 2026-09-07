import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiUsageMemberAllocation } from '@/shared/types/budget'
import type { Member } from '@/shared/types/member'
import type { Section } from '@/shared/types/section'
import {
  useAppStore,
  useBudgetStore,
  useMembersStore,
  useTeamStore,
} from '@/stores'
import { AiUsageMemberAllocationPanel } from '../AiUsageMemberAllocationPanel'

vi.mock('@/stores', () => ({
  useAppStore: vi.fn(),
  useBudgetStore: vi.fn(),
  useMembersStore: vi.fn(),
  useTeamStore: vi.fn(),
}))

afterEach(() => cleanup())

const DIVISION_ID = crypto.randomUUID()
const SECTION_ID = crypto.randomUUID()
const OTHER_SECTION_ID = crypto.randomUUID()
const MEMBER_ID = crypto.randomUUID()
const OTHER_MEMBER_ID = crypto.randomUUID()

function createMember(overrides: Partial<Member> = {}): Member {
  return {
    id: MEMBER_ID,
    name: '山田太郎',
    sectionId: SECTION_ID,
    role: 'エンジニア',
    isActive: true,
    startDate: null,
    endDate: null,
    unitPriceHistory: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function createSection(overrides: Partial<Section> = {}): Section {
  return {
    id: SECTION_ID,
    divisionId: DIVISION_ID,
    name: '第一課',
    sortOrder: 0,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function createAllocation(
  overrides: Partial<AiUsageMemberAllocation> = {},
): AiUsageMemberAllocation {
  return {
    id: crypto.randomUUID(),
    divisionId: DIVISION_ID,
    fiscalYear: 2025,
    month: '2025-04',
    memberId: MEMBER_ID,
    monthlyBudget: 0,
    bufferAmount: 0,
    actualAmount: 0,
    bufferActualAmount: 0,
    ...overrides,
  }
}

describe('AiUsageMemberAllocationPanel', () => {
  let members: Member[]
  let sections: Section[]
  let allocations: AiUsageMemberAllocation[]
  const setAiUsageMemberAllocation = vi.fn()
  const bulkSetAiUsageMemberMonthlyBudget = vi.fn()
  const bulkSetAiUsageMemberBufferAmount = vi.fn()

  beforeEach(() => {
    members = [createMember()]
    sections = [createSection()]
    allocations = [
      createAllocation({
        monthlyBudget: 10,
        bufferAmount: 2,
        actualAmount: 8,
        bufferActualAmount: 1,
      }),
    ]
    setAiUsageMemberAllocation.mockReset()
    bulkSetAiUsageMemberMonthlyBudget.mockReset()
    bulkSetAiUsageMemberBufferAmount.mockReset()

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useAppStore).mockImplementation((selector: any) =>
      selector({ fiscalYearStartMonth: 4 }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useMembersStore).mockImplementation((selector: any) =>
      selector({ members }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useTeamStore).mockImplementation((selector: any) =>
      selector({ sections }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useBudgetStore).mockImplementation((selector: any) =>
      selector({
        aiUsageMemberAllocations: allocations,
        aiUsageEntries: [],
        getOrCreateAiUsageMemberAllocations: () => allocations,
        setAiUsageMemberAllocation,
        bulkSetAiUsageMemberMonthlyBudget,
        bulkSetAiUsageMemberBufferAmount,
        getAiUsageMemberAllocationsByMonth: (
          divisionId: string,
          fiscalYear: number,
          month: string,
          providerId: string | null = null,
        ) =>
          allocations.filter(
            (a) =>
              a.divisionId === divisionId &&
              a.fiscalYear === fiscalYear &&
              a.month === month &&
              (a.providerId ?? null) === (providerId ?? null),
          ),
        getAiUsageBudgetAmountForMonth: () => 100,
      }),
    )
  })

  function renderPanel(
    props: Partial<ComponentProps<typeof AiUsageMemberAllocationPanel>> = {},
  ) {
    return render(
      <AiUsageMemberAllocationPanel
        divisionId={DIVISION_ID}
        fiscalYear={2025}
        sectionId={SECTION_ID}
        providerId={null}
        {...props}
      />,
    )
  }

  // 反証: 課セレクタはAiUsageGrid（上部エリア）へ移設済みのため、本コンポーネントには存在しない
  //
  it('課セレクタを表示しない（AiUsageGridへ移設済み）', () => {
    renderPanel()
    expect(screen.queryByText('課')).not.toBeInTheDocument()
  })

  it('列順が「個人予算／バッファ／割当／バッファ割当」になっている', () => {
    renderPanel()
    const headers = screen
      .getAllByRole('columnheader')
      .map((h) => h.textContent)
    const budgetIdx = headers.indexOf('個人予算（＄）')
    const bufferIdx = headers.indexOf('バッファ（＄）')
    const actualIdx = headers.indexOf('割当（＄）')
    const bufferActualIdx = headers.indexOf('バッファ割当（＄）')
    expect(budgetIdx).toBeGreaterThanOrEqual(0)
    expect(budgetIdx).toBeLessThan(bufferIdx)
    expect(bufferIdx).toBeLessThan(actualIdx)
    expect(actualIdx).toBeLessThan(bufferActualIdx)
  })

  it('単位表記が＄になっている（万円は表示されない）', () => {
    const { container } = renderPanel()
    expect(container.textContent).not.toContain('万円')
    expect(container.textContent).toContain('＄')
  })

  it('残額は予算額－(割当合計＋バッファ割当合計)で算出する（是正後の計算式）', () => {
    // 予算100（getAiUsageBudgetAmountForMonthのモック値）、割当8、バッファ割当1 → 残 = 100-(8+1) = 91
    const { container } = renderPanel()
    expect(container.textContent).toContain('残 91.00＄')
  })

  // 反証: 是正前の計算式（予算－(割当+バッファ予算) = 100-(8+2)=90）とは異なる結果になるか
  // （バッファ"予算"ではなくバッファ"割当（実績）"を使うべき）
  it('バッファ予算とバッファ割当が異なる値の場合、バッファ割当（実績）を使って算出する', () => {
    allocations = [
      createAllocation({
        monthlyBudget: 10,
        bufferAmount: 5,
        actualAmount: 8,
        bufferActualAmount: 3,
      }),
    ]
    const { container } = renderPanel()
    // 新計算式: 100-(8+3) = 89。バッファ予算(5)を使う旧式なら 100-(8+5)=87 になっていたはず
    expect(container.textContent).toContain('残 89.00＄')
    expect(container.textContent).not.toContain('残 87.00＄')
  })

  it('バッファ割当セルを編集するとsetAiUsageMemberAllocationがbufferActualAmountで呼ばれる', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    renderPanel()
    // textbox順: bulk-budget(0), bulk-buffer(1), 個人予算(2), バッファ(3), 割当(4), バッファ割当(5)
    const bufferActualInput = screen.getAllByRole('textbox')[5]
    if (!bufferActualInput) throw new Error('input not found')
    await user.clear(bufferActualInput)
    await user.type(bufferActualInput, '9')
    await user.tab()
    expect(setAiUsageMemberAllocation).toHaveBeenCalledWith(
      allocations[0]?.id,
      {
        bufferActualAmount: 9,
      },
    )
  })

  // : フッター合計はテーブル本体に表示中のメンバー（課で絞り込み済み）の
  // 配分のみを合算する
  it('課で絞り込んだ場合、フッター合計はその課に属するメンバーの配分のみを合算する', () => {
    members = [
      createMember({ id: MEMBER_ID, sectionId: SECTION_ID }),
      createMember({ id: OTHER_MEMBER_ID, sectionId: OTHER_SECTION_ID }),
    ]
    sections = [
      createSection({ id: SECTION_ID, divisionId: DIVISION_ID }),
      createSection({ id: OTHER_SECTION_ID, divisionId: DIVISION_ID }),
    ]
    allocations = [
      createAllocation({ memberId: MEMBER_ID, monthlyBudget: 10 }),
      createAllocation({ memberId: OTHER_MEMBER_ID, monthlyBudget: 20 }),
    ]
    const { container } = renderPanel({ sectionId: SECTION_ID })
    // SECTION_ID所属メンバー分（10）のみが合計に反映され、他課分（20）は含まれない
    expect(container.textContent).toContain('10')
    // 合計セルの「30」（10+20の誤った合算）が出現していないことを反証する
    expect(container.textContent).not.toContain('30')
  })

  // : メンバー別配分にプロバイダ軸を追加したため、選択中プロバイダの
  // 配分のみをフッター合計・テーブル本体に反映する
  it('プロバイダで絞り込んだ場合、その課かつそのプロバイダの配分のみを合算する', () => {
    const providerId = crypto.randomUUID()
    const otherProviderId = crypto.randomUUID()
    allocations = [
      createAllocation({ memberId: MEMBER_ID, providerId, monthlyBudget: 10 }),
      createAllocation({
        memberId: MEMBER_ID,
        providerId: otherProviderId,
        monthlyBudget: 99,
      }),
    ]
    const { container } = renderPanel({ providerId })
    expect(container.textContent).toContain('10')
    expect(container.textContent).not.toContain('99')
  })

  it('一律設定ボタン押下時、bulkSetAiUsageMemberMonthlyBudget/BufferAmountが現在の絞り込み済みmemberIdsと選択中プロバイダ付きで呼ばれる', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const providerId = crypto.randomUUID()
    renderPanel({ sectionId: SECTION_ID, providerId })
    const budgetButtons = screen.getAllByRole('button', { name: '一律設定' })
    await user.click(budgetButtons[0] as HTMLElement)
    expect(bulkSetAiUsageMemberMonthlyBudget).toHaveBeenCalledWith(
      DIVISION_ID,
      2025,
      expect.any(String),
      0,
      [MEMBER_ID],
      providerId,
    )

    await user.click(budgetButtons[1] as HTMLElement)
    expect(bulkSetAiUsageMemberBufferAmount).toHaveBeenCalledWith(
      DIVISION_ID,
      2025,
      expect.any(String),
      0,
      [MEMBER_ID],
      providerId,
    )
  })
})
