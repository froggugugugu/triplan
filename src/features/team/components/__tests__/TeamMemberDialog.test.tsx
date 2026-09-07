import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Member } from '@/shared/types'
import {
  useCompaniesStore,
  useMembersStore,
  useSkillStore,
  useTeamStore,
  useTechTagsStore,
} from '@/stores'
import { TeamMemberDialog } from '../TeamMemberDialog'

vi.mock('@/stores', () => ({
  useMembersStore: vi.fn(),
  useTeamStore: vi.fn(),
  useTechTagsStore: vi.fn(),
  useCompaniesStore: vi.fn(),
  useSkillStore: vi.fn(),
  // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
  useBudgetStore: vi.fn((selector: any) =>
    selector({ skillReviewCycleMonths: 3 }),
  ),
}))

vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

const DIVISION_ID = crypto.randomUUID()
const SECTION_ID = crypto.randomUUID()

describe('TeamMemberDialog', () => {
  const mockAddMember = vi.fn()
  const mockUpdateMember = vi.fn()
  const mockGetRoles = vi.fn(() => [])
  const mockLoadTechTags = vi.fn()
  const mockLoadCompanies = vi.fn()
  const mockOnOpenChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockAddMember.mockReturnValue({ id: 'new-member-id' } as Member)

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useMembersStore).mockImplementation((selector: any) =>
      selector({
        addMember: mockAddMember,
        updateMember: mockUpdateMember,
        getRoles: mockGetRoles,
      }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useTeamStore).mockImplementation((selector: any) =>
      selector({
        divisions: [{ id: DIVISION_ID, name: 'テスト部門', sortOrder: 0 }],
        sections: [
          {
            id: SECTION_ID,
            divisionId: DIVISION_ID,
            name: 'テスト課',
            sortOrder: 0,
          },
        ],
      }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useTechTagsStore).mockImplementation((selector: any) =>
      selector({
        techTags: [],
        techTagCategories: [],
        techTagSubCategories: [],
        loadTechTags: mockLoadTechTags,
      }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useCompaniesStore).mockImplementation((selector: any) =>
      selector({ companies: [], loadCompanies: mockLoadCompanies }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useSkillStore).mockImplementation((selector: any) =>
      selector({
        skillEvaluations: [],
        skillRoadmapGoals: [],
        loadSkillData: vi.fn(),
        addSkillEvaluation: vi.fn(),
        addSkillRoadmapGoal: vi.fn(),
        getCurrentLevel: () => null,
        getSkillRoadmapGoalHistory: () => [],
        getCurrentRoadmapGoal: () => undefined,
      }),
    )
  })

  test('新規登録時、人員計画クローズ連携UIは表示されない（機能廃止済み）', async () => {
    render(
      <TeamMemberDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        member={null}
      />,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('氏名')).toBeInTheDocument()
    })
    expect(
      screen.queryByText('この人員計画から実現しましたか？'),
    ).not.toBeInTheDocument()
  })

  test('新規追加時はスキル・成長記録タブが表示されない（設計判断⑥）', async () => {
    render(
      <TeamMemberDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        member={null}
      />,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('氏名')).toBeInTheDocument()
    })
    expect(
      screen.queryByRole('tab', { name: /スキル・成長記録/ }),
    ).not.toBeInTheDocument()
  })

  test('編集時はスキル・成長記録タブが表示され、切り替えるとスキルパネルが見える', async () => {
    const TAG_ID = crypto.randomUUID()
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useTechTagsStore).mockImplementation((selector: any) =>
      selector({
        techTags: [
          {
            id: TAG_ID,
            name: 'React',
            color: '#61dafb',
            categoryId: 'cat-1',
            subCategoryId: null,
          },
        ],
        techTagCategories: [],
        techTagSubCategories: [],
        loadTechTags: mockLoadTechTags,
      }),
    )
    const existingMember: Member = {
      id: 'existing-member',
      name: '既存太郎',
      sectionId: SECTION_ID,
      role: 'エンジニア',
      isActive: true,
      techTagIds: [TAG_ID],
      startDate: '2024-04-01',
      endDate: null,
      unitPriceHistory: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    const user = userEvent.setup()
    render(
      <TeamMemberDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        member={existingMember}
      />,
    )

    const skillTab = await waitFor(() =>
      screen.getByRole('tab', { name: /スキル・成長記録/ }),
    )
    await user.click(skillTab)

    await waitFor(() => {
      expect(screen.getByRole('cell', { name: 'React' })).toBeInTheDocument()
    })
  })

  test('編集時はダイアログタイトルが「担当者を編集」になる', async () => {
    const existingMember: Member = {
      id: 'existing-member',
      name: '既存太郎',
      sectionId: SECTION_ID,
      role: 'エンジニア',
      isActive: true,
      techTagIds: [],
      startDate: '2024-04-01',
      endDate: null,
      unitPriceHistory: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    render(
      <TeamMemberDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        member={existingMember}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('担当者を編集')).toBeInTheDocument()
    })
  })

  test('氏名・役割を入力して追加すると、人員計画への言及なくaddMemberが呼ばれる', async () => {
    const user = userEvent.setup()
    render(
      <TeamMemberDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        member={null}
        defaultSectionId={SECTION_ID}
      />,
    )

    await user.type(screen.getByLabelText('氏名'), '山田花子')
    await user.type(screen.getByLabelText('役割'), 'エンジニア')
    await user.click(screen.getByRole('button', { name: '追加' }))

    await waitFor(() => {
      expect(mockAddMember).toHaveBeenCalled()
    })
    const payload = mockAddMember.mock.calls[0]?.[0]
    expect(payload).not.toHaveProperty('realizedPlanId')
  })

  test('開始日を設定すると単価履歴入力(NumericInput)が表示され、金額を入力できる', async () => {
    const user = userEvent.setup()
    render(
      <TeamMemberDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        member={null}
        defaultSectionId={SECTION_ID}
      />,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('開始日')).toBeInTheDocument()
    })
    // 初期状態は単価履歴が空のため「単価変更を追加」から新規エントリを作る
    expect(screen.getByText('単価履歴がありません')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /単価変更を追加/ }))

    const priceInput = screen.getByPlaceholderText('万円') as HTMLInputElement
    expect(priceInput.value).toBe('0')
    await user.clear(priceInput)
    await user.type(priceInput, '80')
    expect(priceInput.value).toBe('80')
  })

  describe('メールアドレスフィールド（人・モノ・金の三位一体強化: 外部連携キー）', () => {
    test('新規登録時、メールアドレス入力欄が表示される', async () => {
      render(
        <TeamMemberDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          member={null}
        />,
      )

      await waitFor(() => {
        expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument()
      })
    })

    test('編集時、既存のメールアドレスが入力欄に表示される', async () => {
      const existingMember: Member = {
        id: 'existing-member',
        name: '既存太郎',
        email: 'existing@example.com',
        sectionId: SECTION_ID,
        role: 'エンジニア',
        isActive: true,
        techTagIds: [],
        startDate: '2024-04-01',
        endDate: null,
        unitPriceHistory: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      render(
        <TeamMemberDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          member={existingMember}
        />,
      )

      await waitFor(() => {
        expect(screen.getByLabelText('メールアドレス')).toHaveValue(
          'existing@example.com',
        )
      })
    })

    test('氏名・役割・メールアドレスを入力して追加すると、emailを含むペイロードでaddMemberが呼ばれる', async () => {
      const user = userEvent.setup()
      render(
        <TeamMemberDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          member={null}
          defaultSectionId={SECTION_ID}
        />,
      )

      await user.type(screen.getByLabelText('氏名'), '山田花子')
      await user.type(screen.getByLabelText('役割'), 'エンジニア')
      await user.type(
        screen.getByLabelText('メールアドレス'),
        'yamada@example.com',
      )
      await user.click(screen.getByRole('button', { name: '追加' }))

      await waitFor(() => {
        expect(mockAddMember).toHaveBeenCalled()
      })
      const payload = mockAddMember.mock.calls[0]?.[0]
      expect(payload.email).toBe('yamada@example.com')
    })

    // 反証: メールアドレスを空欄のまま送信した場合、'' ではなくnullとして保存されるか
    test('メールアドレスを未入力のまま追加すると、emailはnullで保存される', async () => {
      const user = userEvent.setup()
      render(
        <TeamMemberDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          member={null}
          defaultSectionId={SECTION_ID}
        />,
      )

      await user.type(screen.getByLabelText('氏名'), '山田花子')
      await user.type(screen.getByLabelText('役割'), 'エンジニア')
      await user.click(screen.getByRole('button', { name: '追加' }))

      await waitFor(() => {
        expect(mockAddMember).toHaveBeenCalled()
      })
      const payload = mockAddMember.mock.calls[0]?.[0]
      expect(payload.email).toBeNull()
    })
  })
})
