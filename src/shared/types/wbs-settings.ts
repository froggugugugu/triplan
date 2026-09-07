import { z } from 'zod'
import { type ThemeColor, ThemeColorSchema } from './theme-color'

/**
 * 工数列定義スキーマ
 */
export const EffortColumnSchema = z.object({
  id: z.string(), // "effort-1" ~ "effort-10"
  displayName: z.string().min(1).max(50),
  enabled: z.boolean(),
  order: z.number().int().min(0),
  backgroundColor: ThemeColorSchema.optional(), // hex color (supports light/dark modes)
  techTagIds: z.array(z.string().uuid()).optional(), // 紐付けた技術タグIDリスト
})
export type EffortColumn = z.infer<typeof EffortColumnSchema>

/**
 * レベル別背景色のデフォルト値（デジタル庁デザインシステム準拠）
 *
 * デジタル庁デザインシステムウェブサイト（https://design.digital.go.jp/dads/）の
 * コンテンツを参考に作成しています。
 * 利用規約: https://design.digital.go.jp/dads/introduction/notices/
 *
 * カラーコード出典: https://github.com/digital-go-jp/design-tokens (figma/tokens.json)
 * - ライトモード: Blue 50-200（薄→濃のグラデーション）
 * - ダークモード: Blue 1200-800（薄→濃のグラデーション）
 */
export const DEFAULT_LEVEL_COLORS: Record<string, ThemeColor> = {
  0: { light: '#e8f1fe', dark: '#000060' }, // Blue 50 / Blue 1200（レベル0=最も薄い）
  1: { light: '#e8f1fe', dark: '#000071' }, // Blue 50 / Blue 1100
  2: { light: '#d9e6ff', dark: '#00118f' }, // Blue 100 / Blue 1000
  3: { light: '#c5d7fb', dark: '#0017c1' }, // Blue 200 / Blue 900
  4: { light: '#d9e6ff', dark: '#0031d8' }, // Blue 100 / Blue 800
  5: { light: '#e8f1fe', dark: '#000060' }, // Blue 50 / Blue 1200（レベル5=最も薄い、レベル0と同じ）
}

/**
 * 工数列のデフォルト背景色（デジタル庁デザインシステム準拠）
 *
 * カラーコード出典: https://github.com/digital-go-jp/design-tokens (figma/tokens.json)
 * - ライトモード: 各色 200（淡い階調、背景色として可読性を確保）
 * - ダークモード: 各色 600（暗い階調、ダークモードの可読性を確保）
 */
export const DEFAULT_EFFORT_COLUMN_COLORS: ThemeColor[] = [
  { light: '#c5d7fb', dark: '#3460fb' }, // Blue 200 / 600
  { light: '#9bd4b5', dark: '#259d63' }, // Green 200 / 600
  { light: '#ffc199', dark: '#fb5b01' }, // Orange 200 / 600
  { light: '#ddc2ff', dark: '#8843e1' }, // Purple 200 / 600
  { light: '#99f2ff', dark: '#00a3bf' }, // Cyan 200 / 600
  { light: '#ffe380', dark: '#d2a400' }, // Yellow 200 / 600
  { light: '#ffbbbb', dark: '#fe3939' }, // Red 200 / 600
  { light: '#c0e4ff', dark: '#008bf2' }, // LightBlue 200 / 600
  { light: '#c0f354', dark: '#7eb40d' }, // Lime 200 / 600
  { light: '#ffaeff', dark: '#db00db' }, // Magenta 200 / 600
]

/**
 * WBS設定スキーマ
 */
export const WbsSettingsSchema = z.object({
  effortColumns: z.array(EffortColumnSchema).max(10),
  levelColors: z.record(z.string(), ThemeColorSchema).optional(),
  lastModified: z.string().datetime(),
})
export type WbsSettings = z.infer<typeof WbsSettingsSchema>

// WBS設定エンティティ（案件×1レコード。17ストアのDataAdapter配線・第11弾で追加。
// wbs-settings-storeが従来Zustand persistの独立localStorageキー（wbs-settings-storage）
// で永続化していたWbsSettings（settingsMap: Record<projectId, WbsSettings>）を、
// 他ストアと同じDataAdapter/Database経由の永続化へ移行するためのレコード型）
export const WbsSettingsEntrySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  effortColumns: z.array(EffortColumnSchema).max(10),
  levelColors: z.record(z.string(), ThemeColorSchema).optional(),
  lastModified: z.string().datetime(),
})
export type WbsSettingsEntry = z.infer<typeof WbsSettingsEntrySchema>
export const CreateWbsSettingsEntrySchema = WbsSettingsEntrySchema.omit({
  id: true,
})
export type CreateWbsSettingsEntry = z.infer<
  typeof CreateWbsSettingsEntrySchema
>

/**
 * デフォルトの工数列定義（10列、最初の3列が有効）
 */
export function createDefaultWbsSettings(): WbsSettings {
  const columns: EffortColumn[] = Array.from({ length: 10 }, (_, i) => ({
    id: `effort-${i + 1}`,
    displayName: '区分',
    enabled: i < 3,
    order: i,
    backgroundColor: DEFAULT_EFFORT_COLUMN_COLORS[i],
  }))
  return {
    effortColumns: columns,
    levelColors: { ...DEFAULT_LEVEL_COLORS },
    lastModified: new Date().toISOString(),
  }
}
