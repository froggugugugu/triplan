import type { AssignmentEntry } from '@/shared/types/assignment'
import type {
  AiUsageEntry,
  BudgetBreakdown,
  DivisionBudget,
  ExchangeRateEntry,
  SaasContract,
} from '@/shared/types/budget'
import type { Company } from '@/shared/types/company'
import type { Member } from '@/shared/types/member'
import {
  calcBudgetBreakdownActualRecordsTotal,
  calcSaasContractsActualTotal,
  convertUsdToManYen,
  getApplicableExchangeRate,
  isProperMember,
} from '@/shared/utils/budget-utils'
import { calcAcAtWeek } from '@/shared/utils/evm-utils'
import { getIsoWeekKey } from '@/shared/utils/iso-week-utils'

/**
 * 原価4区分（労務費・外注費・直接経費・間接費配賦）の算出コア（* 非公開の設計文書）。
 * すべて純関数で、新しいユーザー入力は増やさない（既存の記録から自動導出する）。
 *
 * 核心の恒等式: 労務費＋外注費＝既存の実人件費（`calcProjectProfitability`の
 * `actualPersonnelCost`）。4区分は案件別損益の内訳展開であり、粗利の数値を変えない。
 */
export interface ProjectCostBreakdown {
  /** 労務費（万円）: 内部リソースメンバーのアサイン実コスト */
  laborCost: number
  /** 外注費（万円）: 外部リソースメンバーのアサイン実コスト（実人件費−労務費で導出） */
  subcontractCost: number
  /** 直接経費（万円): 案件紐づきBudgetBreakdownの実績明細合計（実付帯費用と同一値） */
  directExpense: number
  /** 間接費配賦（万円）: 部門の間接費実績の直接工数比例配賦（Math.round整数） */
  allocatedOverhead: number
}

export interface DivisionOverheadPoolInput {
  divisionId: string
  fiscalYear: number
  /** 対象年度の月次キー一覧（getFiscalYearMonthKeysで生成） */
  monthKeys: string[]
  divisionBudgets: DivisionBudget[]
  budgetBreakdowns: BudgetBreakdown[]
  saasContracts: SaasContract[]
  aiUsageEntries: AiUsageEntry[]
  exchangeRateHistory: ExchangeRateEntry[]
}

/**
 * 部門×年度の間接費原資（実績ベース、万円・未丸め）を算出する。
 * 内訳: 一般経費の実績明細合計＋SaaS費用実績（年度内月）＋AI利用費実績（為替換算）。
 * AI利用費は`divisionId`単位で全件合算する（課別・プロバイダ別を問わない。
 * 予実ダッシュボードの着地予測と同じ集計スコープ、設計【仮定】3）。
 */
export function calcDivisionOverheadPool(
  input: DivisionOverheadPoolInput,
): number {
  const budgetIds = new Set(
    input.divisionBudgets
      .filter(
        (b) =>
          b.divisionId === input.divisionId &&
          b.fiscalYear === input.fiscalYear,
      )
      .map((b) => b.id),
  )
  const generalExpense = calcBudgetBreakdownActualRecordsTotal(
    input.budgetBreakdowns.filter(
      (b) => budgetIds.has(b.budgetId) && b.category === 'general_expense',
    ),
  )

  const saasActual = calcSaasContractsActualTotal(
    input.saasContracts.filter((c) => c.divisionId === input.divisionId),
    input.monthKeys,
  )

  const aiActual = input.aiUsageEntries.reduce((sum, entry) => {
    if (entry.divisionId !== input.divisionId) return sum
    if (entry.fiscalYear !== input.fiscalYear) return sum
    if (entry.actualAmount === null || entry.actualAmount === undefined) {
      return sum
    }
    const rate = getApplicableExchangeRate(
      input.exchangeRateHistory,
      entry.month,
    )
    return sum + convertUsdToManYen(entry.actualAmount, rate)
  }, 0)

  return generalExpense + saasActual + aiActual
}

export interface ProjectCostBreakdownInput {
  /** トップレベル案件（divisionIdの参照のみ。配下タスクのアサインはprojectIdで紐づく） */
  topLevelProjects: { id: string; divisionId?: string | null }[]
  assignments: AssignmentEntry[]
  members: Member[]
  companies: Company[]
  budgetBreakdowns: BudgetBreakdown[]
  /** 配賦基準（直接工数）の対象月。対象年度の12ヶ月（getFiscalYearMonthKeysで生成） */
  monthKeys: string[]
  /** 部門id→間接費原資（万円）。calcDivisionOverheadPoolで構築する */
  overheadPoolByDivision: Map<string, number>
  /** 実コストの集計基準日（calcProjectProfitabilityと同じ基準日を渡すこと） */
  referenceDate: Date
}

/**
 * 案件id→原価4区分のMapを構築する。
 *
 * - 労務費: `calcAcAtWeek`を内部リソースメンバー（`isProperMember`）のアサインに絞って適用
 * - 外注費: 実人件費−労務費（`calcAcAtWeek`は結果を丸めるため、独立に丸めると合計が
 *   ±1万円ずれうる。引き算での導出により恒等式を丸めに関わらず保証する）
 * - 直接経費: 案件紐づき実績明細合計（既存の実付帯費用と同一値）
 * - 間接費配賦: 部門原資×（当該案件の直接工数÷部門内案件の直接工数合計）。
 *   工数は年度内の配分合計（実績優先・未入力月は計画）で、削除済みメンバーの
 *   アサインは基準に含めない。divisionId未設定案件・基準合計0の部門は配賦0
 */
export function buildProjectCostBreakdownMap(
  input: ProjectCostBreakdownInput,
): Map<string, ProjectCostBreakdown> {
  const weekKey = getIsoWeekKey(input.referenceDate)
  const memberById = new Map(input.members.map((m) => [m.id, m]))
  const internalAssignments = input.assignments.filter((a) => {
    const member = memberById.get(a.memberId)
    return member !== undefined && isProperMember(member, input.companies)
  })

  // 配賦基準: 案件ごとの年度内直接工数（実績優先・削除済みメンバー除外）
  const effortBasisByProject = new Map<string, number>()
  for (const assignment of input.assignments) {
    if (!memberById.has(assignment.memberId)) continue
    let basis = 0
    for (const month of input.monthKeys) {
      basis +=
        assignment.actualMonthlyValues?.[month] ??
        assignment.monthlyValues[month] ??
        0
    }
    effortBasisByProject.set(
      assignment.projectId,
      (effortBasisByProject.get(assignment.projectId) ?? 0) + basis,
    )
  }

  // 部門ごとの配賦基準合計（divisionId設定済みトップレベル案件のみ）
  const basisTotalByDivision = new Map<string, number>()
  for (const project of input.topLevelProjects) {
    if (!project.divisionId) continue
    const basis = effortBasisByProject.get(project.id) ?? 0
    basisTotalByDivision.set(
      project.divisionId,
      (basisTotalByDivision.get(project.divisionId) ?? 0) + basis,
    )
  }

  const result = new Map<string, ProjectCostBreakdown>()
  for (const project of input.topLevelProjects) {
    const totalPersonnelCost = calcAcAtWeek(
      weekKey,
      input.assignments,
      input.members,
      project.id,
    )
    const laborCost = calcAcAtWeek(
      weekKey,
      internalAssignments,
      input.members,
      project.id,
    )
    const subcontractCost = totalPersonnelCost - laborCost

    const directExpense = calcBudgetBreakdownActualRecordsTotal(
      input.budgetBreakdowns.filter((b) => b.projectId === project.id),
    )

    let allocatedOverhead = 0
    if (project.divisionId) {
      const pool = input.overheadPoolByDivision.get(project.divisionId) ?? 0
      const basisTotal = basisTotalByDivision.get(project.divisionId) ?? 0
      if (pool > 0 && basisTotal > 0) {
        const basis = effortBasisByProject.get(project.id) ?? 0
        allocatedOverhead = Math.round((pool * basis) / basisTotal)
      }
    }

    result.set(project.id, {
      laborCost,
      subcontractCost,
      directExpense,
      allocatedOverhead,
    })
  }
  return result
}
