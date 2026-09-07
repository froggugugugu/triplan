export interface TagFilterResult {
  visibleTagIds: Set<string>
  visibleCategoryIds: Set<string>
  visibleSubCategoryIds: Set<string>
  expandedCategoryIds: Set<string>
}

interface TagLike {
  id: string
  name: string
  categoryId: string
  subCategoryId: string | null
}

interface CategoryLike {
  id: string
  name: string
}

interface SubCategoryLike {
  id: string
  categoryId: string
  name: string
}

export function filterTechTags(
  keyword: string,
  tags: TagLike[],
  categories: CategoryLike[],
  subCategories: SubCategoryLike[],
): TagFilterResult {
  const visibleTagIds = new Set<string>()
  const visibleCategoryIds = new Set<string>()
  const visibleSubCategoryIds = new Set<string>()
  const expandedCategoryIds = new Set<string>()

  const trimmed = keyword.trim().toLowerCase()

  if (!trimmed) {
    for (const tag of tags) visibleTagIds.add(tag.id)
    for (const cat of categories) visibleCategoryIds.add(cat.id)
    for (const sub of subCategories) visibleSubCategoryIds.add(sub.id)
    return {
      visibleTagIds,
      visibleCategoryIds,
      visibleSubCategoryIds,
      expandedCategoryIds,
    }
  }

  // Check category name matches → show all children
  const matchedCategoryIds = new Set<string>()
  for (const cat of categories) {
    if (cat.name.toLowerCase().includes(trimmed)) {
      matchedCategoryIds.add(cat.id)
      visibleCategoryIds.add(cat.id)
      expandedCategoryIds.add(cat.id)
    }
  }

  // Check subcategory name matches → show all tags in that subcategory
  const matchedSubCategoryIds = new Set<string>()
  for (const sub of subCategories) {
    if (sub.name.toLowerCase().includes(trimmed)) {
      matchedSubCategoryIds.add(sub.id)
      visibleSubCategoryIds.add(sub.id)
      visibleCategoryIds.add(sub.categoryId)
      expandedCategoryIds.add(sub.categoryId)
    }
  }

  // Process tags
  for (const tag of tags) {
    const tagMatches = tag.name.toLowerCase().includes(trimmed)
    const categoryMatches = matchedCategoryIds.has(tag.categoryId)
    const subCategoryMatches =
      tag.subCategoryId && matchedSubCategoryIds.has(tag.subCategoryId)

    if (tagMatches || categoryMatches || subCategoryMatches) {
      visibleTagIds.add(tag.id)
      visibleCategoryIds.add(tag.categoryId)
      expandedCategoryIds.add(tag.categoryId)
      if (tag.subCategoryId) {
        visibleSubCategoryIds.add(tag.subCategoryId)
      }
    }
  }

  // For matched categories, add all their subcategories
  for (const sub of subCategories) {
    if (matchedCategoryIds.has(sub.categoryId)) {
      visibleSubCategoryIds.add(sub.id)
    }
  }

  return {
    visibleTagIds,
    visibleCategoryIds,
    visibleSubCategoryIds,
    expandedCategoryIds,
  }
}
