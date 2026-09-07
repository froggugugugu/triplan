import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOCUMENT_TEMPLATE_MASTER } from '@/shared/data/document-template-master'
import type { DocumentTemplate } from '@/shared/types/document-template'
import {
  resetDocumentTemplateSeedGuardForTesting,
  useDocumentTemplateStore,
} from '@/stores/document-template-store'

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

function buildTemplate(overrides: Partial<DocumentTemplate> = {}) {
  return {
    name: '要件定義書',
    phase: '要件定義',
    description: null,
    content: '# 要件定義書\n',
    ...overrides,
  }
}

describe('useDocumentTemplateStore', () => {
  beforeEach(async () => {
    useDocumentTemplateStore.setState({ documentTemplates: [] })
    resetDocumentTemplateSeedGuardForTesting()
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
    mockCreate.mockImplementation(
      async (
        _entity: string,
        data: Omit<DocumentTemplate, 'id'>,
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
        patch: Partial<DocumentTemplate>,
      ) => ({
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

  it('loadDocumentTemplatesはDataAdapterから読み込む', async () => {
    const seeded = [
      {
        id: crypto.randomUUID(),
        ...buildTemplate(),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]
    mockList.mockResolvedValueOnce(seeded)

    useDocumentTemplateStore.getState().loadDocumentTemplates()
    await flushMicrotasks()

    expect(useDocumentTemplateStore.getState().documentTemplates).toEqual(
      seeded,
    )
  })

  it('読み込みがDataAdapterで失敗した場合はトースト表示される', async () => {
    mockList.mockRejectedValueOnce(new Error('network error'))
    useDocumentTemplateStore.getState().loadDocumentTemplates()
    await flushMicrotasks()
    const { toast } = await import('@/shared/hooks/use-toast')
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' }),
    )
  })

  it('addDocumentTemplateは楽観的に即座へ反映され、確定後もidが安定している', async () => {
    const created = useDocumentTemplateStore
      .getState()
      .addDocumentTemplate(buildTemplate())

    expect(created.id).toBeTruthy()
    expect(useDocumentTemplateStore.getState().documentTemplates).toHaveLength(
      1,
    )
    expect(mockCreate).toHaveBeenCalledWith(
      'documentTemplates',
      expect.objectContaining({ name: '要件定義書' }),
      { id: created.id },
    )
    await flushMicrotasks()
    expect(useDocumentTemplateStore.getState().documentTemplates[0]?.id).toBe(
      created.id,
    )
  })

  it('追加がDataAdapterで失敗した場合はロールバックされる', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network error'))
    useDocumentTemplateStore.getState().addDocumentTemplate(buildTemplate())
    await flushMicrotasks()
    expect(useDocumentTemplateStore.getState().documentTemplates).toHaveLength(
      0,
    )
  })

  it('updateDocumentTemplateは指定IDのみ更新する', () => {
    const a = useDocumentTemplateStore
      .getState()
      .addDocumentTemplate(buildTemplate({ name: 'A' }))
    const b = useDocumentTemplateStore
      .getState()
      .addDocumentTemplate(buildTemplate({ name: 'B' }))

    useDocumentTemplateStore
      .getState()
      .updateDocumentTemplate({ id: a.id, content: '# 更新済み\n' })

    const state = useDocumentTemplateStore.getState().documentTemplates
    expect(state.find((t) => t.id === a.id)?.content).toBe('# 更新済み\n')
    expect(state.find((t) => t.id === b.id)?.content).toBe('# 要件定義書\n')
  })

  it('更新がDataAdapterで失敗した場合はロールバックされる', async () => {
    const a = useDocumentTemplateStore
      .getState()
      .addDocumentTemplate(buildTemplate({ name: 'A' }))
    mockUpdate.mockRejectedValueOnce(new Error('network error'))
    useDocumentTemplateStore
      .getState()
      .updateDocumentTemplate({ id: a.id, name: 'A更新' })
    await flushMicrotasks()
    expect(
      useDocumentTemplateStore
        .getState()
        .documentTemplates.find((t) => t.id === a.id)?.name,
    ).toBe('A')
  })

  it('deleteDocumentTemplateは指定IDのみ削除する', () => {
    const a = useDocumentTemplateStore
      .getState()
      .addDocumentTemplate(buildTemplate({ name: 'A' }))
    const b = useDocumentTemplateStore
      .getState()
      .addDocumentTemplate(buildTemplate({ name: 'B' }))

    useDocumentTemplateStore.getState().deleteDocumentTemplate(a.id)

    expect(
      useDocumentTemplateStore.getState().documentTemplates.map((t) => t.id),
    ).toEqual([b.id])
  })

  it('削除がDataAdapterで失敗した場合はロールバックされる', async () => {
    const a = useDocumentTemplateStore
      .getState()
      .addDocumentTemplate(buildTemplate({ name: 'A' }))
    mockRemove.mockRejectedValueOnce(new Error('network error'))
    useDocumentTemplateStore.getState().deleteDocumentTemplate(a.id)
    expect(useDocumentTemplateStore.getState().documentTemplates).toHaveLength(
      0,
    )
    await flushMicrotasks()
    expect(useDocumentTemplateStore.getState().documentTemplates).toHaveLength(
      1,
    )
  })

  describe('seedStandardDocumentTemplates', () => {
    it('DataAdapter上が0件の場合、マスタ全件を固定UUIDのままシードする', async () => {
      mockList.mockResolvedValue([])
      useDocumentTemplateStore.getState().seedStandardDocumentTemplates()
      await flushMicrotasks()

      const state = useDocumentTemplateStore.getState().documentTemplates
      expect(state).toHaveLength(DOCUMENT_TEMPLATE_MASTER.length)
      // 固定UUIDが維持される（STANDARD_WBS_TEMPLATEからの紐づけ前提）
      expect(state.map((t) => t.id).sort()).toEqual(
        DOCUMENT_TEMPLATE_MASTER.map((t) => t.id).sort(),
      )
      for (const entry of DOCUMENT_TEMPLATE_MASTER) {
        expect(mockCreate).toHaveBeenCalledWith(
          'documentTemplates',
          expect.objectContaining({ name: entry.name }),
          { id: entry.id },
        )
      }
    })

    // 反証: 既に1件以上ある場合はシードしない（重複防止）
    it('反証: DataAdapter上に既に1件以上ある場合はシードしない', async () => {
      const existing = [
        {
          id: crypto.randomUUID(),
          ...buildTemplate({ name: '既存' }),
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]
      mockList.mockResolvedValue(existing)

      useDocumentTemplateStore.getState().seedStandardDocumentTemplates()
      await flushMicrotasks()

      expect(mockCreate).not.toHaveBeenCalled()
      expect(useDocumentTemplateStore.getState().documentTemplates).toEqual(
        existing,
      )
    })

    // 反証: StrictMode二重発火（同一tick内の2回呼び出し）でも重複シードしない
    // （list()未解決の間に2回目が割り込むTOCTOUレースの回帰テスト、と同型）
    it('反証: 同一tick内に2回呼ばれてもマスタ件数を超えて重複シードしない', async () => {
      mockList.mockResolvedValue([])
      useDocumentTemplateStore.getState().seedStandardDocumentTemplates()
      useDocumentTemplateStore.getState().seedStandardDocumentTemplates()
      await flushMicrotasks()

      expect(
        useDocumentTemplateStore.getState().documentTemplates,
      ).toHaveLength(DOCUMENT_TEMPLATE_MASTER.length)
      expect(mockCreate).toHaveBeenCalledTimes(DOCUMENT_TEMPLATE_MASTER.length)
    })

    // 反証: StrictModeの二重マウント相当（load→seed→load）でも、2周目のloadの
    // 空配列set()がシード結果を消さない（実ブラウザE2Eで発見した競合の回帰テスト。
    // list()はload#1→seed→load#2の順で解決し、load#2がシードの楽観的stateを
    // 上書きするが、create確定時のupsertで最終状態がシード結果へ収束する）
    it('反証: load→seed→loadの順で呼ばれてもシード結果がUI stateから消えない', async () => {
      mockList.mockResolvedValue([])
      const store = useDocumentTemplateStore.getState()
      store.loadDocumentTemplates()
      store.seedStandardDocumentTemplates()
      store.loadDocumentTemplates()

      // list()3件＋create()33件の全チェーンが解決するまで十分にflushする
      for (let i = 0; i < 10; i++) {
        await flushMicrotasks()
      }

      const state = useDocumentTemplateStore.getState().documentTemplates
      expect(state).toHaveLength(DOCUMENT_TEMPLATE_MASTER.length)
      expect(state.map((t) => t.id).sort()).toEqual(
        DOCUMENT_TEMPLATE_MASTER.map((t) => t.id).sort(),
      )
    })

    // 反証: 一部レコードの永続化が失敗した場合、そのレコードのみロールバックされる
    it('反証: シード中の1件が失敗した場合、その1件のみロールバックされる', async () => {
      mockList.mockResolvedValue([])
      const failingId = DOCUMENT_TEMPLATE_MASTER[0]?.id
      mockCreate.mockImplementation(
        async (
          _entity: string,
          data: Omit<DocumentTemplate, 'id'>,
          options?: { id?: string },
        ) => {
          if (options?.id === failingId) throw new Error('network error')
          return { ...data, id: options?.id ?? crypto.randomUUID() }
        },
      )

      useDocumentTemplateStore.getState().seedStandardDocumentTemplates()
      await flushMicrotasks()

      const state = useDocumentTemplateStore.getState().documentTemplates
      expect(state).toHaveLength(DOCUMENT_TEMPLATE_MASTER.length - 1)
      expect(state.some((t) => t.id === failingId)).toBe(false)
    })
  })

  describe('getDocumentTemplateById', () => {
    it('存在するidのテンプレートを返し、存在しないidはundefinedを返す', () => {
      const a = useDocumentTemplateStore
        .getState()
        .addDocumentTemplate(buildTemplate({ name: 'A' }))
      expect(
        useDocumentTemplateStore.getState().getDocumentTemplateById(a.id)?.name,
      ).toBe('A')
      expect(
        useDocumentTemplateStore
          .getState()
          .getDocumentTemplateById(crypto.randomUUID()),
      ).toBeUndefined()
    })
  })
})
