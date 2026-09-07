import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/shared/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { useToast } from '@/shared/hooks/use-toast'
import type {
  TechTag,
  TechTagCategory,
  TechTagSubCategory,
} from '@/shared/types'
import { pickReadableTextColor } from '@/shared/utils/color-contrast'
import { filterTechTags } from '@/shared/utils/tag-filter'
import { useTechTagsStore } from '@/stores'
import { TechTagDialog } from '../components/TechTagDialog'

export function TechTagsPage() {
  const { toast } = useToast()
  const techTags = useTechTagsStore((s) => s.techTags)
  const techTagCategories = useTechTagsStore((s) => s.techTagCategories)
  const techTagSubCategories = useTechTagsStore((s) => s.techTagSubCategories)
  const loadTechTags = useTechTagsStore((s) => s.loadTechTags)
  const seedFromMaster = useTechTagsStore((s) => s.seedFromMaster)
  const deleteTechTag = useTechTagsStore((s) => s.deleteTechTag)
  const addCategory = useTechTagsStore((s) => s.addCategory)
  const updateCategory = useTechTagsStore((s) => s.updateCategory)
  const deleteCategory = useTechTagsStore((s) => s.deleteCategory)
  const addSubCategory = useTechTagsStore((s) => s.addSubCategory)
  const updateSubCategory = useTechTagsStore((s) => s.updateSubCategory)
  const deleteSubCategory = useTechTagsStore((s) => s.deleteSubCategory)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTag, setEditTag] = useState<TechTag | null>(null)
  const [presetCategoryId, setPresetCategoryId] = useState<string | null>(null)
  const [presetSubCategoryId, setPresetSubCategoryId] = useState<string | null>(
    null,
  )

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [tagToDelete, setTagToDelete] = useState<TechTag | null>(null)

  const [catDeleteDialogOpen, setCatDeleteDialogOpen] = useState(false)
  const [catToDelete, setCatToDelete] = useState<TechTagCategory | null>(null)

  const [subCatDeleteDialogOpen, setSubCatDeleteDialogOpen] = useState(false)
  const [subCatToDelete, setSubCatToDelete] =
    useState<TechTagSubCategory | null>(null)

  const [addCatDialogOpen, setAddCatDialogOpen] = useState(false)
  const [newCatName, setNewCatName] = useState('')

  const [editCatDialogOpen, setEditCatDialogOpen] = useState(false)
  const [editCat, setEditCat] = useState<TechTagCategory | null>(null)
  const [editCatName, setEditCatName] = useState('')

  const [addSubCatDialogOpen, setAddSubCatDialogOpen] = useState(false)
  const [addSubCatParentId, setAddSubCatParentId] = useState<string | null>(
    null,
  )
  const [newSubCatName, setNewSubCatName] = useState('')

  const [editSubCatDialogOpen, setEditSubCatDialogOpen] = useState(false)
  const [editSubCat, setEditSubCat] = useState<TechTagSubCategory | null>(null)
  const [editSubCatName, setEditSubCatName] = useState('')

  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set())
  const [searchKeyword, setSearchKeyword] = useState('')

  useEffect(() => {
    loadTechTags()
  }, [loadTechTags])

  useEffect(() => {
    if (techTagCategories.length === 0 && techTags.length === 0) {
      seedFromMaster()
    }
  }, [techTagCategories.length, techTags.length, seedFromMaster])

  useEffect(() => {
    if (techTagCategories.length > 0 && openCategories.size === 0) {
      setOpenCategories(new Set(techTagCategories.map((c) => c.id)))
    }
  }, [techTagCategories, openCategories.size])

  const sortedCategories = useMemo(
    () => [...techTagCategories].sort((a, b) => a.sortOrder - b.sortOrder),
    [techTagCategories],
  )

  const filterResult = useMemo(
    () =>
      filterTechTags(
        searchKeyword,
        techTags,
        techTagCategories,
        techTagSubCategories,
      ),
    [searchKeyword, techTags, techTagCategories, techTagSubCategories],
  )

  const toggleCategory = useCallback((catId: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev)
      if (next.has(catId)) {
        next.delete(catId)
      } else {
        next.add(catId)
      }
      return next
    })
  }, [])

  // ── タグ操作 ──

  const handleAddTag = useCallback(
    (categoryId: string, subCategoryId?: string) => {
      setEditTag(null)
      setPresetCategoryId(categoryId)
      setPresetSubCategoryId(subCategoryId ?? null)
      setDialogOpen(true)
    },
    [],
  )

  const handleEditTag = useCallback((tag: TechTag) => {
    setEditTag(tag)
    setPresetCategoryId(null)
    setPresetSubCategoryId(null)
    setDialogOpen(true)
  }, [])

  const handleDeleteTagClick = useCallback((tag: TechTag) => {
    setTagToDelete(tag)
    setDeleteDialogOpen(true)
  }, [])

  const handleDeleteTagConfirm = useCallback(() => {
    if (tagToDelete) {
      deleteTechTag(tagToDelete.id)
      toast({ title: '技術タグを削除しました' })
    }
    setDeleteDialogOpen(false)
    setTagToDelete(null)
  }, [tagToDelete, deleteTechTag, toast])

  // ── カテゴリ操作 ──

  const handleAddCategory = useCallback(() => {
    if (!newCatName.trim()) return
    addCategory({
      name: newCatName.trim(),
      sortOrder: techTagCategories.length,
    })
    toast({ title: 'カテゴリを追加しました' })
    setNewCatName('')
    setAddCatDialogOpen(false)
  }, [newCatName, addCategory, techTagCategories.length, toast])

  const handleEditCategoryOpen = useCallback((cat: TechTagCategory) => {
    setEditCat(cat)
    setEditCatName(cat.name)
    setEditCatDialogOpen(true)
  }, [])

  const handleEditCategoryConfirm = useCallback(() => {
    if (editCat && editCatName.trim()) {
      updateCategory({ id: editCat.id, name: editCatName.trim() })
      toast({ title: 'カテゴリを更新しました' })
    }
    setEditCatDialogOpen(false)
    setEditCat(null)
  }, [editCat, editCatName, updateCategory, toast])

  const handleDeleteCategoryClick = useCallback((cat: TechTagCategory) => {
    setCatToDelete(cat)
    setCatDeleteDialogOpen(true)
  }, [])

  const handleDeleteCategoryConfirm = useCallback(() => {
    if (catToDelete) {
      deleteCategory(catToDelete.id)
      toast({ title: 'カテゴリを削除しました' })
    }
    setCatDeleteDialogOpen(false)
    setCatToDelete(null)
  }, [catToDelete, deleteCategory, toast])

  // ── サブカテゴリ操作 ──

  const handleAddSubCategoryOpen = useCallback((categoryId: string) => {
    setAddSubCatParentId(categoryId)
    setNewSubCatName('')
    setAddSubCatDialogOpen(true)
  }, [])

  const handleAddSubCategoryConfirm = useCallback(() => {
    if (!addSubCatParentId || !newSubCatName.trim()) return
    const siblingsCount = techTagSubCategories.filter(
      (s) => s.categoryId === addSubCatParentId,
    ).length
    addSubCategory({
      categoryId: addSubCatParentId,
      name: newSubCatName.trim(),
      sortOrder: siblingsCount,
    })
    toast({ title: 'サブカテゴリを追加しました' })
    setNewSubCatName('')
    setAddSubCatDialogOpen(false)
  }, [
    addSubCatParentId,
    newSubCatName,
    techTagSubCategories,
    addSubCategory,
    toast,
  ])

  const handleEditSubCategoryOpen = useCallback(
    (subCat: TechTagSubCategory) => {
      setEditSubCat(subCat)
      setEditSubCatName(subCat.name)
      setEditSubCatDialogOpen(true)
    },
    [],
  )

  const handleEditSubCategoryConfirm = useCallback(() => {
    if (editSubCat && editSubCatName.trim()) {
      updateSubCategory({ id: editSubCat.id, name: editSubCatName.trim() })
      toast({ title: 'サブカテゴリを更新しました' })
    }
    setEditSubCatDialogOpen(false)
    setEditSubCat(null)
  }, [editSubCat, editSubCatName, updateSubCategory, toast])

  const handleDeleteSubCategoryClick = useCallback(
    (subCat: TechTagSubCategory) => {
      setSubCatToDelete(subCat)
      setSubCatDeleteDialogOpen(true)
    },
    [],
  )

  const handleDeleteSubCategoryConfirm = useCallback(() => {
    if (subCatToDelete) {
      deleteSubCategory(subCatToDelete.id)
      toast({ title: 'サブカテゴリを削除しました' })
    }
    setSubCatDeleteDialogOpen(false)
    setSubCatToDelete(null)
  }, [subCatToDelete, deleteSubCategory, toast])

  const catTagCount = useCallback(
    (catId: string) => techTags.filter((t) => t.categoryId === catId).length,
    [techTags],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">技術タグ管理</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAddCatDialogOpen(true)}>
            <FolderPlus className="h-4 w-4" />
            カテゴリ追加
          </Button>
          <Button onClick={() => handleAddTag(sortedCategories[0]?.id ?? '')}>
            <Plus className="h-4 w-4" />
            新規タグ
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                技術タグ一覧（{techTagCategories.length}カテゴリ /{' '}
                {techTags.length}
                タグ）
              </CardTitle>
              <CardDescription>
                カテゴリ（大分類）・サブカテゴリ（中分類）ごとに技術タグを管理します
              </CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="タグ・カテゴリを検索..."
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {sortedCategories.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              カテゴリがありません。「カテゴリ追加」ボタンから追加してください。
            </p>
          ) : (
            <div className="space-y-2">
              {searchKeyword.trim() &&
                filterResult.visibleTagIds.size === 0 && (
                  <p className="py-8 text-center text-muted-foreground">
                    「{searchKeyword.trim()}
                    」に一致するタグ・カテゴリがありません
                  </p>
                )}
              {sortedCategories.map((cat) => {
                if (!filterResult.visibleCategoryIds.has(cat.id)) return null
                const catSubs = techTagSubCategories
                  .filter(
                    (s) =>
                      s.categoryId === cat.id &&
                      filterResult.visibleSubCategoryIds.has(s.id),
                  )
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                const isOpen =
                  openCategories.has(cat.id) ||
                  filterResult.expandedCategoryIds.has(cat.id)

                return (
                  <Collapsible
                    key={cat.id}
                    open={isOpen}
                    onOpenChange={() => toggleCategory(cat.id)}
                  >
                    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          aria-label={`${cat.name}を${isOpen ? '折りたたむ' : '展開する'}`}
                        >
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                      <span className="font-semibold flex-1">
                        {cat.name}
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          ({catTagCount(cat.id)})
                        </span>
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAddSubCategoryOpen(cat.id)
                          }}
                          title="サブカテゴリ追加"
                        >
                          <FolderPlus className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAddTag(cat.id)
                          }}
                          title="タグ追加"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEditCategoryOpen(cat)
                          }}
                          title="カテゴリ編集"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteCategoryClick(cat)
                          }}
                          title="カテゴリ削除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <CollapsibleContent>
                      <div className="ml-4 mt-1 space-y-1">
                        {catSubs.map((sub) => {
                          const subTags = techTags.filter(
                            (t) =>
                              t.subCategoryId === sub.id &&
                              filterResult.visibleTagIds.has(t.id),
                          )
                          return (
                            <SubCategorySection
                              key={sub.id}
                              subCategory={sub}
                              tags={subTags}
                              onAddTag={() => handleAddTag(cat.id, sub.id)}
                              onEditTag={handleEditTag}
                              onDeleteTag={handleDeleteTagClick}
                              onEditSubCategory={() =>
                                handleEditSubCategoryOpen(sub)
                              }
                              onDeleteSubCategory={() =>
                                handleDeleteSubCategoryClick(sub)
                              }
                            />
                          )
                        })}

                        {/* カテゴリ直下（サブカテゴリなし）のタグ */}
                        {(() => {
                          const allCatSubs = techTagSubCategories.filter(
                            (s) => s.categoryId === cat.id,
                          )
                          const subIds = new Set(allCatSubs.map((s) => s.id))
                          const uncategorizedTags = techTags.filter(
                            (t) =>
                              t.categoryId === cat.id &&
                              filterResult.visibleTagIds.has(t.id) &&
                              (!t.subCategoryId ||
                                !subIds.has(t.subCategoryId)),
                          )
                          if (uncategorizedTags.length === 0) return null
                          return (
                            <div className="ml-4 py-1">
                              <div className="flex flex-wrap gap-1.5">
                                {uncategorizedTags.map((tag) => (
                                  <TagBadge
                                    key={tag.id}
                                    tag={tag}
                                    onEdit={() => handleEditTag(tag)}
                                    onDelete={() => handleDeleteTagClick(tag)}
                                  />
                                ))}
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* タグ追加/編集ダイアログ */}
      <TechTagDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        techTag={editTag}
        presetCategoryId={presetCategoryId}
        presetSubCategoryId={presetSubCategoryId}
      />

      {/* タグ削除確認 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>技術タグの削除</DialogTitle>
            <DialogDescription>
              「{tagToDelete?.name}」を削除しますか？この操作は取り消せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button variant="destructive" onClick={handleDeleteTagConfirm}>
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* カテゴリ追加ダイアログ */}
      <Dialog open={addCatDialogOpen} onOpenChange={setAddCatDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>カテゴリ追加</DialogTitle>
            <DialogDescription>
              新しい大分類カテゴリを追加します。
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="カテゴリ名"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddCategory()
            }}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddCatDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button onClick={handleAddCategory} disabled={!newCatName.trim()}>
              追加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* カテゴリ編集ダイアログ */}
      <Dialog open={editCatDialogOpen} onOpenChange={setEditCatDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>カテゴリ編集</DialogTitle>
            <DialogDescription>カテゴリ名を変更します。</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="カテゴリ名"
            value={editCatName}
            onChange={(e) => setEditCatName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleEditCategoryConfirm()
            }}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditCatDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleEditCategoryConfirm}
              disabled={!editCatName.trim()}
            >
              更新
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* カテゴリ削除確認 */}
      <Dialog open={catDeleteDialogOpen} onOpenChange={setCatDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>カテゴリの削除</DialogTitle>
            <DialogDescription>
              「{catToDelete?.name}
              」を削除しますか？配下のサブカテゴリとタグもすべて削除されます。この操作は取り消せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCatDeleteDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button variant="destructive" onClick={handleDeleteCategoryConfirm}>
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* サブカテゴリ追加ダイアログ */}
      <Dialog open={addSubCatDialogOpen} onOpenChange={setAddSubCatDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>サブカテゴリ追加</DialogTitle>
            <DialogDescription>
              新しい中分類サブカテゴリを追加します。
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="サブカテゴリ名"
            value={newSubCatName}
            onChange={(e) => setNewSubCatName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddSubCategoryConfirm()
            }}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddSubCatDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleAddSubCategoryConfirm}
              disabled={!newSubCatName.trim()}
            >
              追加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* サブカテゴリ編集ダイアログ */}
      <Dialog
        open={editSubCatDialogOpen}
        onOpenChange={setEditSubCatDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>サブカテゴリ編集</DialogTitle>
            <DialogDescription>サブカテゴリ名を変更します。</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="サブカテゴリ名"
            value={editSubCatName}
            onChange={(e) => setEditSubCatName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleEditSubCategoryConfirm()
            }}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditSubCatDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleEditSubCategoryConfirm}
              disabled={!editSubCatName.trim()}
            >
              更新
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* サブカテゴリ削除確認 */}
      <Dialog
        open={subCatDeleteDialogOpen}
        onOpenChange={setSubCatDeleteDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>サブカテゴリの削除</DialogTitle>
            <DialogDescription>
              「{subCatToDelete?.name}
              」を削除しますか？配下のタグはカテゴリ直下に移動します。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSubCatDeleteDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSubCategoryConfirm}
            >
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── サブカテゴリセクション ──

function SubCategorySection({
  subCategory,
  tags,
  onAddTag,
  onEditTag,
  onDeleteTag,
  onEditSubCategory,
  onDeleteSubCategory,
}: {
  subCategory: TechTagSubCategory
  tags: TechTag[]
  onAddTag: () => void
  onEditTag: (tag: TechTag) => void
  onDeleteTag: (tag: TechTag) => void
  onEditSubCategory: () => void
  onDeleteSubCategory: () => void
}) {
  return (
    <div className="rounded-md border border-border/50 bg-background px-3 py-2">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-sm font-medium text-muted-foreground flex-1">
          {subCategory.name}
          <span className="ml-1 text-xs">({tags.length})</span>
        </span>
        <div className="flex gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onAddTag}
            title="タグ追加"
          >
            <Plus className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onEditSubCategory}
            title="サブカテゴリ編集"
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive hover:text-destructive"
            onClick={onDeleteSubCategory}
            title="サブカテゴリ削除"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <TagBadge
              key={tag.id}
              tag={tag}
              onEdit={() => onEditTag(tag)}
              onDelete={() => onDeleteTag(tag)}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground py-1">タグなし</p>
      )}
    </div>
  )
}

// ── タグバッジ ──

function TagBadge({
  tag,
  onEdit,
  onDelete,
}: {
  tag: TechTag
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <Badge
      style={{
        backgroundColor: tag.color,
        color: pickReadableTextColor(tag.color),
      }}
      className="border-transparent gap-1 pr-1 group cursor-default"
    >
      <span>{tag.name}</span>
      <button
        type="button"
        className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/20 rounded px-0.5"
        onClick={onEdit}
        title="編集"
      >
        <Pencil className="h-2.5 w-2.5" />
      </button>
      <button
        type="button"
        className="opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/20 rounded px-0.5"
        onClick={onDelete}
        title="削除"
      >
        <Trash2 className="h-2.5 w-2.5" />
      </button>
    </Badge>
  )
}
