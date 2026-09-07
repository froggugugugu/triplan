/**
 * 任意の背景色に対して読める文字色を選ぶ（a11y対応）。
 *
 * 技術タグの色はユーザーが自由に指定できるため、文字色を`#fff`で固定すると
 * 明るいタグでコントラストが足りない（axeの`color-contrast`違反。実測166件）。
 * WCAG 2.1の相対輝度から白/黒のうちコントラスト比が高い方を選ぶ。
 *
 * **白と黒の二択で必ずAA（4.5:1）を満たせる**: 分岐点（相対輝度≒0.179）でも
 * 白・黒いずれとも約4.58:1になるため、どちらか高い方を採れば下回らない。
 */

/** sRGBの1チャンネル（0〜1）を線形値へ変換する（WCAG 2.1の定義） */
function toLinear(channel: number): number {
  return channel <= 0.03928
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4
}

/**
 * `#RGB` / `#RRGGBB` を [r, g, b]（0〜255）へ。解釈できなければnull。
 */
function parseHex(hex: string): [number, number, number] | null {
  const value = hex.trim().replace(/^#/, '')
  const expanded =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null
  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ]
}

/** WCAG 2.1の相対輝度（0〜1）。解釈できない色は0（＝黒扱い）とする */
export function getRelativeLuminance(hex: string): number {
  const rgb = parseHex(hex)
  if (!rgb) return 0
  const [r, g, b] = rgb.map((c) => toLinear(c / 255)) as [
    number,
    number,
    number,
  ]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** 2色のコントラスト比（1〜21）。WCAG AAの通常テキストは4.5以上 */
export function getContrastRatio(hexA: string, hexB: string): number {
  const a = getRelativeLuminance(hexA)
  const b = getRelativeLuminance(hexB)
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * 背景色に対して読める文字色（白か黒）を返す。
 *
 * 解釈できない色（空文字・不正なHEX）は白を返す。従来の固定値と同じ挙動にして、
 * 色が壊れているデータで表示まで崩れないようにする。
 */
export function pickReadableTextColor(
  backgroundHex: string,
): '#ffffff' | '#000000' {
  if (!parseHex(backgroundHex)) return '#ffffff'
  return getContrastRatio(backgroundHex, '#ffffff') >=
    getContrastRatio(backgroundHex, '#000000')
    ? '#ffffff'
    : '#000000'
}
