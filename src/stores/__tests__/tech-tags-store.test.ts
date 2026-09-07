import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTechTagsStore } from '@/stores/tech-tags-store'

/**
 * tech-tag-category.test.ts（features/tech-tags/utils/__tests__/）が実LocalJsonAdapter経由の
 * 正常系（シード・CRUD・カスケード）を網羅しているため、本ファイルはDataAdapter失敗時の
 * ロールバック・idの安定性のみを補完する。
 */

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
  for (let i = 0; i < 4; i++) {
    await Promise.resolve()
  }
}

describe('useTechTagsStore（DataAdapter失敗時の挙動）', () => {
  beforeEach(async () => {
    useTechTagsStore.getState().resetAll()
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

  it('DataAdapter確定後もカテゴリ/サブカテゴリ/タグのidは変わらず安定している', async () => {
    const cat = useTechTagsStore
      .getState()
      .addCategory({ name: 'Cat', sortOrder: 0 })
    const sub = useTechTagsStore
      .getState()
      .addSubCategory({ categoryId: cat.id, name: 'Sub', sortOrder: 0 })
    const tag = useTechTagsStore.getState().addTechTag({
      name: 'Tag',
      color: '#000000',
      categoryId: cat.id,
      subCategoryId: sub.id,
      note: null,
    })
    await flushMicrotasks()
    const state = useTechTagsStore.getState()
    expect(state.techTagCategories[0]?.id).toBe(cat.id)
    expect(state.techTagSubCategories[0]?.id).toBe(sub.id)
    expect(state.techTags[0]?.id).toBe(tag.id)
  })

  /**
   * 楽観ロック。本ストアは3つの更新アクションがいずれも`previous`という
   * 同名変数を使いながら**別々の配列**（techTags / techTagCategories /
   * techTagSubCategories）を指すため、期待値の取り違えが型では検出できない。
   * 「どのレコードのupdatedAtが送られたか」を突き合わせて取り違えを反証する。
   */
  describe('楽観ロックの期待値', () => {
    it('タグ・カテゴリ・サブカテゴリがそれぞれ自分自身のupdatedAtを送る', async () => {
      const cat = useTechTagsStore
        .getState()
        .addCategory({ name: 'Cat', sortOrder: 0 })
      const sub = useTechTagsStore
        .getState()
        .addSubCategory({ categoryId: cat.id, name: 'Sub', sortOrder: 0 })
      const tag = useTechTagsStore.getState().addTechTag({
        name: 'Tag',
        color: '#000000',
        categoryId: cat.id,
        subCategoryId: sub.id,
        note: null,
      })
      await flushMicrotasks()

      // 3種のupdatedAtは生成タイミングが近いため、取り違えても偶然一致しないよう
      // 意図的に異なる値へ差し替えてから更新する
      useTechTagsStore.setState({
        techTagCategories: useTechTagsStore
          .getState()
          .techTagCategories.map((c) => ({
            ...c,
            updatedAt: '2026-01-01T00:00:00.000Z',
          })),
        techTagSubCategories: useTechTagsStore
          .getState()
          .techTagSubCategories.map((s) => ({
            ...s,
            updatedAt: '2026-02-02T00:00:00.000Z',
          })),
        techTags: useTechTagsStore.getState().techTags.map((t) => ({
          ...t,
          updatedAt: '2026-03-03T00:00:00.000Z',
        })),
      })

      const optionsOf = (entity: string) =>
        mockUpdate.mock.calls.find((c) => c[0] === entity)?.[3]

      mockUpdate.mockClear()
      useTechTagsStore.getState().updateTechTag({ id: tag.id, name: 'T2' })
      expect(optionsOf('techTags')).toEqual({
        expectedUpdatedAt: '2026-03-03T00:00:00.000Z',
      })

      mockUpdate.mockClear()
      useTechTagsStore.getState().updateCategory({ id: cat.id, name: 'C2' })
      expect(optionsOf('techTagCategories')).toEqual({
        expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      })

      mockUpdate.mockClear()
      useTechTagsStore.getState().updateSubCategory({ id: sub.id, name: 'S2' })
      expect(optionsOf('techTagSubCategories')).toEqual({
        expectedUpdatedAt: '2026-02-02T00:00:00.000Z',
      })
    })

    it('反証: 対象が見つからない場合でも期待値をでっち上げない（undefinedで送る）', async () => {
      // 存在しないidを渡したとき、他レコードのupdatedAtを掴んで
      // 「別レコードの版で楽観ロックする」事故を起こさない
      const cat = useTechTagsStore
        .getState()
        .addCategory({ name: 'Cat', sortOrder: 0 })
      await flushMicrotasks()
      expect(cat.updatedAt).toBeTruthy()

      mockUpdate.mockClear()
      useTechTagsStore
        .getState()
        .updateCategory({ id: crypto.randomUUID(), name: 'ghost' })
      const options = mockUpdate.mock.calls.at(-1)?.[3]
      expect(options).toEqual({ expectedUpdatedAt: undefined })
    })
  })

  it('カテゴリ追加がDataAdapterで失敗した場合はロールバックされる', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network error'))
    useTechTagsStore.getState().addCategory({ name: 'Cat', sortOrder: 0 })
    await flushMicrotasks()
    expect(useTechTagsStore.getState().techTagCategories).toHaveLength(0)
  })

  it('タグ更新がDataAdapterで失敗した場合はロールバックされる', async () => {
    const cat = useTechTagsStore
      .getState()
      .addCategory({ name: 'Cat', sortOrder: 0 })
    const tag = useTechTagsStore.getState().addTechTag({
      name: 'Before',
      color: '#000000',
      categoryId: cat.id,
      subCategoryId: null,
      note: null,
    })
    await flushMicrotasks()
    mockUpdate.mockRejectedValueOnce(new Error('network error'))
    useTechTagsStore.getState().updateTechTag({ id: tag.id, name: 'After' })
    expect(
      useTechTagsStore.getState().techTags.find((t) => t.id === tag.id)?.name,
    ).toBe('After')
    await flushMicrotasks()
    expect(
      useTechTagsStore.getState().techTags.find((t) => t.id === tag.id)?.name,
    ).toBe('Before')
  })

  it('カテゴリ削除がDataAdapterで失敗した場合はカテゴリ・サブカテゴリ・タグとも復元される', async () => {
    const cat = useTechTagsStore
      .getState()
      .addCategory({ name: 'Cat', sortOrder: 0 })
    const sub = useTechTagsStore
      .getState()
      .addSubCategory({ categoryId: cat.id, name: 'Sub', sortOrder: 0 })
    useTechTagsStore.getState().addTechTag({
      name: 'Tag',
      color: '#000000',
      categoryId: cat.id,
      subCategoryId: sub.id,
      note: null,
    })
    await flushMicrotasks()

    mockRemove.mockRejectedValueOnce(new Error('network error'))
    useTechTagsStore.getState().deleteCategory(cat.id)
    expect(useTechTagsStore.getState().techTagCategories).toHaveLength(0)
    await flushMicrotasks()
    expect(useTechTagsStore.getState().techTagCategories).toHaveLength(1)
    expect(useTechTagsStore.getState().techTagSubCategories).toHaveLength(1)
    expect(useTechTagsStore.getState().techTags).toHaveLength(1)
  })

  it('サブカテゴリ削除がDataAdapterで失敗した場合はサブカテゴリ・タグとも復元される', async () => {
    const cat = useTechTagsStore
      .getState()
      .addCategory({ name: 'Cat', sortOrder: 0 })
    const sub = useTechTagsStore
      .getState()
      .addSubCategory({ categoryId: cat.id, name: 'Sub', sortOrder: 0 })
    const tag = useTechTagsStore.getState().addTechTag({
      name: 'Tag',
      color: '#000000',
      categoryId: cat.id,
      subCategoryId: sub.id,
      note: null,
    })
    await flushMicrotasks()

    mockRemove.mockRejectedValueOnce(new Error('network error'))
    useTechTagsStore.getState().deleteSubCategory(sub.id)
    expect(useTechTagsStore.getState().techTagSubCategories).toHaveLength(0)
    expect(
      useTechTagsStore.getState().techTags.find((t) => t.id === tag.id)
        ?.subCategoryId,
    ).toBeNull()
    await flushMicrotasks()
    expect(useTechTagsStore.getState().techTagSubCategories).toHaveLength(1)
    expect(
      useTechTagsStore.getState().techTags.find((t) => t.id === tag.id)
        ?.subCategoryId,
    ).toBe(sub.id)
  })

  it('読み込みがDataAdapterで失敗した場合はトースト表示される', async () => {
    mockList.mockRejectedValue(new Error('network error'))
    useTechTagsStore.getState().loadTechTags()
    await flushMicrotasks()
    const { toast } = await import('@/shared/hooks/use-toast')
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' }),
    )
  })
})
