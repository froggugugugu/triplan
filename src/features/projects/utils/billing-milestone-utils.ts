import type { BillingMilestone } from '@/shared/types/billing-milestone'

/**
 * 請求マイルストンの集計（非公開の設計文書）。
 * 売上計上は検収基準（accepted以降＝検収済/請求済/入金済を売上とみなす）。
 */
export interface BillingTotals {
  /** 配分合計（全マイルストンの請求額合計、万円） */
  allocatedTotal: number
  /** 売上計上額（検収済以降の合計、万円） */
  recognizedTotal: number
  /** 入金済合計（万円） */
  paidTotal: number
}

const RECOGNIZED_STATUSES = new Set(['accepted', 'invoiced', 'paid'])

export function calcBillingTotals(
  milestones: BillingMilestone[],
): BillingTotals {
  let allocatedTotal = 0
  let recognizedTotal = 0
  let paidTotal = 0
  for (const milestone of milestones) {
    allocatedTotal += milestone.amount
    if (RECOGNIZED_STATUSES.has(milestone.status)) {
      recognizedTotal += milestone.amount
    }
    if (milestone.status === 'paid') {
      paidTotal += milestone.amount
    }
  }
  return { allocatedTotal, recognizedTotal, paidTotal }
}

/**
 * 配分合計と受注額の差（配分合計 − 受注額）を返す。
 * 受注額が未設定（null/0以下）の場合はnull（判定不能。受注額が後から降りてくる
 * 商習慣を踏まえ、未設定を異常扱いしない）。
 * 0 = 一致、正 = 配分超過、負 = 未配分あり。
 */
export function calcBillingAllocationGap(
  contractAmount: number | null | undefined,
  allocatedTotal: number,
): number | null {
  if (contractAmount == null || contractAmount <= 0) return null
  return allocatedTotal - contractAmount
}

/**
 * 受注残（受注額 − 売上計上額）。受注額未設定の場合はnull。
 * 受注残 = まだ検収されていない契約残高（バックログ）。
 */
export function calcOrderBacklog(
  contractAmount: number | null | undefined,
  recognizedTotal: number,
): number | null {
  if (contractAmount == null || contractAmount <= 0) return null
  return contractAmount - recognizedTotal
}
