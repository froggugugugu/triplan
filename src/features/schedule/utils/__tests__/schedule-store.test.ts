import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

// Mock crypto.randomUUID
let uuidCounter = 0
vi.stubGlobal('crypto', {
  randomUUID: () => {
    uuidCounter++
    return `00000000-0000-0000-0000-${String(uuidCounter).padStart(12, '0')}`
  },
})

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('useScheduleStore', () => {
  beforeEach(async () => {
    uuidCounter = 0
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
    // Reset store by re-importing
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function getStore() {
    const { useScheduleStore } = await import('@/stores/schedule-store')
    return useScheduleStore
  }

  it('should load schedule entries and dependencies', async () => {
    const store = await getStore()
    store.getState().loadSchedule()
    await flushMicrotasks()
    expect(store.getState().entries).toEqual([])
    expect(store.getState().dependencies).toEqual([])
  })

  it('should upsert a new entry', async () => {
    const store = await getStore()
    const projectId = '11111111-1111-1111-1111-111111111111'

    store
      .getState()
      .upsertEntry(projectId, 'phase-1', '2025-04-01', '2025-06-30')

    const entries = store.getState().entries
    expect(entries).toHaveLength(1)
    expect(entries[0]?.projectId).toBe(projectId)
    expect(entries[0]?.phaseKey).toBe('phase-1')
    expect(entries[0]?.startDate).toBe('2025-04-01')
    expect(entries[0]?.endDate).toBe('2025-06-30')
  })

  it('DataAdapter確定後もidは変わらず安定している', async () => {
    const store = await getStore()
    const projectId = '11111111-1111-1111-1111-111111111111'
    store
      .getState()
      .upsertEntry(projectId, 'phase-1', '2025-04-01', '2025-06-30')
    const optimisticId = store.getState().entries[0]?.id
    await flushMicrotasks()
    expect(store.getState().entries[0]?.id).toBe(optimisticId)
  })

  it('should update an existing entry (update()が呼ばれる)', async () => {
    const store = await getStore()
    const projectId = '11111111-1111-1111-1111-111111111111'

    store
      .getState()
      .upsertEntry(projectId, 'phase-1', '2025-04-01', '2025-06-30')
    store
      .getState()
      .upsertEntry(projectId, 'phase-1', '2025-05-01', '2025-07-31')

    const entries = store.getState().entries
    expect(entries).toHaveLength(1)
    expect(entries[0]?.startDate).toBe('2025-05-01')
    expect(entries[0]?.endDate).toBe('2025-07-31')
    expect(mockUpdate).toHaveBeenCalledWith('scheduleEntries', entries[0]?.id, {
      startDate: '2025-05-01',
      endDate: '2025-07-31',
    })
  })

  it('should delete an entry', async () => {
    const store = await getStore()
    const projectId = '11111111-1111-1111-1111-111111111111'

    store
      .getState()
      .upsertEntry(projectId, 'phase-1', '2025-04-01', '2025-06-30')
    store.getState().deleteEntry(projectId, 'phase-1')

    expect(store.getState().entries).toHaveLength(0)
  })

  it('should delete all entries and dependencies for a project', async () => {
    const store = await getStore()
    const projectId = '11111111-1111-1111-1111-111111111111'

    store
      .getState()
      .upsertEntry(projectId, 'phase-1', '2025-04-01', '2025-06-30')
    store
      .getState()
      .upsertEntry(projectId, 'phase-2', '2025-07-01', '2025-09-30')
    store.getState().addDependency(projectId, 'phase-1', 'phase-2', 'FS')
    store.getState().deleteByProject(projectId)

    expect(store.getState().entries).toHaveLength(0)
    expect(store.getState().dependencies).toHaveLength(0)
  })

  it('deleteByProjectがDataAdapterで失敗した場合はentries・dependencies双方ロールバックされる', async () => {
    const store = await getStore()
    const projectId = '11111111-1111-1111-1111-111111111111'
    store
      .getState()
      .upsertEntry(projectId, 'phase-1', '2025-04-01', '2025-06-30')
    store.getState().addDependency(projectId, 'phase-1', 'phase-2', 'FS')
    mockRemove.mockRejectedValueOnce(new Error('network error'))
    store.getState().deleteByProject(projectId)
    expect(store.getState().entries).toHaveLength(0)
    expect(store.getState().dependencies).toHaveLength(0)
    await flushMicrotasks()
    expect(store.getState().entries).toHaveLength(1)
    expect(store.getState().dependencies).toHaveLength(1)
  })

  it('should add a dependency', async () => {
    const store = await getStore()
    const projectId = '11111111-1111-1111-1111-111111111111'

    store.getState().addDependency(projectId, 'phase-1', 'phase-2', 'FS')

    const deps = store.getState().dependencies
    expect(deps).toHaveLength(1)
    expect(deps[0]?.fromPhaseKey).toBe('phase-1')
    expect(deps[0]?.toPhaseKey).toBe('phase-2')
    expect(deps[0]?.dependencyType).toBe('FS')
  })

  it('should not add duplicate dependency', async () => {
    const store = await getStore()
    const projectId = '11111111-1111-1111-1111-111111111111'

    store.getState().addDependency(projectId, 'phase-1', 'phase-2', 'FS')
    store.getState().addDependency(projectId, 'phase-1', 'phase-2', 'SS')

    expect(store.getState().dependencies).toHaveLength(1)
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('should delete a dependency', async () => {
    const store = await getStore()
    const projectId = '11111111-1111-1111-1111-111111111111'

    store.getState().addDependency(projectId, 'phase-1', 'phase-2', 'FS')
    const depId = store.getState().dependencies[0]?.id ?? ''
    store.getState().deleteDependency(depId)

    expect(store.getState().dependencies).toHaveLength(0)
  })

  it('should get entries by project', async () => {
    const store = await getStore()
    const projectA = '11111111-1111-1111-1111-111111111111'
    const projectB = '22222222-2222-2222-2222-222222222222'

    store
      .getState()
      .upsertEntry(projectA, 'phase-1', '2025-04-01', '2025-06-30')
    store
      .getState()
      .upsertEntry(projectB, 'phase-1', '2025-07-01', '2025-09-30')

    expect(store.getState().getEntriesByProject(projectA)).toHaveLength(1)
    expect(store.getState().getEntriesByProject(projectB)).toHaveLength(1)
  })

  it('should get dependencies by project', async () => {
    const store = await getStore()
    const projectA = '11111111-1111-1111-1111-111111111111'

    store.getState().addDependency(projectA, 'phase-1', 'phase-2', 'FS')

    expect(store.getState().getDependenciesByProject(projectA)).toHaveLength(1)
    expect(store.getState().getDependenciesByProject('other-id')).toHaveLength(
      0,
    )
  })
})
