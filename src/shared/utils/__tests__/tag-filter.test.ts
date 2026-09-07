import { describe, expect, it } from 'vitest'
import { filterTechTags } from '@/shared/utils/tag-filter'

const categories = [
  { id: 'cat-1', name: 'フロントエンド' },
  { id: 'cat-2', name: 'バックエンド' },
  { id: 'cat-3', name: 'インフラ' },
]

const subCategories = [
  { id: 'sub-1', categoryId: 'cat-1', name: 'フレームワーク' },
  { id: 'sub-2', categoryId: 'cat-1', name: 'UIライブラリ' },
  { id: 'sub-3', categoryId: 'cat-2', name: 'Web Framework' },
]

const tags = [
  { id: 'tag-1', name: 'React', categoryId: 'cat-1', subCategoryId: 'sub-1' },
  { id: 'tag-2', name: 'Vue.js', categoryId: 'cat-1', subCategoryId: 'sub-1' },
  {
    id: 'tag-3',
    name: 'Tailwind CSS',
    categoryId: 'cat-1',
    subCategoryId: 'sub-2',
  },
  { id: 'tag-4', name: 'Express', categoryId: 'cat-2', subCategoryId: 'sub-3' },
  { id: 'tag-5', name: 'NestJS', categoryId: 'cat-2', subCategoryId: 'sub-3' },
  { id: 'tag-6', name: 'Docker', categoryId: 'cat-3', subCategoryId: null },
  { id: 'tag-7', name: 'Kubernetes', categoryId: 'cat-3', subCategoryId: null },
]

describe('filterTechTags', () => {
  it('empty keyword returns all items visible', () => {
    const result = filterTechTags('', tags, categories, subCategories)
    expect(result.visibleTagIds.size).toBe(7)
    expect(result.visibleCategoryIds.size).toBe(3)
    expect(result.visibleSubCategoryIds.size).toBe(3)
    expect(result.expandedCategoryIds.size).toBe(0)
  })

  it('whitespace-only keyword returns all items visible', () => {
    const result = filterTechTags('   ', tags, categories, subCategories)
    expect(result.visibleTagIds.size).toBe(7)
    expect(result.expandedCategoryIds.size).toBe(0)
  })

  it('tag name match shows only matching tag', () => {
    const result = filterTechTags('React', tags, categories, subCategories)
    expect(result.visibleTagIds).toEqual(new Set(['tag-1']))
    expect(result.visibleCategoryIds).toEqual(new Set(['cat-1']))
    expect(result.visibleSubCategoryIds).toEqual(new Set(['sub-1']))
    expect(result.expandedCategoryIds).toEqual(new Set(['cat-1']))
  })

  it('category name match shows all children', () => {
    const result = filterTechTags(
      'フロントエンド',
      tags,
      categories,
      subCategories,
    )
    expect(result.visibleTagIds).toEqual(new Set(['tag-1', 'tag-2', 'tag-3']))
    expect(result.visibleCategoryIds).toEqual(new Set(['cat-1']))
    expect(result.visibleSubCategoryIds).toEqual(new Set(['sub-1', 'sub-2']))
    expect(result.expandedCategoryIds).toEqual(new Set(['cat-1']))
  })

  it('subcategory name match shows all tags in that subcategory', () => {
    const result = filterTechTags(
      'フレームワーク',
      tags,
      categories,
      subCategories,
    )
    expect(result.visibleTagIds).toEqual(new Set(['tag-1', 'tag-2']))
    expect(result.visibleCategoryIds).toEqual(new Set(['cat-1']))
    expect(result.visibleSubCategoryIds).toEqual(new Set(['sub-1']))
    expect(result.expandedCategoryIds).toEqual(new Set(['cat-1']))
  })

  it('case-insensitive matching', () => {
    const result = filterTechTags('react', tags, categories, subCategories)
    expect(result.visibleTagIds).toEqual(new Set(['tag-1']))
  })

  it('Japanese partial match', () => {
    const result = filterTechTags('インフラ', tags, categories, subCategories)
    expect(result.visibleTagIds).toEqual(new Set(['tag-6', 'tag-7']))
    expect(result.visibleCategoryIds).toEqual(new Set(['cat-3']))
  })

  it('no matches returns empty sets', () => {
    const result = filterTechTags(
      'xyz-nonexistent',
      tags,
      categories,
      subCategories,
    )
    expect(result.visibleTagIds.size).toBe(0)
    expect(result.visibleCategoryIds.size).toBe(0)
    expect(result.visibleSubCategoryIds.size).toBe(0)
    expect(result.expandedCategoryIds.size).toBe(0)
  })

  it('auto-expands categories with matches', () => {
    const result = filterTechTags('Docker', tags, categories, subCategories)
    expect(result.expandedCategoryIds).toEqual(new Set(['cat-3']))
  })

  it('partial tag name match', () => {
    const result = filterTechTags('Tail', tags, categories, subCategories)
    expect(result.visibleTagIds).toEqual(new Set(['tag-3']))
  })

  it('subcategory match with English name', () => {
    const result = filterTechTags('Web Frame', tags, categories, subCategories)
    expect(result.visibleTagIds).toEqual(new Set(['tag-4', 'tag-5']))
    expect(result.visibleSubCategoryIds).toEqual(new Set(['sub-3']))
  })
})
