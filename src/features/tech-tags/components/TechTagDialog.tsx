import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import {
  type TechTagFormValues,
  techTagFormSchema,
} from '@/infrastructure/validation/schemas'
import { Button } from '@/shared/components/ui/button'
import { Combobox } from '@/shared/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { useToast } from '@/shared/hooks/use-toast'
import type { TechTag } from '@/shared/types'
import { useTechTagsStore } from '@/stores'

interface TechTagDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  techTag?: TechTag | null
  presetCategoryId?: string | null
  presetSubCategoryId?: string | null
}

const NONE_VALUE = '__none__'

export function TechTagDialog({
  open,
  onOpenChange,
  techTag,
  presetCategoryId,
  presetSubCategoryId,
}: TechTagDialogProps) {
  const { toast } = useToast()
  const addTechTag = useTechTagsStore((s) => s.addTechTag)
  const updateTechTag = useTechTagsStore((s) => s.updateTechTag)
  const techTagCategories = useTechTagsStore((s) => s.techTagCategories)
  const techTagSubCategories = useTechTagsStore((s) => s.techTagSubCategories)

  const isEditing = !!techTag

  const sortedCategories = useMemo(
    () => [...techTagCategories].sort((a, b) => a.sortOrder - b.sortOrder),
    [techTagCategories],
  )

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TechTagFormValues>({
    resolver: zodResolver(techTagFormSchema),
    defaultValues: {
      name: '',
      color: '#3b82f6',
      categoryId: '',
      subCategoryId: null,
      note: null,
    },
  })

  const selectedCategoryId = watch('categoryId')

  const filteredSubCategories = useMemo(
    () =>
      techTagSubCategories
        .filter((s) => s.categoryId === selectedCategoryId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [techTagSubCategories, selectedCategoryId],
  )

  useEffect(() => {
    if (open) {
      const catId =
        techTag?.categoryId ?? presetCategoryId ?? sortedCategories[0]?.id ?? ''
      const subCatId = techTag?.subCategoryId ?? presetSubCategoryId ?? null
      reset({
        name: techTag?.name ?? '',
        color: techTag?.color ?? '#3b82f6',
        categoryId: catId,
        subCategoryId: subCatId,
        note: techTag?.note ?? null,
      })
    }
  }, [
    open,
    techTag,
    presetCategoryId,
    presetSubCategoryId,
    sortedCategories,
    reset,
  ])

  const onSubmit = useCallback(
    (data: TechTagFormValues) => {
      if (isEditing && techTag) {
        updateTechTag({ id: techTag.id, ...data })
        toast({ title: '技術タグを更新しました' })
      } else {
        addTechTag(data)
        toast({ title: '技術タグを追加しました' })
      }
      onOpenChange(false)
    },
    [isEditing, techTag, addTechTag, updateTechTag, onOpenChange, toast],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? '技術タグを編集' : '新規技術タグ'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? '技術タグの情報を編集します。'
              : '新しい技術タグを追加します。'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>カテゴリ（大分類）</Label>
            <Combobox
              value={selectedCategoryId}
              onValueChange={(v) => {
                setValue('categoryId', v, { shouldValidate: true })
                setValue('subCategoryId', null)
              }}
              options={sortedCategories.map((cat) => ({
                value: cat.id,
                label: cat.name,
              }))}
              placeholder="カテゴリを選択"
              searchPlaceholder="カテゴリを検索..."
            />
            {errors.categoryId ? (
              <p className="text-sm text-destructive">
                {errors.categoryId.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>サブカテゴリ（中分類）</Label>
            <Combobox
              value={watch('subCategoryId') ?? NONE_VALUE}
              onValueChange={(v) =>
                setValue('subCategoryId', v === NONE_VALUE ? null : v, {
                  shouldValidate: true,
                })
              }
              options={[
                { value: NONE_VALUE, label: 'なし' },
                ...filteredSubCategories.map((sub) => ({
                  value: sub.id,
                  label: sub.name,
                })),
              ]}
              placeholder="なし"
              searchPlaceholder="サブカテゴリを検索..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">タグ名</Label>
            <Input id="name" {...register('name')} placeholder="タグ名を入力" />
            {errors.name ? (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="color">色</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="color"
                value={watch('color')}
                onChange={(e) =>
                  setValue('color', e.target.value, { shouldValidate: true })
                }
                className="h-10 w-14 cursor-pointer rounded border border-input bg-background p-1"
              />
              <Input
                {...register('color')}
                placeholder="#3b82f6"
                className="flex-1"
              />
            </div>
            {errors.color ? (
              <p className="text-sm text-destructive">{errors.color.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">備考</Label>
            <Input
              id="note"
              value={watch('note') ?? ''}
              onChange={(e) =>
                setValue('note', e.target.value || null, {
                  shouldValidate: true,
                })
              }
              placeholder="備考（任意）"
            />
            {errors.note ? (
              <p className="text-sm text-destructive">{errors.note.message}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button type="submit">{isEditing ? '更新' : '追加'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
