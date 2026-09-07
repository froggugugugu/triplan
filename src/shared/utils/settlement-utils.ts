import type { ContractUnitPriceEntry } from '@/shared/types/member'
import { HOURS_PER_DAY, WORKDAYS_PER_MONTH } from './budget-utils'

/**
 * 準委任の月次精算コア（非公開の設計文書）。
 * 精算幅（時間/月）に対する実績時間で「幅内=固定／下回り=控除／超過=追加請求」を判定する。
 * すべて純関数・決定論（丸めは万円の小数2桁）。
 *
 * - 控除単価 = 基準額 ÷ 下限h、超過単価 = 基準額 ÷ 上限h（日本のSES商習慣の一般形。
 *   個社の別方式はカスタムCSV＋外部計算で逃がす=過剰設計回避【仮定】）
 * - 上下限が両方設定されて初めて精算対象。片側のみ・未設定は固定扱い（防御的）
 */

export type SettlementKind = 'fixed' | 'within' | 'deduction' | 'overage'

export const SETTLEMENT_KIND_LABELS: Record<SettlementKind, string> = {
  fixed: '',
  within: '幅内',
  deduction: '控除',
  overage: '超過',
}

export interface SettlementResult {
  kind: SettlementKind
  /** 実績時間（h、小数2桁）。fixed時も参考値として返す */
  actualHours: number
  /** 精算後の支払額（万円、小数2桁）。fixed時は 基準額 × 実績人月（従来どおり） */
  payableAmount: number
  /** 精算の基準額（万円）= 契約単価エントリのamount。1.0人月あたりの月額 */
  baseAmount: number
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * 対象月に適用される契約単価エントリを返す（`getApplicableUnitPrice`と同じ探索:
 * effectiveFromが対象月以下のうち最新。該当なしはundefined）
 */
export function getApplicableContractEntry(
  history: ContractUnitPriceEntry[],
  targetMonth: string,
): ContractUnitPriceEntry | undefined {
  return [...history]
    .filter((entry) => entry.effectiveFrom <= targetMonth)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
}

/** 精算幅が有効か（上下限が両方設定され、上限≥下限） */
export function hasSettlementRange(
  entry: Pick<
    ContractUnitPriceEntry,
    'settlementLowerHours' | 'settlementUpperHours'
  >,
): boolean {
  return (
    entry.settlementLowerHours !== undefined &&
    entry.settlementUpperHours !== undefined &&
    entry.settlementUpperHours >= entry.settlementLowerHours
  )
}

/**
 * メンバー×月の合計実績人月から精算を判定する。
 * 実績時間 = 実績人月 × workdaysPerMonth × hoursPerDay（システム設定値を注入）。
 * 境界は幅内に含める（下限ちょうど・上限ちょうど=固定額）
 */
export function calcQuasiDelegationSettlement(
  entry: Pick<
    ContractUnitPriceEntry,
    'amount' | 'settlementLowerHours' | 'settlementUpperHours'
  >,
  actualManMonths: number,
  workdaysPerMonth: number = WORKDAYS_PER_MONTH,
  hoursPerDay: number = HOURS_PER_DAY,
): SettlementResult {
  const actualHours = round2(actualManMonths * workdaysPerMonth * hoursPerDay)
  const baseAmount = entry.amount

  if (!hasSettlementRange(entry)) {
    return {
      kind: 'fixed',
      actualHours,
      payableAmount: round2(baseAmount * actualManMonths),
      baseAmount,
    }
  }
  const lower = entry.settlementLowerHours as number
  const upper = entry.settlementUpperHours as number

  if (actualHours < lower) {
    return {
      kind: 'deduction',
      actualHours,
      payableAmount: round2((baseAmount / lower) * actualHours),
      baseAmount,
    }
  }
  if (actualHours > upper) {
    return {
      kind: 'overage',
      actualHours,
      payableAmount: round2(
        baseAmount + (baseAmount / upper) * (actualHours - upper),
      ),
      baseAmount,
    }
  }
  return {
    kind: 'within',
    actualHours,
    payableAmount: baseAmount,
    baseAmount,
  }
}
