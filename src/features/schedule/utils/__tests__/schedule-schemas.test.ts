import { describe, expect, it } from 'vitest'
import {
  createDefaultPhaseSettings,
  DependencyTypeSchema,
  PhaseDefinitionSchema,
  PhaseDependencySchema,
  PhaseSettingsSchema,
  ScheduleEntrySchema,
} from '@/shared/types/schedule'

describe('PhaseDefinitionSchema', () => {
  it('should validate a valid phase definition', () => {
    const result = PhaseDefinitionSchema.safeParse({
      phaseKey: 'phase-1',
      name: '基本設計',
      color: '#4A90D9',
      enabled: true,
      sortOrder: 0,
    })
    expect(result.success).toBe(true)
  })

  it('should reject empty name', () => {
    const result = PhaseDefinitionSchema.safeParse({
      phaseKey: 'phase-1',
      name: '',
      color: '#4A90D9',
      enabled: true,
      sortOrder: 0,
    })
    expect(result.success).toBe(false)
  })

  it('should reject name exceeding 50 characters', () => {
    const result = PhaseDefinitionSchema.safeParse({
      phaseKey: 'phase-1',
      name: 'a'.repeat(51),
      color: '#4A90D9',
      enabled: true,
      sortOrder: 0,
    })
    expect(result.success).toBe(false)
  })
})

describe('PhaseSettingsSchema', () => {
  it('should validate default settings', () => {
    const settings = createDefaultPhaseSettings()
    const result = PhaseSettingsSchema.safeParse(settings)
    expect(result.success).toBe(true)
  })

  // : 工程設定の登録上限を10件から15件に拡張
  it('should accept exactly 15 phases', () => {
    const phases = Array.from({ length: 15 }, (_, i) => ({
      phaseKey: `phase-${i + 1}`,
      name: `工程${i + 1}`,
      color: '#000000',
      enabled: true,
      sortOrder: i,
    }))
    const result = PhaseSettingsSchema.safeParse({
      phases,
      lastModified: new Date().toISOString(),
    })
    expect(result.success).toBe(true)
  })

  it('should reject more than 15 phases', () => {
    const phases = Array.from({ length: 16 }, (_, i) => ({
      phaseKey: `phase-${i + 1}`,
      name: `工程${i + 1}`,
      color: '#000000',
      enabled: true,
      sortOrder: i,
    }))
    const result = PhaseSettingsSchema.safeParse({
      phases,
      lastModified: new Date().toISOString(),
    })
    expect(result.success).toBe(false)
  })

  // 反証: 既存データ（10件以下）は上限拡張後も引き続き受け入れられる（後方互換）
  it('反証: 10件（旧上限）は拡張後も引き続き受け入れられる', () => {
    const phases = Array.from({ length: 10 }, (_, i) => ({
      phaseKey: `phase-${i + 1}`,
      name: `工程${i + 1}`,
      color: '#000000',
      enabled: true,
      sortOrder: i,
    }))
    const result = PhaseSettingsSchema.safeParse({
      phases,
      lastModified: new Date().toISOString(),
    })
    expect(result.success).toBe(true)
  })
})

describe('ScheduleEntrySchema', () => {
  it('should validate a valid entry', () => {
    const result = ScheduleEntrySchema.safeParse({
      id: crypto.randomUUID(),
      projectId: crypto.randomUUID(),
      phaseKey: 'phase-1',
      startDate: '2025-04-01',
      endDate: '2025-06-30',
    })
    expect(result.success).toBe(true)
  })

  it('should reject missing projectId', () => {
    const result = ScheduleEntrySchema.safeParse({
      id: crypto.randomUUID(),
      phaseKey: 'phase-1',
      startDate: '2025-04-01',
      endDate: '2025-06-30',
    })
    expect(result.success).toBe(false)
  })
})

describe('PhaseDependencySchema', () => {
  it('should validate a valid dependency', () => {
    const result = PhaseDependencySchema.safeParse({
      id: crypto.randomUUID(),
      projectId: crypto.randomUUID(),
      fromPhaseKey: 'phase-1',
      toPhaseKey: 'phase-2',
      dependencyType: 'FS',
    })
    expect(result.success).toBe(true)
  })

  it('should validate all dependency types', () => {
    for (const type of ['FS', 'SS', 'FF', 'SF']) {
      const result = DependencyTypeSchema.safeParse(type)
      expect(result.success).toBe(true)
    }
  })

  it('should reject invalid dependency type', () => {
    const result = DependencyTypeSchema.safeParse('XX')
    expect(result.success).toBe(false)
  })
})

describe('createDefaultPhaseSettings', () => {
  it('should create 15 phases', () => {
    const settings = createDefaultPhaseSettings()
    expect(settings.phases).toHaveLength(15)
  })

  it('should have first 5 phases enabled', () => {
    const settings = createDefaultPhaseSettings()
    const enabledCount = settings.phases.filter((p) => p.enabled).length
    expect(enabledCount).toBe(5)
  })

  it('should have unique phase keys', () => {
    const settings = createDefaultPhaseSettings()
    const keys = settings.phases.map((p) => p.phaseKey)
    expect(new Set(keys).size).toBe(15)
  })

  it('should have sequential sort orders', () => {
    const settings = createDefaultPhaseSettings()
    const orders = settings.phases.map((p) => p.sortOrder)
    expect(orders).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
  })

  // : 追加5件（phase-11〜phase-15）にも色が割り当てられ、
  // 既存10色のプリセットを再利用しない（重複しない）
  it('反証: 追加分（phase-11〜phase-15）の色は既存10色と重複しない', () => {
    const settings = createDefaultPhaseSettings()
    const colors = settings.phases.map((p) =>
      typeof p.color === 'string' ? p.color : p.color.light,
    )
    expect(new Set(colors).size).toBe(15)
  })
})
