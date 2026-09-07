import { beforeEach, describe, expect, it } from 'vitest'
import {
  CATEGORY_DEFAULT_COLORS,
  MASTER_DATA,
} from '@/features/tech-tags/utils/tech-tag-master'
import {
  techTagCategoryFormSchema,
  techTagFormSchema,
  techTagSubCategoryFormSchema,
} from '@/infrastructure/validation/schemas'
import {
  TechTagCategorySchema,
  TechTagSchema,
  TechTagSubCategorySchema,
} from '@/shared/types'
import { useTechTagsStore } from '@/stores'

// ── スキーマバリデーション ──

describe('TechTagCategorySchema', () => {
  const validCategory = {
    id: crypto.randomUUID(),
    name: 'プログラミング言語',
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  it('有効なカテゴリデータを受け入れる', () => {
    expect(TechTagCategorySchema.parse(validCategory)).toEqual(validCategory)
  })

  it('nameが空文字の場合に拒否する', () => {
    expect(() =>
      TechTagCategorySchema.parse({ ...validCategory, name: '' }),
    ).toThrow()
  })

  it('nameが100文字を超える場合に拒否する', () => {
    expect(() =>
      TechTagCategorySchema.parse({ ...validCategory, name: 'a'.repeat(101) }),
    ).toThrow()
  })

  it('sortOrderが負数の場合に拒否する', () => {
    expect(() =>
      TechTagCategorySchema.parse({ ...validCategory, sortOrder: -1 }),
    ).toThrow()
  })
})

describe('TechTagSubCategorySchema', () => {
  const validSubCategory = {
    id: crypto.randomUUID(),
    categoryId: crypto.randomUUID(),
    name: 'バックエンド系',
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  it('有効なサブカテゴリデータを受け入れる', () => {
    expect(TechTagSubCategorySchema.parse(validSubCategory)).toEqual(
      validSubCategory,
    )
  })

  it('categoryIdがUUIDでない場合に拒否する', () => {
    expect(() =>
      TechTagSubCategorySchema.parse({
        ...validSubCategory,
        categoryId: 'not-a-uuid',
      }),
    ).toThrow()
  })
})

describe('TechTagSchema（categoryId/subCategoryId追加後）', () => {
  const categoryId = crypto.randomUUID()

  const validTag = {
    id: crypto.randomUUID(),
    name: 'TypeScript',
    color: '#3b82f6',
    categoryId,
    subCategoryId: null,
    note: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  it('有効なタグデータを受け入れる', () => {
    expect(TechTagSchema.parse(validTag)).toEqual(validTag)
  })

  it('categoryIdが必須である', () => {
    const { categoryId: _, ...withoutCategoryId } = validTag
    expect(() => TechTagSchema.parse(withoutCategoryId)).toThrow()
  })

  it('subCategoryIdがnull許容である', () => {
    const result = TechTagSchema.parse({ ...validTag, subCategoryId: null })
    expect(result.subCategoryId).toBeNull()
  })

  it('subCategoryIdにUUIDを設定できる', () => {
    const subCategoryId = crypto.randomUUID()
    const result = TechTagSchema.parse({ ...validTag, subCategoryId })
    expect(result.subCategoryId).toBe(subCategoryId)
  })

  it('noteがnull許容かつ200文字以内である', () => {
    expect(TechTagSchema.parse({ ...validTag, note: '備考メモ' }).note).toBe(
      '備考メモ',
    )
    expect(() =>
      TechTagSchema.parse({ ...validTag, note: 'x'.repeat(201) }),
    ).toThrow()
  })
})

// ── フォームバリデーション ──

describe('techTagFormSchema（カテゴリ対応）', () => {
  const validForm = {
    name: 'React',
    color: '#3b82f6',
    categoryId: crypto.randomUUID(),
    subCategoryId: null,
    note: null,
  }

  it('有効なフォームデータを受け入れる', () => {
    expect(techTagFormSchema.parse(validForm)).toEqual(validForm)
  })

  it('categoryIdが未指定の場合に拒否する', () => {
    const { categoryId: _, ...withoutCategoryId } = validForm
    expect(() => techTagFormSchema.parse(withoutCategoryId)).toThrow()
  })
})

describe('techTagCategoryFormSchema', () => {
  it('有効なカテゴリ名を受け入れる', () => {
    expect(techTagCategoryFormSchema.parse({ name: 'クラウド' })).toEqual({
      name: 'クラウド',
    })
  })

  it('空文字のカテゴリ名を拒否する', () => {
    expect(() => techTagCategoryFormSchema.parse({ name: '' })).toThrow()
  })
})

describe('techTagSubCategoryFormSchema', () => {
  it('有効なサブカテゴリフォームを受け入れる', () => {
    const data = { categoryId: crypto.randomUUID(), name: 'AWS' }
    expect(techTagSubCategoryFormSchema.parse(data)).toEqual(data)
  })
})

// ── マスタデータ整合性 ──

describe('MASTER_DATA 整合性', () => {
  it('全カテゴリにデフォルト色が定義されている', () => {
    for (const cat of MASTER_DATA) {
      expect(
        CATEGORY_DEFAULT_COLORS[cat.name],
        `${cat.name} のデフォルト色が未定義`,
      ).toBeDefined()
    }
  })

  it('全タグのnameが50文字以内である', () => {
    for (const cat of MASTER_DATA) {
      for (const sub of cat.subCategories) {
        for (const tag of sub.tags) {
          expect(
            tag.name.length,
            `${cat.name} > ${sub.name} > ${tag.name} が50文字超`,
          ).toBeLessThanOrEqual(50)
        }
      }
    }
  })

  it('カテゴリ数が17件である', () => {
    expect(MASTER_DATA).toHaveLength(17)
  })

  it('全タグ件数が正しい', () => {
    let tagCount = 0
    for (const cat of MASTER_DATA) {
      for (const sub of cat.subCategories) {
        tagCount += sub.tags.length
      }
    }
    expect(tagCount).toBe(199)
  })
})

// ── ストア: カテゴリ/サブカテゴリ CRUD ──

describe('tech-tags-store カテゴリ管理', () => {
  beforeEach(() => {
    const store = useTechTagsStore.getState()
    store.resetAll()
  })

  describe('seedFromMaster', () => {
    it('マスタデータからカテゴリ・サブカテゴリ・タグをシードできる', () => {
      const store = useTechTagsStore.getState()
      store.seedFromMaster()

      const { techTags, techTagCategories, techTagSubCategories } =
        useTechTagsStore.getState()

      expect(techTagCategories.length).toBe(17)
      expect(techTagSubCategories.length).toBeGreaterThan(0)
      expect(techTags.length).toBe(199)

      // カテゴリの並び順が0始まりで連番
      for (let i = 0; i < techTagCategories.length; i++) {
        expect(techTagCategories[i]?.sortOrder).toBe(i)
      }
    })

    it('全タグがカテゴリ/サブカテゴリを正しく参照している', () => {
      const store = useTechTagsStore.getState()
      store.seedFromMaster()

      const { techTags, techTagCategories, techTagSubCategories } =
        useTechTagsStore.getState()
      const categoryIds = new Set(techTagCategories.map((c) => c.id))
      const subCategoryIds = new Set(techTagSubCategories.map((s) => s.id))

      for (const tag of techTags) {
        expect(
          categoryIds.has(tag.categoryId),
          `タグ "${tag.name}" のcategoryIdが無効`,
        ).toBe(true)
        if (tag.subCategoryId) {
          expect(
            subCategoryIds.has(tag.subCategoryId),
            `タグ "${tag.name}" のsubCategoryIdが無効`,
          ).toBe(true)
        }
      }
    })

    it('既にデータがある場合はシードしない', () => {
      const store = useTechTagsStore.getState()
      store.seedFromMaster()
      const countBefore = useTechTagsStore.getState().techTags.length

      store.seedFromMaster()
      const countAfter = useTechTagsStore.getState().techTags.length

      expect(countAfter).toBe(countBefore)
    })
  })

  describe('カテゴリ CRUD', () => {
    it('カテゴリを追加できる', () => {
      const store = useTechTagsStore.getState()
      const cat = store.addCategory({ name: 'テストカテゴリ', sortOrder: 0 })

      expect(cat.name).toBe('テストカテゴリ')
      expect(cat.id).toBeDefined()
      expect(useTechTagsStore.getState().techTagCategories).toHaveLength(1)
    })

    it('カテゴリを更新できる', () => {
      const store = useTechTagsStore.getState()
      const cat = store.addCategory({ name: 'Before', sortOrder: 0 })

      store.updateCategory({ id: cat.id, name: 'After' })

      const updated = useTechTagsStore
        .getState()
        .techTagCategories.find((c) => c.id === cat.id)
      expect(updated?.name).toBe('After')
    })

    it('カテゴリを削除すると配下のサブカテゴリとタグも削除される', () => {
      const store = useTechTagsStore.getState()
      const cat = store.addCategory({ name: 'Cat1', sortOrder: 0 })
      const sub = store.addSubCategory({
        categoryId: cat.id,
        name: 'Sub1',
        sortOrder: 0,
      })
      store.addTechTag({
        name: 'Tag1',
        color: '#000000',
        categoryId: cat.id,
        subCategoryId: sub.id,
        note: null,
      })

      store.deleteCategory(cat.id)

      const state = useTechTagsStore.getState()
      expect(state.techTagCategories).toHaveLength(0)
      expect(state.techTagSubCategories).toHaveLength(0)
      expect(state.techTags).toHaveLength(0)
    })
  })

  describe('サブカテゴリ CRUD', () => {
    it('サブカテゴリを追加できる', () => {
      const store = useTechTagsStore.getState()
      const cat = store.addCategory({ name: 'Cat', sortOrder: 0 })
      const sub = store.addSubCategory({
        categoryId: cat.id,
        name: 'Sub',
        sortOrder: 0,
      })

      expect(sub.name).toBe('Sub')
      expect(sub.categoryId).toBe(cat.id)
      expect(useTechTagsStore.getState().techTagSubCategories).toHaveLength(1)
    })

    it('サブカテゴリを更新できる', () => {
      const store = useTechTagsStore.getState()
      const cat = store.addCategory({ name: 'Cat', sortOrder: 0 })
      const sub = store.addSubCategory({
        categoryId: cat.id,
        name: 'Before',
        sortOrder: 0,
      })

      store.updateSubCategory({ id: sub.id, name: 'After' })

      const updated = useTechTagsStore
        .getState()
        .techTagSubCategories.find((s) => s.id === sub.id)
      expect(updated?.name).toBe('After')
    })

    it('サブカテゴリを削除すると配下のタグのsubCategoryIdがnullになる', () => {
      const store = useTechTagsStore.getState()
      const cat = store.addCategory({ name: 'Cat', sortOrder: 0 })
      const sub = store.addSubCategory({
        categoryId: cat.id,
        name: 'Sub',
        sortOrder: 0,
      })
      const tag = store.addTechTag({
        name: 'Tag',
        color: '#000000',
        categoryId: cat.id,
        subCategoryId: sub.id,
        note: null,
      })

      store.deleteSubCategory(sub.id)

      const state = useTechTagsStore.getState()
      expect(state.techTagSubCategories).toHaveLength(0)
      const updatedTag = state.techTags.find((t) => t.id === tag.id)
      expect(updatedTag?.subCategoryId).toBeNull()
    })
  })

  describe('タグ CRUD（カテゴリ対応）', () => {
    it('カテゴリ付きのタグを追加できる', () => {
      const store = useTechTagsStore.getState()
      const cat = store.addCategory({ name: 'Cat', sortOrder: 0 })
      const tag = store.addTechTag({
        name: 'TypeScript',
        color: '#3b82f6',
        categoryId: cat.id,
        subCategoryId: null,
        note: null,
      })

      expect(tag.categoryId).toBe(cat.id)
      expect(tag.subCategoryId).toBeNull()
    })

    it('カテゴリとサブカテゴリ付きのタグを追加できる', () => {
      const store = useTechTagsStore.getState()
      const cat = store.addCategory({ name: 'Cat', sortOrder: 0 })
      const sub = store.addSubCategory({
        categoryId: cat.id,
        name: 'Sub',
        sortOrder: 0,
      })
      const tag = store.addTechTag({
        name: 'React',
        color: '#61dafb',
        categoryId: cat.id,
        subCategoryId: sub.id,
        note: null,
      })

      expect(tag.categoryId).toBe(cat.id)
      expect(tag.subCategoryId).toBe(sub.id)
    })
  })
})
