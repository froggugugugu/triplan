import type {
  EstimateBasis,
  FpItem,
  FpItemType,
  FpMethod,
} from '@/shared/types/estimate-snapshot'
import { FP_ITEM_TYPES } from '@/shared/types/estimate-snapshot'
import { calcProjectEstimateBudget } from '@/shared/utils/budget-utils'

/**
 * 簡易ファンクションポイント（NESMA）の重み表。複雑度は評価せず固定重みの未調整FP（UFP）。
 *
 * - 概算法（indicative）: データの塊（ILF・EIF）しか分からない引合初期向け
 * - 推定法（estimated）: 画面・帳票の一覧が挙がる提案段階向け
 *
 * 方法によって重みが変わるため、方法は記録（`EstimateSnapshot.fp.method`）に凍結する。
 */
export const FP_WEIGHTS: Record<
  FpMethod,
  Partial<Record<FpItemType, number>>
> = {
  nesma_indicative: { ILF: 35, EIF: 15 },
  nesma_estimated: { EI: 4, EO: 5, EQ: 4, ILF: 7, EIF: 5 },
}

export const FP_METHOD_LABELS: Record<FpMethod, string> = {
  nesma_indicative: 'NESMA概算法',
  nesma_estimated: 'NESMA推定法',
}

export const FP_ITEM_TYPE_LABELS: Record<FpItemType, string> = {
  EI: '外部入力（EI）',
  EO: '外部出力（EO）',
  EQ: '外部照会（EQ）',
  ILF: '内部論理ファイル（ILF）',
  EIF: '外部インタフェースファイル（EIF）',
}

/** その方法で数える機能種別（定義順） */
export function getCountableFpItemTypes(method: FpMethod): FpItemType[] {
  const weights = FP_WEIGHTS[method]
  return FP_ITEM_TYPES.filter((type) => weights[type] !== undefined)
}

export function isFpItemTypeCountable(
  method: FpMethod,
  type: FpItemType,
): boolean {
  return FP_WEIGHTS[method][type] !== undefined
}

/**
 * 合計FP = Σ 件数 × 重み（整数）。
 * その方法で数えない種別の行は0として無視する（保存時はZodのrefineが拒否する。
 * ここは入力途中のライブ表示にも使うため例外を投げない）
 */
export function calcTotalFp(
  method: FpMethod,
  items: readonly FpItem[],
): number {
  const weights = FP_WEIGHTS[method]
  return items.reduce((sum, item) => {
    const weight = weights[item.type]
    if (weight === undefined) return sum
    return sum + item.count * weight
  }, 0)
}

/** 人日を小数2桁に四捨五入する（見積の工数はこの刻みで保存する） */
export function roundEffortDays(days: number): number {
  return Math.round(days * 100) / 100
}

/**
 * FP → 人日。`totalFp × 人時/FP ÷ 時間/日` を小数2桁に四捨五入。
 * 時間/日が0以下なら0（Zodが弾く値だが、ライブ表示でNaNやInfinityを出さない）
 */
export function convertFpToEffortDays(
  totalFp: number,
  hoursPerFunctionPoint: number,
  hoursPerDay: number,
): number {
  if (!(hoursPerDay > 0)) return 0
  return roundEffortDays((totalFp * hoursPerFunctionPoint) / hoursPerDay)
}

/**
 * 人日 → 万円。人月（人日÷人日/人月、中間丸めなし）に概算単価と係数を掛けて
 * 整数の万円にする（`calcProjectEstimateBudget`と同じ丸め＝WBS概算予算と同じ数字になる）
 */
export function calcEstimateAmount(
  effortDays: number,
  basis: Pick<
    EstimateBasis,
    'estimatedUnitPrice' | 'coefficient' | 'workdaysPerMonth'
  >,
): number {
  if (!(basis.workdaysPerMonth > 0)) return 0
  return calcProjectEstimateBudget(
    effortDays / basis.workdaysPerMonth,
    basis.estimatedUnitPrice,
    basis.coefficient,
  )
}

export interface FpEstimateResult {
  totalFp: number
  effortDays: number
  /** 表示専用（小数2桁で表示）。中間丸めはしない */
  effortMonths: number
  amount: number
}

/** FP項目と設定値から、合計FP・人日・人月・万円をまとめて算出する */
export function buildFpEstimate(
  method: FpMethod,
  items: readonly FpItem[],
  basis: EstimateBasis & { hoursPerFunctionPoint: number },
): FpEstimateResult {
  const totalFp = calcTotalFp(method, items)
  const effortDays = convertFpToEffortDays(
    totalFp,
    basis.hoursPerFunctionPoint,
    basis.hoursPerDay,
  )
  return {
    totalFp,
    effortDays,
    effortMonths:
      basis.workdaysPerMonth > 0 ? effortDays / basis.workdaysPerMonth : 0,
    amount: calcEstimateAmount(effortDays, basis),
  }
}
