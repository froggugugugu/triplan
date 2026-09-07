import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AiUsageEntry,
  AiUsageMemberAllocation,
  AiUsageProvider,
} from '@/shared/types/budget'
import type { Member } from '@/shared/types/member'
import type { Section } from '@/shared/types/section'
import {
  useAppStore,
  useBudgetStore,
  useMembersStore,
  useTeamStore,
} from '@/stores'
import { AiUsageGrid } from '../AiUsageGrid'

vi.mock('@/stores', () => ({
  useAppStore: vi.fn(),
  useBudgetStore: vi.fn(),
  useMembersStore: vi.fn(),
  useTeamStore: vi.fn(),
}))

afterEach(() => cleanup())

const DIVISION_ID = crypto.randomUUID()
const SECTION_ID = crypto.randomUUID()
const MEMBER_ID = crypto.randomUUID()
const MEMBER_ID_2 = crypto.randomUUID()

function createEntry(overrides: Partial<AiUsageEntry> = {}): AiUsageEntry {
  return {
    id: crypto.randomUUID(),
    divisionId: DIVISION_ID,
    sectionId: null,
    fiscalYear: 2025,
    month: '2025-04',
    budgetAmount: 0,
    actualAmount: null,
    ...overrides,
  }
}

function createProvider(
  overrides: Partial<AiUsageProvider> = {},
): AiUsageProvider {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    divisionId: DIVISION_ID,
    name: 'Anthropic',
    plan: null,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
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

describe('AiUsageGrid', () => {
  let entries: AiUsageEntry[]
  let allocations: AiUsageMemberAllocation[]
  let providers: AiUsageProvider[]
  let members: Member[]
  let sections: Section[]
  const setAiUsageBudget = vi.fn()
  const setAiUsageActual = vi.fn()
  const deleteAiUsageProvider = vi.fn()
  const onSectionChange = vi.fn()
  const onProviderChange = vi.fn()

  beforeEach(() => {
    entries = []
    allocations = []
    providers = []
    members = [
      createMember({ id: MEMBER_ID, sectionId: SECTION_ID }),
      createMember({ id: MEMBER_ID_2, sectionId: SECTION_ID }),
    ]
    sections = [createSection({ id: SECTION_ID, divisionId: DIVISION_ID })]
    setAiUsageBudget.mockReset()
    setAiUsageActual.mockReset()
    deleteAiUsageProvider.mockReset()
    onSectionChange.mockReset()
    onProviderChange.mockReset()

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
        aiUsageEntries: entries,
        aiUsageMemberAllocations: allocations,
        aiUsageProviders: providers,
        setAiUsageBudget,
        setAiUsageActual,
        deleteAiUsageProvider,
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
      }),
    )
  })

  function renderGrid(props: Partial<ComponentProps<typeof AiUsageGrid>> = {}) {
    return render(
      <AiUsageGrid
        divisionId={DIVISION_ID}
        fiscalYear={2025}
        sectionId={SECTION_ID}
        onSectionChange={onSectionChange}
        providerId={null}
        onProviderChange={onProviderChange}
        {...props}
      />,
    )
  }

  it('月を列に配置した横方向テーブル（5行）を＄単位で描画する', () => {
    renderGrid()
    expect(screen.getByText('4月')).toBeInTheDocument()
    expect(screen.getByText('3月')).toBeInTheDocument()
    expect(screen.getByText('予算額（＄）')).toBeInTheDocument()
    expect(screen.getByText('個人予算合計（＄）')).toBeInTheDocument()
    expect(screen.getByText('バッファ合計（＄）')).toBeInTheDocument()
    expect(screen.getByText('割当合計（＄）')).toBeInTheDocument()
    expect(screen.getByText('バッファ割当合計（＄）')).toBeInTheDocument()
    expect(screen.queryByText(/万円/)).not.toBeInTheDocument()
  })

  it('個人予算合計・バッファ合計行はメンバー配分のmonthlyBudget/bufferAmount合計を表示する（編集不可）', () => {
    allocations = [
      createAllocation({
        month: '2025-04',
        memberId: MEMBER_ID,
        monthlyBudget: 10,
        bufferAmount: 3,
      }),
      createAllocation({
        month: '2025-04',
        memberId: MEMBER_ID_2,
        monthlyBudget: 5,
        bufferAmount: 1,
      }),
    ]
    const { container } = renderGrid()
    expect(container.textContent).toContain('15')
    expect(container.textContent).toContain('4')
  })

  it('割当合計・バッファ割当合計行はメンバー配分のactualAmount/bufferActualAmount合計を表示する（AiUsageEntry.actualAmountの直接入力UIは廃止）', () => {
    entries = [createEntry({ month: '2025-04', actualAmount: 999 })]
    allocations = [
      createAllocation({
        month: '2025-04',
        memberId: MEMBER_ID,
        actualAmount: 8,
        bufferActualAmount: 2,
      }),
      createAllocation({
        month: '2025-04',
        memberId: MEMBER_ID_2,
        actualAmount: 4,
        bufferActualAmount: 1,
      }),
    ]
    const { container } = renderGrid()
    // AiUsageEntry.actualAmount(999)ではなく、メンバー配分合計(割当12、バッファ割当3)を表示する
    expect(container.textContent).toContain('12')
    expect(container.textContent).toContain('3')
    expect(container.textContent).not.toContain('999')
  })

  // 反証: 配分・実績データが1件も無い月でもクラッシュせず0を表示するか
  it('データが無い場合はクラッシュせず0を表示する', () => {
    expect(() => renderGrid()).not.toThrow()
  })

  it('課を指定した場合、当該課のAiUsageEntryのみが予算額欄の初期値に反映される', () => {
    const otherSectionId = crypto.randomUUID()
    entries = [
      createEntry({ month: '2025-04', sectionId: null, budgetAmount: 100 }),
      createEntry({
        month: '2025-04',
        sectionId: otherSectionId,
        budgetAmount: 50,
      }),
    ]
    renderGrid({ sectionId: otherSectionId })
    expect(screen.getByDisplayValue('50')).toBeInTheDocument()
  })

  it('課セレクタが常時表示される', () => {
    renderGrid()
    expect(screen.getByText('課')).toBeInTheDocument()
    // 「部門全体」の選択肢は廃止されている
    expect(screen.queryByText('部門全体')).not.toBeInTheDocument()
  })

  it('課を切り替えると、個人予算合計等4行の値もその課の配分に切り替わる', () => {
    const otherSectionId = crypto.randomUUID()
    const otherMemberId = crypto.randomUUID()
    members = [
      createMember({ id: MEMBER_ID, sectionId: SECTION_ID }),
      createMember({ id: otherMemberId, sectionId: otherSectionId }),
    ]
    sections = [
      createSection({ id: SECTION_ID, divisionId: DIVISION_ID }),
      createSection({
        id: otherSectionId,
        divisionId: DIVISION_ID,
        name: '第二課',
      }),
    ]
    allocations = [
      createAllocation({
        month: '2025-04',
        memberId: MEMBER_ID,
        monthlyBudget: 10,
      }),
      createAllocation({
        month: '2025-04',
        memberId: otherMemberId,
        monthlyBudget: 20,
      }),
    ]
    const { unmount } = renderGrid({ sectionId: SECTION_ID })
    expect(screen.getByText('10.00')).toBeInTheDocument()
    expect(screen.queryByText('20.00')).not.toBeInTheDocument()
    unmount()

    renderGrid({ sectionId: otherSectionId })
    expect(screen.getByText('20.00')).toBeInTheDocument()
    expect(screen.queryByText('10.00')).not.toBeInTheDocument()
  })

  describe('プロバイダ表示', () => {
    it('プロバイダが0件の場合、既存どおり単一の「予算額」行のみを表示する（後方互換）', () => {
      renderGrid()
      expect(screen.getByText('予算額（＄）')).toBeInTheDocument()
      expect(screen.queryByText('予算合計（＄）')).not.toBeInTheDocument()
      expect(screen.queryByText('未分類 予算額（＄）')).not.toBeInTheDocument()
      // プロバイダ選択セレクタ自体は0件時は表示されない
      expect(screen.queryByText('プロバイダ')).not.toBeInTheDocument()
    })

    it('プロバイダが1件以上の場合、プロバイダ選択セレクタが表示され、選択中プロバイダの予算額・実績額行が表示される。未分類行は表示されない', () => {
      const anthropic = createProvider({
        name: 'Anthropic',
        plan: 'Team',
        sortOrder: 0,
      })
      const openai = createProvider({ name: 'OpenAI', sortOrder: 1 })
      providers = [openai, anthropic]
      renderGrid({ providerId: anthropic.id })
      expect(screen.getByText('プロバイダ')).toBeInTheDocument()
      expect(
        screen.getByText('Anthropic（Team） 予算額（＄）'),
      ).toBeInTheDocument()
      expect(
        screen.getByText('Anthropic（Team） 実績額（＄）'),
      ).toBeInTheDocument()
      expect(screen.queryByText('OpenAI 予算額（＄）')).not.toBeInTheDocument()
      expect(screen.queryByText('未分類 予算額（＄）')).not.toBeInTheDocument()
      expect(screen.getByText('予算合計（＄）')).toBeInTheDocument()
      expect(screen.getByText('実績合計（＄）')).toBeInTheDocument()
      // プロバイダ0件時の単一「予算額」行（未分類と紛れない完全一致テキスト）は存在しない
      expect(screen.queryByText('予算額（＄）')).not.toBeInTheDocument()
    })

    it('providerIdがnullのままプロバイダが1件以上ある場合、onProviderChangeでsortOrder最小のプロバイダへの変更を通知する', () => {
      const anthropic = createProvider({ name: 'Anthropic', sortOrder: 0 })
      const openai = createProvider({ name: 'OpenAI', sortOrder: 1 })
      providers = [openai, anthropic]
      renderGrid({ providerId: null })
      expect(onProviderChange).toHaveBeenCalledWith(anthropic.id)
    })

    it('選択中プロバイダが一覧から無くなっている場合、onProviderChangeで別のプロバイダへの変更を通知する（削除等への対応）', () => {
      const anthropic = createProvider({ name: 'Anthropic', sortOrder: 0 })
      const openai = createProvider({ name: 'OpenAI', sortOrder: 1 })
      // Anthropicはすでに削除済み、という想定
      providers = [openai]
      renderGrid({ providerId: anthropic.id })
      expect(onProviderChange).toHaveBeenCalledWith(openai.id)
    })

    it('プロバイダセレクタでオプションを選択すると、onProviderChangeが選択したプロバイダのIDで呼ばれる', () => {
      const anthropic = createProvider({ name: 'Anthropic', sortOrder: 0 })
      const openai = createProvider({ name: 'OpenAI', sortOrder: 1 })
      providers = [anthropic, openai]
      renderGrid({ providerId: anthropic.id })

      // combobox並び順: [0]=課, [1]=プロバイダ
      fireEvent.click(screen.getAllByRole('combobox')[1] as HTMLElement)
      fireEvent.click(screen.getByRole('option', { name: 'OpenAI' }))

      expect(onProviderChange).toHaveBeenCalledWith(openai.id)
    })

    it('providerId propが変わると、表示される予算額・実績額行がそのプロバイダのものに切り替わる', () => {
      const anthropic = createProvider({ name: 'Anthropic', sortOrder: 0 })
      const openai = createProvider({ name: 'OpenAI', sortOrder: 1 })
      providers = [anthropic, openai]
      entries = [
        createEntry({
          month: '2025-04',
          sectionId: SECTION_ID,
          providerId: anthropic.id,
          budgetAmount: 200,
        }),
        createEntry({
          month: '2025-04',
          sectionId: SECTION_ID,
          providerId: openai.id,
          budgetAmount: 100,
        }),
      ]
      const { rerender } = renderGrid({ providerId: anthropic.id })
      expect(screen.getByDisplayValue('200')).toBeInTheDocument()

      rerender(
        <AiUsageGrid
          divisionId={DIVISION_ID}
          fiscalYear={2025}
          sectionId={SECTION_ID}
          onSectionChange={onSectionChange}
          providerId={openai.id}
          onProviderChange={onProviderChange}
        />,
      )
      expect(screen.getByDisplayValue('100')).toBeInTheDocument()
      expect(screen.queryByDisplayValue('200')).not.toBeInTheDocument()
    })

    it('反証: プロバイダ別の予算合計行は、未分類分を非表示にしても全プロバイダ＋未分類分のbudgetAmountを合算し続ける（データは保持される）', () => {
      const anthropic = createProvider({ name: 'Anthropic' })
      const openai = createProvider({ name: 'OpenAI', sortOrder: 1 })
      providers = [anthropic, openai]
      entries = [
        createEntry({
          month: '2025-04',
          sectionId: SECTION_ID,
          providerId: anthropic.id,
          budgetAmount: 200,
        }),
        createEntry({
          month: '2025-04',
          sectionId: SECTION_ID,
          providerId: openai.id,
          budgetAmount: 100,
        }),
        createEntry({
          month: '2025-04',
          sectionId: SECTION_ID,
          providerId: null,
          budgetAmount: 50,
        }),
      ]
      const { container } = renderGrid({ providerId: anthropic.id })
      expect(container.textContent).toContain('350')
      expect(screen.queryByText('未分類 予算額（＄）')).not.toBeInTheDocument()
    })

    // : メンバー別配分にプロバイダ軸を追加したため、個人予算合計等4行は
    // 選択中プロバイダの配分のみを反映する（プロバイダを切り替えると値も切り替わる）
    it('providerIdを切り替えると、個人予算合計等4行もそのプロバイダの配分に切り替わる', () => {
      const anthropic = createProvider({ name: 'Anthropic', sortOrder: 0 })
      const openai = createProvider({ name: 'OpenAI', sortOrder: 1 })
      providers = [anthropic, openai]
      allocations = [
        createAllocation({
          month: '2025-04',
          providerId: anthropic.id,
          monthlyBudget: 10,
        }),
        createAllocation({
          month: '2025-04',
          providerId: openai.id,
          monthlyBudget: 20,
        }),
      ]
      const { unmount } = renderGrid({ providerId: anthropic.id })
      expect(screen.getByText('10.00')).toBeInTheDocument()
      expect(screen.queryByText('20.00')).not.toBeInTheDocument()
      unmount()

      renderGrid({ providerId: openai.id })
      expect(screen.getByText('20.00')).toBeInTheDocument()
      expect(screen.queryByText('10.00')).not.toBeInTheDocument()
    })

    it('プロバイダの削除アイコンをクリックすると確認ダイアログが開き、削除確定でdeleteAiUsageProviderが呼ばれる', () => {
      const provider = createProvider({ name: 'Anthropic' })
      providers = [provider]
      renderGrid({ providerId: provider.id })

      fireEvent.click(screen.getByTitle('削除'))
      expect(screen.getByText('プロバイダの削除')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: '削除' }))
      expect(deleteAiUsageProvider).toHaveBeenCalledWith(provider.id)
    })

    it('反証: 削除確認ダイアログでキャンセルした場合、deleteAiUsageProviderは呼ばれない', () => {
      const provider = createProvider({ name: 'Anthropic' })
      providers = [provider]
      renderGrid({ providerId: provider.id })

      fireEvent.click(screen.getByTitle('削除'))
      fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
      expect(deleteAiUsageProvider).not.toHaveBeenCalled()
    })
  })
})
