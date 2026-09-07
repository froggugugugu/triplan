import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Member, SkillEvaluation, SkillRoadmapGoal } from '@/shared/types'
import { getCurrentSkillLevel } from '@/shared/utils/skill-utils'
import { useSkillStore, useTechTagsStore } from '@/stores'
import { MemberSkillPanel } from '../MemberSkillPanel'

const { mockToast } = vi.hoisted(() => ({ mockToast: vi.fn() }))

vi.mock('@/stores', () => ({
  useSkillStore: vi.fn(),
  useTechTagsStore: vi.fn(),
  // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
  useBudgetStore: vi.fn((selector: any) =>
    selector({ skillReviewCycleMonths: 3 }),
  ),
}))

vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

afterEach(() => cleanup())

const MEMBER_ID = crypto.randomUUID()
const TAG_A_ID = crypto.randomUUID()
const TAG_B_ID = crypto.randomUUID()

function createMember(overrides: Partial<Member> = {}): Member {
  return {
    id: MEMBER_ID,
    name: '田中太郎',
    sectionId: null,
    role: 'エンジニア',
    isActive: true,
    techTagIds: [TAG_A_ID, TAG_B_ID],
    startDate: '2025-04-01',
    endDate: null,
    unitPriceHistory: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('MemberSkillPanel', () => {
  let skillEvaluations: SkillEvaluation[]
  let skillRoadmapGoals: SkillRoadmapGoal[]
  const mockAddSkillEvaluation = vi.fn()
  const mockAddSkillRoadmapGoal = vi.fn()

  beforeEach(() => {
    skillEvaluations = []
    skillRoadmapGoals = []
    mockAddSkillEvaluation.mockReset()
    mockAddSkillRoadmapGoal.mockReset()
    mockToast.mockReset()

    mockAddSkillEvaluation.mockImplementation((data) => {
      const created = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      }
      skillEvaluations = [...skillEvaluations, created]
      return created
    })
    mockAddSkillRoadmapGoal.mockImplementation((data) => {
      const created = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      }
      skillRoadmapGoals = [...skillRoadmapGoals, created]
      return created
    })

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useSkillStore).mockImplementation((selector: any) =>
      selector({
        get skillEvaluations() {
          return skillEvaluations
        },
        get skillRoadmapGoals() {
          return skillRoadmapGoals
        },
        loadSkillData: vi.fn(),
        addSkillEvaluation: mockAddSkillEvaluation,
        addSkillRoadmapGoal: mockAddSkillRoadmapGoal,
        getCurrentLevel: (
          memberId: string,
          techTagId: string,
          evaluatorType: 'self' | 'manager',
        ) =>
          getCurrentSkillLevel(
            skillEvaluations,
            memberId,
            techTagId,
            evaluatorType,
          ),
        getSkillRoadmapGoalHistory: (memberId: string, techTagId: string) =>
          skillRoadmapGoals
            .filter((g) => g.memberId === memberId && g.techTagId === techTagId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        getCurrentRoadmapGoal: (memberId: string, techTagId: string) =>
          skillRoadmapGoals
            .filter((g) => g.memberId === memberId && g.techTagId === techTagId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
      }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useTechTagsStore).mockImplementation((selector: any) =>
      selector({
        techTags: [
          {
            id: TAG_A_ID,
            name: 'React',
            color: '#61dafb',
            categoryId: 'cat-1',
            subCategoryId: null,
          },
          {
            id: TAG_B_ID,
            name: 'TypeScript',
            color: '#3178c6',
            categoryId: 'cat-1',
            subCategoryId: null,
          },
        ],
        loadTechTags: vi.fn(),
      }),
    )
  })

  function renderPanel(member: Member = createMember()) {
    const { rerender: baseRerender } = render(
      <MemberSkillPanel member={member} />,
    )
    const user = userEvent.setup()
    // モック化したuseSkillStoreにはZustandの購読機構がないため、ストアデータを
    // 変更するアクション（addSkillEvaluation等）を呼んだ後は明示的にrerenderして
    // 最新のモックデータで再計算させる必要がある
    const rerender = () => baseRerender(<MemberSkillPanel member={member} />)
    return { user, rerender }
  }

  it('保有タグがレベル一覧に表示される', () => {
    renderPanel()
    expect(screen.getByRole('cell', { name: 'React' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'TypeScript' })).toBeInTheDocument()
  })

  it('保有タグがない場合は案内メッセージを表示する', () => {
    render(<MemberSkillPanel member={createMember({ techTagIds: [] })} />)
    expect(screen.getByText(/技術タグが未設定です/)).toBeInTheDocument()
  })

  it('評価記録フォームで送信するとaddSkillEvaluationが呼ばれる', async () => {
    const { user } = renderPanel()

    await user.selectOptions(screen.getByLabelText('評価対象タグ'), 'React')
    await user.selectOptions(screen.getByLabelText('レベル'), '初級')
    await user.click(screen.getByRole('button', { name: '評価を記録' }))

    expect(mockAddSkillEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: MEMBER_ID,
        techTagId: TAG_A_ID,
        evaluatorType: 'self',
        beforeLevel: 'none',
        afterLevel: 'beginner',
      }),
    )
  })

  it('レベルアップ時にtoastでレベルアップ文言が表示される', async () => {
    const { user } = renderPanel()
    await user.selectOptions(screen.getByLabelText('評価対象タグ'), 'React')
    await user.selectOptions(screen.getByLabelText('レベル'), '初級')
    await user.click(screen.getByRole('button', { name: '評価を記録' }))

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('レベルが') }),
    )
  })

  it('未評価から未経験(none)を記録してもレベルアップ扱いにならない', async () => {
    const { user } = renderPanel()
    await user.selectOptions(
      screen.getByLabelText('評価対象タグ'),
      'TypeScript',
    )
    await user.selectOptions(screen.getByLabelText('レベル'), '未経験')
    await user.click(screen.getByRole('button', { name: '評価を記録' }))

    // none -> none は変化なしのためレベルアップ扱いにならない
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: '評価を記録しました' }),
    )
  })

  it('成長タイムラインに記録済み評価が表示される', async () => {
    skillEvaluations = [
      {
        id: crypto.randomUUID(),
        memberId: MEMBER_ID,
        techTagId: TAG_A_ID,
        evaluatorType: 'self',
        beforeLevel: 'none',
        afterLevel: 'beginner',
        evaluatedAt: '2025-04-01',
        createdAt: '2025-04-01T00:00:00.000Z',
      },
    ]
    renderPanel()
    expect(screen.getByText(/2025-04-01/)).toBeInTheDocument()
  })

  it('ロードマップ目標を設定すると進捗バーが表示される', async () => {
    skillEvaluations = [
      {
        id: crypto.randomUUID(),
        memberId: MEMBER_ID,
        techTagId: TAG_A_ID,
        evaluatorType: 'manager',
        beforeLevel: 'none',
        afterLevel: 'intermediate',
        evaluatedAt: '2025-04-01',
        createdAt: '2025-04-01T00:00:00.000Z',
      },
    ]
    const { user, rerender } = renderPanel()
    await user.selectOptions(screen.getByLabelText('目標タグ'), 'React')
    await user.selectOptions(screen.getByLabelText('目標レベル'), '上級')
    await user.click(screen.getByRole('button', { name: '目標を更新' }))

    expect(mockAddSkillRoadmapGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: MEMBER_ID,
        techTagId: TAG_A_ID,
        targetLevel: 'advanced',
      }),
    )
    // モックストアには購読機構がないため明示的に再レンダーする（実際のZustandでは不要）
    rerender()
    // intermediate(2)/advanced(3) = 67%（JSX補間でテキストノードが分割されるため要素単位で照合する）
    expect(
      screen.getByText((_, element) => element?.textContent === '進捗 67%'),
    ).toBeInTheDocument()
  })

  it('目標を変更すると過去の目標が「過去の目標を見る」に残る', async () => {
    const { user, rerender } = renderPanel()
    await user.selectOptions(screen.getByLabelText('目標タグ'), 'React')
    await user.selectOptions(screen.getByLabelText('目標レベル'), '中級')
    await user.click(screen.getByRole('button', { name: '目標を更新' }))
    rerender()

    await user.selectOptions(screen.getByLabelText('目標タグ'), 'React')
    await user.selectOptions(screen.getByLabelText('目標レベル'), '上級')
    await user.click(screen.getByRole('button', { name: '目標を更新' }))
    rerender()

    await user.click(screen.getByRole('button', { name: /過去の目標を見る/ }))
    const historySection = screen.getByText(/中級/, {
      selector: 'p',
    })
    expect(historySection).toBeInTheDocument()
  })
})
