import { z } from 'zod'
import { ThemeColorSchema } from './theme-color'

// 1. Dependency type enum
export const DependencyTypeSchema = z.enum(['FS', 'SS', 'FF', 'SF'])
export type DependencyType = z.infer<typeof DependencyTypeSchema>

// 2. Phase definition (max 15 phases)
export const PhaseDefinitionSchema = z.object({
  phaseKey: z.string(), // phase-1 ~ phase-15 (immutable)
  name: z.string().min(1).max(50), // Display name
  color: ThemeColorSchema, // Hex color for Gantt bar (supports light/dark modes)
  enabled: z.boolean(),
  sortOrder: z.number().int().min(0), // For drag-drop ordering
})
export type PhaseDefinition = z.infer<typeof PhaseDefinitionSchema>

// 3. Phase settings container
export const PhaseSettingsSchema = z.object({
  phases: z.array(PhaseDefinitionSchema).max(15),
  lastModified: z.string().datetime(),
})
export type PhaseSettings = z.infer<typeof PhaseSettingsSchema>

// 4. Schedule entry (projectId × phaseKey uniqueness)
export const ScheduleEntrySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  phaseKey: z.string(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
export type ScheduleEntry = z.infer<typeof ScheduleEntrySchema>

// 5. Phase dependency (projectId × fromPhaseKey × toPhaseKey uniqueness)
export const PhaseDependencySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  fromPhaseKey: z.string(),
  toPhaseKey: z.string(),
  dependencyType: DependencyTypeSchema,
})
export type PhaseDependency = z.infer<typeof PhaseDependencySchema>

// 3b. Phase settings entity（案件×1レコード。17ストアのDataAdapter配線・第11弾で追加。
// schedule-settings-storeが従来Zustand persistの独立localStorageキー（schedule-settings-storage）
// で永続化していたPhaseSettings（settingsMap: Record<projectId, PhaseSettings>）を、
// 他ストアと同じDataAdapter/Database経由の永続化へ移行するためのレコード型）
export const PhaseSettingsEntrySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  phases: z.array(PhaseDefinitionSchema).max(15),
  lastModified: z.string().datetime(),
})
export type PhaseSettingsEntry = z.infer<typeof PhaseSettingsEntrySchema>
export const CreatePhaseSettingsEntrySchema = PhaseSettingsEntrySchema.omit({
  id: true,
})
export type CreatePhaseSettingsEntry = z.infer<
  typeof CreatePhaseSettingsEntrySchema
>

// 6. Default settings factory (15 phases, first 5 enabled。で10→15に拡張)
export function createDefaultPhaseSettings(): PhaseSettings {
  const defaultNames = [
    '要件定義',
    '基本設計',
    '詳細設計',
    '実装・単体テスト',
    '結合テスト',
  ]
  const defaultColors = [
    { light: '#9db7f9', dark: '#9db7f9' }, // DADS Blue 300
    { light: '#97d3ff', dark: '#97d3ff' }, // DADS Light Blue 300
    { light: '#79e2f2', dark: '#79e2f2' }, // DADS Cyan 300
    { light: '#71c598', dark: '#71c598' }, // DADS Green 300
    { light: '#ade830', dark: '#ade830' }, // DADS Lime 300
    { light: '#ffd43d', dark: '#ffd43d' }, // DADS Yellow 300
    { light: '#ffa66d', dark: '#ffa66d' }, // DADS Orange 300
    { light: '#ff8eff', dark: '#ff8eff' }, // DADS Magenta 300
    { light: '#cda6ff', dark: '#cda6ff' }, // DADS Purple 300
    { light: '#ff9696', dark: '#ff9696' }, // DADS Red 300
    // 【仮定】phase-11〜phase-15用の追加5色。既存10色と重複しないよう選定（DADS拡張パレット未確認のため次工程で確認）
    { light: '#0ea5e9', dark: '#0ea5e9' }, // Sky 500
    { light: '#8b5cf6', dark: '#8b5cf6' }, // Violet 500
    { light: '#f43f5e', dark: '#f43f5e' }, // Rose 500
    { light: '#14b8a6', dark: '#14b8a6' }, // Teal 500
    { light: '#64748b', dark: '#64748b' }, // Slate 500
  ]

  const phases: PhaseDefinition[] = Array.from({ length: 15 }, (_, i) => ({
    phaseKey: `phase-${i + 1}`,
    name: i < 5 ? (defaultNames[i] ?? `工程${i + 1}`) : `工程${i + 1}`,
    color: defaultColors[i] ?? { light: '#3b82f6', dark: '#60a5fa' },
    enabled: i < 5,
    sortOrder: i,
  }))

  return {
    phases,
    lastModified: new Date().toISOString(),
  }
}
