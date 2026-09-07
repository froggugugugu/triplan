import { z } from 'zod'

// Theme型をローカル定義（循環依存回避）
export type Theme = 'light' | 'dark' | 'system'

/**
 * テーマ別カラー定義スキーマ。
 * ライト／ダークで色を変えない場合は単一HEX文字列、変える場合は
 * `{ light, dark }` オブジェクトで指定する（`getThemeColor`が両方を解決する）。
 * 工程色（`PhaseDefinition.color`）のように1色で足りるものは文字列を使う。
 */
export const ThemeColorSchema = z.union([
  z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  z.object({
    light: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    dark: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  }),
])

export type ThemeColor = z.infer<typeof ThemeColorSchema>

/**
 * ThemeColorから現在のテーマに応じた色を取得する
 * @param color - ThemeColor（単一stringまたはlight/darkオブジェクト）
 * @param theme - 'light' | 'dark' | 'system'
 * @returns HEX色文字列
 */
export function getThemeColor(color: ThemeColor, theme: Theme): string {
  // 単一stringの場合はそのまま返す
  if (typeof color === 'string') {
    return color
  }

  // オブジェクトの場合はテーマに応じて返す
  if (theme === 'system') {
    // システムテーマの場合はprefers-color-schemeをチェック
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    return prefersDark ? color.dark : color.light
  }

  return theme === 'dark' ? color.dark : color.light
}

/**
 * 単一string色をThemeColorオブジェクトに変換する（マイグレーション用）
 * @param color - ThemeColor（単一stringまたは既存のオブジェクト）
 * @returns { light: string, dark: string }
 */
export function migrateToThemeColor(color: ThemeColor): {
  light: string
  dark: string
} {
  // 既にオブジェクトの場合はそのまま返す
  if (typeof color === 'object') {
    return color
  }

  // 単一stringの場合はlight/darkに変換
  return {
    light: color,
    dark: adjustBrightnessForDark(color),
  }
}

/**
 * HEX色の明度を調整してダークモード用の色を生成する
 * - 明るい色（輝度 > 0.5）は暗めに調整
 * - 暗い色（輝度 <= 0.5）は明るめに調整
 * @param hexColor - HEX形式の色（例: #4A90D9）
 * @returns 調整後のHEX色
 */
export function adjustBrightnessForDark(hexColor: string): string {
  // HEX形式のバリデーション
  if (!/^#[0-9A-Fa-f]{6}$/.test(hexColor)) {
    return hexColor // 無効な色はそのまま返す（防御的）
  }

  // HEXをRGBに変換
  const r = Number.parseInt(hexColor.slice(1, 3), 16)
  const g = Number.parseInt(hexColor.slice(3, 5), 16)
  const b = Number.parseInt(hexColor.slice(5, 7), 16)

  // 相対輝度を計算（簡易版）
  // 正確な計算は sRGB -> linear RGB 変換が必要だが、ここでは簡易的に
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255

  let adjustedR: number, adjustedG: number, adjustedB: number

  if (luminance > 0.5) {
    // 明るい色は暗めに調整（0.6倍）
    const factor = 0.6
    adjustedR = Math.round(r * factor)
    adjustedG = Math.round(g * factor)
    adjustedB = Math.round(b * factor)
  } else {
    // 暗い色は明るめに調整（1.4倍、255を超えない）
    const factor = 1.4
    adjustedR = Math.min(255, Math.round(r * factor))
    adjustedG = Math.min(255, Math.round(g * factor))
    adjustedB = Math.min(255, Math.round(b * factor))
  }

  // RGBをHEXに変換
  const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase()
  return `#${toHex(adjustedR)}${toHex(adjustedG)}${toHex(adjustedB)}`
}
