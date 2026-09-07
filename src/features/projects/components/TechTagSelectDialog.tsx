import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { pickReadableTextColor } from '@/shared/utils/color-contrast'
import { filterTechTags } from '@/shared/utils/tag-filter'
import { useTechTagsStore } from '@/stores'

interface TechTagSelectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedTagIds: string[]
  onSave: (tagIds: string[]) => void
  columnName: string
}

export function TechTagSelectDialog({
  open,
  onOpenChange,
  selectedTagIds,
  onSave,
  columnName,
}: TechTagSelectDialogProps) {
  const techTags = useTechTagsStore((s) => s.techTags)
  const techTagCategories = useTechTagsStore((s) => s.techTagCategories)
  const techTagSubCategories = useTechTagsStore((s) => s.techTagSubCategories)
  const [selected, setSelected] = useState<string[]>(selectedTagIds)
  const [searchKeyword, setSearchKeyword] = useState('')

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

  const handleOpenChange = (value: boolean) => {
    if (value) {
      setSelected(selectedTagIds)
      setSearchKeyword('')
    }
    onOpenChange(value)
  }

  const toggleTag = (tagId: string) => {
    setSelected((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId],
    )
  }

  const handleSave = () => {
    onSave(selected)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>技術タグ選択 — {columnName}</DialogTitle>
          <DialogDescription>
            この工数列に紐付ける技術タグを選択してください
          </DialogDescription>
        </DialogHeader>

        {techTags.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            技術タグが登録されていません。技術タグ管理画面でタグを追加してください。
          </p>
        ) : (
          <>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="タグを検索..."
                className="pl-8"
              />
            </div>
            <div className="max-h-[400px] overflow-y-auto space-y-3 py-2">
              {searchKeyword.trim() &&
                filterResult.visibleTagIds.size === 0 && (
                  <p className="py-4 text-sm text-muted-foreground text-center">
                    一致するタグがありません
                  </p>
                )}
              {sortedCategories.map((cat) => {
                if (!filterResult.visibleCategoryIds.has(cat.id)) return null
                const catTags = techTags.filter(
                  (t) =>
                    t.categoryId === cat.id &&
                    filterResult.visibleTagIds.has(t.id),
                )
                if (catTags.length === 0) return null

                const catSubs = techTagSubCategories
                  .filter(
                    (s) =>
                      s.categoryId === cat.id &&
                      filterResult.visibleSubCategoryIds.has(s.id),
                  )
                  .sort((a, b) => a.sortOrder - b.sortOrder)

                return (
                  <div key={cat.id}>
                    <p className="text-xs font-semibold text-muted-foreground mb-1 px-1">
                      {cat.name}
                    </p>
                    {catSubs.map((sub) => {
                      const subTags = catTags.filter(
                        (t) => t.subCategoryId === sub.id,
                      )
                      if (subTags.length === 0) return null
                      return (
                        <div key={sub.id} className="mb-1">
                          <p className="text-xs text-muted-foreground/70 ml-2 mb-0.5">
                            {sub.name}
                          </p>
                          <div className="space-y-0.5 ml-2">
                            {subTags.map((tag) => (
                              <TagCheckbox
                                key={tag.id}
                                tag={tag}
                                checked={selected.includes(tag.id)}
                                onToggle={toggleTag}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    })}
                    {/* カテゴリ直下のタグ */}
                    {catTags
                      .filter(
                        (t) =>
                          !t.subCategoryId ||
                          !techTagSubCategories.some(
                            (s) => s.id === t.subCategoryId,
                          ),
                      )
                      .map((tag) => (
                        <div key={tag.id} className="ml-2">
                          <TagCheckbox
                            tag={tag}
                            checked={selected.includes(tag.id)}
                            onToggle={toggleTag}
                          />
                        </div>
                      ))}
                  </div>
                )
              })}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={techTags.length === 0}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TagCheckbox({
  tag,
  checked,
  onToggle,
}: {
  tag: { id: string; name: string; color: string }
  checked: boolean
  onToggle: (id: string) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-1.5 hover:bg-muted/50">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(tag.id)}
        className="h-4 w-4 rounded border-border"
      />
      <Badge
        style={{
          backgroundColor: tag.color,
          color: pickReadableTextColor(tag.color),
        }}
        className="border-transparent"
      >
        {tag.name}
      </Badge>
    </label>
  )
}
