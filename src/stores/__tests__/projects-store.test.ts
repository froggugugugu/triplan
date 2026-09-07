import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MonthlyCloseEvent, Project } from '@/shared/types'
import { useActualsStore } from '@/stores/actuals-store'
import { useAssignmentStore } from '@/stores/assignment-store'
import { useProjectsStore } from '@/stores/projects-store'

const mockList = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockRemove = vi.fn()
const mockBulkUpdate = vi.fn()

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
    bulkUpdate: mockBulkUpdate,
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

/** テスト用CreateProjectデータ */
const createProjectData = (overrides: Partial<Project> = {}) => ({
  code: 'P001',
  name: 'テストプロジェクト',
  parentId: null,
  level: 0 as const,
  status: 'not_started' as const,
  confidence: null,
  completed: false,
  ...overrides,
})

describe('useProjectsStore', () => {
  beforeEach(async () => {
    useProjectsStore.setState({ projects: [] })
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
    mockCreate.mockImplementation(
      async (
        _entity: string,
        data: Omit<Project, 'id'>,
        options?: { id?: string },
      ) => ({
        ...data,
        id: options?.id ?? crypto.randomUUID(),
      }),
    )
    mockUpdate.mockImplementation(
      async (_entity: string, id: string, patch: Partial<Project>) => ({
        id,
        ...patch,
      }),
    )
    mockRemove.mockResolvedValue(undefined)
    mockBulkUpdate.mockResolvedValue([])
    const { toast } = await import('@/shared/hooks/use-toast')
    vi.mocked(toast).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('addProject', () => {
    it('案件を追加できる（id, createdAt, updatedAt 自動生成、楽観的に即座へ反映される）', () => {
      const data = createProjectData()
      const project = useProjectsStore.getState().addProject(data)

      expect(project.id).toBeDefined()
      expect(project.createdAt).toBeDefined()
      expect(project.updatedAt).toBeDefined()
      expect(project.code).toBe('P001')
      expect(project.name).toBe('テストプロジェクト')
      expect(project.parentId).toBeNull()
      expect(project.level).toBe(0)
      expect(project.status).toBe('not_started')
      expect(project.confidence).toBeNull()
      expect(useProjectsStore.getState().projects).toHaveLength(1)
    })

    it('親案件IDを設定できる（戻り値idを子のparentIdへ同期的に連鎖利用できる）', () => {
      const parent = useProjectsStore
        .getState()
        .addProject(createProjectData({ code: 'P001', name: '親案件' }))

      const child = useProjectsStore.getState().addProject(
        createProjectData({
          code: 'P001-01',
          name: '子案件',
          parentId: parent.id,
          level: 1,
        }),
      )

      expect(child.parentId).toBe(parent.id)
      expect(child.level).toBe(1)
      expect(useProjectsStore.getState().projects).toHaveLength(2)
    })

    it('DataAdapter.create()がoptions.id付きで呼ばれる', () => {
      const project = useProjectsStore
        .getState()
        .addProject(createProjectData())
      expect(mockCreate).toHaveBeenCalledWith(
        'projects',
        expect.objectContaining({ code: 'P001' }),
        { id: project.id },
      )
    })

    it('DataAdapter確定後もidは変わらず安定している', async () => {
      const project = useProjectsStore
        .getState()
        .addProject(createProjectData())
      await flushMicrotasks()
      expect(useProjectsStore.getState().projects[0]?.id).toBe(project.id)
    })

    it('新規作成がDataAdapterで失敗した場合はロールバックされ、トースト表示される', async () => {
      mockCreate.mockRejectedValueOnce(new Error('network error'))
      useProjectsStore.getState().addProject(createProjectData())
      await flushMicrotasks()
      expect(useProjectsStore.getState().projects).toHaveLength(0)
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })
  })

  describe('updateProject', () => {
    it('案件情報を更新できる', () => {
      const project = useProjectsStore
        .getState()
        .addProject(createProjectData())

      useProjectsStore.getState().updateProject({
        id: project.id,
        name: '更新後の名前',
        status: 'active',
      })

      const updated = useProjectsStore.getState().getProjectById(project.id)
      expect(updated?.name).toBe('更新後の名前')
      expect(updated?.status).toBe('active')
      expect(mockUpdate).toHaveBeenCalledWith(
        'projects',
        project.id,
        expect.objectContaining({ name: '更新後の名前', status: 'active' }),
        // 楽観ロック: 画面が見ていた版を期待値として送る
        { expectedUpdatedAt: project.updatedAt },
      )
    })

    it('updatedAtが更新される', () => {
      const project = useProjectsStore
        .getState()
        .addProject(createProjectData())

      // createdAtと区別できるように少し前の時刻を手動で設定
      const pastDate = '2020-01-01T00:00:00.000Z'
      useProjectsStore.setState({
        projects: useProjectsStore
          .getState()
          .projects.map((p) =>
            p.id === project.id ? { ...p, updatedAt: pastDate } : p,
          ),
      })

      useProjectsStore.getState().updateProject({
        id: project.id,
        name: '更新テスト',
      })

      const updated = useProjectsStore.getState().getProjectById(project.id)
      expect(updated?.updatedAt).toBeDefined()
      expect(updated?.updatedAt).not.toBe(pastDate)
    })

    it('部分更新が可能（nameのみ更新）', () => {
      const project = useProjectsStore.getState().addProject(
        createProjectData({
          code: 'P002',
          name: '元の名前',
          status: 'active',
          confidence: 'A',
        }),
      )

      useProjectsStore.getState().updateProject({
        id: project.id,
        name: '新しい名前',
      })

      const updated = useProjectsStore.getState().getProjectById(project.id)
      expect(updated?.name).toBe('新しい名前')
      expect(updated?.code).toBe('P002')
      expect(updated?.status).toBe('active')
      expect(updated?.confidence).toBe('A')
    })

    it('更新がDataAdapterで失敗した場合はロールバックされる', async () => {
      const project = useProjectsStore
        .getState()
        .addProject(createProjectData())
      await flushMicrotasks()
      mockUpdate.mockRejectedValueOnce(new Error('network error'))
      useProjectsStore
        .getState()
        .updateProject({ id: project.id, name: '更新後' })
      expect(useProjectsStore.getState().getProjectById(project.id)?.name).toBe(
        '更新後',
      )
      await flushMicrotasks()
      expect(useProjectsStore.getState().getProjectById(project.id)?.name).toBe(
        'テストプロジェクト',
      )
    })
  })

  describe('updateProjectsBatch', () => {
    it('複数案件を一括更新できる（DataAdapter.bulkUpdate経由）', () => {
      const p1 = useProjectsStore
        .getState()
        .addProject(createProjectData({ code: 'P001', name: '案件1' }))
      const p2 = useProjectsStore
        .getState()
        .addProject(createProjectData({ code: 'P002', name: '案件2' }))

      useProjectsStore.getState().updateProjectsBatch([
        { id: p1.id, status: 'active' },
        { id: p2.id, status: 'completed' },
      ])

      const updated1 = useProjectsStore.getState().getProjectById(p1.id)
      const updated2 = useProjectsStore.getState().getProjectById(p2.id)
      expect(updated1?.status).toBe('active')
      expect(updated2?.status).toBe('completed')
      expect(mockBulkUpdate).toHaveBeenCalledWith(
        'projects',
        expect.arrayContaining([
          expect.objectContaining({
            id: p1.id,
            patch: expect.objectContaining({ status: 'active' }),
          }),
          expect.objectContaining({
            id: p2.id,
            patch: expect.objectContaining({ status: 'completed' }),
          }),
        ]),
      )
    })

    it('更新対象でない案件に影響しない', () => {
      const p1 = useProjectsStore
        .getState()
        .addProject(createProjectData({ code: 'P001', name: '案件1' }))
      const p2 = useProjectsStore.getState().addProject(
        createProjectData({
          code: 'P002',
          name: '案件2',
          status: 'active',
        }),
      )

      useProjectsStore
        .getState()
        .updateProjectsBatch([{ id: p1.id, name: '更新済み案件1' }])

      const unchanged = useProjectsStore.getState().getProjectById(p2.id)
      expect(unchanged?.name).toBe('案件2')
      expect(unchanged?.status).toBe('active')
      expect(unchanged?.updatedAt).toBe(p2.updatedAt)
    })

    it('反証: 空配列の場合はDataAdapterを呼び出さない', () => {
      useProjectsStore.getState().updateProjectsBatch([])
      expect(mockBulkUpdate).not.toHaveBeenCalled()
    })

    it('一括更新がDataAdapterで失敗した場合は全件ロールバックされる', async () => {
      const p1 = useProjectsStore
        .getState()
        .addProject(createProjectData({ code: 'P001', name: '案件1' }))
      await flushMicrotasks()
      mockBulkUpdate.mockRejectedValueOnce(new Error('network error'))
      useProjectsStore
        .getState()
        .updateProjectsBatch([{ id: p1.id, status: 'active' }])
      await flushMicrotasks()
      expect(useProjectsStore.getState().getProjectById(p1.id)?.status).toBe(
        'not_started',
      )
    })
  })

  describe('deleteProject', () => {
    it('案件を削除できる', () => {
      const project = useProjectsStore
        .getState()
        .addProject(createProjectData())
      expect(useProjectsStore.getState().projects).toHaveLength(1)

      useProjectsStore.getState().deleteProject(project.id)
      expect(useProjectsStore.getState().projects).toHaveLength(0)
      expect(mockRemove).toHaveBeenCalledWith('projects', project.id)
    })

    it('子案件も再帰的に削除される（cascade、DataAdapter.removeが子の数だけ呼ばれる）', () => {
      const parent = useProjectsStore
        .getState()
        .addProject(createProjectData({ code: 'P001', name: '親案件' }))
      useProjectsStore.getState().addProject(
        createProjectData({
          code: 'P001-01',
          name: '子案件1',
          parentId: parent.id,
          level: 1,
        }),
      )
      useProjectsStore.getState().addProject(
        createProjectData({
          code: 'P001-02',
          name: '子案件2',
          parentId: parent.id,
          level: 1,
        }),
      )
      expect(useProjectsStore.getState().projects).toHaveLength(3)
      mockRemove.mockClear()

      useProjectsStore.getState().deleteProject(parent.id)
      expect(useProjectsStore.getState().projects).toHaveLength(0)
      expect(mockRemove).toHaveBeenCalledTimes(3)
    })

    it('孫案件も削除される（3階層cascade）', () => {
      const grandparent = useProjectsStore
        .getState()
        .addProject(createProjectData({ code: 'P001', name: '祖父案件' }))
      const parent = useProjectsStore.getState().addProject(
        createProjectData({
          code: 'P001-01',
          name: '親案件',
          parentId: grandparent.id,
          level: 1,
        }),
      )
      useProjectsStore.getState().addProject(
        createProjectData({
          code: 'P001-01-001',
          name: '孫案件',
          parentId: parent.id,
          level: 2,
        }),
      )
      expect(useProjectsStore.getState().projects).toHaveLength(3)

      useProjectsStore.getState().deleteProject(grandparent.id)
      expect(useProjectsStore.getState().projects).toHaveLength(0)
    })

    // 反証: postgresモードのON DELETE CASCADE（parentId自己参照FK）により、親削除が先に
    // 処理されると子孫の個別remove()が404になりうる（Promise.allは処理順序を保証しない）。
    // このケースは「対象が既に存在しない」＝削除の目的を満たしているためロールバックしない
    it('反証: 子孫のremove()が404で失敗してもロールバックしない（親のcascadeで既に削除済み扱い）', async () => {
      const parent = useProjectsStore
        .getState()
        .addProject(createProjectData({ code: 'P001', name: '親案件' }))
      useProjectsStore.getState().addProject(
        createProjectData({
          code: 'P001-01',
          name: '子案件',
          parentId: parent.id,
          level: 1,
        }),
      )
      await flushMicrotasks()
      mockRemove.mockImplementation(async () => {
        throw new MockApiError('対象が見つかりません', 404)
      })

      useProjectsStore.getState().deleteProject(parent.id)
      expect(useProjectsStore.getState().projects).toHaveLength(0)
      await flushMicrotasks()
      // 404はエラー扱いされないため、ロールバックされず削除済みのまま
      expect(useProjectsStore.getState().projects).toHaveLength(0)
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(toast).not.toHaveBeenCalled()
    })

    it('削除がDataAdapterで失敗した場合は全件ロールバックされる', async () => {
      const project = useProjectsStore
        .getState()
        .addProject(createProjectData())
      await flushMicrotasks()
      mockRemove.mockRejectedValueOnce(new Error('network error'))
      useProjectsStore.getState().deleteProject(project.id)
      expect(useProjectsStore.getState().projects).toHaveLength(0)
      await flushMicrotasks()
      expect(useProjectsStore.getState().projects).toHaveLength(1)
    })
  })

  describe('selectors', () => {
    it('getProjectByIdで案件を取得できる', () => {
      const project = useProjectsStore
        .getState()
        .addProject(createProjectData({ code: 'P001', name: 'テスト案件' }))

      const found = useProjectsStore.getState().getProjectById(project.id)
      expect(found?.name).toBe('テスト案件')
      expect(found?.id).toBe(project.id)
    })

    it('getProjectByIdで存在しないIDはundefinedを返す', () => {
      const found = useProjectsStore.getState().getProjectById('nonexistent-id')
      expect(found).toBeUndefined()
    })

    it('getProjectsByLevelでレベル別案件一覧を取得できる', () => {
      useProjectsStore
        .getState()
        .addProject(
          createProjectData({ code: 'P001', name: '案件A', level: 0 }),
        )
      const parent = useProjectsStore
        .getState()
        .addProject(
          createProjectData({ code: 'P002', name: '案件B', level: 0 }),
        )
      useProjectsStore.getState().addProject(
        createProjectData({
          code: 'P002-01',
          name: '子案件',
          parentId: parent.id,
          level: 1,
        }),
      )

      const level0 = useProjectsStore.getState().getProjectsByLevel(0)
      const level1 = useProjectsStore.getState().getProjectsByLevel(1)
      expect(level0).toHaveLength(2)
      expect(level1).toHaveLength(1)
      expect(level1[0]?.name).toBe('子案件')
    })

    it('getProjectsByParentIdで子案件一覧を取得できる', () => {
      const parent = useProjectsStore
        .getState()
        .addProject(createProjectData({ code: 'P001', name: '親' }))
      useProjectsStore.getState().addProject(
        createProjectData({
          code: 'P001-01',
          name: '子1',
          parentId: parent.id,
          level: 1,
        }),
      )
      useProjectsStore.getState().addProject(
        createProjectData({
          code: 'P001-02',
          name: '子2',
          parentId: parent.id,
          level: 1,
        }),
      )
      useProjectsStore
        .getState()
        .addProject(createProjectData({ code: 'P002', name: '別案件' }))

      const children = useProjectsStore
        .getState()
        .getProjectsByParentId(parent.id)
      expect(children).toHaveLength(2)
      expect(children.map((c) => c.name).sort()).toEqual(['子1', '子2'])
    })
  })

  describe('getProjectTree', () => {
    it('フラットな案件リストをツリー構造に変換できる', () => {
      const parent = useProjectsStore
        .getState()
        .addProject(createProjectData({ code: 'P001', name: '親案件' }))
      useProjectsStore.getState().addProject(
        createProjectData({
          code: 'P001-01',
          name: '子案件',
          parentId: parent.id,
          level: 1,
        }),
      )

      const tree = useProjectsStore.getState().getProjectTree()
      expect(tree).toHaveLength(1)
      expect(tree[0]?.name).toBe('親案件')
      expect(tree[0]?.children).toHaveLength(1)
      expect(tree[0]?.children[0]?.name).toBe('子案件')
      expect(tree[0]?.depth).toBe(0)
      expect(tree[0]?.children[0]?.depth).toBe(1)
    })

    it('空リストから空ツリーを返す', () => {
      const tree = useProjectsStore.getState().getProjectTree()
      expect(tree).toEqual([])
    })

    it('子がコード順にソートされる', () => {
      const parent = useProjectsStore
        .getState()
        .addProject(createProjectData({ code: 'P001', name: '親' }))
      useProjectsStore.getState().addProject(
        createProjectData({
          code: 'P001-03',
          name: '子C',
          parentId: parent.id,
          level: 1,
        }),
      )
      useProjectsStore.getState().addProject(
        createProjectData({
          code: 'P001-01',
          name: '子A',
          parentId: parent.id,
          level: 1,
        }),
      )
      useProjectsStore.getState().addProject(
        createProjectData({
          code: 'P001-02',
          name: '子B',
          parentId: parent.id,
          level: 1,
        }),
      )

      const tree = useProjectsStore.getState().getProjectTree()
      const childNames = tree[0]?.children.map((c) => c.name)
      expect(childNames).toEqual(['子A', '子B', '子C'])
    })

    it('orphan（parentIdが無効）はルートに含まれない', () => {
      useProjectsStore
        .getState()
        .addProject(createProjectData({ code: 'P001', name: '正常案件' }))
      useProjectsStore.getState().addProject(
        createProjectData({
          code: 'P002-01',
          name: '孤児案件',
          parentId: 'nonexistent-parent-id',
          level: 1,
        }),
      )

      const tree = useProjectsStore.getState().getProjectTree()
      expect(tree).toHaveLength(1)
      expect(tree[0]?.name).toBe('正常案件')
    })
  })

  describe('loadProjects', () => {
    it('DataAdapterからデータを読み込める', async () => {
      const now = new Date().toISOString()
      mockList.mockResolvedValueOnce([
        {
          id: crypto.randomUUID(),
          code: 'P001',
          name: '読み込みテスト',
          parentId: null,
          level: 0,
          status: 'not_started',
          confidence: null,
          createdAt: now,
          updatedAt: now,
        },
      ])

      useProjectsStore.getState().loadProjects()
      await flushMicrotasks()
      const projects = useProjectsStore.getState().projects
      expect(projects).toHaveLength(1)
      expect(projects[0]?.name).toBe('読み込みテスト')
      expect(projects[0]?.level).toBe(0)
    })

    it("旧文字列レベルがマイグレーションされる（'project'→0, 'major'→1）", async () => {
      const now = new Date().toISOString()
      mockList.mockResolvedValueOnce([
        {
          id: crypto.randomUUID(),
          code: 'P001',
          name: 'プロジェクトレベル',
          parentId: null,
          level: 'project' as unknown as number,
          status: 'not_started',
          confidence: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: crypto.randomUUID(),
          code: 'P001-01',
          name: 'メジャーレベル',
          parentId: null,
          level: 'major' as unknown as number,
          status: 'not_started',
          confidence: null,
          createdAt: now,
          updatedAt: now,
        },
      ])

      useProjectsStore.getState().loadProjects()
      await flushMicrotasks()
      const projects = useProjectsStore.getState().projects
      expect(projects).toHaveLength(2)
      expect(projects[0]?.level).toBe(0) // 'project' → 0
      expect(projects[1]?.level).toBe(1) // 'major' → 1
    })

    it('読み込みがDataAdapterで失敗した場合はトースト表示される', async () => {
      mockList.mockRejectedValueOnce(new Error('network error'))
      useProjectsStore.getState().loadProjects()
      await flushMicrotasks()
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })
  })
})

describe('deleteProject × 月次締めガード（P1-b段階2）', () => {
  const TASK_ID = '00000000-0000-4000-8000-00000000t001'.replace('t0', 'a0')
  const ROOT_ID = '00000000-0000-4000-8000-00000000a002'

  function seedTree() {
    const now = new Date().toISOString()
    const base = {
      status: 'active' as const,
      confidence: null,
      completed: false,
      createdAt: now,
      updatedAt: now,
    }
    useProjectsStore.setState({
      projects: [
        {
          id: ROOT_ID,
          code: 'P100',
          name: '削除対象',
          parentId: null,
          level: 0,
          ...base,
        },
        {
          id: TASK_ID,
          code: 'P100-01',
          name: '子タスク',
          parentId: ROOT_ID,
          level: 1,
          ...base,
        },
      ] as Project[],
    })
  }

  function seedClose(month: string, reopened = false) {
    const events: MonthlyCloseEvent[] = [
      {
        id: crypto.randomUUID(),
        month,
        action: 'close',
        reason: null,
        occurredAt: '2026-02-01T00:00:00.000Z',
        actorName: null,
      },
    ]
    if (reopened) {
      events.push({
        id: crypto.randomUUID(),
        month,
        action: 'reopen',
        reason: '検証のため解除',
        occurredAt: '2026-02-02T00:00:00.000Z',
        actorName: null,
      })
    }
    useActualsStore.setState({ monthlyCloseEvents: events })
  }

  function seedAssignment(monthlyValues: Record<string, number>) {
    const now = new Date().toISOString()
    useAssignmentStore.setState({
      assignments: [
        {
          id: crypto.randomUUID(),
          projectId: ROOT_ID,
          taskId: TASK_ID,
          memberId: crypto.randomUUID(),
          monthlyValues,
          createdAt: now,
          updatedAt: now,
        },
      ],
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRemove.mockResolvedValue(undefined)
    useActualsStore.setState({ monthlyCloseEvents: [] })
    useAssignmentStore.setState({ assignments: [] })
    seedTree()
  })

  it('締め済み月に計画値を持つアサインがあるツリーは削除を拒否する（remove非発行・state不変）', async () => {
    seedClose('2026-01')
    seedAssignment({ '2026-01': 0.5 })

    useProjectsStore.getState().deleteProject(ROOT_ID)
    await flushMicrotasks()

    expect(useProjectsStore.getState().projects).toHaveLength(2)
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it('反証: 締め月に値が無いアサインだけなら削除できる', async () => {
    seedClose('2026-01')
    seedAssignment({ '2026-02': 0.5 })

    useProjectsStore.getState().deleteProject(ROOT_ID)
    await flushMicrotasks()

    expect(useProjectsStore.getState().projects).toHaveLength(0)
    expect(mockRemove).toHaveBeenCalled()
  })

  it('反証: 締めを解除（reopen）した後は削除できる＝永続ロックではない', async () => {
    seedClose('2026-01', true)
    seedAssignment({ '2026-01': 0.5 })

    useProjectsStore.getState().deleteProject(ROOT_ID)
    await flushMicrotasks()

    expect(useProjectsStore.getState().projects).toHaveLength(0)
  })

  it('反証: 締め月に実績の明示キー（0でも）があれば削除を拒否する', async () => {
    seedClose('2026-01')
    const now = new Date().toISOString()
    useAssignmentStore.setState({
      assignments: [
        {
          id: crypto.randomUUID(),
          projectId: ROOT_ID,
          taskId: TASK_ID,
          memberId: crypto.randomUUID(),
          monthlyValues: {},
          actualMonthlyValues: { '2026-01': 0 },
          createdAt: now,
          updatedAt: now,
        },
      ],
    })

    useProjectsStore.getState().deleteProject(ROOT_ID)
    await flushMicrotasks()

    expect(useProjectsStore.getState().projects).toHaveLength(2)
    expect(mockRemove).not.toHaveBeenCalled()
  })
})
