import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreateCsvMappingProfile } from '@/shared/types'
import { useCsvMappingStore } from '@/stores/csv-mapping-store'

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

const createData = (
  overrides: Partial<CreateCsvMappingProfile> = {},
): CreateCsvMappingProfile => ({
  name: '会計ソフト向け',
  sourceKey: 'billing',
  direction: 'export',
  columns: [
    { field: 'projectCode', header: 'コード', enabled: true, order: 0 },
  ],
  includeHeader: true,
  ...overrides,
})

describe('useCsvMappingStore', () => {
  beforeEach(() => {
    useCsvMappingStore.setState({ csvMappingProfiles: [] })
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
    mockCreate.mockImplementation(
      async (
        _entity: string,
        data: Record<string, unknown>,
        options?: { id?: string },
      ) => ({ ...data, id: options?.id ?? crypto.randomUUID() }),
    )
    mockUpdate.mockResolvedValue(undefined)
    mockRemove.mockResolvedValue(undefined)
  })

  it('addCsvMappingProfile: 楽観的更新の仮idがcreate確定後も変わらない（idの安定性）', async () => {
    const optimistic = useCsvMappingStore
      .getState()
      .addCsvMappingProfile(createData())
    expect(useCsvMappingStore.getState().csvMappingProfiles).toHaveLength(1)

    await flushMicrotasks()
    const [entity, , options] = mockCreate.mock.calls[0] as [
      string,
      unknown,
      { id?: string },
    ]
    expect(entity).toBe('csvMappingProfiles')
    expect(options.id).toBe(optimistic.id)
    expect(useCsvMappingStore.getState().csvMappingProfiles[0]?.id).toBe(
      optimistic.id,
    )
  })

  it('反証: create失敗時は楽観的追加がロールバックされる', async () => {
    mockCreate.mockRejectedValue(new Error('server down'))
    useCsvMappingStore.getState().addCsvMappingProfile(createData())
    await flushMicrotasks()
    expect(useCsvMappingStore.getState().csvMappingProfiles).toHaveLength(0)
  })

  it('updateCsvMappingProfile: 部分更新が反映され、失敗時はロールバックされる', async () => {
    const created = useCsvMappingStore
      .getState()
      .addCsvMappingProfile(createData())
    await flushMicrotasks()

    mockUpdate.mockRejectedValue(new Error('server down'))
    useCsvMappingStore
      .getState()
      .updateCsvMappingProfile(created.id, { name: '改名後' })
    expect(useCsvMappingStore.getState().csvMappingProfiles[0]?.name).toBe(
      '改名後',
    )
    await flushMicrotasks()
    expect(useCsvMappingStore.getState().csvMappingProfiles[0]?.name).toBe(
      '会計ソフト向け',
    )
  })

  it('deleteCsvMappingProfile: 失敗時はロールバックされる', async () => {
    const created = useCsvMappingStore
      .getState()
      .addCsvMappingProfile(createData())
    await flushMicrotasks()

    mockRemove.mockRejectedValue(new Error('server down'))
    useCsvMappingStore.getState().deleteCsvMappingProfile(created.id)
    expect(useCsvMappingStore.getState().csvMappingProfiles).toHaveLength(0)
    await flushMicrotasks()
    expect(useCsvMappingStore.getState().csvMappingProfiles).toHaveLength(1)
  })

  it('getProfilesForSource: sourceKeyとdirectionの両方で絞り込み、名前順で返す', async () => {
    const store = useCsvMappingStore.getState()
    store.addCsvMappingProfile(createData({ name: 'い社向け' }))
    store.addCsvMappingProfile(createData({ name: 'あ社向け' }))
    store.addCsvMappingProfile(
      createData({ name: '別ソース', sourceKey: 'partnerPayment' }),
    )
    store.addCsvMappingProfile(
      createData({ name: '取込側', direction: 'import' }),
    )
    await flushMicrotasks()

    const result = useCsvMappingStore
      .getState()
      .getProfilesForSource('billing', 'export')
    expect(result.map((p) => p.name)).toEqual(['あ社向け', 'い社向け'])
  })
})
