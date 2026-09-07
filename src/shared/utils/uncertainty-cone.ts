import type { EstimateStage } from '@/shared/types/estimate-snapshot'
import { ESTIMATE_STAGES } from '@/shared/types/estimate-snapshot'

/**
 * 不確実性コーン（Boehm 1981 / McConnell 2006）。
 * 各段階で「実績÷見積」が収まると期待できる幅。**保存せず段階から都度導出する**
 * （`totalFp`と違い、出典の値であって記録固有の根拠ではないため）。
 */
export const UNCERTAINTY_CONE: Record<
  EstimateStage,
  { low: number; high: number }
> = {
  initial_concept: { low: 0.25, high: 4 },
  product_definition: { low: 0.5, high: 2 },
  requirements_complete: { low: 0.67, high: 1.5 },
  ui_design_complete: { low: 0.8, high: 1.25 },
  detailed_design_complete: { low: 0.9, high: 1.1 },
  completed: { low: 1, high: 1 },
}

export const ESTIMATE_STAGE_LABELS: Record<EstimateStage, string> = {
  initial_concept: '初期コンセプト',
  product_definition: '製品定義の承認（提案・受注）',
  requirements_complete: '要件定義完了',
  ui_design_complete: '基本設計（UI設計）完了',
  detailed_design_complete: '詳細設計完了',
  completed: '完了（実績）',
}

/** 段階の並び順（コーンのx軸）。`ESTIMATE_STAGES`の定義順 */
export function getStageIndex(stage: EstimateStage): number {
  return ESTIMATE_STAGES.indexOf(stage)
}

/** 幅の表示文字列（例: "0.67x〜1.5x"。完了は"1x"） */
export function formatConeWidth(stage: EstimateStage): string {
  const { low, high } = UNCERTAINTY_CONE[stage]
  if (low === high) return `${low}x`
  return `${low}x〜${high}x`
}

/**
 * 見積額に幅を掛けた下限・上限（万円、整数に四捨五入）。
 * y軸が万円のコーン帯を描くための値
 */
export function calcConeBounds(
  amount: number,
  stage: EstimateStage,
): { low: number; high: number } {
  const { low, high } = UNCERTAINTY_CONE[stage]
  return { low: Math.round(amount * low), high: Math.round(amount * high) }
}

/**
 * 誤差比 = 実績 ÷ 見積。見積が0以下なら判定不能（null）＝ゼロ除算を回避し、
 * 「見積0で実績あり」を無限大として扱わない
 */
export function calcErrorRatio(
  actual: number,
  estimate: number,
): number | null {
  if (!(estimate > 0)) return null
  return actual / estimate
}

/**
 * 誤差比がその段階の幅に収まるか。境界（下限・上限ちょうど）は内側。
 * 浮動小数点の丸め誤差（0.67を計算で作った場合など）で境界を誤判定しないようepsilonを許容する
 */
export function isWithinCone(
  ratio: number,
  stage: EstimateStage,
  epsilon = 1e-9,
): boolean {
  const { low, high } = UNCERTAINTY_CONE[stage]
  return ratio >= low - epsilon && ratio <= high + epsilon
}
