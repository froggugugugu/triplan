import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSkillStore } from '@/stores/skill-store'

const mockList = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockRemove = vi.fn()

vi.mock('@/infrastructure/adapters', () => ({
  getDataAdapter: () => ({
    list: mockList,
    create: mockCreate,
    update: mockUpdate,
    remove: mockRemove,
  }),
}))

vi.mock('@/shared/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

const MEMBER_ID = crypto.randomUUID()
const OTHER_MEMBER_ID = crypto.randomUUID()
const TAG_ID = crypto.randomUUID()
const OTHER_TAG_ID = crypto.randomUUID()

describe('useSkillStore', () => {
  beforeEach(async () => {
    useSkillStore.setState({ skillEvaluations: [], skillRoadmapGoals: [] })
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
    mockCreate.mockImplementation(
      async (
        _entity: string,
        data: Record<string, unknown>,
        options?: { id?: string },
      ) => ({
        ...data,
        id: options?.id ?? crypto.randomUUID(),
      }),
    )
    mockUpdate.mockResolvedValue(undefined)
    mockRemove.mockResolvedValue(undefined)
    const { toast } = await import('@/shared/hooks/use-toast')
    vi.mocked(toast).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('loadSkillData', () => {
    it('DataAdapterから読み込んだ評価履歴・ロードマップ目標をセットする', async () => {
      mockList.mockImplementation(async (entity: string) => {
        if (entity === 'skillEvaluations') {
          return [
            {
              id: crypto.randomUUID(),
              memberId: MEMBER_ID,
              techTagId: TAG_ID,
              evaluatorType: 'self',
              beforeLevel: 'none',
              afterLevel: 'beginner',
              evaluatedAt: '2025-04-01',
              createdAt: '2025-04-01T00:00:00.000Z',
            },
          ]
        }
        return []
      })
      useSkillStore.getState().loadSkillData()
      await flushMicrotasks()
      expect(useSkillStore.getState().skillEvaluations).toHaveLength(1)
      expect(useSkillStore.getState().skillRoadmapGoals).toEqual([])
    })

    it('読み込みがDataAdapterで失敗した場合はトースト表示される', async () => {
      mockList.mockRejectedValue(new Error('network error'))
      useSkillStore.getState().loadSkillData()
      await flushMicrotasks()
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })
  })

  describe('addSkillEvaluation', () => {
    it('評価履歴を追記できる（楽観的に即座へ反映される）', () => {
      const created = useSkillStore.getState().addSkillEvaluation({
        memberId: MEMBER_ID,
        techTagId: TAG_ID,
        evaluatorType: 'self',
        beforeLevel: 'none',
        afterLevel: 'beginner',
        evaluatedAt: '2025-04-01',
      })
      expect(created.id).toBeTruthy()
      expect(created.createdAt).toBeTruthy()
      expect(useSkillStore.getState().skillEvaluations).toHaveLength(1)
      expect(mockCreate).toHaveBeenCalledWith(
        'skillEvaluations',
        expect.objectContaining({ memberId: MEMBER_ID, techTagId: TAG_ID }),
        { id: created.id },
      )
    })

    it('DataAdapter確定後もidは変わらず安定している', async () => {
      const created = useSkillStore.getState().addSkillEvaluation({
        memberId: MEMBER_ID,
        techTagId: TAG_ID,
        evaluatorType: 'self',
        beforeLevel: 'none',
        afterLevel: 'beginner',
        evaluatedAt: '2025-04-01',
      })
      await flushMicrotasks()
      expect(useSkillStore.getState().skillEvaluations[0]?.id).toBe(created.id)
    })

    it('追加がDataAdapterで失敗した場合はロールバックされる', async () => {
      mockCreate.mockRejectedValueOnce(new Error('network error'))
      useSkillStore.getState().addSkillEvaluation({
        memberId: MEMBER_ID,
        techTagId: TAG_ID,
        evaluatorType: 'self',
        beforeLevel: 'none',
        afterLevel: 'beginner',
        evaluatedAt: '2025-04-01',
      })
      await flushMicrotasks()
      expect(useSkillStore.getState().skillEvaluations).toHaveLength(0)
    })

    it('追記後も過去のレコードが変更されない（追記専用性）', () => {
      const first = useSkillStore.getState().addSkillEvaluation({
        memberId: MEMBER_ID,
        techTagId: TAG_ID,
        evaluatorType: 'self',
        beforeLevel: 'none',
        afterLevel: 'beginner',
        evaluatedAt: '2025-04-01',
      })
      useSkillStore.getState().addSkillEvaluation({
        memberId: MEMBER_ID,
        techTagId: TAG_ID,
        evaluatorType: 'self',
        beforeLevel: 'beginner',
        afterLevel: 'intermediate',
        evaluatedAt: '2025-07-01',
      })
      const evaluations = useSkillStore.getState().skillEvaluations
      expect(evaluations).toHaveLength(2)
      expect(evaluations.find((e) => e.id === first.id)).toEqual(first)
    })
  })

  describe('addSkillRoadmapGoal', () => {
    it('ロードマップ目標を追記できる', () => {
      const created = useSkillStore.getState().addSkillRoadmapGoal({
        memberId: MEMBER_ID,
        techTagId: TAG_ID,
        targetLevel: 'advanced',
        targetDate: '2026-03',
      })
      expect(created.id).toBeTruthy()
      expect(useSkillStore.getState().skillRoadmapGoals).toHaveLength(1)
    })

    it('追加がDataAdapterで失敗した場合はロールバックされる', async () => {
      mockCreate.mockRejectedValueOnce(new Error('network error'))
      useSkillStore.getState().addSkillRoadmapGoal({
        memberId: MEMBER_ID,
        techTagId: TAG_ID,
        targetLevel: 'advanced',
        targetDate: '2026-03',
      })
      await flushMicrotasks()
      expect(useSkillStore.getState().skillRoadmapGoals).toHaveLength(0)
    })

    it('目標を変更しても過去の目標が履歴として残る（上書きしない）', () => {
      const first = useSkillStore.getState().addSkillRoadmapGoal({
        memberId: MEMBER_ID,
        techTagId: TAG_ID,
        targetLevel: 'intermediate',
        targetDate: '2025-12',
      })
      useSkillStore.getState().addSkillRoadmapGoal({
        memberId: MEMBER_ID,
        techTagId: TAG_ID,
        targetLevel: 'advanced',
        targetDate: '2026-06',
      })
      const goals = useSkillStore.getState().skillRoadmapGoals
      expect(goals).toHaveLength(2)
      expect(goals.find((g) => g.id === first.id)).toEqual(first)
    })
  })

  describe('getSkillEvaluationHistory', () => {
    it('指定member×techTagの評価履歴を時系列昇順で返す', () => {
      useSkillStore.setState({
        skillEvaluations: [
          {
            id: '1',
            memberId: MEMBER_ID,
            techTagId: TAG_ID,
            evaluatorType: 'self',
            beforeLevel: 'beginner',
            afterLevel: 'intermediate',
            evaluatedAt: '2025-07-01',
            createdAt: '2025-07-01T00:00:00.000Z',
          },
          {
            id: '2',
            memberId: MEMBER_ID,
            techTagId: TAG_ID,
            evaluatorType: 'self',
            beforeLevel: 'none',
            afterLevel: 'beginner',
            evaluatedAt: '2025-04-01',
            createdAt: '2025-04-01T00:00:00.000Z',
          },
        ],
        skillRoadmapGoals: [],
      })
      const history = useSkillStore
        .getState()
        .getSkillEvaluationHistory(MEMBER_ID, TAG_ID)
      expect(history.map((h) => h.id)).toEqual(['2', '1'])
    })

    it('他member・他タグの履歴は含まれない', () => {
      useSkillStore.setState({
        skillEvaluations: [
          {
            id: '1',
            memberId: OTHER_MEMBER_ID,
            techTagId: TAG_ID,
            evaluatorType: 'self',
            beforeLevel: 'none',
            afterLevel: 'expert',
            evaluatedAt: '2025-04-01',
            createdAt: '2025-04-01T00:00:00.000Z',
          },
          {
            id: '2',
            memberId: MEMBER_ID,
            techTagId: OTHER_TAG_ID,
            evaluatorType: 'self',
            beforeLevel: 'none',
            afterLevel: 'expert',
            evaluatedAt: '2025-04-01',
            createdAt: '2025-04-01T00:00:00.000Z',
          },
        ],
        skillRoadmapGoals: [],
      })
      expect(
        useSkillStore.getState().getSkillEvaluationHistory(MEMBER_ID, TAG_ID),
      ).toEqual([])
    })
  })

  describe('getCurrentLevel', () => {
    it('storeの評価履歴からgetCurrentSkillLevelと同じロジックで現在レベルを返す', () => {
      useSkillStore.setState({
        skillEvaluations: [
          {
            id: '1',
            memberId: MEMBER_ID,
            techTagId: TAG_ID,
            evaluatorType: 'manager',
            beforeLevel: 'none',
            afterLevel: 'advanced',
            evaluatedAt: '2025-04-01',
            createdAt: '2025-04-01T00:00:00.000Z',
          },
        ],
        skillRoadmapGoals: [],
      })
      expect(
        useSkillStore.getState().getCurrentLevel(MEMBER_ID, TAG_ID, 'manager'),
      ).toBe('advanced')
      expect(
        useSkillStore.getState().getCurrentLevel(MEMBER_ID, TAG_ID, 'self'),
      ).toBeNull()
    })
  })

  describe('getSkillRoadmapGoalHistory / getCurrentRoadmapGoal', () => {
    it('目標履歴を降順（先頭＝現在の目標）で返し、getCurrentRoadmapGoalは先頭と一致する', () => {
      useSkillStore.setState({
        skillEvaluations: [],
        skillRoadmapGoals: [
          {
            id: '1',
            memberId: MEMBER_ID,
            techTagId: TAG_ID,
            targetLevel: 'intermediate',
            targetDate: '2025-12',
            createdAt: '2025-04-01T00:00:00.000Z',
          },
          {
            id: '2',
            memberId: MEMBER_ID,
            techTagId: TAG_ID,
            targetLevel: 'advanced',
            targetDate: '2026-06',
            createdAt: '2025-08-01T00:00:00.000Z',
          },
        ],
      })
      const history = useSkillStore
        .getState()
        .getSkillRoadmapGoalHistory(MEMBER_ID, TAG_ID)
      expect(history.map((g) => g.id)).toEqual(['2', '1'])
      expect(
        useSkillStore.getState().getCurrentRoadmapGoal(MEMBER_ID, TAG_ID)?.id,
      ).toBe('2')
    })

    it('目標が未設定の場合getCurrentRoadmapGoalはundefinedを返す', () => {
      useSkillStore.setState({ skillEvaluations: [], skillRoadmapGoals: [] })
      expect(
        useSkillStore.getState().getCurrentRoadmapGoal(MEMBER_ID, TAG_ID),
      ).toBeUndefined()
    })
  })
})
