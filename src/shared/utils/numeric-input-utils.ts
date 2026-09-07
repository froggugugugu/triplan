/**
 * 全角数字・全角ピリオドを半角に変換する
 */
export function toHalfWidthNumeral(input: string): string {
  return input
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/．/g, '.')
}

/**
 * 先頭の連続するゼロを除去する。
 * 小数点直前の単一の0（例: "0.5"）は除去しない。
 * 全て0の場合は単一の"0"を残す（例: "00" -> "0"）。
 * このアプリの数値フィールドはすべて0以上のため負符号は扱わない。
 */
export function stripLeadingZeros(input: string): string {
  return input.replace(/^0+(?=\d)/, '')
}

/**
 * 全角→半角変換のうえで数値へパースする。
 * 空文字列は0、無効な入力・負の値はnullを返す。
 */
export function parseNumericInput(input: string): number | null {
  const halfWidth = toHalfWidthNumeral(input).trim()
  if (halfWidth === '') return 0

  const parsed = Number(halfWidth)
  if (Number.isNaN(parsed) || parsed < 0) return null

  return parsed
}
