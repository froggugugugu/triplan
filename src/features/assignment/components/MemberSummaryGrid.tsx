import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/shared/components/ui/collapsible'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/shared/components/ui/hover-card'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Member } from '@/shared/types/member'
import type { Project } from '@/shared/types/project'
import { CONFIDENCE_OPTIONS } from '@/shared/types/project'
import type { TechTag } from '@/shared/types/tech-tag'
import {
  calcExpectedRevenue,
  calcRevenueBudget,
} from '@/shared/utils/budget-utils'
import { pickReadableTextColor } from '@/shared/utils/color-contrast'
import { useTeamStore } from '@/stores/team-store'
import { useTechTagsStore } from '@/stores/tech-tags-store'
import {
  filterAssignmentsByConfidence,
  filterMembersByOrganization,
  formatAssignmentValue,
  getMonthLabelWithYear,
  getScheduleMonthRange,
  isOverCapacity,
} from '../utils/assignment-utils'

const ALL_CONFIDENCE_KEYS = ['S', 'A', 'B', 'C', '__null__'] as const
const CONFIDENCE_FILTER_OPTIONS = [
  ...CONFIDENCE_OPTIONS.map((o) => ({ key: o.value, label: o.label })),
  { key: '__null__', label: '未設定' },
]

interface MemberSummaryGridProps {
  monthColumns: string[]
  assignments: AssignmentEntry[]
  members: Member[]
  projects: Project[]
  fiscalYear: number
  fiscalYearStartMonth: number
  onMemberSelectionChange?: (memberIds: Set<string>) => void
  onFiscalYearChange?: (year: number) => void
}

const budgetFormatter = new Intl.NumberFormat('ja-JP')
function formatBudget(amount: number): string {
  return `${budgetFormatter.format(Math.round(amount))}万円`
}

/**
 * セル値に応じた背景色クラスを返す（DADS公式カラー準拠）。
 * 基準はメンバーごとの稼働率上限（`Member.capacityRatio`、既定1.0）で、
 * 時短勤務・兼務のメンバーはより小さい値が満稼働になる。
 * - 0（未アサイン）: 薄赤（危険） - DADS Red 300系（#ff9696）の薄め
 * - 0 < value < 上限: 薄黄（注意） - DADS Yellow 300系（#ffd43d）の薄め
 * - value === 上限: 薄緑（安全） - DADS Green 300系（#71c598）の薄め
 * - value > 上限: 赤（超過） - DADS Red 300系（#ff9696）の濃いめ
 */
function getCellColorClass(total: number, capacity: number): string {
  if (total <= 0) return 'bg-[#ff9696]/20 dark:bg-[#ff9696]/10'
  if (total < capacity - 1e-9) return 'bg-[#ffd43d]/20 dark:bg-[#ffd43d]/10'
  if (total <= capacity + 1e-9) return 'bg-[#71c598]/20 dark:bg-[#71c598]/10'
  return 'bg-[#ff9696]/40 dark:bg-[#ff9696]/20'
}

export function MemberSummaryGrid({
  monthColumns: _defaultMonthColumns,
  assignments,
  members,
  projects,
  fiscalYear,
  fiscalYearStartMonth,
  onMemberSelectionChange,
  onFiscalYearChange,
}: MemberSummaryGridProps) {
  const [open, setOpen] = useState(false)
  const [selectedFiscalYear, setSelectedFiscalYear] = useState(fiscalYear)
  const [selectedConfidences, setSelectedConfidences] = useState<Set<string>>(
    () => new Set(ALL_CONFIDENCE_KEYS),
  )
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [selectedDivisionId, setSelectedDivisionId] = useState('')
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [nameFilter, setNameFilter] = useState('')

  // 選択メンバーと年度の変更を親に通知
  useEffect(() => {
    onMemberSelectionChange?.(selectedMemberIds)
  }, [selectedMemberIds, onMemberSelectionChange])

  useEffect(() => {
    onFiscalYearChange?.(selectedFiscalYear)
  }, [selectedFiscalYear, onFiscalYearChange])

  // Zustand: 生データ取得 → useMemoで派生（パターン準拠）
  const divisions = useTeamStore((s) => s.divisions)
  const sections = useTeamStore((s) => s.sections)
  const techTags = useTechTagsStore((s) => s.techTags)

  const getMemberTags = useCallback(
    (member: Member): TechTag[] =>
      (member.techTagIds ?? [])
        .map((tagId) => techTags.find((t) => t.id === tagId))
        .filter((t): t is TechTag => t !== undefined),
    [techTags],
  )

  const sortedDivisions = useMemo(
    () => [...divisions].sort((a, b) => a.sortOrder - b.sortOrder),
    [divisions],
  )

  const availableSections = useMemo(
    () =>
      selectedDivisionId && selectedDivisionId !== '__unaffiliated__'
        ? [...sections]
            .filter((s) => s.divisionId === selectedDivisionId)
            .sort((a, b) => a.sortOrder - b.sortOrder)
        : [],
    [sections, selectedDivisionId],
  )

  const handleDivisionChange = useCallback((divisionId: string) => {
    setSelectedDivisionId(divisionId)
    setSelectedSectionId('')
    setSelectedMemberIds(new Set())
  }, [])

  const handleSectionChange = useCallback((sectionId: string) => {
    setSelectedSectionId(sectionId)
    setSelectedMemberIds(new Set())
  }, [])

  const fiscalYearOptions = useMemo(() => {
    const years: number[] = []
    for (let y = fiscalYear - 2; y <= fiscalYear + 2; y++) {
      years.push(y)
    }
    return years
  }, [fiscalYear])

  const monthColumns = useMemo(
    () => getScheduleMonthRange(selectedFiscalYear, fiscalYearStartMonth),
    [selectedFiscalYear, fiscalYearStartMonth],
  )

  const toggleConfidence = useCallback((key: string) => {
    setSelectedConfidences((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedConfidences(new Set(ALL_CONFIDENCE_KEYS))
  }, [])

  const clearAll = useCallback(() => {
    setSelectedConfidences(new Set())
  }, [])

  const toggleMember = useCallback((memberId: string) => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev)
      if (next.has(memberId)) {
        next.delete(memberId)
      } else {
        next.add(memberId)
      }
      return next
    })
  }, [])

  const clearMemberFilter = useCallback(() => {
    setSelectedMemberIds(new Set())
  }, [])

  const projectMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  )

  const filteredAssignments = useMemo(
    () =>
      filterAssignmentsByConfidence(
        assignments,
        projects,
        selectedConfidences,
        projectMap,
      ),
    [assignments, projects, selectedConfidences, projectMap],
  )

  // 全登録担当者（アクティブ）を名前順でソート
  const sortedMembers = useMemo(
    () =>
      [...members]
        .filter((m) => m.isActive)
        .sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    [members],
  )

  const orgFilteredMembers = useMemo(
    () =>
      filterMembersByOrganization(
        sortedMembers,
        sections,
        selectedDivisionId,
        selectedSectionId,
      ),
    [sortedMembers, sections, selectedDivisionId, selectedSectionId],
  )

  const nameFilteredMembers = useMemo(() => {
    if (!nameFilter) return orgFilteredMembers
    const lower = nameFilter.toLowerCase()
    return orgFilteredMembers.filter((m) =>
      m.name.toLowerCase().includes(lower),
    )
  }, [orgFilteredMembers, nameFilter])

  const displayedMembers = useMemo(
    () =>
      selectedMemberIds.size > 0
        ? nameFilteredMembers.filter((m) => selectedMemberIds.has(m.id))
        : nameFilteredMembers,
    [nameFilteredMembers, selectedMemberIds],
  )

  // 売上予算・見込売上の計算（assignmentsプロパティ依存でアサイン変更時に再計算）
  const getMemberMonthlyTotalFn = useCallback(
    (memberId: string, monthKey: string): number =>
      assignments
        .filter((a) => a.memberId === memberId)
        .reduce((sum, a) => sum + (a.monthlyValues[monthKey] ?? 0), 0),
    [assignments],
  )

  const budgetInfo = useMemo(() => {
    const isFiltered = selectedDivisionId !== '' || selectedMemberIds.size > 0
    if (!isFiltered || displayedMembers.length === 0) return null

    let label: string
    if (selectedMemberIds.size > 0) {
      label =
        selectedMemberIds.size === 1
          ? (displayedMembers[0]?.name ?? '')
          : `${selectedMemberIds.size}名`
    } else if (selectedSectionId) {
      const section = sections.find((s) => s.id === selectedSectionId)
      label = section?.name ?? ''
    } else if (selectedDivisionId === '__unaffiliated__') {
      label = '未所属'
    } else {
      const division = divisions.find((d) => d.id === selectedDivisionId)
      label = division?.name ?? ''
    }

    const budget = displayedMembers.reduce(
      (sum, m) =>
        sum + calcRevenueBudget(m, selectedFiscalYear, fiscalYearStartMonth),
      0,
    )
    const expectedRevenue = displayedMembers.reduce(
      (sum, m) =>
        sum +
        calcExpectedRevenue(
          m,
          getMemberMonthlyTotalFn,
          selectedFiscalYear,
          fiscalYearStartMonth,
        ),
      0,
    )

    return { label, budget, expectedRevenue }
  }, [
    displayedMembers,
    selectedDivisionId,
    selectedSectionId,
    selectedMemberIds,
    selectedFiscalYear,
    fiscalYearStartMonth,
    divisions,
    sections,
    getMemberMonthlyTotalFn,
  ])

  // Pre-group assignments by memberId (O(assignments) once)
  const assignmentsByMember = useMemo(() => {
    const map = new Map<string, AssignmentEntry[]>()
    for (const a of filteredAssignments) {
      const list = map.get(a.memberId)
      if (list) {
        list.push(a)
      } else {
        map.set(a.memberId, [a])
      }
    }
    return map
  }, [filteredAssignments])

  // Compute summary: memberId -> monthKey -> { total, breakdown }
  const summaryData = useMemo(() => {
    const data = new Map<
      string,
      Map<
        string,
        { total: number; breakdown: { projectName: string; value: number }[] }
      >
    >()

    for (const member of sortedMembers) {
      const memberAssignments = assignmentsByMember.get(member.id) ?? []
      const monthMap = new Map<
        string,
        { total: number; breakdown: { projectName: string; value: number }[] }
      >()

      for (const monthKey of monthColumns) {
        let total = 0
        const breakdown: { projectName: string; value: number }[] = []

        for (const a of memberAssignments) {
          const val = a.monthlyValues[monthKey] ?? 0
          if (val > 0) {
            total += val
            const project = projectMap.get(a.projectId)
            breakdown.push({
              projectName: project?.name ?? a.projectId,
              value: val,
            })
          }
        }

        monthMap.set(monthKey, { total, breakdown })
      }

      data.set(member.id, monthMap)
    }

    return data
  }, [sortedMembers, assignmentsByMember, monthColumns, projectMap])

  if (sortedMembers.length === 0) {
    return null
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-2 mb-2">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2">
            {open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <span className="text-sm font-medium">担当者別年間サマリー</span>
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <span className="text-xs text-muted-foreground">年度:</span>
          <select
            value={selectedFiscalYear}
            onChange={(e) => setSelectedFiscalYear(Number(e.target.value))}
            className="h-7 rounded-md border border-input bg-background px-2 text-xs"
          >
            {fiscalYearOptions.map((y) => (
              <option key={y} value={y}>
                {y}年度
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground ml-2">部門:</span>
          <select
            value={selectedDivisionId}
            onChange={(e) => handleDivisionChange(e.target.value)}
            className="h-7 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">全て</option>
            {sortedDivisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
            <option value="__unaffiliated__">未所属</option>
          </select>
          {availableSections.length > 0 && (
            <>
              <span className="text-xs text-muted-foreground">課:</span>
              <select
                value={selectedSectionId}
                onChange={(e) => handleSectionChange(e.target.value)}
                className="h-7 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">全て</option>
                {availableSections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <span className="text-xs text-muted-foreground ml-2">
            確度フィルタ:
          </span>
          {CONFIDENCE_FILTER_OPTIONS.map((opt) => (
            <label
              key={opt.key}
              className="flex items-center gap-1 text-xs cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedConfidences.has(opt.key)}
                onChange={() => toggleConfidence(opt.key)}
                className="h-3.5 w-3.5 rounded border-border accent-primary"
              />
              {opt.label}
            </label>
          ))}
          <div className="flex items-center gap-1 ml-1">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-primary hover:underline"
            >
              全選択
            </button>
            <span className="text-xs text-muted-foreground">/</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-primary hover:underline"
            >
              全解除
            </button>
          </div>
          <span className="text-xs text-muted-foreground ml-2">担当者:</span>
          <input
            type="text"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="名前で絞り込み"
            className="h-7 w-32 rounded-md border border-input bg-background px-2 text-xs"
          />
          {selectedMemberIds.size > 0 && (
            <div className="flex items-center gap-1 ml-2">
              <span className="text-xs text-muted-foreground">
                担当者: {selectedMemberIds.size}名選択中
              </span>
              <button
                type="button"
                onClick={clearMemberFilter}
                className="text-xs text-primary hover:underline"
              >
                全員表示
              </button>
            </div>
          )}
        </div>
        {budgetInfo && (
          <div className="flex items-center gap-4 mb-2 text-xs">
            <span className="text-muted-foreground">{budgetInfo.label}:</span>
            <span>
              売上予算:{' '}
              <span className="font-medium">
                {formatBudget(budgetInfo.budget)}
              </span>
            </span>
            <span>
              見込売上:{' '}
              <span className="font-medium">
                {formatBudget(budgetInfo.expectedRevenue)}
              </span>
            </span>
          </div>
        )}
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="border-collapse text-[11px] table-fixed">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="sticky left-0 z-10 bg-muted/50 px-2 py-1 text-left font-medium whitespace-nowrap w-[400px] min-w-[400px]">
                  担当者
                </th>
                {monthColumns.map((mk) => (
                  <th
                    key={mk}
                    className="w-[75px] min-w-[75px] px-1 py-1 text-center font-medium"
                  >
                    {getMonthLabelWithYear(mk)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedMembers.map((member) => {
                const monthMap = summaryData.get(member.id)
                const isSelected = selectedMemberIds.has(member.id)
                const memberTags = getMemberTags(member)

                return (
                  <tr key={member.id} className="border-b border-border">
                    <td
                      className={cn(
                        'sticky left-0 z-10 px-2 py-0.5 whitespace-nowrap w-[400px] min-w-[400px]',
                        isSelected
                          ? 'bg-primary/10 font-semibold'
                          : 'bg-background',
                      )}
                    >
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="min-w-0 flex-1 overflow-hidden text-ellipsis text-left hover:bg-accent/50 cursor-pointer select-none rounded-sm px-0.5 -mx-0.5"
                          onClick={() => toggleMember(member.id)}
                          title="クリックで絞り込み"
                        >
                          {member.name}
                          {member.role && `（${member.role}）`}
                        </button>
                        {memberTags.length > 0 && (
                          <HoverCard openDelay={200} closeDelay={100}>
                            <HoverCardTrigger asChild>
                              <button
                                type="button"
                                aria-label={`${member.name}の保有スキル`}
                                className="shrink-0 text-muted-foreground hover:text-foreground"
                              >
                                <Sparkles className="h-3 w-3" />
                              </button>
                            </HoverCardTrigger>
                            <HoverCardContent className="w-56">
                              <div className="flex flex-wrap gap-1">
                                {memberTags.map((tag) => (
                                  <Badge
                                    key={tag.id}
                                    style={{
                                      backgroundColor: tag.color,
                                      color: pickReadableTextColor(tag.color),
                                    }}
                                    className="border-transparent text-[10px]"
                                  >
                                    {tag.name}
                                  </Badge>
                                ))}
                              </div>
                            </HoverCardContent>
                          </HoverCard>
                        )}
                      </div>
                    </td>
                    {monthColumns.map((mk) => {
                      const cell = monthMap?.get(mk)
                      const total = cell?.total ?? 0

                      const tooltipText =
                        cell && cell.breakdown.length > 0
                          ? cell.breakdown
                              .map(
                                (b) =>
                                  `${b.projectName}: ${formatAssignmentValue(b.value)}`,
                              )
                              .join('\n')
                          : undefined

                      return (
                        <td
                          key={mk}
                          className={cn(
                            'px-1 py-0.5 text-center tabular-nums',
                            getCellColorClass(total, member.capacityRatio ?? 1),
                          )}
                          title={tooltipText}
                        >
                          <span
                            className={cn(
                              isOverCapacity(total, member.capacityRatio) &&
                                'text-red-700 dark:text-red-300 font-semibold',
                            )}
                          >
                            {total > 0 ? formatAssignmentValue(total) : ''}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
