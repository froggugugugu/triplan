import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Member } from '@/shared/types'
import { useMembersStore } from '@/stores/members-store'

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

describe('useMembersStore', () => {
  beforeEach(async () => {
    useMembersStore.setState({ members: [] })
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
    mockCreate.mockImplementation(
      async (
        _entity: string,
        data: Omit<Member, 'id'>,
        options?: { id?: string },
      ) => ({
        ...data,
        id: options?.id ?? crypto.randomUUID(),
      }),
    )
    mockUpdate.mockImplementation(
      async (_entity: string, id: string, patch: Partial<Member>) => ({
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

  describe('addMember', () => {
    it('メンバーを追加できる（id, createdAt, updatedAt 自動生成）', () => {
      const member = useMembersStore.getState().addMember({
        name: '田中太郎',
        sectionId: null,
        role: 'エンジニア',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
      })

      expect(member.id).toBeDefined()
      expect(member.name).toBe('田中太郎')
      expect(member.role).toBe('エンジニア')
      expect(member.isActive).toBe(true)
      expect(member.createdAt).toBeDefined()
      expect(member.updatedAt).toBeDefined()
      expect(useMembersStore.getState().members).toHaveLength(1)
    })

    it('sectionId付きで追加できる', () => {
      const sectionId = crypto.randomUUID()
      const member = useMembersStore.getState().addMember({
        name: '佐藤一郎',
        sectionId,
        role: 'デザイナー',
        isActive: true,
        startDate: '2025-04-01',
        endDate: null,
        unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 80 }],
      })

      expect(member.sectionId).toBe(sectionId)
      expect(member.startDate).toBe('2025-04-01')
      expect(member.unitPriceHistory).toHaveLength(1)
    })

    it('DataAdapter.create()が呼ばれ、idは確定後も安定している', async () => {
      const member = useMembersStore.getState().addMember({
        name: '山田次郎',
        sectionId: null,
        role: 'エンジニア',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
      })

      expect(mockCreate).toHaveBeenCalledWith(
        'members',
        expect.objectContaining({ name: '山田次郎' }),
        { id: member.id },
      )
      await flushMicrotasks()
      expect(useMembersStore.getState().members[0]?.id).toBe(member.id)
    })

    it('追加がDataAdapterで失敗した場合はロールバックされる', async () => {
      mockCreate.mockRejectedValueOnce(new Error('network error'))
      useMembersStore.getState().addMember({
        name: '山田次郎',
        sectionId: null,
        role: 'エンジニア',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
      })
      await flushMicrotasks()
      expect(useMembersStore.getState().members).toHaveLength(0)
    })
  })

  describe('updateMember', () => {
    it('メンバー情報を更新できる', () => {
      const member = useMembersStore.getState().addMember({
        name: '田中太郎',
        sectionId: null,
        role: 'エンジニア',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
      })

      useMembersStore.getState().updateMember({
        id: member.id,
        name: '田中太郎（更新後）',
        role: 'テックリード',
      })

      const updated = useMembersStore.getState().getMemberById(member.id)
      expect(updated?.name).toBe('田中太郎（更新後）')
      expect(updated?.role).toBe('テックリード')
    })

    it('updatedAtが更新される', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'))

      const member = useMembersStore.getState().addMember({
        name: '田中太郎',
        sectionId: null,
        role: 'エンジニア',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
      })

      expect(member.updatedAt).toBe('2025-01-01T00:00:00.000Z')

      // 時刻を進めて更新
      vi.setSystemTime(new Date('2025-06-15T12:00:00.000Z'))

      useMembersStore.getState().updateMember({
        id: member.id,
        name: '田中太郎（更新後）',
      })

      const updated = useMembersStore.getState().getMemberById(member.id)
      expect(updated?.updatedAt).toBe('2025-06-15T12:00:00.000Z')

      vi.useRealTimers()
    })

    it('他のメンバーに影響しない', () => {
      const member1 = useMembersStore.getState().addMember({
        name: '田中太郎',
        sectionId: null,
        role: 'エンジニア',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
      })

      const member2 = useMembersStore.getState().addMember({
        name: '鈴木花子',
        sectionId: null,
        role: 'PM',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
      })

      useMembersStore.getState().updateMember({
        id: member1.id,
        name: '田中太郎（更新後）',
      })

      const unchanged = useMembersStore.getState().getMemberById(member2.id)
      expect(unchanged?.name).toBe('鈴木花子')
      expect(unchanged?.role).toBe('PM')
    })

    it('更新がDataAdapterで失敗した場合はロールバックされる', async () => {
      const member = useMembersStore.getState().addMember({
        name: '田中太郎',
        sectionId: null,
        role: 'エンジニア',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
      })
      mockUpdate.mockRejectedValueOnce(new Error('network error'))
      useMembersStore
        .getState()
        .updateMember({ id: member.id, name: '田中太郎（更新後）' })
      expect(useMembersStore.getState().getMemberById(member.id)?.name).toBe(
        '田中太郎（更新後）',
      )
      await flushMicrotasks()
      expect(useMembersStore.getState().getMemberById(member.id)?.name).toBe(
        '田中太郎',
      )
    })
  })

  describe('deleteMember', () => {
    it('メンバーを削除できる', () => {
      const member = useMembersStore.getState().addMember({
        name: '田中太郎',
        sectionId: null,
        role: 'エンジニア',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
      })

      expect(useMembersStore.getState().members).toHaveLength(1)

      useMembersStore.getState().deleteMember(member.id)
      expect(useMembersStore.getState().members).toHaveLength(0)
    })

    it('存在しないIDで削除してもエラーにならない', () => {
      useMembersStore.getState().addMember({
        name: '田中太郎',
        sectionId: null,
        role: 'エンジニア',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
      })

      expect(() => {
        useMembersStore.getState().deleteMember('nonexistent-id')
      }).not.toThrow()

      expect(useMembersStore.getState().members).toHaveLength(1)
    })

    it('削除がDataAdapterで失敗した場合はロールバックされる', async () => {
      const member = useMembersStore.getState().addMember({
        name: '田中太郎',
        sectionId: null,
        role: 'エンジニア',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
      })
      mockRemove.mockRejectedValueOnce(new Error('network error'))
      useMembersStore.getState().deleteMember(member.id)
      expect(useMembersStore.getState().members).toHaveLength(0)
      await flushMicrotasks()
      expect(useMembersStore.getState().members).toHaveLength(1)
    })
  })

  describe('loadMembers', () => {
    it('DataAdapterからメンバーを読み込める', async () => {
      const memberId = crypto.randomUUID()
      mockList.mockResolvedValueOnce([
        {
          id: memberId,
          name: '田中太郎',
          sectionId: null,
          role: 'エンジニア',
          isActive: true,
          startDate: null,
          endDate: null,
          unitPriceHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])

      useMembersStore.getState().loadMembers()
      await flushMicrotasks()
      expect(useMembersStore.getState().members).toHaveLength(1)
      expect(useMembersStore.getState().members[0]?.name).toBe('田中太郎')
    })

    it('読み込みがDataAdapterで失敗した場合はトースト表示される', async () => {
      mockList.mockRejectedValueOnce(new Error('network error'))
      useMembersStore.getState().loadMembers()
      await flushMicrotasks()
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })
  })

  describe('selectors', () => {
    const baseMember = {
      role: 'エンジニア',
      isActive: true,
      sectionId: null,
      startDate: null,
      endDate: null,
      unitPriceHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    it('getMemberByIdでメンバーを取得できる', () => {
      useMembersStore.setState({
        members: [
          { ...baseMember, id: 'm1', name: '田中太郎' },
          { ...baseMember, id: 'm2', name: '鈴木花子' },
        ],
      })

      const member = useMembersStore.getState().getMemberById('m1')
      expect(member?.name).toBe('田中太郎')
    })

    it('getMemberByIdで存在しないIDはundefinedを返す', () => {
      useMembersStore.setState({
        members: [{ ...baseMember, id: 'm1', name: '田中太郎' }],
      })

      const member = useMembersStore.getState().getMemberById('nonexistent')
      expect(member).toBeUndefined()
    })

    it('getActiveMembersでアクティブなメンバーのみ取得できる', () => {
      useMembersStore.setState({
        members: [
          { ...baseMember, id: 'm1', name: '田中太郎', isActive: true },
          { ...baseMember, id: 'm2', name: '鈴木花子', isActive: false },
          { ...baseMember, id: 'm3', name: '佐藤一郎', isActive: true },
        ],
      })

      const activeMembers = useMembersStore.getState().getActiveMembers()
      expect(activeMembers).toHaveLength(2)
      expect(activeMembers.map((m) => m.name)).toEqual(['田中太郎', '佐藤一郎'])
    })

    it('getRolesでユニークな役割一覧を取得できる', () => {
      useMembersStore.setState({
        members: [
          { ...baseMember, id: 'm1', name: '田中太郎', role: 'エンジニア' },
          { ...baseMember, id: 'm2', name: '鈴木花子', role: 'PM' },
          { ...baseMember, id: 'm3', name: '佐藤一郎', role: 'エンジニア' },
          { ...baseMember, id: 'm4', name: '山田次郎', role: 'デザイナー' },
        ],
      })

      const roles = useMembersStore.getState().getRoles()
      expect(roles).toEqual(['PM', 'エンジニア', 'デザイナー'])
    })

    it('getRolesで空のroleは除外される', () => {
      useMembersStore.setState({
        members: [
          { ...baseMember, id: 'm1', name: '田中太郎', role: 'エンジニア' },
          { ...baseMember, id: 'm2', name: '鈴木花子', role: '' },
        ],
      })

      const roles = useMembersStore.getState().getRoles()
      expect(roles).toEqual(['エンジニア'])
    })

    it('メンバーが0人のときgetActiveMembersは空配列を返す', () => {
      const activeMembers = useMembersStore.getState().getActiveMembers()
      expect(activeMembers).toEqual([])
    })

    it('メンバーが0人のときgetRolesは空配列を返す', () => {
      const roles = useMembersStore.getState().getRoles()
      expect(roles).toEqual([])
    })
  })
})
