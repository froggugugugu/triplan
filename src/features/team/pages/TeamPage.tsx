import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NameInputDialog } from '@/shared/components/NameInputDialog'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { useToast } from '@/shared/hooks/use-toast'
import type { Company } from '@/shared/types/company'
import type { Division } from '@/shared/types/division'
import type { Member } from '@/shared/types/member'
import type { Section } from '@/shared/types/section'
import type { TechTag } from '@/shared/types/tech-tag'
import {
  calcDivisionBudget,
  calcDivisionExpectedRevenue,
  calcSectionBudget,
  calcSectionExpectedRevenue,
  getApplicableUnitPrice,
} from '@/shared/utils/budget-utils'
import {
  filterMembersByCompanyIds,
  filterMembersByInternal,
  type InternalFilterMode,
} from '@/shared/utils/member-filter'
import {
  useAppStore,
  useAssignmentStore,
  useCompaniesStore,
  useMembersStore,
  usePersonnelPlanStore,
  useTeamStore,
  useTechTagsStore,
} from '@/stores'
import { CompanyBreakdownHoverCard } from '../components/CompanyBreakdownHoverCard'
import { MemberRow } from '../components/MemberRow'
import { TeamMemberDialog } from '../components/TeamMemberDialog'
import { TeamMemberFilterBar } from '../components/TeamMemberFilterBar'

const currencyFormatter = new Intl.NumberFormat('ja-JP')

function formatBudget(amount: number): string {
  return `${currencyFormatter.format(amount)}万円`
}

function getCurrentFiscalYear(startMonth: number): number {
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  return currentMonth >= startMonth ? now.getFullYear() : now.getFullYear() - 1
}

export function TeamPage() {
  const { toast } = useToast()
  const fiscalYearStartMonth = useAppStore((s) => s.fiscalYearStartMonth)

  // Team store
  const divisions = useTeamStore((s) => s.divisions)
  const allSections = useTeamStore((s) => s.sections)
  const loadTeam = useTeamStore((s) => s.loadTeam)
  const addDivision = useTeamStore((s) => s.addDivision)
  const updateDivision = useTeamStore((s) => s.updateDivision)
  const deleteDivision = useTeamStore((s) => s.deleteDivision)
  const addSection = useTeamStore((s) => s.addSection)
  const updateSection = useTeamStore((s) => s.updateSection)
  const deleteSection = useTeamStore((s) => s.deleteSection)

  // Members store
  const members = useMembersStore((s) => s.members)
  const loadMembers = useMembersStore((s) => s.loadMembers)
  const deleteMember = useMembersStore((s) => s.deleteMember)

  // Assignment store
  const loadAssignments = useAssignmentStore((s) => s.loadAssignments)
  const getMemberMonthlyTotal = useAssignmentStore(
    (s) => s.getMemberMonthlyTotal,
  )

  // Personnel plan store（TeamMemberDialogの人員計画クローズ連携に必要）
  const loadPersonnelPlans = usePersonnelPlanStore((s) => s.loadPersonnelPlans)

  // Companies store（所属会社表示・絞り込みに必要）
  const companies = useCompaniesStore((s) => s.companies)
  const loadCompanies = useCompaniesStore((s) => s.loadCompanies)

  // Tech tags store（保有スキルタグ表示に必要）
  const techTags = useTechTagsStore((s) => s.techTags)
  const loadTechTags = useTechTagsStore((s) => s.loadTechTags)

  // Local state
  const [selectedFiscalYear, setSelectedFiscalYear] = useState(() =>
    getCurrentFiscalYear(fiscalYearStartMonth),
  )
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([])
  const [internalFilter, setInternalFilter] =
    useState<InternalFilterMode>('all')
  const [expandedDivisions, setExpandedDivisions] = useState<Set<string>>(
    () => new Set(),
  )
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(),
  )

  // Dialog states
  const [nameDialogOpen, setNameDialogOpen] = useState(false)
  const [nameDialogTitle, setNameDialogTitle] = useState('')
  const [nameDialogDefault, setNameDialogDefault] = useState('')
  const [nameDialogCallback, setNameDialogCallback] = useState<
    ((name: string) => void) | null
  >(null)

  const [memberDialogOpen, setMemberDialogOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [memberDefaultSectionId, setMemberDefaultSectionId] = useState<
    string | null
  >(null)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'division' | 'section' | 'member'
    id: string
    name: string
  } | null>(null)

  // Load data
  useEffect(() => {
    loadTeam()
    loadMembers()
    loadAssignments()
    loadPersonnelPlans()
    loadCompanies()
    loadTechTags()
  }, [
    loadTeam,
    loadMembers,
    loadAssignments,
    loadPersonnelPlans,
    loadCompanies,
    loadTechTags,
  ])

  // Expand all divisions on first load
  const hasInitiallyExpanded = useRef(false)
  useEffect(() => {
    if (divisions.length > 0 && !hasInitiallyExpanded.current) {
      hasInitiallyExpanded.current = true
      setExpandedDivisions(new Set(divisions.map((d) => d.id)))
      setExpandedSections(new Set(allSections.map((s) => s.id)))
    }
  }, [divisions, allSections])

  // Fiscal year range
  const currentFY = getCurrentFiscalYear(fiscalYearStartMonth)
  const fyOptions = useMemo(() => {
    const years: number[] = []
    for (let y = currentFY - 2; y <= currentFY + 2; y++) {
      years.push(y)
    }
    return years
  }, [currentFY])

  // Sorted divisions
  const sortedDivisions = useMemo(
    () => [...divisions].sort((a, b) => a.sortOrder - b.sortOrder),
    [divisions],
  )

  // 所属会社・内部/外部リソースフィルタを適用したメンバー（既存の部門・課グルーピングとは独立に横断適用）
  const filteredMembers = useMemo(() => {
    const byCompany = filterMembersByCompanyIds(members, selectedCompanyIds)
    return filterMembersByInternal(byCompany, companies, internalFilter)
  }, [members, selectedCompanyIds, companies, internalFilter])

  // Unaffiliated members
  const unaffiliatedMembers = useMemo(
    () => filteredMembers.filter((m) => m.sectionId === null),
    [filteredMembers],
  )

  // 保有スキルタグ・所属会社名の取得ヘルパー
  const getMemberTags = useCallback(
    (member: Member): TechTag[] =>
      (member.techTagIds ?? [])
        .map((tagId) => techTags.find((t) => t.id === tagId))
        .filter((t): t is TechTag => t !== undefined),
    [techTags],
  )

  const getMemberCompanyName = useCallback(
    (member: Member): string => {
      if (!member.companyId) return '-'
      const company = companies.find((c) => c.id === member.companyId)
      return company?.name ?? '-'
    },
    [companies],
  )

  // Toggle helpers
  const toggleDivision = useCallback((id: string) => {
    setExpandedDivisions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const toggleSection = useCallback((id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // Name dialog helpers
  const openNameDialog = useCallback(
    (title: string, defaultValue: string, callback: (name: string) => void) => {
      setNameDialogTitle(title)
      setNameDialogDefault(defaultValue)
      setNameDialogCallback(() => callback)
      setNameDialogOpen(true)
    },
    [],
  )

  // Division CRUD
  const handleAddDivision = useCallback(() => {
    openNameDialog('部を追加', '', (name) => {
      const div = addDivision(name)
      setExpandedDivisions((prev) => new Set([...prev, div.id]))
      toast({ title: '部を追加しました' })
    })
  }, [openNameDialog, addDivision, toast])

  const handleEditDivision = useCallback(
    (div: Division) => {
      openNameDialog('部名を編集', div.name, (name) => {
        updateDivision(div.id, name)
        toast({ title: '部名を更新しました' })
      })
    },
    [openNameDialog, updateDivision, toast],
  )

  const handleDeleteDivision = useCallback((div: Division) => {
    setDeleteTarget({ type: 'division', id: div.id, name: div.name })
    setDeleteDialogOpen(true)
  }, [])

  // Section CRUD
  const handleAddSection = useCallback(
    (divisionId: string) => {
      openNameDialog('課を追加', '', (name) => {
        const sec = addSection(divisionId, name)
        setExpandedSections((prev) => new Set([...prev, sec.id]))
        toast({ title: '課を追加しました' })
      })
    },
    [openNameDialog, addSection, toast],
  )

  const handleEditSection = useCallback(
    (sec: Section) => {
      openNameDialog('課名を編集', sec.name, (name) => {
        updateSection(sec.id, name)
        toast({ title: '課名を更新しました' })
      })
    },
    [openNameDialog, updateSection, toast],
  )

  const handleDeleteSection = useCallback((sec: Section) => {
    setDeleteTarget({ type: 'section', id: sec.id, name: sec.name })
    setDeleteDialogOpen(true)
  }, [])

  // Member CRUD
  const handleAddMember = useCallback((sectionId: string | null) => {
    setEditingMember(null)
    setMemberDefaultSectionId(sectionId)
    setMemberDialogOpen(true)
  }, [])

  const handleEditMember = useCallback((member: Member) => {
    setEditingMember(member)
    setMemberDefaultSectionId(member.sectionId)
    setMemberDialogOpen(true)
  }, [])

  const handleDeleteMember = useCallback((member: Member) => {
    setDeleteTarget({ type: 'member', id: member.id, name: member.name })
    setDeleteDialogOpen(true)
  }, [])

  // Delete confirm
  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return
    switch (deleteTarget.type) {
      case 'division':
        deleteDivision(deleteTarget.id)
        toast({ title: '部を削除しました' })
        break
      case 'section':
        deleteSection(deleteTarget.id)
        toast({ title: '課を削除しました' })
        break
      case 'member':
        deleteMember(deleteTarget.id)
        toast({ title: '担当者を削除しました' })
        break
    }
    setDeleteDialogOpen(false)
    setDeleteTarget(null)
  }, [deleteTarget, deleteDivision, deleteSection, deleteMember, toast])

  const deleteDescription = deleteTarget
    ? deleteTarget.type === 'division'
      ? `「${deleteTarget.name}」を削除しますか？配下の課も削除され、所属メンバーは未所属になります。`
      : deleteTarget.type === 'section'
        ? `「${deleteTarget.name}」を削除しますか？所属メンバーは未所属になります。`
        : `「${deleteTarget.name}」を削除しますか？関連する配分データもすべて削除されます。`
    : ''

  // Get current unit price display for a member
  const getMemberCurrentPrice = useCallback((member: Member): string => {
    if (member.unitPriceHistory.length === 0) return '-'
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const price = getApplicableUnitPrice(member.unitPriceHistory, currentMonth)
    return price > 0 ? `${currencyFormatter.format(price)}万円/月` : '-'
  }, [])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">チーム</h1>
        <div className="flex items-center gap-3">
          <select
            aria-label="表示する年度"
            data-tour="team-fiscal-year"
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            value={selectedFiscalYear}
            onChange={(e) => setSelectedFiscalYear(Number(e.target.value))}
          >
            {fyOptions.map((y) => (
              <option key={y} value={y}>
                {y}年度
              </option>
            ))}
          </select>
          <Button data-tour="team-add-division" onClick={handleAddDivision}>
            <Plus className="h-4 w-4" />
            部追加
          </Button>
        </div>
      </div>

      {/* Filters */}
      <TeamMemberFilterBar
        companies={companies}
        selectedCompanyIds={selectedCompanyIds}
        onCompanyIdsChange={setSelectedCompanyIds}
        internalFilter={internalFilter}
        onInternalFilterChange={setInternalFilter}
      />

      {/* Tree */}
      <div data-tour="team-tree" className="space-y-2">
        {sortedDivisions.length === 0 && unaffiliatedMembers.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            組織構成がありません。「部追加」ボタンから組織を作成してください。
          </div>
        )}

        {sortedDivisions.map((div) => (
          <DivisionNode
            key={div.id}
            division={div}
            allSections={allSections}
            members={filteredMembers}
            companies={companies}
            fiscalYear={selectedFiscalYear}
            startMonth={fiscalYearStartMonth}
            getMemberMonthlyTotal={getMemberMonthlyTotal}
            isExpanded={expandedDivisions.has(div.id)}
            expandedSections={expandedSections}
            onToggle={() => toggleDivision(div.id)}
            onToggleSection={toggleSection}
            onEditDivision={() => handleEditDivision(div)}
            onDeleteDivision={() => handleDeleteDivision(div)}
            onAddSection={() => handleAddSection(div.id)}
            onEditSection={handleEditSection}
            onDeleteSection={handleDeleteSection}
            onAddMember={handleAddMember}
            onEditMember={handleEditMember}
            onDeleteMember={handleDeleteMember}
            getMemberCurrentPrice={getMemberCurrentPrice}
            getMemberTags={getMemberTags}
            getMemberCompanyName={getMemberCompanyName}
          />
        ))}

        {/* Unaffiliated */}
        {unaffiliatedMembers.length > 0 && (
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-muted-foreground">未所属</span>
              <span className="text-sm text-muted-foreground">
                ({unaffiliatedMembers.length}名)
              </span>
            </div>
            <div className="divide-y divide-border">
              {unaffiliatedMembers.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  indent={1}
                  onEdit={() => handleEditMember(member)}
                  onDelete={() => handleDeleteMember(member)}
                  currentPrice={getMemberCurrentPrice(member)}
                  tags={getMemberTags(member)}
                  companyName={getMemberCompanyName(member)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <NameInputDialog
        open={nameDialogOpen}
        onOpenChange={setNameDialogOpen}
        title={nameDialogTitle}
        defaultValue={nameDialogDefault}
        onSubmit={(name) => nameDialogCallback?.(name)}
      />

      <TeamMemberDialog
        open={memberDialogOpen}
        onOpenChange={setMemberDialogOpen}
        member={editingMember}
        defaultSectionId={memberDefaultSectionId}
      />

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>削除の確認</DialogTitle>
            <DialogDescription>{deleteDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// --- Sub-components ---

interface DivisionNodeProps {
  division: Division
  allSections: Section[]
  members: Member[]
  companies: Company[]
  fiscalYear: number
  startMonth: number
  getMemberMonthlyTotal: (memberId: string, monthKey: string) => number
  isExpanded: boolean
  expandedSections: Set<string>
  onToggle: () => void
  onToggleSection: (id: string) => void
  onEditDivision: () => void
  onDeleteDivision: () => void
  onAddSection: () => void
  onEditSection: (sec: Section) => void
  onDeleteSection: (sec: Section) => void
  onAddMember: (sectionId: string | null) => void
  onEditMember: (member: Member) => void
  onDeleteMember: (member: Member) => void
  getMemberCurrentPrice: (member: Member) => string
  getMemberTags: (member: Member) => TechTag[]
  getMemberCompanyName: (member: Member) => string
}

function DivisionNode({
  division,
  allSections,
  members,
  companies,
  fiscalYear,
  startMonth,
  getMemberMonthlyTotal,
  isExpanded,
  expandedSections,
  onToggle,
  onToggleSection,
  onEditDivision,
  onDeleteDivision,
  onAddSection,
  onEditSection,
  onDeleteSection,
  onAddMember,
  onEditMember,
  onDeleteMember,
  getMemberCurrentPrice,
  getMemberTags,
  getMemberCompanyName,
}: DivisionNodeProps) {
  const divSections = useMemo(
    () =>
      allSections
        .filter((s) => s.divisionId === division.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [allSections, division.id],
  )

  const divMembers = useMemo(
    () =>
      members.filter(
        (m) =>
          m.sectionId !== null && divSections.some((s) => s.id === m.sectionId),
      ),
    [members, divSections],
  )

  const budget = useMemo(
    () => calcDivisionBudget(divSections, members, fiscalYear, startMonth),
    [divSections, members, fiscalYear, startMonth],
  )

  const expectedRevenue = useMemo(
    () =>
      calcDivisionExpectedRevenue(
        divSections,
        members,
        getMemberMonthlyTotal,
        fiscalYear,
        startMonth,
      ),
    [divSections, members, getMemberMonthlyTotal, fiscalYear, startMonth],
  )

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Division header */}
      <div className="group flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-label={`${division.name}を${isExpanded ? '折りたたむ' : '展開する'}`}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        <span className="font-semibold">{division.name}</span>
        <span className="flex items-center gap-1 text-sm text-muted-foreground">
          ({divMembers.length}名)
          <CompanyBreakdownHoverCard
            members={divMembers}
            companies={companies}
            label={`${division.name}の所属会社別内訳`}
          />
        </span>
        <div className="ml-auto flex items-center gap-4">
          <div className="flex gap-4 text-sm">
            <span>
              売上予算:{' '}
              <span className="font-medium">{formatBudget(budget)}</span>
            </span>
            <span>
              見込売上:{' '}
              <span className="font-medium">
                {formatBudget(expectedRevenue)}
              </span>
            </span>
          </div>
          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onEditDivision}
              title="部名を編集"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={onDeleteDivision}
              title="部を削除"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Children */}
      {isExpanded && (
        <div className="border-t border-border">
          {divSections.map((sec) => (
            <SectionNode
              key={sec.id}
              section={sec}
              members={members}
              companies={companies}
              fiscalYear={fiscalYear}
              startMonth={startMonth}
              getMemberMonthlyTotal={getMemberMonthlyTotal}
              isExpanded={expandedSections.has(sec.id)}
              onToggle={() => onToggleSection(sec.id)}
              onEdit={() => onEditSection(sec)}
              onDelete={() => onDeleteSection(sec)}
              onAddMember={() => onAddMember(sec.id)}
              onEditMember={onEditMember}
              onDeleteMember={onDeleteMember}
              getMemberCurrentPrice={getMemberCurrentPrice}
              getMemberTags={getMemberTags}
              getMemberCompanyName={getMemberCompanyName}
            />
          ))}

          {/* Add section button */}
          <div className="px-8 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={onAddSection}
            >
              <Plus className="mr-1 h-3 w-3" />
              課を追加
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

interface SectionNodeProps {
  section: Section
  members: Member[]
  companies: Company[]
  fiscalYear: number
  startMonth: number
  getMemberMonthlyTotal: (memberId: string, monthKey: string) => number
  isExpanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onAddMember: () => void
  onEditMember: (member: Member) => void
  onDeleteMember: (member: Member) => void
  getMemberCurrentPrice: (member: Member) => string
  getMemberTags: (member: Member) => TechTag[]
  getMemberCompanyName: (member: Member) => string
}

function SectionNode({
  section,
  members,
  companies,
  fiscalYear,
  startMonth,
  getMemberMonthlyTotal,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onAddMember,
  onEditMember,
  onDeleteMember,
  getMemberCurrentPrice,
  getMemberTags,
  getMemberCompanyName,
}: SectionNodeProps) {
  const sectionMembers = useMemo(
    () => members.filter((m) => m.sectionId === section.id),
    [members, section.id],
  )

  const budget = useMemo(
    () => calcSectionBudget(sectionMembers, fiscalYear, startMonth),
    [sectionMembers, fiscalYear, startMonth],
  )

  const expectedRevenue = useMemo(
    () =>
      calcSectionExpectedRevenue(
        sectionMembers,
        getMemberMonthlyTotal,
        fiscalYear,
        startMonth,
      ),
    [sectionMembers, getMemberMonthlyTotal, fiscalYear, startMonth],
  )

  return (
    <div className="border-b border-border last:border-b-0">
      {/* Section header */}
      <div className="group flex items-center gap-2 px-8 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-label={`${section.name}を${isExpanded ? '折りたたむ' : '展開する'}`}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        <span className="text-sm font-medium">{section.name}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          ({sectionMembers.length}名)
          <CompanyBreakdownHoverCard
            members={sectionMembers}
            companies={companies}
            label={`${section.name}の所属会社別内訳`}
          />
        </span>
        <div className="ml-auto flex items-center gap-4">
          <div className="flex gap-4 text-xs">
            <span>
              売上予算:{' '}
              <span className="font-medium">{formatBudget(budget)}</span>
            </span>
            <span>
              見込売上:{' '}
              <span className="font-medium">
                {formatBudget(expectedRevenue)}
              </span>
            </span>
          </div>
          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onEdit}
              title="課名を編集"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={onDelete}
              title="課を削除"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Members */}
      {isExpanded && (
        <div>
          {sectionMembers.length === 0 ? (
            <div className="px-14 py-2 text-xs text-muted-foreground">
              メンバーがいません
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {sectionMembers.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  indent={2}
                  onEdit={() => onEditMember(member)}
                  onDelete={() => onDeleteMember(member)}
                  currentPrice={getMemberCurrentPrice(member)}
                  tags={getMemberTags(member)}
                  companyName={getMemberCompanyName(member)}
                />
              ))}
            </div>
          )}
          <div className="px-14 py-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={onAddMember}
            >
              <Plus className="mr-1 h-3 w-3" />
              メンバー追加
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
