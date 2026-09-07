/**
 * 月次配分値（人月）入力のパース（P1-aでsharedへ抽出）。
 * 元は`features/assignment/utils/assignment-utils.ts`の`parseAssignmentInput`
 * （上限1.0固定）だったが、月次実績画面（features/actuals）は「実績は事実の記録であり
 * 上限でブロックしない」（DESIGN §4.0 原則5）ため、上限をオプション化したコアを
 * shared層に置き、features間の直接依存を避ける（依存方向ルール）。
 *
 * - 全角数字・全角ピリオドは半角へ変換
 * - 空文字は0（既存挙動の維持。クリア操作は呼び出し側が空文字を先に判定する）
 * - 負値・数値以外はnull
 * - 0.01刻み（2桁精度）に丸め
 * - `options.max`を指定した場合、丸め後の値が上限を超えるとnull
 */
export function parseAllocationInput(
  input: string,
  options?: { max?: number },
): number | null {
  const halfWidth = input
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/．/g, '.')
    .trim()

  if (halfWidth === '') return 0

  const parsed = Number(halfWidth)
  if (Number.isNaN(parsed) || parsed < 0) return null

  const rounded = Math.round(parsed * 100) / 100
  if (options?.max !== undefined && rounded > options.max) return null

  return rounded
}
