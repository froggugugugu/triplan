import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Combobox } from '@/shared/components/ui/combobox'
import {
  useAppStore,
  useAssignmentStore,
  useBudgetStore,
  useEffortsStore,
  useMembersStore,
  usePersonnelPlanStore,
  useProjectsStore,
  useTeamStore,
} from '@/stores'
import { AiUsageGrid } from '../components/AiUsageGrid'
import { AiUsageMemberAllocationPanel } from '../components/AiUsageMemberAllocationPanel'
import { AllDivisionsBudgetSummary } from '../components/AllDivisionsBudgetSummary'
import { BudgetActualDashboard } from '../components/BudgetActualDashboard'
import { DivisionBudgetPanel } from '../components/DivisionBudgetPanel'
import { OtherExpensePanel } from '../components/OtherExpensePanel'
import { PersonnelPlanPanel } from '../components/PersonnelPlanPanel'
import { ProjectBudgetView } from '../components/ProjectBudgetView'
import { SaasContractTable } from '../components/SaasContractTable'

type TabKey =
  | 'budget'
  | 'personnel-plan'
  | 'project'
  | 'other-expense'
  | 'ai-usage'
  | 'saas'
  | 'dashboard'

// タブ順: 全部門を俯瞰できる「部門予算一覧」を先頭に配置し、次いで予実確認の頻度が高い
// 「予実ダッシュボード」を配置する（旧「部門予算」から改称）。
// 利用頻度の低い「人員計画」は末尾に配置する。他タブの相対順序は変更しない。
// 初期表示タブは「予実ダッシュボード」のまま維持する（【仮定】要件原文は「先頭に配置」のみ
// 言及しており初期表示の変更までは明示していないため、保守的にタブ順のみ変更する）
const TABS: { key: TabKey; label: string }[] = [
  { key: 'budget', label: '部門予算一覧' },
  { key: 'dashboard', label: '予実ダッシュボード' },
  { key: 'project', label: 'プロジェクト' },
  { key: 'other-expense', label: 'その他費用' },
  { key: 'ai-usage', label: 'AI利用費' },
  { key: 'saas', label: 'SaaS費用' },
  { key: 'personnel-plan', label: '人員計画' },
]

// 「全部門」選択肢の内部表現（要確認-6）。空文字は「部門読み込み前」の
// 初期状態を表す既存の意味と衝突するため、別の専用センチネル値を使う
// （shared/utils/member-filter.tsの空文字センチネル規約とは意図的に異なる表現を採用）
const ALL_DIVISIONS_VALUE = '__all_divisions__'

function getCurrentFiscalYear(startMonth: number): number {
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  return currentMonth >= startMonth ? now.getFullYear() : now.getFullYear() - 1
}

export function BudgetPage() {
  const fiscalYearStartMonth = useAppStore((s) => s.fiscalYearStartMonth)

  const divisions = useTeamStore((s) => s.divisions)
  const sections = useTeamStore((s) => s.sections)
  const loadTeam = useTeamStore((s) => s.loadTeam)
  const loadMembers = useMembersStore((s) => s.loadMembers)
  const loadAssignments = useAssignmentStore((s) => s.loadAssignments)
  const loadBudgetData = useBudgetStore((s) => s.loadBudgetData)
  const loadProjects = useProjectsStore((s) => s.loadProjects)
  const loadPersonnelPlans = usePersonnelPlanStore((s) => s.loadPersonnelPlans)
  const loadEfforts = useEffortsStore((s) => s.loadEfforts)

  useEffect(() => {
    loadTeam()
    loadMembers()
    loadAssignments()
    loadBudgetData()
    loadProjects()
    loadPersonnelPlans()
    loadEfforts()
  }, [
    loadTeam,
    loadMembers,
    loadAssignments,
    loadBudgetData,
    loadProjects,
    loadPersonnelPlans,
    loadEfforts,
  ])

  const [activeTab, setActiveTab] = useState<TabKey>('dashboard')
  const [selectedFiscalYear, setSelectedFiscalYear] = useState(() =>
    getCurrentFiscalYear(fiscalYearStartMonth),
  )
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>('')
  // AI利用費タブの課選択。「部門全体」は選択肢として廃止したため、必ず特定の課のIDを
  // 保持する（課が0件の部門では空のまま）
  const [selectedSectionId, setSelectedSectionId] = useState<string>('')
  // AI利用費タブのプロバイダ選択（AiUsageGrid・AiUsageMemberAllocationPanelで共有、
  //）。providers.length===0の部門では常にnull
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    null,
  )

  const currentFY = getCurrentFiscalYear(fiscalYearStartMonth)
  const fyOptions = useMemo(() => {
    const years: number[] = []
    for (let y = currentFY - 2; y <= currentFY + 2; y++) {
      years.push(y)
    }
    return years
  }, [currentFY])

  const sortedDivisions = useMemo(
    () => [...divisions].sort((a, b) => a.sortOrder - b.sortOrder),
    [divisions],
  )

  // 部門が読み込まれたら先頭を自動選択
  useEffect(() => {
    if (!selectedDivisionId && sortedDivisions.length > 0) {
      setSelectedDivisionId(sortedDivisions[0]?.id ?? '')
    }
  }, [selectedDivisionId, sortedDivisions])

  const isAllDivisions = selectedDivisionId === ALL_DIVISIONS_VALUE
  // project/saasタブは元々divisionId=null（未指定）で「全件表示」の意味を持つため、
  // 「全部門」選択時はそのままnullを渡すだけで済む（新規の集計サマリーUIは不要）
  const divisionIdForFilter = isAllDivisions ? null : selectedDivisionId || null

  const selectedDivisionName =
    sortedDivisions.find((d) => d.id === selectedDivisionId)?.name ?? ''

  const sectionsInDivision = useMemo(
    () =>
      sections
        .filter((s) => s.divisionId === selectedDivisionId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [sections, selectedDivisionId],
  )

  // 課セレクタから「部門全体」を廃止したため、常に部門内の先頭課を自動選択する
  // （部門切り替えで現在の選択が新しい部門に存在しなくなった場合も同様に再選択する。
  //）。課が0件の部門では空のままとなり、呼び出し側で案内表示に切り替える
  useEffect(() => {
    if (
      selectedSectionId &&
      sectionsInDivision.some((s) => s.id === selectedSectionId)
    ) {
      return
    }
    setSelectedSectionId(sectionsInDivision[0]?.id ?? '')
  }, [selectedSectionId, sectionsInDivision])

  const showDivisionSelector =
    activeTab === 'personnel-plan' ||
    activeTab === 'other-expense' ||
    activeTab === 'ai-usage' ||
    activeTab === 'dashboard' ||
    activeTab === 'project' ||
    activeTab === 'saas'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">予算管理</h1>
        <div className="flex items-center gap-3">
          {showDivisionSelector && (
            <Combobox
              value={selectedDivisionId}
              onValueChange={setSelectedDivisionId}
              options={[
                { value: ALL_DIVISIONS_VALUE, label: '全部門' },
                ...sortedDivisions.map((d) => ({
                  value: d.id,
                  label: d.name,
                })),
              ]}
              placeholder="部門を選択してください"
              searchPlaceholder="部門を検索..."
              className="w-[220px]"
            />
          )}
          <select
            aria-label="表示する年度"
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
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={cn(
              'px-3 py-2 text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'budget' && (
        <DivisionBudgetPanel
          fiscalYear={selectedFiscalYear}
          startMonth={fiscalYearStartMonth}
        />
      )}

      {activeTab === 'personnel-plan' &&
        (isAllDivisions ? (
          <AllDivisionsBudgetSummary fiscalYear={selectedFiscalYear} />
        ) : selectedDivisionId ? (
          <PersonnelPlanPanel
            divisionId={selectedDivisionId}
            fiscalYear={selectedFiscalYear}
            startMonth={fiscalYearStartMonth}
          />
        ) : (
          <p className="py-8 text-center text-muted-foreground">
            部門が登録されていません。
          </p>
        ))}

      {activeTab === 'project' && (
        <ProjectBudgetView divisionId={divisionIdForFilter} />
      )}

      {activeTab === 'other-expense' &&
        (isAllDivisions ? (
          <AllDivisionsBudgetSummary fiscalYear={selectedFiscalYear} />
        ) : selectedDivisionId ? (
          <OtherExpensePanel
            divisionId={selectedDivisionId}
            fiscalYear={selectedFiscalYear}
          />
        ) : (
          <p className="py-8 text-center text-muted-foreground">
            部門が登録されていません。
          </p>
        ))}

      {activeTab === 'ai-usage' &&
        (isAllDivisions ? (
          <AllDivisionsBudgetSummary fiscalYear={selectedFiscalYear} />
        ) : selectedDivisionId ? (
          sectionsInDivision.length > 0 ? (
            <div className="space-y-6">
              <AiUsageGrid
                divisionId={selectedDivisionId}
                sectionId={selectedSectionId || null}
                fiscalYear={selectedFiscalYear}
                onSectionChange={setSelectedSectionId}
                providerId={selectedProviderId}
                onProviderChange={setSelectedProviderId}
              />
              <AiUsageMemberAllocationPanel
                divisionId={selectedDivisionId}
                sectionId={selectedSectionId || null}
                fiscalYear={selectedFiscalYear}
                providerId={selectedProviderId}
              />
            </div>
          ) : (
            <p className="py-8 text-center text-muted-foreground">
              この部門には課が登録されていません。チーム管理で課を登録してください。
            </p>
          )
        ) : (
          <p className="py-8 text-center text-muted-foreground">
            部門が登録されていません。
          </p>
        ))}

      {activeTab === 'saas' && (
        <SaasContractTable
          fiscalYear={selectedFiscalYear}
          startMonth={fiscalYearStartMonth}
          divisionId={divisionIdForFilter}
        />
      )}

      {activeTab === 'dashboard' &&
        (isAllDivisions ? (
          <AllDivisionsBudgetSummary fiscalYear={selectedFiscalYear} />
        ) : selectedDivisionId ? (
          <BudgetActualDashboard
            divisionId={selectedDivisionId}
            divisionName={selectedDivisionName}
            fiscalYear={selectedFiscalYear}
            startMonth={fiscalYearStartMonth}
          />
        ) : (
          <p className="py-8 text-center text-muted-foreground">
            部門が登録されていません。
          </p>
        ))}
    </div>
  )
}
