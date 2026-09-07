import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WbsTemplate } from '@/shared/types/wbs-template'
import {
  resetWbsTemplateSeedGuardForTesting,
  useWbsTemplateStore,
} from '@/stores/wbs-template-store'

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

describe('useWbsTemplateStore', () => {
  beforeEach(async () => {
    useWbsTemplateStore.setState({ wbsTemplates: [] })
    resetWbsTemplateSeedGuardForTesting()
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
    mockCreate.mockImplementation(
      async (
        _entity: string,
        data: Omit<WbsTemplate, 'id'>,
        options?: { id?: string },
      ) => ({
        ...data,
        id: options?.id ?? crypto.randomUUID(),
      }),
    )
    mockUpdate.mockImplementation(
      async (_entity: string, id: string, patch: Partial<WbsTemplate>) => ({
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

  it('loadWbsTemplatesはDataAdapterからwbsTemplatesを読み込む', async () => {
    const seeded = [
      {
        id: crypto.randomUUID(),
        name: '既存テンプレート',
        nodes: [{ name: '工程A' }],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]
    mockList.mockResolvedValueOnce(seeded)

    useWbsTemplateStore.getState().loadWbsTemplates()
    await flushMicrotasks()

    expect(useWbsTemplateStore.getState().wbsTemplates).toEqual(seeded)
  })

  it('読み込みがDataAdapterで失敗した場合はトースト表示される', async () => {
    mockList.mockRejectedValueOnce(new Error('network error'))
    useWbsTemplateStore.getState().loadWbsTemplates()
    await flushMicrotasks()
    const { toast } = await import('@/shared/hooks/use-toast')
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' }),
    )
  })

  it('addWbsTemplateは新規テンプレートを追加する（楽観的に即座へ反映される）', () => {
    const created = useWbsTemplateStore
      .getState()
      .addWbsTemplate({ name: '新規', nodes: [{ name: '工程A' }] })

    expect(created.id).toBeTruthy()
    expect(useWbsTemplateStore.getState().wbsTemplates).toHaveLength(1)
    expect(mockCreate).toHaveBeenCalledWith(
      'wbsTemplates',
      expect.objectContaining({ name: '新規' }),
      { id: created.id },
    )
  })

  it('DataAdapter確定後もidは変わらず安定している', async () => {
    const created = useWbsTemplateStore
      .getState()
      .addWbsTemplate({ name: '新規', nodes: [] })
    await flushMicrotasks()
    expect(useWbsTemplateStore.getState().wbsTemplates[0]?.id).toBe(created.id)
  })

  it('追加がDataAdapterで失敗した場合はロールバックされる', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network error'))
    useWbsTemplateStore.getState().addWbsTemplate({ name: '新規', nodes: [] })
    await flushMicrotasks()
    expect(useWbsTemplateStore.getState().wbsTemplates).toHaveLength(0)
  })

  it('updateWbsTemplateは指定IDのテンプレートのみ更新する', () => {
    const a = useWbsTemplateStore
      .getState()
      .addWbsTemplate({ name: 'A', nodes: [] })
    const b = useWbsTemplateStore
      .getState()
      .addWbsTemplate({ name: 'B', nodes: [] })

    useWbsTemplateStore
      .getState()
      .updateWbsTemplate({ id: a.id, name: 'A更新' })

    const state = useWbsTemplateStore.getState().wbsTemplates
    expect(state.find((t) => t.id === a.id)?.name).toBe('A更新')
    expect(state.find((t) => t.id === b.id)?.name).toBe('B')
  })

  it('更新がDataAdapterで失敗した場合はロールバックされる', async () => {
    const a = useWbsTemplateStore
      .getState()
      .addWbsTemplate({ name: 'A', nodes: [] })
    mockUpdate.mockRejectedValueOnce(new Error('network error'))
    useWbsTemplateStore
      .getState()
      .updateWbsTemplate({ id: a.id, name: 'A更新' })
    expect(
      useWbsTemplateStore.getState().wbsTemplates.find((t) => t.id === a.id)
        ?.name,
    ).toBe('A更新')
    await flushMicrotasks()
    expect(
      useWbsTemplateStore.getState().wbsTemplates.find((t) => t.id === a.id)
        ?.name,
    ).toBe('A')
  })

  it('deleteWbsTemplateは指定IDのテンプレートのみ削除する', () => {
    const a = useWbsTemplateStore
      .getState()
      .addWbsTemplate({ name: 'A', nodes: [] })
    const b = useWbsTemplateStore
      .getState()
      .addWbsTemplate({ name: 'B', nodes: [] })

    useWbsTemplateStore.getState().deleteWbsTemplate(a.id)

    const state = useWbsTemplateStore.getState().wbsTemplates
    expect(state.map((t) => t.id)).toEqual([b.id])
  })

  it('削除がDataAdapterで失敗した場合はロールバックされる', async () => {
    const a = useWbsTemplateStore
      .getState()
      .addWbsTemplate({ name: 'A', nodes: [] })
    mockRemove.mockRejectedValueOnce(new Error('network error'))
    useWbsTemplateStore.getState().deleteWbsTemplate(a.id)
    expect(useWbsTemplateStore.getState().wbsTemplates).toHaveLength(0)
    await flushMicrotasks()
    expect(useWbsTemplateStore.getState().wbsTemplates).toHaveLength(1)
  })

  describe('seedStandardTemplate', () => {
    it('DataAdapter上のストックが0件の場合、標準テンプレートを1件シードする', async () => {
      mockList.mockResolvedValue([])
      useWbsTemplateStore.getState().seedStandardTemplate()
      await flushMicrotasks()

      expect(useWbsTemplateStore.getState().wbsTemplates).toHaveLength(1)
    })

    // 反証: 既に1件以上ストックがある場合はシードしない（重複防止）
    it('反証: DataAdapter上に既に1件以上ある場合はシードしない', async () => {
      const existing = [
        {
          id: crypto.randomUUID(),
          name: '既存',
          nodes: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]
      mockList.mockResolvedValue(existing)

      useWbsTemplateStore.getState().seedStandardTemplate()
      await flushMicrotasks()

      expect(useWbsTemplateStore.getState().wbsTemplates).toEqual(existing)
      expect(mockCreate).not.toHaveBeenCalled()
    })

    // 反証: StrictModeの二重マウント相当（load→seed→load）でも、2周目のloadの
    // 空配列set()がシード結果を消さない（document-template-storeの実ブラウザE2Eで
    // 発見した同型競合の回帰テスト。create確定時のupsertで収束する）
    it('反証: load→seed→loadの順で呼ばれてもシード結果がUI stateから消えない', async () => {
      mockList.mockResolvedValue([])
      const store = useWbsTemplateStore.getState()
      store.loadWbsTemplates()
      store.seedStandardTemplate()
      store.loadWbsTemplates()

      for (let i = 0; i < 10; i++) {
        await flushMicrotasks()
      }

      expect(useWbsTemplateStore.getState().wbsTemplates).toHaveLength(1)
    })

    // 反証: ローカルstateが未ロード（空配列）でも、DataAdapter側の実データで正しく
    // 判定する（loadWbsTemplates()のlist()未解決タイミングと競合しても二重シードしない、
    // 実ブラウザE2Eで発見した回帰テスト）
    it('反証: ローカルstateが空でもDataAdapter上に既存データがあれば二重シードしない', async () => {
      expect(useWbsTemplateStore.getState().wbsTemplates).toHaveLength(0)
      const existing = [
        {
          id: crypto.randomUUID(),
          name: '既に永続化済みの標準テンプレート',
          nodes: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]
      mockList.mockResolvedValue(existing)

      useWbsTemplateStore.getState().seedStandardTemplate()
      await flushMicrotasks()

      expect(mockCreate).not.toHaveBeenCalled()
      expect(useWbsTemplateStore.getState().wbsTemplates).toEqual(existing)
    })
  })
})
