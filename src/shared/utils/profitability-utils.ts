import type { AssignmentEntry } from '@/shared/types/assignment'
import type { BudgetBreakdown } from '@/shared/types/budget'
import type { Member } from '@/shared/types/member'
import {
  calcBudgetBreakdownActualRecordsTotal,
  calcConsumptionRate,
} from '@/shared/utils/budget-utils'
import { calcAcAtWeek } from '@/shared/utils/evm-utils'
import { getIsoWeekKey } from '@/shared/utils/iso-week-utils'

// budget-utils（evm-utilsに依存しない）とevm-utils（budget-utilsに依存する）の両方を使うため、
// どちらへ入れても循環依存になる。独立ファイルとして両者の上に置く
// （実体は元features/budget/utils/expense-budget-utils.tsから移設、features側にリエクスポートあり。
// アラートセンター＝features/dashboardからも参照するためのshared化）。

/**
 * 案件別損益（人・モノ・金の三位一体強化、requirements: 非公開の設計文書）。
 * 受注金額（`Project.contractAmount`）と実コスト（実人件費＋実付帯費用）を突き合わせ、粗利・利益率を算出する。
 */
export interface ProjectProfitability {
  /** 受注金額（万円）。Project.contractAmountが未設定(null/undefined)の場合は0 */
  contractAmount: number
  /** 実人件費（万円）。AssignmentEntry×Memberの人件費単価から算出（calcAcAtWeekと同一ロジック） */
  actualPersonnelCost: number
  /** 実付帯費用（万円）。対象案件に紐づくBudgetBreakdownの実績明細合計 */
  actualExpenseCost: number
  /** 実コスト合計（万円） = actualPersonnelCost + actualExpenseCost */
  actualCostTotal: number
  /** 粗利（万円） = contractAmount - actualCostTotal。予算超過時は負の値 */
  grossProfit: number
  /** 利益率（%） = grossProfit / contractAmount × 100。contractAmountが0以下の場合はnull（算出不能、ゼロ除算回避） */
  profitMarginRate: number | null
}

/**
 * @param project - 損益算出対象案件（id/contractAmountのみ参照）
 * @param assignments - 全AssignmentEntry（内部でprojectId一致分のみ抽出）
 * @param members - 全Member（人件費単価の参照に使用）
 * @param budgetBreakdowns - 全BudgetBreakdown（内部でprojectId一致分のみ抽出）
 * @param referenceDate - 実コストの集計基準日（デフォルト: 現在日時）。テストでは固定日時を明示的に渡すこと
 */
export function calcProjectProfitability(
  project: { id: string; contractAmount?: number | null },
  assignments: AssignmentEntry[],
  members: Member[],
  budgetBreakdowns: BudgetBreakdown[],
  referenceDate: Date = new Date(),
): ProjectProfitability {
  const contractAmount = project.contractAmount ?? 0
  const weekKey = getIsoWeekKey(referenceDate)
  const actualPersonnelCost = calcAcAtWeek(
    weekKey,
    assignments,
    members,
    project.id,
  )
  const projectBreakdowns = budgetBreakdowns.filter(
    (b) => b.projectId === project.id,
  )
  const actualExpenseCost =
    calcBudgetBreakdownActualRecordsTotal(projectBreakdowns)
  const actualCostTotal = actualPersonnelCost + actualExpenseCost
  const grossProfit = contractAmount - actualCostTotal
  const profitMarginRate =
    contractAmount > 0 ? (grossProfit / contractAmount) * 100 : null

  return {
    contractAmount,
    actualPersonnelCost,
    actualExpenseCost,
    actualCostTotal,
    grossProfit,
    profitMarginRate,
  }
}

/**
 * 案件の受注金額（予算）に対する実コスト消化率が閾値を超えたかを判定する
 * （`isContractRenewalWarning`と同型のパターンを案件予算超過アラートへ拡張、
 * ENHANCEMENT-ROADMAP §4）。ハードバリデーションではなく警告表示用の非ブロッキング判定。
 *
 * @param profitability - `calcProjectProfitability`の算出結果（の一部）
 * @param thresholdRate - 警告しきい値（消化率%、デフォルト80。【仮定】仕様未指定のため
 *   `isContractRenewalWarning`と同様に早期警告の目安として設定。100%到達前に気づけることを狙う）
 * @returns 受注金額が未設定（0以下）の場合は判定不能としてfalseを返す。
 *   それ以外は消化率（実コスト÷受注金額×100）がしきい値以上ならtrue
 */
export function isProjectBudgetOverrun(
  profitability: Pick<
    ProjectProfitability,
    'contractAmount' | 'actualCostTotal'
  >,
  thresholdRate = 80,
): boolean {
  if (profitability.contractAmount <= 0) return false
  return (
    calcConsumptionRate(
      profitability.contractAmount,
      profitability.actualCostTotal,
    ) >= thresholdRate
  )
}
