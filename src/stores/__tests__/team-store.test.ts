import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMembersStore } from '@/stores/members-store'
import { useTeamStore } from '@/stores/team-store'

const mockList = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockRemove = vi.fn()

const { MockApiError } = vi.hoisted(() => ({
  MockApiError: class MockApiError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
}))

vi.mock('@/infrastructure/adapters', () => ({
  getDataAdapter: () => ({
    list: mockList,
    create: mockCreate,
    update: mockUpdate,
    remove: mockRemove,
  }),
  ApiError: MockApiError,
}))

vi.mock('@/shared/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('useTeamStore', () => {
  beforeEach(async () => {
    useTeamStore.setState({ divisions: [], sections: [] })
    useMembersStore.setState({ members: [] })
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
    mockUpdate.mockImplementation(
      async (_entity: string, id: string, patch: Record<string, unknown>) => ({
        id,
        ...patch,
      }),
    )
    mockRemove.mockResolvedValue(undefined)
    const { toast } = await import('@/shared/hooks/use-toast')
    vi.mocked(toast).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Division CRUD', () => {
    it('部門を追加できる', () => {
      const division = useTeamStore.getState().addDivision('開発本部')
      expect(division.name).toBe('開発本部')
      expect(division.id).toBeDefined()
      expect(division.sortOrder).toBe(0)
      expect(useTeamStore.getState().divisions).toHaveLength(1)
    })

    it('部門追加時にsortOrderが自動設定される', () => {
      useTeamStore.getState().addDivision('開発本部')
      const second = useTeamStore.getState().addDivision('営業本部')
      expect(second.sortOrder).toBe(1)
    })

    it('DataAdapter確定後もidは変わらず安定している', async () => {
      const division = useTeamStore.getState().addDivision('開発本部')
      await flushMicrotasks()
      expect(useTeamStore.getState().divisions[0]?.id).toBe(division.id)
    })

    it('部門追加がDataAdapterで失敗した場合はロールバックされる', async () => {
      mockCreate.mockRejectedValueOnce(new Error('network error'))
      useTeamStore.getState().addDivision('開発本部')
      await flushMicrotasks()
      expect(useTeamStore.getState().divisions).toHaveLength(0)
    })

    it('部門名を更新できる', () => {
      const division = useTeamStore.getState().addDivision('開発本部')
      useTeamStore.getState().updateDivision(division.id, 'テクノロジー本部')
      const updated = useTeamStore
        .getState()
        .divisions.find((d) => d.id === division.id)
      expect(updated?.name).toBe('テクノロジー本部')
    })

    it('部門を削除できる', () => {
      const division = useTeamStore.getState().addDivision('開発本部')
      useTeamStore.getState().deleteDivision(division.id)
      expect(useTeamStore.getState().divisions).toHaveLength(0)
    })

    it('部門削除時に子課も削除される', () => {
      const division = useTeamStore.getState().addDivision('開発本部')
      useTeamStore.getState().addSection(division.id, '第1課')
      useTeamStore.getState().addSection(division.id, '第2課')
      expect(useTeamStore.getState().sections).toHaveLength(2)

      useTeamStore.getState().deleteDivision(division.id)
      expect(useTeamStore.getState().sections).toHaveLength(0)
    })

    // 反証: postgresモードのON DELETE CASCADE（sections.divisionId→divisions.id）により、
    // 部門削除が先に処理されると子課の個別remove()が404になりうる（Promise.allは処理順序を
    // 保証しない、実Postgresで反証・確認済みのprojects-store.tsと同型のバグ）。このケースは
    // 「対象が既に存在しない」＝削除の目的を満たしているためロールバックしない
    it('反証: 子課のremove()が404で失敗してもロールバックしない（部門のcascadeで既に削除済み扱い）', async () => {
      const division = useTeamStore.getState().addDivision('開発本部')
      useTeamStore.getState().addSection(division.id, '第1課')
      await flushMicrotasks()
      mockRemove.mockImplementation(async () => {
        throw new MockApiError('対象が見つかりません', 404)
      })

      useTeamStore.getState().deleteDivision(division.id)
      expect(useTeamStore.getState().divisions).toHaveLength(0)
      expect(useTeamStore.getState().sections).toHaveLength(0)
      await flushMicrotasks()
      expect(useTeamStore.getState().divisions).toHaveLength(0)
      expect(useTeamStore.getState().sections).toHaveLength(0)
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(toast).not.toHaveBeenCalled()
    })

    it('部門削除がDataAdapterで失敗した場合は部門・課ともロールバックされる', async () => {
      const division = useTeamStore.getState().addDivision('開発本部')
      useTeamStore.getState().addSection(division.id, '第1課')
      mockRemove.mockRejectedValueOnce(new Error('network error'))
      useTeamStore.getState().deleteDivision(division.id)
      expect(useTeamStore.getState().divisions).toHaveLength(0)
      expect(useTeamStore.getState().sections).toHaveLength(0)
      await flushMicrotasks()
      expect(useTeamStore.getState().divisions).toHaveLength(1)
      expect(useTeamStore.getState().sections).toHaveLength(1)
    })

    it('部門削除時に所属メンバーのsectionIdがnullになる', () => {
      const division = useTeamStore.getState().addDivision('開発本部')
      const section = useTeamStore.getState().addSection(division.id, '第1課')

      // メンバーを追加
      useMembersStore.setState({
        members: [
          {
            id: 'm1',
            name: '田中太郎',
            sectionId: section.id,
            role: 'エンジニア',
            isActive: true,
            startDate: null,
            endDate: null,
            unitPriceHistory: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'm2',
            name: '鈴木花子',
            sectionId: null,
            role: 'PM',
            isActive: true,
            startDate: null,
            endDate: null,
            unitPriceHistory: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      })

      useTeamStore.getState().deleteDivision(division.id)

      const members = useMembersStore.getState().members
      expect(members[0]?.sectionId).toBeNull()
      expect(members[1]?.sectionId).toBeNull() // 元々null
    })
  })

  describe('Section CRUD', () => {
    it('課を追加できる', () => {
      const division = useTeamStore.getState().addDivision('開発本部')
      const section = useTeamStore.getState().addSection(division.id, '第1課')
      expect(section.name).toBe('第1課')
      expect(section.divisionId).toBe(division.id)
      expect(section.sortOrder).toBe(0)
      expect(useTeamStore.getState().sections).toHaveLength(1)
    })

    it('同一部門内の課追加時にsortOrderが自動設定される', () => {
      const division = useTeamStore.getState().addDivision('開発本部')
      useTeamStore.getState().addSection(division.id, '第1課')
      const second = useTeamStore.getState().addSection(division.id, '第2課')
      expect(second.sortOrder).toBe(1)
    })

    it('課名を更新できる', () => {
      const division = useTeamStore.getState().addDivision('開発本部')
      const section = useTeamStore.getState().addSection(division.id, '第1課')
      useTeamStore.getState().updateSection(section.id, 'Web開発課')
      const updated = useTeamStore
        .getState()
        .sections.find((s) => s.id === section.id)
      expect(updated?.name).toBe('Web開発課')
    })

    it('課を削除できる', () => {
      const division = useTeamStore.getState().addDivision('開発本部')
      const section = useTeamStore.getState().addSection(division.id, '第1課')
      useTeamStore.getState().deleteSection(section.id)
      expect(useTeamStore.getState().sections).toHaveLength(0)
    })

    it('課削除時に所属メンバーのsectionIdがnullになる', () => {
      const division = useTeamStore.getState().addDivision('開発本部')
      const section = useTeamStore.getState().addSection(division.id, '第1課')

      useMembersStore.setState({
        members: [
          {
            id: 'm1',
            name: '田中太郎',
            sectionId: section.id,
            role: 'エンジニア',
            isActive: true,
            startDate: null,
            endDate: null,
            unitPriceHistory: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      })

      useTeamStore.getState().deleteSection(section.id)
      expect(useMembersStore.getState().members[0]?.sectionId).toBeNull()
    })
  })

  describe('Selectors', () => {
    it('getSectionsByDivisionで部門の課一覧を取得できる', () => {
      const div1 = useTeamStore.getState().addDivision('開発本部')
      const div2 = useTeamStore.getState().addDivision('営業本部')
      useTeamStore.getState().addSection(div1.id, '第1課')
      useTeamStore.getState().addSection(div1.id, '第2課')
      useTeamStore.getState().addSection(div2.id, '営業1課')

      const sections = useTeamStore.getState().getSectionsByDivision(div1.id)
      expect(sections).toHaveLength(2)
      expect(sections.every((s) => s.divisionId === div1.id)).toBe(true)
    })

    it('getDivisionByIdで部門を取得できる', () => {
      const division = useTeamStore.getState().addDivision('開発本部')
      const found = useTeamStore.getState().getDivisionById(division.id)
      expect(found?.name).toBe('開発本部')
    })

    it('getDivisionByIdで存在しないIDはundefinedを返す', () => {
      const found = useTeamStore.getState().getDivisionById('nonexistent')
      expect(found).toBeUndefined()
    })

    it('getSectionByIdで課を取得できる', () => {
      const division = useTeamStore.getState().addDivision('開発本部')
      const section = useTeamStore.getState().addSection(division.id, '第1課')
      const found = useTeamStore.getState().getSectionById(section.id)
      expect(found?.name).toBe('第1課')
    })

    it('getSectionByIdで存在しないIDはundefinedを返す', () => {
      const found = useTeamStore.getState().getSectionById('nonexistent')
      expect(found).toBeUndefined()
    })
  })

  describe('members-store新セレクタ', () => {
    const baseMember = {
      role: 'エンジニア',
      isActive: true,
      unitPriceHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    it('getMembersBySectionで課のメンバー一覧を取得できる', () => {
      const sectionId = crypto.randomUUID()
      useMembersStore.setState({
        members: [
          {
            ...baseMember,
            id: 'm1',
            name: '田中太郎',
            sectionId,
            startDate: null,
            endDate: null,
          },
          {
            ...baseMember,
            id: 'm2',
            name: '鈴木花子',
            sectionId: crypto.randomUUID(),
            startDate: null,
            endDate: null,
          },
          {
            ...baseMember,
            id: 'm3',
            name: '佐藤一郎',
            sectionId,
            startDate: null,
            endDate: null,
          },
        ],
      })

      const members = useMembersStore.getState().getMembersBySection(sectionId)
      expect(members).toHaveLength(2)
      expect(members.map((m) => m.name)).toEqual(['田中太郎', '佐藤一郎'])
    })

    it('getUnaffiliatedMembersで未所属メンバーを取得できる', () => {
      useMembersStore.setState({
        members: [
          {
            ...baseMember,
            id: 'm1',
            name: '田中太郎',
            sectionId: crypto.randomUUID(),
            startDate: null,
            endDate: null,
          },
          {
            ...baseMember,
            id: 'm2',
            name: '山田次郎',
            sectionId: null,
            startDate: null,
            endDate: null,
          },
        ],
      })

      const unaffiliated = useMembersStore.getState().getUnaffiliatedMembers()
      expect(unaffiliated).toHaveLength(1)
      expect(unaffiliated[0]?.name).toBe('山田次郎')
    })

    it('getMembersActiveInFiscalYearでFY2025（4月始まり）の在籍メンバーを取得できる', () => {
      useMembersStore.setState({
        members: [
          {
            ...baseMember,
            id: 'a',
            name: 'メンバーA',
            sectionId: null,
            startDate: '2025-02-11',
            endDate: null,
          },
          {
            ...baseMember,
            id: 'b',
            name: 'メンバーB',
            sectionId: null,
            startDate: '2025-05-11',
            endDate: '2026-02-11',
          },
          {
            ...baseMember,
            id: 'c',
            name: 'メンバーC',
            sectionId: null,
            startDate: '2026-04-01',
            endDate: null,
          },
          {
            ...baseMember,
            id: 'd',
            name: 'メンバーD',
            sectionId: null,
            startDate: null,
            endDate: null,
          },
        ],
      })

      // FY2025 = 2025/04 - 2026/03
      const active = useMembersStore
        .getState()
        .getMembersActiveInFiscalYear(2025, 4)
      expect(active.map((m) => m.name).sort()).toEqual([
        'メンバーA',
        'メンバーB',
      ])
    })

    it('getMembersActiveInFiscalYearでFY2024の在籍メンバーを取得できる', () => {
      useMembersStore.setState({
        members: [
          {
            ...baseMember,
            id: 'a',
            name: 'メンバーA',
            sectionId: null,
            startDate: '2025-02-11',
            endDate: null,
          },
          {
            ...baseMember,
            id: 'b',
            name: 'メンバーB',
            sectionId: null,
            startDate: '2025-05-11',
            endDate: '2026-02-11',
          },
        ],
      })

      // FY2024 = 2024/04 - 2025/03
      const active = useMembersStore
        .getState()
        .getMembersActiveInFiscalYear(2024, 4)
      // メンバーA: startDate 2025-02 <= 2025-03 && endDate 9999 >= 2024-04 → true
      // メンバーB: startDate 2025-05 <= 2025-03 → false
      expect(active).toHaveLength(1)
      expect(active[0]?.name).toBe('メンバーA')
    })

    it('endDateが年度終了月と一致するメンバーも対象になる', () => {
      useMembersStore.setState({
        members: [
          {
            ...baseMember,
            id: 'a',
            name: 'メンバーA',
            sectionId: null,
            startDate: '2024-04-01',
            endDate: '2025-03-31',
          },
        ],
      })

      // FY2024 = 2024/04 - 2025/03
      const active = useMembersStore
        .getState()
        .getMembersActiveInFiscalYear(2024, 4)
      expect(active).toHaveLength(1)
    })
  })

  describe('loadTeam', () => {
    it('DataAdapterからデータを読み込める', async () => {
      const divisionId = crypto.randomUUID()
      const sectionId = crypto.randomUUID()
      mockList.mockImplementation(async (entity: string) => {
        if (entity === 'divisions') {
          return [
            {
              id: divisionId,
              name: '開発本部',
              sortOrder: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ]
        }
        if (entity === 'sections') {
          return [
            {
              id: sectionId,
              divisionId,
              name: '第1課',
              sortOrder: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ]
        }
        return []
      })

      useTeamStore.getState().loadTeam()
      await flushMicrotasks()
      expect(useTeamStore.getState().divisions).toHaveLength(1)
      expect(useTeamStore.getState().sections).toHaveLength(1)
    })
  })
})
