import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Company } from '@/shared/types/company'
import { useCompaniesStore } from '@/stores/companies-store'
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

// members-store（未変換）は依然としてjsonStorageへ直接書き込むため、
// deleteCompanyのカスケード先で実際のZod検証・localStorage書き込みが走らないようにする
vi.mock('@/infrastructure/storage', () => ({
  jsonStorage: {
    load: vi.fn(() => ({
      version: '1.0.0',
      fiscalYear: 2025,
      projects: [],
      members: [],
      metadata: {
        lastModified: new Date().toISOString(),
        createdBy: 'test',
        version: '1.0.0',
      },
    })),
    save: vi.fn(),
  },
}))

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('useCompaniesStore', () => {
  beforeEach(async () => {
    useCompaniesStore.setState({ companies: [] })
    useMembersStore.setState({ members: [] })
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
    mockCreate.mockImplementation(
      async (
        _entity: string,
        data: Omit<Company, 'id'>,
        options?: { id?: string },
      ) => ({
        ...data,
        id: options?.id ?? crypto.randomUUID(),
      }),
    )
    mockUpdate.mockImplementation(
      async (_entity: string, id: string, patch: Partial<Company>) => ({
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

  describe('Company CRUD', () => {
    it('所属会社を追加できる（楽観的に即座へ反映される）', () => {
      const company = useCompaniesStore.getState().addCompany('株式会社A')
      expect(company.name).toBe('株式会社A')
      expect(company.id).toBeDefined()
      expect(company.sortOrder).toBe(0)
      expect(useCompaniesStore.getState().companies).toHaveLength(1)
      expect(mockCreate).toHaveBeenCalledWith(
        'companies',
        {
          name: '株式会社A',
          sortOrder: 0,
          isInternal: false,
          invoiceRegistrationNumber: null,
          paymentTerms: null,
          createdAt: company.createdAt,
          updatedAt: company.updatedAt,
        },
        { id: company.id },
      )
    })

    it('追加時にsortOrderが自動設定される', () => {
      useCompaniesStore.getState().addCompany('株式会社A')
      const second = useCompaniesStore.getState().addCompany('株式会社B')
      expect(second.sortOrder).toBe(1)
    })

    it('DataAdapter確定後もidは変わらず安定している', async () => {
      const company = useCompaniesStore.getState().addCompany('株式会社A')
      await flushMicrotasks()
      const companies = useCompaniesStore.getState().companies
      expect(companies).toHaveLength(1)
      // create()にoptions.idでクライアント生成idを渡すため、確定後も
      // 楽観的に生成した仮idと同じidのまま保たれる（戻り値idの連鎖利用が安全に成立する）
      expect(companies[0]?.name).toBe('株式会社A')
      expect(companies[0]?.id).toBe(company.id)
    })

    it('追加がDataAdapterで失敗した場合はロールバックされ、トースト表示される', async () => {
      mockCreate.mockRejectedValueOnce(new Error('network error'))
      useCompaniesStore.getState().addCompany('株式会社A')
      await flushMicrotasks()
      expect(useCompaniesStore.getState().companies).toHaveLength(0)
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })

    it('所属会社名を更新できる', () => {
      const company = useCompaniesStore.getState().addCompany('株式会社A')
      useCompaniesStore.getState().updateCompany(company.id, '株式会社A2')
      const updated = useCompaniesStore
        .getState()
        .companies.find((c) => c.id === company.id)
      expect(updated?.name).toBe('株式会社A2')
    })

    it('isInternalを指定して追加できる（デフォルトはfalse）', () => {
      const proper = useCompaniesStore.getState().addCompany('自社', true)
      const partner = useCompaniesStore.getState().addCompany('協力会社')
      expect(proper.isInternal).toBe(true)
      expect(partner.isInternal).toBe(false)
    })

    it('isInternalを更新できる', () => {
      const company = useCompaniesStore.getState().addCompany('株式会社A')
      useCompaniesStore.getState().updateCompany(company.id, '株式会社A', true)
      const updated = useCompaniesStore
        .getState()
        .companies.find((c) => c.id === company.id)
      expect(updated?.isInternal).toBe(true)
    })

    it('isInternalを省略して更新した場合は既存値が保持される', () => {
      const company = useCompaniesStore.getState().addCompany('株式会社A', true)
      useCompaniesStore.getState().updateCompany(company.id, '株式会社A2')
      const updated = useCompaniesStore
        .getState()
        .companies.find((c) => c.id === company.id)
      expect(updated?.isInternal).toBe(true)
      // updateへ渡すpatchにisInternalキー自体が含まれないことも確認する
      // （キーがundefined値で含まれるとLocalJsonAdapter側のスプレッドで既存値が消える）
      const lastCall = mockUpdate.mock.calls.at(-1)
      expect(lastCall?.[2]).not.toHaveProperty('isInternal')
    })

    it('更新がDataAdapterで失敗した場合はロールバックされる', async () => {
      const company = useCompaniesStore.getState().addCompany('株式会社A')
      mockUpdate.mockRejectedValueOnce(new Error('network error'))
      useCompaniesStore.getState().updateCompany(company.id, '株式会社A2')
      // 楽観的更新は即座に反映される
      expect(
        useCompaniesStore.getState().companies.find((c) => c.id === company.id)
          ?.name,
      ).toBe('株式会社A2')
      await flushMicrotasks()
      // 失敗後は元の名称へロールバックされる
      expect(
        useCompaniesStore.getState().companies.find((c) => c.id === company.id)
          ?.name,
      ).toBe('株式会社A')
    })

    it('楽観ロック: 画面が見ていた版のupdatedAtを期待値として送る', () => {
      const company = useCompaniesStore.getState().addCompany('株式会社A')
      useCompaniesStore.getState().updateCompany(company.id, '株式会社A2')
      const lastCall = mockUpdate.mock.calls.at(-1)
      expect(lastCall?.[3]).toEqual({ expectedUpdatedAt: company.updatedAt })
    })

    it('反証: 競合（412）はロールバックしたうえで専用の文言で通知する', async () => {
      const { ApiError } = await import(
        '@/infrastructure/adapters/authenticated-fetch'
      )
      const { toast } = await import('@/shared/hooks/use-toast')
      const company = useCompaniesStore.getState().addCompany('株式会社A')
      vi.mocked(toast).mockClear()
      mockUpdate.mockRejectedValueOnce(new ApiError('conflict', 412))

      useCompaniesStore.getState().updateCompany(company.id, '株式会社A2')
      await flushMicrotasks()

      // 他者の変更を消さないよう、自分の変更は取り消される
      expect(
        useCompaniesStore.getState().companies.find((c) => c.id === company.id)
          ?.name,
      ).toBe('株式会社A')
      // 「保存に失敗」ではなく再読込を促す（競合は障害ではなく並行編集の結果）
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '他のユーザーが先に更新しました',
          description: expect.stringContaining('再読み込み'),
          variant: 'destructive',
        }),
      )
    })

    /**
     * 楽観ロックの回帰テスト（PR #12 のセルフレビューMUST-1）。
     *
     * サーバーは`updatedAt`を**サーバー時計**で上書きする。クライアントが
     * 楽観的更新で入れた`now`をローカルに残したままにすると、次の更新で送る
     * 期待値が保存値と食い違い、**単独ユーザーでも2回目の編集が必ず412になる**。
     */
    it('反証: 同じレコードを連続で2回更新できる（2回目の期待値はサーバー確定値）', async () => {
      const SERVER_TIME = '2099-01-01T00:00:00.000Z'
      // サーバーは自分の時計でupdatedAtを確定して返す
      mockUpdate.mockImplementation(
        async (_entity: string, id: string, patch: Partial<Company>) => ({
          id,
          ...patch,
          updatedAt: SERVER_TIME,
        }),
      )
      const company = useCompaniesStore.getState().addCompany('株式会社A')
      await flushMicrotasks()

      useCompaniesStore.getState().updateCompany(company.id, '1回目')
      await flushMicrotasks()

      // ローカルstateにサーバー確定値が反映されていること
      expect(
        useCompaniesStore.getState().companies.find((c) => c.id === company.id)
          ?.updatedAt,
      ).toBe(SERVER_TIME)

      mockUpdate.mockClear()
      useCompaniesStore.getState().updateCompany(company.id, '2回目')
      await flushMicrotasks()

      // 2回目が送る期待値がサーバー保存値と一致する（＝412にならない）
      expect(mockUpdate.mock.calls.at(-1)?.[3]).toEqual({
        expectedUpdatedAt: SERVER_TIME,
      })
      expect(
        useCompaniesStore.getState().companies.find((c) => c.id === company.id)
          ?.name,
      ).toBe('2回目')
    })

    it('反証: 競合以外の失敗は従来どおりの文言で通知する（原因を覆い隠さない）', async () => {
      const { toast } = await import('@/shared/hooks/use-toast')
      const company = useCompaniesStore.getState().addCompany('株式会社A')
      vi.mocked(toast).mockClear()
      mockUpdate.mockRejectedValueOnce(new Error('network error'))

      useCompaniesStore.getState().updateCompany(company.id, '株式会社A2')
      await flushMicrotasks()

      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '所属会社の更新に失敗しました',
          description: 'network error',
        }),
      )
    })

    it('所属会社を削除できる', () => {
      const company = useCompaniesStore.getState().addCompany('株式会社A')
      useCompaniesStore.getState().deleteCompany(company.id)
      expect(useCompaniesStore.getState().companies).toHaveLength(0)
    })

    it('削除がDataAdapterで失敗した場合はロールバックされる', async () => {
      const company = useCompaniesStore.getState().addCompany('株式会社A')
      mockRemove.mockRejectedValueOnce(new Error('network error'))
      useCompaniesStore.getState().deleteCompany(company.id)
      expect(useCompaniesStore.getState().companies).toHaveLength(0)
      await flushMicrotasks()
      expect(useCompaniesStore.getState().companies).toHaveLength(1)
    })

    it('所属会社削除時に所属メンバーのcompanyIdがnullになり、契約単価履歴は保持される', () => {
      const company = useCompaniesStore.getState().addCompany('株式会社A')

      useMembersStore.setState({
        members: [
          {
            id: 'm1',
            name: '田中太郎',
            sectionId: null,
            companyId: company.id,
            role: 'エンジニア',
            isActive: true,
            startDate: null,
            endDate: null,
            unitPriceHistory: [],
            contractUnitPriceHistory: [
              { effectiveFrom: '2025-04', amount: 70 },
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      })

      useCompaniesStore.getState().deleteCompany(company.id)

      const member = useMembersStore.getState().members[0]
      expect(member?.companyId).toBeNull()
      expect(member?.contractUnitPriceHistory).toEqual([
        { effectiveFrom: '2025-04', amount: 70 },
      ])
    })
  })

  describe('Selectors', () => {
    it('getCompanyByIdで所属会社を取得できる', () => {
      const company = useCompaniesStore.getState().addCompany('株式会社A')
      const found = useCompaniesStore.getState().getCompanyById(company.id)
      expect(found?.name).toBe('株式会社A')
    })

    it('getCompanyByIdで存在しないIDはundefinedを返す', () => {
      const found = useCompaniesStore.getState().getCompanyById('nonexistent')
      expect(found).toBeUndefined()
    })
  })

  describe('loadCompanies', () => {
    it('DataAdapterから所属会社を読み込める', async () => {
      const companyId = crypto.randomUUID()
      mockList.mockResolvedValueOnce([
        {
          id: companyId,
          name: '株式会社A',
          sortOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])

      useCompaniesStore.getState().loadCompanies()
      await flushMicrotasks()
      expect(useCompaniesStore.getState().companies).toHaveLength(1)
      expect(useCompaniesStore.getState().companies[0]?.name).toBe('株式会社A')
    })

    it('読み込みが空配列の場合は空配列になる', async () => {
      mockList.mockResolvedValueOnce([])
      useCompaniesStore.getState().loadCompanies()
      await flushMicrotasks()
      expect(useCompaniesStore.getState().companies).toEqual([])
    })

    it('読み込みがDataAdapterで失敗した場合はトースト表示される', async () => {
      mockList.mockRejectedValueOnce(new Error('network error'))
      useCompaniesStore.getState().loadCompanies()
      await flushMicrotasks()
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })
  })
})
