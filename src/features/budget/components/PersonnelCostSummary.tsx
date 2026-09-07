import { useMemo } from 'react'
import type { PersonnelPlanCategory } from '@/shared/types/personnel-plan'
import {
  manYenFormatter as currencyFormatter,
  isProperMember,
} from '@/shared/utils/budget-utils'
import { computeProjectTotalEffort } from '@/shared/utils/effort-utils'
import {
  useAssignmentStore,
  useBudgetStore,
  useCompaniesStore,
  useEffortsStore,
  useMembersStore,
  usePersonnelPlanStore,
  useProjectsStore,
  useTeamStore,
  useWbsSettingsStore,
} from '@/stores'
import {
  calcRemainingContractEffort,
  getFiscalYearMonthKeys,
} from '../utils/expense-budget-utils'

// 人月（工数）は非金額のため対象外。小数1桁のまま維持する
const effortFormatter = new Intl.NumberFormat('ja-JP', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

// 年間総合予算額の算出式（合計人数×概算単価）に実数を当てはめて表示する際の人数表記。
// monthlyHeadcountは小数入力を許容するため、整数強制はせず最大1桁までに丸める
const headcountFormatter = new Intl.NumberFormat('ja-JP', {
  maximumFractionDigits: 1,
})

interface PersonnelCostSummaryProps {
  divisionId: string
  fiscalYear: number
  startMonth: number
}

/**
 * 人件費予算サマリー表示（入力UIなし）。
 * 「年間総合予算額」「年間総合実績額見込み」「残予算」「残契約概算工数」の4エリアを
 * 1パネル内に横並び（左から順に）で表示し、総合予算－実績＝残という一連の流れで
 * 確認できるようにする（旧「人件費予算」「人件費の残予算」の2パネルを統合）。
 * 人員計画4区分の予定人数×概算単価から年間総合予算額を、
 * 人件費区分（personnel_internal/personnel_external）の実績金額から
 * 年間総合実績額見込みを、それぞれ内部リソース/外部リソースの内訳付きで算出する。
 * 「案件工数との比較」は独立パネルのまま維持する。
 */
export function PersonnelCostSummary({
  divisionId,
  fiscalYear,
  startMonth,
}: PersonnelCostSummaryProps) {
  const estimatedUnitPrice = useBudgetStore((s) => s.estimatedUnitPrice)
  const workdaysPerMonth = useBudgetStore((s) => s.workdaysPerMonth)
  const getPersonnelPlansByDivision = usePersonnelPlanStore(
    (s) => s.getPersonnelPlansByDivision,
  )
  const getRevenueBudgetForCategory = usePersonnelPlanStore(
    (s) => s.getRevenueBudgetForCategory,
  )
  // 人員計画の変更を検知して再レンダーされるよう購読する
  usePersonnelPlanStore((s) => s.personnelPlans)

  const getProjectTree = useProjectsStore((s) => s.getProjectTree)
  // 案件・工数・WBS設定・アサインの変更を検知して再レンダーされるよう購読する
  useProjectsStore((s) => s.projects)
  const efforts = useEffortsStore((s) => s.efforts)
  const wbsSettingsEntries = useWbsSettingsStore((s) => s.entries)
  const getWbsSettings = useWbsSettingsStore((s) => s.getSettings)
  const sections = useTeamStore((s) => s.sections)
  const members = useMembersStore((s) => s.members)
  const companies = useCompaniesStore((s) => s.companies)
  const getMemberMonthlyTotal = useAssignmentStore(
    (s) => s.getMemberMonthlyTotal,
  )
  useAssignmentStore((s) => s.assignments)

  const plans = getPersonnelPlansByDivision(divisionId, fiscalYear)

  // 案件の合計工数（人月）: 担当部門（Project.divisionId）が当部門に設定されている
  // トップレベル案件のみを対象とする。未設定の案件は含めない（次工程で要確認事項として提示済み）
  const divisionRoots = useMemo(
    () => getProjectTree().filter((p) => p.divisionId === divisionId),
    [getProjectTree, divisionId],
  )
  const totalProjectEffortDays = useMemo(() => {
    let total = 0
    for (const root of divisionRoots) {
      const settings = getWbsSettings(root.id)
      const columnIds = settings.effortColumns
        .filter((c) => c.enabled)
        .map((c) => c.id)
      const result = computeProjectTotalEffort([root], columnIds, efforts)
      total += result.get(root.id) ?? 0
    }
    return total
  }, [divisionRoots, wbsSettingsEntries, getWbsSettings, efforts])
  const totalProjectEffortMonths = totalProjectEffortDays / workdaysPerMonth

  // 部門所属メンバー（課経由）。割り当て済み工数の算出と、現在の内部/外部リソース人数の
  // 算出（isActiveかつisProperMemberで判定）の両方で共有する
  const divisionMembers = useMemo(() => {
    const sectionIds = new Set(
      sections.filter((s) => s.divisionId === divisionId).map((s) => s.id),
    )
    return members.filter(
      (m) => m.sectionId !== null && sectionIds.has(m.sectionId),
    )
  }, [members, sections, divisionId])

  // 割り当て済み工数（人月）: 部門所属メンバーが担当する全アサイン（月次配分値の合計）
  const divisionMemberIds = useMemo(
    () => divisionMembers.map((m) => m.id),
    [divisionMembers],
  )

  // 現時点でチームに登録されている内部/外部リソース人数（isActive基準、年度に依存しない
  // 「今」の実際のチーム構成のスナップショット。人員計画の月別予定人数とは別軸）
  const currentInternalHeadcount = useMemo(
    () =>
      divisionMembers.filter((m) => m.isActive && isProperMember(m, companies))
        .length,
    [divisionMembers, companies],
  )
  const currentExternalHeadcount = useMemo(
    () =>
      divisionMembers.filter((m) => m.isActive && !isProperMember(m, companies))
        .length,
    [divisionMembers, companies],
  )

  const fiscalMonthKeys = useMemo(
    () => getFiscalYearMonthKeys(fiscalYear, startMonth),
    [fiscalYear, startMonth],
  )

  const assignedEffortMonths = useMemo(() => {
    let total = 0
    for (const memberId of divisionMemberIds) {
      for (const monthKey of fiscalMonthKeys) {
        total += getMemberMonthlyTotal(memberId, monthKey)
      }
    }
    return total
  }, [divisionMemberIds, fiscalMonthKeys, getMemberMonthlyTotal])

  const sumHeadcount = (category: PersonnelPlanCategory): number => {
    const entry = plans.find((p) => p.category === category)
    if (!entry) return 0
    return Object.values(entry.monthlyHeadcount).reduce((s, h) => s + h, 0)
  }

  const sumRevenue = (category: PersonnelPlanCategory): number => {
    const monthly = getRevenueBudgetForCategory(
      divisionId,
      fiscalYear,
      category,
      startMonth,
    )
    return Object.values(monthly).reduce((s, v) => s + v, 0)
  }

  // 年間総合予算額の算出式（合計人数×概算単価）に使う「合計人数」（人月）。
  // 予定人数（monthlyHeadcount）を12ヶ月分合算した値で、内部/外部それぞれ
  // 人件費区分＋追加予定区分を合算する
  const properHeadcountTotal =
    sumHeadcount('personnel_internal') + sumHeadcount('planned_internal')
  const nonProperHeadcountTotal =
    sumHeadcount('personnel_external') + sumHeadcount('planned_external')

  const properBudget = properHeadcountTotal * estimatedUnitPrice
  const nonProperBudget = nonProperHeadcountTotal * estimatedUnitPrice
  const totalBudget = properBudget + nonProperBudget

  const properActual = sumRevenue('personnel_internal')
  const nonProperActual = sumRevenue('personnel_external')
  const totalActual = properActual + nonProperActual

  const remainingBudget = totalBudget - totalActual
  const remainingProperBudget = properBudget - properActual
  const remainingNonProperBudget = nonProperBudget - nonProperActual

  const remainingContractEffort = calcRemainingContractEffort(
    remainingBudget,
    estimatedUnitPrice,
  )
  const remainingProperContractEffort = calcRemainingContractEffort(
    remainingProperBudget,
    estimatedUnitPrice,
  )
  const remainingNonProperContractEffort = calcRemainingContractEffort(
    remainingNonProperBudget,
    estimatedUnitPrice,
  )

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">人件費予算</p>
          <p className="text-xs text-muted-foreground">
            現在のチーム人数: 内部リソース {currentInternalHeadcount}人 ／
            外部リソース {currentExternalHeadcount}人
          </p>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-4">
          <div className="rounded-md bg-budget-planned/10 p-3">
            <p className="text-sm text-muted-foreground">
              年間総合予算額（合計人数×概算単価）
            </p>
            <p className="mt-1 text-2xl font-bold">
              {currencyFormatter.format(totalBudget)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                万円
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              内部リソース: {currencyFormatter.format(properBudget)}万円 ／
              外部リソース: {currencyFormatter.format(nonProperBudget)}万円
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              計算式: 内部 {headcountFormatter.format(properHeadcountTotal)}
              人月 × {currencyFormatter.format(estimatedUnitPrice)}万円 ={' '}
              {currencyFormatter.format(properBudget)}万円 ／ 外部{' '}
              {headcountFormatter.format(nonProperHeadcountTotal)}人月 ×{' '}
              {currencyFormatter.format(estimatedUnitPrice)}万円 ={' '}
              {currencyFormatter.format(nonProperBudget)}万円
            </p>
          </div>
          <div className="rounded-md bg-budget-actual/10 p-3">
            <p className="text-sm text-muted-foreground">
              年間総合実績額見込み（合計（個別での単価実績合計））
            </p>
            <p className="mt-1 text-2xl font-bold">
              {currencyFormatter.format(totalActual)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                万円
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              内部リソース: {currencyFormatter.format(properActual)}万円 ／
              外部リソース: {currencyFormatter.format(nonProperActual)}万円
            </p>
          </div>
          <div className="rounded-md p-3">
            <p className="text-sm text-muted-foreground">
              残予算（予算総額－実績総額見込み）
            </p>
            <p className="mt-1 text-2xl font-bold">
              {currencyFormatter.format(remainingBudget)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                万円
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              内部リソース: {currencyFormatter.format(remainingProperBudget)}
              万円 ／ 外部リソース:{' '}
              {currencyFormatter.format(remainingNonProperBudget)}万円
            </p>
          </div>
          <div className="rounded-md p-3">
            <p className="text-sm text-muted-foreground">
              残契約概算工数（残予算 ÷ 概算単価）
            </p>
            <p className="mt-1 text-2xl font-bold">
              {effortFormatter.format(remainingContractEffort)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                人月
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              内部リソース:{' '}
              {effortFormatter.format(remainingProperContractEffort)}
              人月 ／ 外部リソース:{' '}
              {effortFormatter.format(remainingNonProperContractEffort)}人月
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm font-medium">プロジェクト工数との比較</p>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <div className="rounded-md bg-budget-planned/10 p-3">
            <p className="text-sm text-muted-foreground">
              プロジェクトの合計工数（担当部門設定プロジェクトのWBS総工数、1人月=
              {workdaysPerMonth}
              人日換算）
            </p>
            <p className="mt-1 text-2xl font-bold">
              {effortFormatter.format(totalProjectEffortMonths)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                人月
              </span>
            </p>
          </div>
          <div className="rounded-md bg-budget-actual/10 p-3">
            <p className="text-sm text-muted-foreground">
              割り当て済み工数（部門所属メンバーの月次アサイン合計）
            </p>
            <p className="mt-1 text-2xl font-bold">
              {effortFormatter.format(assignedEffortMonths)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                人月
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
