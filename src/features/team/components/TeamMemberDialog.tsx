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
import type {
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from 'react-hook-form'
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/ui/tabs'
import { useCanViewFinancials } from '@/shared/hooks/use-financial-visibility'
import { useToast } from '@/shared/hooks/use-toast'
import type {
  Company,
  ContractType,
  ContractUnitPriceEntry,
  Division,
  Member,
  Section,
  TechTag,
  TechTagCategory,
  TechTagSubCategory,
  UnitPriceEntry,
  UpdateMember,
} from '@/shared/types'
import { CONTRACT_TYPE_OPTIONS } from '@/shared/types'
import { getNewlyOutOfRangeAssignmentMonths } from '@/shared/utils/budget-utils'
import { pickReadableTextColor } from '@/shared/utils/color-contrast'
import { filterTechTags } from '@/shared/utils/tag-filter'
import {
  useAssignmentStore,
  useCompaniesStore,
  useMembersStore,
  useTeamStore,
  useTechTagsStore,
} from '@/stores'
import { MemberSkillPanel } from './MemberSkillPanel'

/**
 * 今日の日付を YYYY-MM-DD 形式で取得
 */
function getTodayDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

interface TeamMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member?: Member | null
  defaultSectionId?: string | null
}

export function TeamMemberDialog({
  open,
  onOpenChange,
  member,
  defaultSectionId,
}: TeamMemberDialogProps) {
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
  const [contractType, setContractType] = useState<ContractType | null>(null)
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [unitPriceHistory, setUnitPriceHistory] = useState<UnitPriceEntry[]>([])
  const [contractUnitPriceHistory, setContractUnitPriceHistory] = useState<
    ContractUnitPriceEntry[]
  >([])
  const [pendingSave, setPendingSave] = useState<{
    payload: UpdateMember
    conflicts: { assignmentId: string; monthKey: string }[]
  } | null>(null)

  const isEditing = !!member
  const roles = getRoles()

  const sortedCompanies = useMemo(
    () => [...companies].sort((a, b) => a.sortOrder - b.sortOrder),
    [companies],
  )

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<MemberFormValues>({
    resolver: zodResolver(memberFormSchema),
    defaultValues: {
      name: '',
      email: null,
      role: '',
      isActive: true,
    },
  })

  useEffect(() => {
    if (open) {
      loadTechTags()
      loadCompanies()
      reset({
        name: member?.name ?? '',
        email: member?.email ?? null,
        role: member?.role ?? '',
        capacityRatio: member?.capacityRatio ?? 1,
        isActive: member?.isActive ?? true,
        sectionId: member?.sectionId ?? defaultSectionId ?? null,
        companyId: member?.companyId ?? null,
        contractType: member?.contractType ?? null,
        startDate: member?.startDate ?? null,
        endDate: member?.endDate ?? null,
        unitPriceHistory: member?.unitPriceHistory ?? [],
        contractUnitPriceHistory: member?.contractUnitPriceHistory ?? [],
      })
      setSelectedTagIds(member?.techTagIds ?? [])
      setSectionId(member?.sectionId ?? defaultSectionId ?? null)
      setCompanyId(member?.companyId ?? null)
      setContractType(member?.contractType ?? null)
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
  }, [open, member, defaultSectionId, reset, loadTechTags, loadCompanies])

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
      field:
        | 'effectiveFrom'
        | 'amount'
        | 'settlementLowerHours'
        | 'settlementUpperHours',
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
        contractType,
        startDate: startDate || null,
        endDate: endDate || null,
        unitPriceHistory: startDate ? unitPriceHistory : [],
        contractUnitPriceHistory: companyId
          ? contractUnitPriceHistory.map((entry) => ({
              ...entry,
              // フォームの0（NumericInput空欄）はデータ上の未設定（undefined）へ正規化する
              settlementLowerHours: entry.settlementLowerHours || undefined,
              settlementUpperHours: entry.settlementUpperHours || undefined,
            }))
          : [],
        techTagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
      }

      if (isEditing && member) {
        const updatedPayload: UpdateMember = { id: member.id, ...payload }
        // 契約単価履歴/endDateの変更により、編集前は契約対象範囲内だった既存アサインが
        // 新たに範囲外になっていないか確認する
        const newMemberCandidate: Member = {
          ...member,
          contractUnitPriceHistory: updatedPayload.contractUnitPriceHistory,
          endDate: updatedPayload.endDate ?? null,
        }
        const conflicts = getNewlyOutOfRangeAssignmentMonths(
          member,
          newMemberCandidate,
          useAssignmentStore.getState().assignments,
        )
        if (conflicts.length > 0) {
          setPendingSave({ payload: updatedPayload, conflicts })
          return
        }
        updateMember(updatedPayload)
        toast({ title: '担当者を更新しました' })
        onOpenChange(false)
        return
      }

      addMember(payload)
      toast({ title: '担当者を追加しました' })
      onOpenChange(false)
    },
    [
      isEditing,
      member,
      sectionId,
      companyId,
      contractType,
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

  const affectedMonths = useMemo(() => {
    if (!pendingSave) return []
    return Array.from(
      new Set(pendingSave.conflicts.map((c) => c.monthKey)),
    ).sort()
  }, [pendingSave])

  const handleConfirmClearConflicts = useCallback(() => {
    if (!pendingSave) return
    updateMember(pendingSave.payload)
    const { updateMonthlyValue } = useAssignmentStore.getState()
    for (const { assignmentId, monthKey } of pendingSave.conflicts) {
      updateMonthlyValue(assignmentId, monthKey, 0)
    }
    toast({
      title: `担当者を更新し、契約対象範囲外の${pendingSave.conflicts.length}件のアサインを解除しました`,
    })
    setPendingSave(null)
    onOpenChange(false)
  }, [pendingSave, updateMember, toast, onOpenChange])

  const handleCancelConflicts = useCallback(() => {
    setPendingSave(null)
  }, [])

  const sortedDivisions = useMemo(
    () => [...divisions].sort((a, b) => a.sortOrder - b.sortOrder),
    [divisions],
  )

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? '担当者を編集' : '新規担当者'}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? '担当者の情報を編集します。'
                : '新しい担当者を追加します。'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {isEditing && member ? (
              <Tabs defaultValue="basic">
                <TabsList>
                  <TabsTrigger value="basic">基本情報</TabsTrigger>
                  <TabsTrigger value="skill">スキル・成長記録</TabsTrigger>
                </TabsList>
                <TabsContent value="basic">
                  <MemberBasicFields
                    register={register}
                    watch={watch}
                    setValue={setValue}
                    errors={errors}
                    roles={roles}
                    sectionId={sectionId}
                    setSectionId={setSectionId}
                    companyId={companyId}
                    handleCompanyChange={handleCompanyChange}
                    contractType={contractType}
                    setContractType={setContractType}
                    sortedDivisions={sortedDivisions}
                    sections={sections}
                    sortedCompanies={sortedCompanies}
                    startDate={startDate}
                    endDate={endDate}
                    handleStartDateChange={handleStartDateChange}
                    setEndDate={setEndDate}
                    unitPriceHistory={unitPriceHistory}
                    handleAddPriceEntry={handleAddPriceEntry}
                    handleDeletePriceEntry={handleDeletePriceEntry}
                    handlePriceEntryChange={handlePriceEntryChange}
                    contractUnitPriceHistory={contractUnitPriceHistory}
                    handleAddContractPriceEntry={handleAddContractPriceEntry}
                    handleDeleteContractPriceEntry={
                      handleDeleteContractPriceEntry
                    }
                    handleContractPriceEntryChange={
                      handleContractPriceEntryChange
                    }
                    techTags={techTags}
                    techTagCategories={techTagCategories}
                    techTagSubCategories={techTagSubCategories}
                    selectedTagIds={selectedTagIds}
                    setSelectedTagIds={setSelectedTagIds}
                  />
                </TabsContent>
                <TabsContent value="skill">
                  <MemberSkillPanel member={member} />
                </TabsContent>
              </Tabs>
            ) : (
              <MemberBasicFields
                register={register}
                watch={watch}
                setValue={setValue}
                errors={errors}
                roles={roles}
                sectionId={sectionId}
                setSectionId={setSectionId}
                companyId={companyId}
                handleCompanyChange={handleCompanyChange}
                contractType={contractType}
                setContractType={setContractType}
                sortedDivisions={sortedDivisions}
                sections={sections}
                sortedCompanies={sortedCompanies}
                startDate={startDate}
                endDate={endDate}
                handleStartDateChange={handleStartDateChange}
                setEndDate={setEndDate}
                unitPriceHistory={unitPriceHistory}
                handleAddPriceEntry={handleAddPriceEntry}
                handleDeletePriceEntry={handleDeletePriceEntry}
                handlePriceEntryChange={handlePriceEntryChange}
                contractUnitPriceHistory={contractUnitPriceHistory}
                handleAddContractPriceEntry={handleAddContractPriceEntry}
                handleDeleteContractPriceEntry={handleDeleteContractPriceEntry}
                handleContractPriceEntryChange={handleContractPriceEntryChange}
                techTags={techTags}
                techTagCategories={techTagCategories}
                techTagSubCategories={techTagSubCategories}
                selectedTagIds={selectedTagIds}
                setSelectedTagIds={setSelectedTagIds}
              />
            )}

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

      <Dialog
        open={pendingSave !== null}
        onOpenChange={(next) => {
          if (!next) handleCancelConflicts()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>契約対象範囲外のアサインがあります</DialogTitle>
            <DialogDescription>
              契約単価・在籍期間の変更により、以下の
              {affectedMonths.join('、')}
              月に含まれる{pendingSave?.conflicts.length ?? 0}
              件のアサインが契約対象範囲外になります。解除（0に設定）してよろしいですか？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelConflicts}
            >
              キャンセル
            </Button>
            <Button type="button" onClick={handleConfirmClearConflicts}>
              解除して保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

interface MemberBasicFieldsProps {
  register: UseFormRegister<MemberFormValues>
  // 稼働率上限はNumericInput（value/onValueChange形式）で扱うため、registerではなく
  // watch/setValueで橋渡しする（development-patterns.md §6.3）
  watch: UseFormWatch<MemberFormValues>
  setValue: UseFormSetValue<MemberFormValues>
  errors: FieldErrors<MemberFormValues>
  roles: string[]
  sectionId: string | null
  setSectionId: (id: string | null) => void
  companyId: string | null
  handleCompanyChange: (id: string | null) => void
  contractType: ContractType | null
  setContractType: (value: ContractType | null) => void
  sortedDivisions: Division[]
  sections: Section[]
  sortedCompanies: Company[]
  startDate: string
  endDate: string
  handleStartDateChange: (value: string) => void
  setEndDate: (value: string) => void
  unitPriceHistory: UnitPriceEntry[]
  handleAddPriceEntry: () => void
  handleDeletePriceEntry: (index: number) => void
  handlePriceEntryChange: (
    index: number,
    field: 'effectiveFrom' | 'amount',
    value: string | number,
  ) => void
  contractUnitPriceHistory: ContractUnitPriceEntry[]
  handleAddContractPriceEntry: () => void
  handleDeleteContractPriceEntry: (index: number) => void
  handleContractPriceEntryChange: (
    index: number,
    field:
      | 'effectiveFrom'
      | 'amount'
      | 'settlementLowerHours'
      | 'settlementUpperHours',
    value: string | number,
  ) => void
  techTags: TechTag[]
  techTagCategories: TechTagCategory[]
  techTagSubCategories: TechTagSubCategory[]
  selectedTagIds: string[]
  setSelectedTagIds: React.Dispatch<React.SetStateAction<string[]>>
}

const UNAFFILIATED_FIELD_VALUE = '__none__'
const NO_COMPANY_FIELD_VALUE = '__none__'
const NO_CONTRACT_TYPE_FIELD_VALUE = '__none__'

/**
 * 担当者ダイアログの「基本情報」タブ内容。左列に基本項目・単価履歴、
 * 右列に技術タグを配置する二列構成（幅を広げたダイアログ前提のレイアウト）。
 */
function MemberBasicFields({
  register,
  watch,
  setValue,
  errors,
  roles,
  sectionId,
  setSectionId,
  companyId,
  handleCompanyChange,
  contractType,
  setContractType,
  sortedDivisions,
  sections,
  sortedCompanies,
  startDate,
  endDate,
  handleStartDateChange,
  setEndDate,
  unitPriceHistory,
  handleAddPriceEntry,
  handleDeletePriceEntry,
  handlePriceEntryChange,
  contractUnitPriceHistory,
  handleAddContractPriceEntry,
  handleDeleteContractPriceEntry,
  handleContractPriceEntryChange,
  techTags,
  techTagCategories,
  techTagSubCategories,
  selectedTagIds,
  setSelectedTagIds,
}: MemberBasicFieldsProps) {
  // 金額の可視性がない場合は単価履歴・契約単価履歴の編集セクションを非表示にする
  // （フォーム値自体は保持されるため、保存してもデータは失われない）
  const canViewFinancials = useCanViewFinancials()
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      <div className="space-y-4">
        {/* 氏名 */}
        <div className="space-y-2">
          <Label htmlFor="member-name">氏名</Label>
          <Input
            id="member-name"
            {...register('name')}
            placeholder="氏名を入力"
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>

        {/* メールアドレス */}
        <div className="space-y-2">
          <Label htmlFor="member-email">メールアドレス</Label>
          <Input
            id="member-email"
            type="email"
            {...register('email')}
            placeholder="メールアドレスを入力（任意）"
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        {/* 所属課 */}
        <div className="space-y-2">
          <Label>所属</Label>
          <Combobox
            value={sectionId ?? UNAFFILIATED_FIELD_VALUE}
            onValueChange={(v) =>
              setSectionId(v === UNAFFILIATED_FIELD_VALUE ? null : v)
            }
            groups={
              [
                {
                  label: '',
                  options: [
                    { value: UNAFFILIATED_FIELD_VALUE, label: '未所属' },
                  ],
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

        {/* 所属会社 */}
        <div className="space-y-2">
          <Label>所属会社</Label>
          <Combobox
            value={companyId ?? NO_COMPANY_FIELD_VALUE}
            onValueChange={(v) =>
              handleCompanyChange(v === NO_COMPANY_FIELD_VALUE ? null : v)
            }
            groups={
              [
                {
                  label: '',
                  options: [{ value: NO_COMPANY_FIELD_VALUE, label: '未設定' }],
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

        {/* 契約形態 */}
        <div className="space-y-2">
          <Label>契約形態</Label>
          <Combobox
            value={contractType ?? NO_CONTRACT_TYPE_FIELD_VALUE}
            onValueChange={(v) =>
              setContractType(
                v === NO_CONTRACT_TYPE_FIELD_VALUE ? null : (v as ContractType),
              )
            }
            groups={
              [
                {
                  label: '',
                  options: [
                    { value: NO_CONTRACT_TYPE_FIELD_VALUE, label: '未設定' },
                  ],
                },
                {
                  label: '',
                  options: CONTRACT_TYPE_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label,
                  })),
                },
              ] as ComboboxGroup[]
            }
            placeholder="未設定"
            searchPlaceholder="契約形態を検索..."
          />
        </div>

        {/* 役割 */}
        <div className="space-y-2">
          <Label htmlFor="member-role">役割</Label>
          <Input
            id="member-role"
            {...register('role')}
            placeholder="役割を入力"
            list="role-list"
          />
          <datalist id="role-list">
            {roles.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>

        {/* 稼働率上限（時短勤務・兼務・部分参画への対応） */}
        <div className="space-y-2">
          <Label htmlFor="member-capacity-ratio">稼働率上限（人月）</Label>
          <NumericInput
            id="member-capacity-ratio"
            value={watch('capacityRatio') ?? 1}
            onValueChange={(v) => setValue('capacityRatio', v)}
            placeholder="1.0"
          />
          <p className="text-xs text-muted-foreground">
            月次アサインの上限。時短勤務・兼務・部分参画のメンバーは1.0未満を設定します（既定1.0）
          </p>
        </div>

        {/* 開始日・終了日 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="member-start-date">開始日</Label>
            <Input
              id="member-start-date"
              type="date"
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="member-end-date">終了日</Label>
            <Input
              id="member-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={!startDate}
              min={startDate || undefined}
            />
          </div>
        </div>
        {errors.endDate && (
          <p className="text-sm text-destructive">{errors.endDate.message}</p>
        )}

        {/* 単価履歴 */}
        {canViewFinancials && startDate && (
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
                    <span className="text-sm text-muted-foreground">万円</span>
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
        {canViewFinancials && companyId && (
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
                    <span className="text-sm text-muted-foreground">万円</span>
                    {/* 準委任の精算幅（時間/月）。両方入力で幅内=固定/下回り=控除/超過=追加請求。
                        空欄（0）=精算なし */}
                    <NumericInput
                      value={entry.settlementLowerHours ?? 0}
                      onValueChange={(v) =>
                        handleContractPriceEntryChange(
                          index,
                          'settlementLowerHours',
                          v,
                        )
                      }
                      className="w-20"
                      placeholder="下限h"
                      aria-label={`精算幅下限${index + 1}（時間）`}
                      title="準委任の精算幅・下限（時間/月）。使わない場合は空欄"
                    />
                    <span className="text-xs text-muted-foreground">〜</span>
                    <NumericInput
                      value={entry.settlementUpperHours ?? 0}
                      onValueChange={(v) =>
                        handleContractPriceEntryChange(
                          index,
                          'settlementUpperHours',
                          v,
                        )
                      }
                      className="w-20"
                      placeholder="上限h"
                      aria-label={`精算幅上限${index + 1}（時間）`}
                      title="準委任の精算幅・上限（時間/月）。使わない場合は空欄"
                    />
                    <span className="text-xs text-muted-foreground">h</span>
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

        {/* アクティブ */}
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="member-isActive"
            {...register('isActive')}
            className="h-4 w-4 rounded border-input"
          />
          <Label htmlFor="member-isActive">アクティブ</Label>
        </div>
      </div>

      {/* 技術タグ（右列） */}
      <div className="space-y-2">
        <Label>技術タグ</Label>
        {techTags.length === 0 ? (
          <p className="text-sm text-muted-foreground">技術タグが未登録です</p>
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
                      className="cursor-pointer gap-1 border-transparent"
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
            <TeamMemberTagSelector
              techTags={techTags}
              techTagCategories={techTagCategories}
              techTagSubCategories={techTagSubCategories}
              selectedTagIds={selectedTagIds}
              onSelect={(id) => setSelectedTagIds((prev) => [...prev, id])}
            />
          </>
        )}
      </div>
    </div>
  )
}

function TeamMemberTagSelector({
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
      <p className="py-1 text-xs text-muted-foreground">
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
      <div className="max-h-[160px] space-y-0.5 overflow-y-auto rounded-md border border-border p-2">
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
                className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs font-medium text-muted-foreground hover:bg-muted/50"
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
                          <p className="ml-1 text-xs text-muted-foreground/60">
                            {sub.name}
                          </p>
                          {subTags.map((tag) => (
                            <button
                              key={tag.id}
                              type="button"
                              className="flex w-full items-center gap-2 rounded px-2 py-0.5 text-left text-sm hover:bg-muted/50"
                              onClick={() => onSelect(tag.id)}
                            >
                              <span
                                className="inline-block h-3 w-3 shrink-0 rounded-full"
                                style={{ backgroundColor: tag.color }}
                              />
                              {tag.name}
                            </button>
                          ))}
                        </div>
                      )
                    })}
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
                        className="flex w-full items-center gap-2 rounded px-2 py-0.5 text-left text-sm hover:bg-muted/50"
                        onClick={() => onSelect(tag.id)}
                      >
                        <span
                          className="inline-block h-3 w-3 shrink-0 rounded-full"
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
