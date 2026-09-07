import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Member } from '@/shared/types/member'
import type { PersonnelPlanEntry } from '@/shared/types/personnel-plan'
import { useCompaniesStore } from '@/stores/companies-store'
import { useMembersStore } from '@/stores/members-store'
import { usePersonnelPlanStore } from '@/stores/personnel-plan-store'
import { useTeamStore } from '@/stores/team-store'

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
  // getOrCreateAllCategoriesはPromise.all + per-entry.then()のため通常より深いchainを持つ
  for (let i = 0; i < 6; i++) {
    await Promise.resolve()
  }
}

const divisionId = crypto.randomUUID()

function createTestMember(
  overrides: Partial<Member> & { startDate: string | null },
): Member {
  const { startDate, ...rest } = overrides
  return {
    id: crypto.randomUUID(),
    name: 'テスト太郎',
    sectionId: null,
    role: 'エンジニア',
    isActive: true,
    techTagIds: [],
    startDate,
    endDate: null,
    unitPriceHistory: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...rest,
  }
}

describe('usePersonnelPlanStore', () => {
  beforeEach(async () => {
    usePersonnelPlanStore.setState({ personnelPlans: [] })
    useTeamStore.setState({ divisions: [], sections: [] })
    useMembersStore.setState({ members: [] })
    useCompaniesStore.setState({ companies: [] })
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
    mockCreate.mockImplementation(
      async (
        _entity: string,
        data: Omit<PersonnelPlanEntry, 'id'>,
        options?: { id?: string },
      ) => ({
        ...data,
        id: options?.id ?? crypto.randomUUID(),
      }),
    )
    mockUpdate.mockImplementation(
      async (
        _entity: string,
        id: string,
        patch: Partial<PersonnelPlanEntry>,
      ) => ({ id, ...patch }),
    )
    mockRemove.mockResolvedValue(undefined)
    const { toast } = await import('@/shared/hooks/use-toast')
    vi.mocked(toast).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getOrCreateAllCategories', () => {
    it('部門×年度に4固定区分のレコードを自動生成する', () => {
      const result = usePersonnelPlanStore
        .getState()
        .getOrCreateAllCategories(divisionId, 2025)
      expect(result).toHaveLength(4)
      const categories = result.map((p) => p.category).sort()
      expect(categories).toEqual(
        [
          'personnel_external',
          'personnel_internal',
          'planned_external',
          'planned_internal',
        ].sort(),
      )
    })

    it('生成したレコードはmonthlyHeadcount/monthlyRealizedHeadcountが空オブジェクトで開始する', () => {
      const result = usePersonnelPlanStore
        .getState()
        .getOrCreateAllCategories(divisionId, 2025)
      for (const entry of result) {
        expect(entry.monthlyHeadcount).toEqual({})
        expect(entry.monthlyRealizedHeadcount).toEqual({})
      }
    })

    it('初回生成時にDataAdapter.create()が4区分分呼ばれる', () => {
      usePersonnelPlanStore
        .getState()
        .getOrCreateAllCategories(divisionId, 2025)
      expect(mockCreate).toHaveBeenCalledTimes(4)
    })

    it('DataAdapter確定後もidは変わらず安定している', async () => {
      const result = usePersonnelPlanStore
        .getState()
        .getOrCreateAllCategories(divisionId, 2025)
      const ids = result.map((p) => p.id).sort()
      await flushMicrotasks()
      const idsAfter = usePersonnelPlanStore
        .getState()
        .personnelPlans.map((p) => p.id)
        .sort()
      expect(idsAfter).toEqual(ids)
    })

    it('生成がDataAdapterで失敗した場合はロールバックされる', async () => {
      mockCreate.mockRejectedValue(new Error('network error'))
      usePersonnelPlanStore
        .getState()
        .getOrCreateAllCategories(divisionId, 2025)
      await flushMicrotasks()
      expect(usePersonnelPlanStore.getState().personnelPlans).toHaveLength(0)
    })

    // 反証: 既に一部の区分だけ存在する状態で呼んだ場合、既存レコードを
    // 上書き・重複生成せず、不足分のみを補うか
    it('既に一部区分が存在する場合は不足分のみを補い、既存レコードのidを保持する', () => {
      const first = usePersonnelPlanStore
        .getState()
        .getOrCreateAllCategories(divisionId, 2025)
      const properEntry = first.find((p) => p.category === 'personnel_internal')
      expect(properEntry).toBeDefined()

      // 手動で1件削除して再生成をシミュレート（3件のみの状態を作る）
      usePersonnelPlanStore.setState((state) => ({
        personnelPlans: state.personnelPlans.filter(
          (p) => p.category !== 'planned_external',
        ),
      }))

      const second = usePersonnelPlanStore
        .getState()
        .getOrCreateAllCategories(divisionId, 2025)
      expect(second).toHaveLength(4)
      const restoredProperEntry = second.find(
        (p) => p.category === 'personnel_internal',
      )
      // 既存レコードのidは変わらない（再生成されていない）
      expect(restoredProperEntry?.id).toBe(properEntry?.id)
    })

    // 反証: 4区分すべて既に存在する場合、DataAdapter.create()が不要に呼ばれないか
    it('4区分すべて既に存在する場合は再度create()を呼ばない', () => {
      usePersonnelPlanStore
        .getState()
        .getOrCreateAllCategories(divisionId, 2025)
      mockCreate.mockClear()

      usePersonnelPlanStore
        .getState()
        .getOrCreateAllCategories(divisionId, 2025)
      expect(mockCreate).not.toHaveBeenCalled()
    })

    // 反証: 異なる年度・異なる部門では独立して4区分が生成されるか（相互汚染しないか）
    it('異なる年度では別レコードとして4区分を生成する', () => {
      usePersonnelPlanStore
        .getState()
        .getOrCreateAllCategories(divisionId, 2025)
      const resultNextYear = usePersonnelPlanStore
        .getState()
        .getOrCreateAllCategories(divisionId, 2026)
      expect(resultNextYear).toHaveLength(4)
      expect(usePersonnelPlanStore.getState().personnelPlans).toHaveLength(8)
    })
  })

  describe('updatePersonnelPlanEntry', () => {
    it('monthlyHeadcount（予定人数）を更新できる', () => {
      const [entry] = usePersonnelPlanStore
        .getState()
        .getOrCreateAllCategories(divisionId, 2025)
      if (!entry) throw new Error('entry not found')

      usePersonnelPlanStore.getState().updatePersonnelPlanEntry({
        id: entry.id,
        monthlyHeadcount: { '2025-04': 2 },
      })
      const updated = usePersonnelPlanStore
        .getState()
        .personnelPlans.find((p) => p.id === entry.id)
      expect(updated?.monthlyHeadcount).toEqual({ '2025-04': 2 })
    })

    it('追加予定区分のmonthlyRealizedHeadcount（実現人数）を更新できる', () => {
      const entries = usePersonnelPlanStore
        .getState()
        .getOrCreateAllCategories(divisionId, 2025)
      const plannedEntry = entries.find(
        (p) => p.category === 'planned_internal',
      )
      if (!plannedEntry) throw new Error('entry not found')

      usePersonnelPlanStore.getState().updatePersonnelPlanEntry({
        id: plannedEntry.id,
        monthlyRealizedHeadcount: { '2025-05': 1 },
      })
      const updated = usePersonnelPlanStore
        .getState()
        .personnelPlans.find((p) => p.id === plannedEntry.id)
      expect(updated?.monthlyRealizedHeadcount).toEqual({ '2025-05': 1 })
    })

    it('更新してもcategoryは他区分のレコードを巻き込まない', () => {
      const entries = usePersonnelPlanStore
        .getState()
        .getOrCreateAllCategories(divisionId, 2025)
      const target = entries.find((p) => p.category === 'personnel_internal')
      const other = entries.find((p) => p.category === 'personnel_external')
      if (!target || !other) throw new Error('entry not found')

      usePersonnelPlanStore.getState().updatePersonnelPlanEntry({
        id: target.id,
        monthlyHeadcount: { '2025-04': 5 },
      })
      const otherAfter = usePersonnelPlanStore
        .getState()
        .personnelPlans.find((p) => p.id === other.id)
      expect(otherAfter?.monthlyHeadcount).toEqual({})
    })
  })

  describe('Selectors', () => {
    it('getPersonnelPlansByDivisionで部門×年度の4区分を取得できる', () => {
      usePersonnelPlanStore
        .getState()
        .getOrCreateAllCategories(divisionId, 2025)
      usePersonnelPlanStore
        .getState()
        .getOrCreateAllCategories(divisionId, 2026)
      const result = usePersonnelPlanStore
        .getState()
        .getPersonnelPlansByDivision(divisionId, 2025)
      expect(result).toHaveLength(4)
    })

    it('getPersonnelPlanByCategoryで区分を指定して1件取得できる', () => {
      usePersonnelPlanStore
        .getState()
        .getOrCreateAllCategories(divisionId, 2025)
      const result = usePersonnelPlanStore
        .getState()
        .getPersonnelPlanByCategory(divisionId, 2025, 'planned_external')
      expect(result?.category).toBe('planned_external')
    })

    it('getPersonnelPlanByCategoryは存在しない場合undefinedを返す', () => {
      const result = usePersonnelPlanStore
        .getState()
        .getPersonnelPlanByCategory(divisionId, 2025, 'planned_external')
      expect(result).toBeUndefined()
    })
  })

  describe('getActiveHeadcountForCategory（実績人数）', () => {
    const sectionId = crypto.randomUUID()

    beforeEach(() => {
      useTeamStore.setState({
        divisions: [],
        sections: [
          {
            id: sectionId,
            divisionId,
            name: '第1課',
            sortOrder: 0,
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
      })
    })

    it('人件費（プロパー）区分は部門所属の在籍メンバーから自動算出する', () => {
      useMembersStore.setState({
        members: [
          createTestMember({
            sectionId,
            startDate: '2025-04-01',
            companyId: null,
          }),
        ],
      })
      const result = usePersonnelPlanStore
        .getState()
        .getActiveHeadcountForCategory(
          divisionId,
          2025,
          'personnel_internal',
          4,
        )
      expect(result['2025-04']).toBe(1)
    })

    it('人件費（プロパー以外）区分はプロパー以外の在籍メンバーのみ集計する', () => {
      const company = useCompaniesStore.getState().addCompany('協力会社', false)
      useMembersStore.setState({
        members: [
          createTestMember({
            sectionId,
            startDate: '2025-04-01',
            companyId: company.id,
          }),
          createTestMember({
            sectionId,
            startDate: '2025-04-01',
            companyId: null,
          }),
        ],
      })
      const result = usePersonnelPlanStore
        .getState()
        .getActiveHeadcountForCategory(
          divisionId,
          2025,
          'personnel_external',
          4,
        )
      expect(result['2025-04']).toBe(1)
    })

    // 反証: 他部門（別課）のメンバーが誤って集計に混入しないか
    it('他部門のメンバーは人件費区分の実績人数に含まれない', () => {
      const otherSectionId = crypto.randomUUID()
      useTeamStore.setState((state) => ({
        sections: [
          ...state.sections,
          {
            id: otherSectionId,
            divisionId: crypto.randomUUID(),
            name: '他部門課',
            sortOrder: 1,
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
      }))
      useMembersStore.setState({
        members: [
          createTestMember({
            sectionId: otherSectionId,
            startDate: '2025-04-01',
            companyId: null,
          }),
        ],
      })
      const result = usePersonnelPlanStore
        .getState()
        .getActiveHeadcountForCategory(
          divisionId,
          2025,
          'personnel_internal',
          4,
        )
      expect(result['2025-04']).toBeUndefined()
    })

    it('追加予定区分は手入力されたmonthlyRealizedHeadcountをそのまま返す', () => {
      const entries = usePersonnelPlanStore
        .getState()
        .getOrCreateAllCategories(divisionId, 2025)
      const plannedEntry = entries.find(
        (p) => p.category === 'planned_internal',
      )
      if (!plannedEntry) throw new Error('entry not found')
      usePersonnelPlanStore.getState().updatePersonnelPlanEntry({
        id: plannedEntry.id,
        monthlyRealizedHeadcount: { '2025-06': 2 },
      })

      const result = usePersonnelPlanStore
        .getState()
        .getActiveHeadcountForCategory(divisionId, 2025, 'planned_internal', 4)
      expect(result).toEqual({ '2025-06': 2 })
    })

    it('追加予定区分のレコードが未生成の場合は空オブジェクトを返す', () => {
      const result = usePersonnelPlanStore
        .getState()
        .getActiveHeadcountForCategory(divisionId, 2025, 'planned_internal', 4)
      expect(result).toEqual({})
    })
  })

  describe('getRevenueBudgetForCategory（実績金額）', () => {
    const sectionId = crypto.randomUUID()

    beforeEach(() => {
      useTeamStore.setState({
        divisions: [],
        sections: [
          {
            id: sectionId,
            divisionId,
            name: '第1課',
            sortOrder: 0,
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
      })
    })

    it('人件費区分はアサイン率で按分せず単価全額を計上する', () => {
      useMembersStore.setState({
        members: [
          createTestMember({
            sectionId,
            startDate: '2025-04-01',
            companyId: null,
            unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
          }),
        ],
      })
      const result = usePersonnelPlanStore
        .getState()
        .getRevenueBudgetForCategory(divisionId, 2025, 'personnel_internal', 4)
      expect(result['2025-04']).toBe(100)
    })

    // 反証: 追加予定区分には実績金額の概念がない（メンバー未在籍のため単価情報がない）ことを確認する
    it('追加予定区分は常に空オブジェクトを返す', () => {
      useMembersStore.setState({
        members: [
          createTestMember({
            sectionId,
            startDate: '2025-04-01',
            companyId: null,
            unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
          }),
        ],
      })
      const result = usePersonnelPlanStore
        .getState()
        .getRevenueBudgetForCategory(divisionId, 2025, 'planned_internal', 4)
      expect(result).toEqual({})
    })
  })

  describe('loadPersonnelPlans', () => {
    it('DataAdapterから人員計画を読み込める', async () => {
      const planId = crypto.randomUUID()
      mockList.mockResolvedValueOnce([
        {
          id: planId,
          divisionId,
          fiscalYear: 2025,
          category: 'personnel_internal',
          monthlyHeadcount: { '2025-04': 1 },
          monthlyRealizedHeadcount: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])

      usePersonnelPlanStore.getState().loadPersonnelPlans()
      await flushMicrotasks()
      expect(usePersonnelPlanStore.getState().personnelPlans).toHaveLength(1)
    })

    it('読み込みが空配列の場合は空配列になる', async () => {
      mockList.mockResolvedValueOnce([])
      usePersonnelPlanStore.getState().loadPersonnelPlans()
      await flushMicrotasks()
      expect(usePersonnelPlanStore.getState().personnelPlans).toEqual([])
    })

    it('読み込みがDataAdapterで失敗した場合はトースト表示される', async () => {
      mockList.mockRejectedValueOnce(new Error('network error'))
      usePersonnelPlanStore.getState().loadPersonnelPlans()
      await flushMicrotasks()
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })
  })
})
