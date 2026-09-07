import { zodResolver } from '@hookform/resolvers/zod'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  type MemberFormValues,
  memberFormSchema,
} from '@/infrastructure/validation/schemas'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Combobox, type ComboboxGroup } from '@/shared/components/ui/combobox'
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
import { NumericInput } from '@/shared/components/ui/numeric-input'
import { useToast } from '@/shared/hooks/use-toast'
import type {
  ContractUnitPriceEntry,
  Member,
  UnitPriceEntry,
} from '@/shared/types'
import { pickReadableTextColor } from '@/shared/utils/color-contrast'
import { filterTechTags } from '@/shared/utils/tag-filter'
import {
  useCompaniesStore,
  useMembersStore,
  useTeamStore,
  useTechTagsStore,
} from '@/stores'

/**
 * 今日の日付を YYYY-MM-DD 形式で取得
 */
export function getTodayDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

interface MemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member?: Member | null
}

export function MemberDialog({
  open,
  onOpenChange,
  member,
}: MemberDialogProps) {
  const { toast } = useToast()
  const addMember = useMembersStore((state) => state.addMember)
  const updateMember = useMembersStore((state) => state.updateMember)
  const getRoles = useMembersStore((state) => state.getRoles)
  const techTags = useTechTagsStore((s) => s.techTags)
  const techTagCategories = useTechTagsStore((s) => s.techTagCategories)
  const techTagSubCategories = useTechTagsStore((s) => s.techTagSubCategories)
  const loadTechTags = useTechTagsStore((s) => s.loadTechTags)
  const divisions = useTeamStore((s) => s.divisions)
  const sections = useTeamStore((s) => s.sections)
  const companies = useCompaniesStore((s) => s.companies)
  const loadCompanies = useCompaniesStore((s) => s.loadCompanies)

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [sectionId, setSectionId] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [unitPriceHistory, setUnitPriceHistory] = useState<UnitPriceEntry[]>([])
  const [contractUnitPriceHistory, setContractUnitPriceHistory] = useState<
    ContractUnitPriceEntry[]
  >([])

  const isEditing = !!member
  const roles = getRoles()
  const UNAFFILIATED_VALUE = '__none__'
  const NO_COMPANY_VALUE = '__none__'

  const sortedCompanies = useMemo(
    () => [...companies].sort((a, b) => a.sortOrder - b.sortOrder),
    [companies],
  )

  const sortedDivisions = useMemo(
    () => [...divisions].sort((a, b) => a.sortOrder - b.sortOrder),
    [divisions],
  )

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MemberFormValues>({
    resolver: zodResolver(memberFormSchema),
    defaultValues: {
      name: member?.name ?? '',
      role: member?.role ?? '',
      isActive: member?.isActive ?? true,
      startDate: member?.startDate ?? getTodayDate(),
      endDate: member?.endDate ?? null,
      unitPriceHistory: member?.unitPriceHistory ?? [],
    },
  })

  useEffect(() => {
    if (open) {
      loadTechTags()
      loadCompanies()
      reset({
        name: member?.name ?? '',
        role: member?.role ?? '',
        isActive: member?.isActive ?? true,
        sectionId: member?.sectionId ?? null,
        companyId: member?.companyId ?? null,
        startDate: member?.startDate ?? null,
        endDate: member?.endDate ?? null,
        unitPriceHistory: member?.unitPriceHistory ?? [],
        contractUnitPriceHistory: member?.contractUnitPriceHistory ?? [],
      })
      setSelectedTagIds(member?.techTagIds ?? [])
      setSectionId(member?.sectionId ?? null)
      setCompanyId(member?.companyId ?? null)
      setStartDate(member?.startDate ?? getTodayDate())
      setEndDate(member?.endDate ?? '')
      const sorted = [...(member?.unitPriceHistory ?? [])].sort((a, b) =>
        a.effectiveFrom.localeCompare(b.effectiveFrom),
      )
      setUnitPriceHistory(sorted)
      const sortedContract = [...(member?.contractUnitPriceHistory ?? [])].sort(
        (a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom),
      )
      setContractUnitPriceHistory(sortedContract)
    }
  }, [open, member, reset, loadTechTags, loadCompanies])

  const handleStartDateChange = useCallback(
    (newStartDate: string) => {
      setStartDate(newStartDate)
      if (!newStartDate) {
        setUnitPriceHistory([])
        setEndDate('')
        return
      }
      const yearMonth = newStartDate.substring(0, 7)
      if (unitPriceHistory.length === 0) {
        setUnitPriceHistory([{ effectiveFrom: yearMonth, amount: 0 }])
      } else {
        setUnitPriceHistory((prev) => {
          const sorted = [...prev].sort((a, b) =>
            a.effectiveFrom.localeCompare(b.effectiveFrom),
          )
          const first = sorted[0]
          if (first) {
            sorted[0] = { ...first, effectiveFrom: yearMonth }
          }
          return sorted
        })
      }
    },
    [unitPriceHistory.length],
  )

  const handleCompanyChange = useCallback(
    (newCompanyId: string | null) => {
      setCompanyId(newCompanyId)
      if (!newCompanyId) {
        setContractUnitPriceHistory([])
        return
      }
      if (contractUnitPriceHistory.length === 0) {
        const yearMonth = (startDate || getTodayDate()).substring(0, 7)
        setContractUnitPriceHistory([{ effectiveFrom: yearMonth, amount: 0 }])
      }
    },
    [contractUnitPriceHistory.length, startDate],
  )

  const handleAddContractPriceEntry = useCallback(() => {
    const lastEntry =
      contractUnitPriceHistory[contractUnitPriceHistory.length - 1]
    let nextFrom: string
    if (lastEntry) {
      const [y, m] = lastEntry.effectiveFrom.split('-').map(Number) as [
        number,
        number,
      ]
      const nextMonth = m === 12 ? 1 : m + 1
      const nextYear = m === 12 ? y + 1 : y
      nextFrom = `${nextYear}-${String(nextMonth).padStart(2, '0')}`
    } else {
      nextFrom = startDate ? startDate.substring(0, 7) : ''
    }
    setContractUnitPriceHistory((prev) => [
      ...prev,
      { effectiveFrom: nextFrom, amount: 0 },
    ])
  }, [contractUnitPriceHistory, startDate])

  const handleDeleteContractPriceEntry = useCallback(
    (index: number) => {
      if (contractUnitPriceHistory.length <= 1) return
      setContractUnitPriceHistory((prev) => prev.filter((_, i) => i !== index))
    },
    [contractUnitPriceHistory.length],
  )

  const handleContractPriceEntryChange = useCallback(
    (
      index: number,
      field: 'effectiveFrom' | 'amount',
      value: string | number,
    ) => {
      setContractUnitPriceHistory((prev) => {
        const updated = prev.map((entry, i) =>
          i === index ? { ...entry, [field]: value } : entry,
        )
        if (field === 'effectiveFrom') {
          return updated.sort((a, b) =>
            a.effectiveFrom.localeCompare(b.effectiveFrom),
          )
        }
        return updated
      })
    },
    [],
  )

  const handleAddPriceEntry = useCallback(() => {
    const lastEntry = unitPriceHistory[unitPriceHistory.length - 1]
    let nextFrom: string
    if (lastEntry) {
      const [y, m] = lastEntry.effectiveFrom.split('-').map(Number) as [
        number,
        number,
      ]
      const nextMonth = m === 12 ? 1 : m + 1
      const nextYear = m === 12 ? y + 1 : y
      nextFrom = `${nextYear}-${String(nextMonth).padStart(2, '0')}`
    } else {
      nextFrom = startDate ? startDate.substring(0, 7) : ''
    }
    setUnitPriceHistory((prev) => [
      ...prev,
      { effectiveFrom: nextFrom, amount: 0 },
    ])
  }, [unitPriceHistory, startDate])

  const handleDeletePriceEntry = useCallback(
    (index: number) => {
      if (unitPriceHistory.length <= 1) return
      setUnitPriceHistory((prev) => prev.filter((_, i) => i !== index))
    },
    [unitPriceHistory.length],
  )

  const handlePriceEntryChange = useCallback(
    (
      index: number,
      field: 'effectiveFrom' | 'amount',
      value: string | number,
    ) => {
      setUnitPriceHistory((prev) => {
        const updated = prev.map((entry, i) =>
          i === index ? { ...entry, [field]: value } : entry,
        )
        if (field === 'effectiveFrom') {
          return updated.sort((a, b) =>
            a.effectiveFrom.localeCompare(b.effectiveFrom),
          )
        }
        return updated
      })
    },
    [],
  )

  const onSubmit = useCallback(
    (data: MemberFormValues) => {
      if (startDate && endDate && endDate < startDate) {
        toast({
          title: '終了日は開始日以降に設定してください',
          variant: 'destructive',
        })
        return
      }
      const payload = {
        ...data,
        sectionId,
        companyId,
        techTagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        startDate: startDate || null,
        endDate: endDate || null,
        unitPriceHistory: startDate ? unitPriceHistory : [],
        contractUnitPriceHistory: companyId ? contractUnitPriceHistory : [],
      }
      if (isEditing && member) {
        updateMember({ id: member.id, ...payload })
        toast({ title: '担当者を更新しました' })
      } else {
        addMember(payload)
        toast({ title: '担当者を追加しました' })
      }
      onOpenChange(false)
    },
    [
      isEditing,
      member,
      sectionId,
      companyId,
      startDate,
      endDate,
      unitPriceHistory,
      contractUnitPriceHistory,
      addMember,
      updateMember,
      onOpenChange,
      toast,
      selectedTagIds,
    ],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? '担当者を編集' : '新規担当者'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? '担当者の情報を編集します。'
              : '新しい担当者を追加します。'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">氏名</Label>
            <Input id="name" {...register('name')} placeholder="氏名を入力" />
            {errors.name ? (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>所属</Label>
            <Combobox
              value={sectionId ?? UNAFFILIATED_VALUE}
              onValueChange={(v) =>
                setSectionId(v === UNAFFILIATED_VALUE ? null : v)
              }
              groups={
                [
                  {
                    label: '',
                    options: [{ value: UNAFFILIATED_VALUE, label: '未所属' }],
                  },
                  ...sortedDivisions
                    .filter((div) =>
                      sections.some((s) => s.divisionId === div.id),
                    )
                    .map((div) => ({
                      label: div.name,
                      options: sections
                        .filter((s) => s.divisionId === div.id)
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .map((sec) => ({
                          value: sec.id,
                          label: `${div.name} / ${sec.name}`,
                        })),
                    })),
                ] as ComboboxGroup[]
              }
              placeholder="未所属"
              searchPlaceholder="所属を検索..."
            />
          </div>

          <div className="space-y-2">
            <Label>所属会社</Label>
            <Combobox
              value={companyId ?? NO_COMPANY_VALUE}
              onValueChange={(v) =>
                handleCompanyChange(v === NO_COMPANY_VALUE ? null : v)
              }
              groups={
                [
                  {
                    label: '',
                    options: [{ value: NO_COMPANY_VALUE, label: '未設定' }],
                  },
                  {
                    label: '',
                    options: sortedCompanies.map((c) => ({
                      value: c.id,
                      label: c.name,
                    })),
                  },
                ] as ComboboxGroup[]
              }
              placeholder="未設定"
              searchPlaceholder="所属会社を検索..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">役割</Label>
            <Input
              id="role"
              {...register('role')}
              placeholder="役割を入力"
              list="role-list"
            />
            <datalist id="role-list">
              {roles.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            {errors.role ? (
              <p className="text-sm text-destructive">{errors.role.message}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">開始日</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
              />
              {errors.startDate ? (
                <p className="text-sm text-destructive">
                  {errors.startDate.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">終了日</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={!startDate}
                min={startDate || undefined}
              />
              {errors.endDate ? (
                <p className="text-sm text-destructive">
                  {errors.endDate.message}
                </p>
              ) : null}
            </div>
          </div>

          {/* 単価履歴 */}
          {startDate && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>単価履歴（万円）</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddPriceEntry}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  単価変更を追加
                </Button>
              </div>
              {unitPriceHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  単価履歴がありません
                </p>
              ) : (
                <div className="space-y-2">
                  {unitPriceHistory.map((entry, index) => (
                    <div
                      key={`${entry.effectiveFrom}-${index}`}
                      className="flex items-center gap-2"
                    >
                      <Input
                        type="month"
                        value={entry.effectiveFrom}
                        onChange={(e) =>
                          handlePriceEntryChange(
                            index,
                            'effectiveFrom',
                            e.target.value,
                          )
                        }
                        className="w-40"
                        disabled={index === 0}
                      />
                      <NumericInput
                        value={entry.amount}
                        onValueChange={(v) =>
                          handlePriceEntryChange(index, 'amount', v)
                        }
                        className="w-28"
                        placeholder="万円"
                      />
                      <span className="text-sm text-muted-foreground">
                        万円
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDeletePriceEntry(index)}
                        disabled={unitPriceHistory.length <= 1}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 契約単価履歴（所属会社への支払用） */}
          {companyId && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>契約単価履歴（万円）</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddContractPriceEntry}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  契約単価変更を追加
                </Button>
              </div>
              {contractUnitPriceHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  契約単価履歴がありません
                </p>
              ) : (
                <div className="space-y-2">
                  {contractUnitPriceHistory.map((entry, index) => (
                    <div
                      key={`${entry.effectiveFrom}-${index}`}
                      className="flex items-center gap-2"
                    >
                      <Input
                        type="month"
                        value={entry.effectiveFrom}
                        onChange={(e) =>
                          handleContractPriceEntryChange(
                            index,
                            'effectiveFrom',
                            e.target.value,
                          )
                        }
                        className="w-40"
                        disabled={index === 0}
                      />
                      <NumericInput
                        value={entry.amount}
                        onValueChange={(v) =>
                          handleContractPriceEntryChange(index, 'amount', v)
                        }
                        className="w-28"
                        placeholder="万円"
                      />
                      <span className="text-sm text-muted-foreground">
                        万円
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteContractPriceEntry(index)}
                        disabled={contractUnitPriceHistory.length <= 1}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>技術タグ</Label>
            {techTags.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                技術タグが未登録です
              </p>
            ) : (
              <>
                {selectedTagIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTagIds.map((tagId) => {
                      const tag = techTags.find((t) => t.id === tagId)
                      if (!tag) return null
                      return (
                        <Badge
                          key={tag.id}
                          style={{
                            backgroundColor: tag.color,
                            color: pickReadableTextColor(tag.color),
                          }}
                          className="border-transparent gap-1 cursor-pointer"
                          onClick={() =>
                            setSelectedTagIds((prev) =>
                              prev.filter((id) => id !== tagId),
                            )
                          }
                        >
                          {tag.name}
                          <X className="h-3 w-3" />
                        </Badge>
                      )
                    })}
                  </div>
                )}
                <MemberTagSelector
                  techTags={techTags}
                  techTagCategories={techTagCategories}
                  techTagSubCategories={techTagSubCategories}
                  selectedTagIds={selectedTagIds}
                  onSelect={(id) => setSelectedTagIds((prev) => [...prev, id])}
                />
              </>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isActive"
              {...register('isActive')}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="isActive">アクティブ</Label>
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

function MemberTagSelector({
  techTags,
  techTagCategories,
  techTagSubCategories,
  selectedTagIds,
  onSelect,
}: {
  techTags: {
    id: string
    name: string
    color: string
    categoryId: string
    subCategoryId: string | null
  }[]
  techTagCategories: { id: string; name: string; sortOrder: number }[]
  techTagSubCategories: {
    id: string
    categoryId: string
    name: string
    sortOrder: number
  }[]
  selectedTagIds: string[]
  onSelect: (id: string) => void
}) {
  const [expandedCat, setExpandedCat] = useState<string | null>(null)
  const [tagKeyword, setTagKeyword] = useState('')

  const sortedCats = useMemo(
    () => [...techTagCategories].sort((a, b) => a.sortOrder - b.sortOrder),
    [techTagCategories],
  )

  const unselectedTags = useMemo(
    () => techTags.filter((t) => !selectedTagIds.includes(t.id)),
    [techTags, selectedTagIds],
  )

  const filterResult = useMemo(
    () =>
      filterTechTags(
        tagKeyword,
        unselectedTags,
        techTagCategories,
        techTagSubCategories,
      ),
    [tagKeyword, unselectedTags, techTagCategories, techTagSubCategories],
  )

  if (unselectedTags.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-1">
        すべてのタグが選択済みです
      </p>
    )
  }

  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={tagKeyword}
          onChange={(e) => setTagKeyword(e.target.value)}
          placeholder="タグを検索..."
          className="h-7 pl-7 text-xs"
        />
      </div>
      <div className="max-h-[160px] overflow-y-auto rounded-md border border-border p-2 space-y-0.5">
        {sortedCats.map((cat) => {
          if (!filterResult.visibleCategoryIds.has(cat.id)) return null
          const catUnselected = unselectedTags.filter(
            (t) =>
              t.categoryId === cat.id && filterResult.visibleTagIds.has(t.id),
          )
          if (catUnselected.length === 0) return null
          const isExpanded =
            expandedCat === cat.id ||
            filterResult.expandedCategoryIds.has(cat.id)

          return (
            <div key={cat.id}>
              <button
                type="button"
                className="flex items-center gap-1 w-full rounded px-1 py-0.5 text-left text-xs font-medium text-muted-foreground hover:bg-muted/50"
                onClick={() => setExpandedCat(isExpanded ? null : cat.id)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                {cat.name}
                <span className="text-xs font-normal">
                  ({catUnselected.length})
                </span>
              </button>
              {isExpanded && (
                <div className="ml-3 space-y-0.5">
                  {techTagSubCategories
                    .filter(
                      (s) =>
                        s.categoryId === cat.id &&
                        filterResult.visibleSubCategoryIds.has(s.id),
                    )
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((sub) => {
                      const subTags = catUnselected.filter(
                        (t) => t.subCategoryId === sub.id,
                      )
                      if (subTags.length === 0) return null
                      return (
                        <div key={sub.id}>
                          <p className="text-xs text-muted-foreground/60 ml-1">
                            {sub.name}
                          </p>
                          {subTags.map((tag) => (
                            <button
                              key={tag.id}
                              type="button"
                              className="flex items-center gap-2 w-full rounded px-2 py-0.5 text-left text-sm hover:bg-muted/50"
                              onClick={() => onSelect(tag.id)}
                            >
                              <span
                                className="inline-block h-3 w-3 rounded-full shrink-0"
                                style={{ backgroundColor: tag.color }}
                              />
                              {tag.name}
                            </button>
                          ))}
                        </div>
                      )
                    })}
                  {/* カテゴリ直下 */}
                  {catUnselected
                    .filter(
                      (t) =>
                        !t.subCategoryId ||
                        !techTagSubCategories.some(
                          (s) => s.id === t.subCategoryId,
                        ),
                    )
                    .map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        className="flex items-center gap-2 w-full rounded px-2 py-0.5 text-left text-sm hover:bg-muted/50"
                        onClick={() => onSelect(tag.id)}
                      >
                        <span
                          className="inline-block h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.name}
                      </button>
                    ))}
                </div>
              )}
            </div>
          )
        })}
        {tagKeyword.trim() && filterResult.visibleTagIds.size === 0 && (
          <p className="text-xs text-muted-foreground py-2 text-center">
            一致するタグがありません
          </p>
        )}
      </div>
    </div>
  )
}
