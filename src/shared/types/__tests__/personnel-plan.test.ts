import { describe, expect, it } from 'vitest'
import {
  CreatePersonnelPlanEntrySchema,
  PERSONNEL_PLAN_CATEGORIES,
  PersonnelPlanCategorySchema,
  PersonnelPlanEntrySchema,
  UpdatePersonnelPlanEntrySchema,
} from '@/shared/types/personnel-plan'

describe('PersonnelPlanCategorySchema', () => {
  it('4つの固定区分をすべて受け付ける', () => {
    for (const category of PERSONNEL_PLAN_CATEGORIES) {
      expect(() => PersonnelPlanCategorySchema.parse(category)).not.toThrow()
    }
  })

  it('未知の区分はエラーになる', () => {
    expect(() => PersonnelPlanCategorySchema.parse('unknown')).toThrow()
  })
})

describe('PersonnelPlanEntrySchema', () => {
  const validEntry = {
    id: crypto.randomUUID(),
    divisionId: crypto.randomUUID(),
    fiscalYear: 2025,
    category: 'personnel_internal' as const,
    monthlyHeadcount: { '2025-04': 2 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  it('monthlyRealizedHeadcountを省略した場合は空オブジェクトがデフォルトになる', () => {
    const parsed = PersonnelPlanEntrySchema.parse(validEntry)
    expect(parsed.monthlyRealizedHeadcount).toEqual({})
  })

  it('4区分のいずれもバリデーションできる', () => {
    for (const category of PERSONNEL_PLAN_CATEGORIES) {
      expect(() =>
        PersonnelPlanEntrySchema.parse({ ...validEntry, category }),
      ).not.toThrow()
    }
  })

  it('追加予定区分でmonthlyRealizedHeadcount（実現人数）を指定できる', () => {
    const parsed = PersonnelPlanEntrySchema.parse({
      ...validEntry,
      category: 'planned_internal',
      monthlyRealizedHeadcount: { '2025-04': 1 },
    })
    expect(parsed.monthlyRealizedHeadcount).toEqual({ '2025-04': 1 })
  })

  it('不正な区分を指定するとエラーになる', () => {
    expect(() =>
      PersonnelPlanEntrySchema.parse({ ...validEntry, category: 'invalid' }),
    ).toThrow()
  })

  it('monthlyHeadcountの値が負の場合はエラーになる', () => {
    expect(() =>
      PersonnelPlanEntrySchema.parse({
        ...validEntry,
        monthlyHeadcount: { '2025-04': -1 },
      }),
    ).toThrow()
  })

  it('monthlyRealizedHeadcountの値が負の場合はエラーになる', () => {
    expect(() =>
      PersonnelPlanEntrySchema.parse({
        ...validEntry,
        monthlyRealizedHeadcount: { '2025-04': -1 },
      }),
    ).toThrow()
  })

  // 反証: fiscalYearの境界値（2000/2100）が実際にスキーマへ正しく反映されているか
  it('fiscalYearが2000未満の場合はエラーになる', () => {
    expect(() =>
      PersonnelPlanEntrySchema.parse({ ...validEntry, fiscalYear: 1999 }),
    ).toThrow()
  })

  it('fiscalYearが2000ちょうどの場合は成功する', () => {
    expect(() =>
      PersonnelPlanEntrySchema.parse({ ...validEntry, fiscalYear: 2000 }),
    ).not.toThrow()
  })

  it('fiscalYearが2100ちょうどの場合は成功する', () => {
    expect(() =>
      PersonnelPlanEntrySchema.parse({ ...validEntry, fiscalYear: 2100 }),
    ).not.toThrow()
  })

  it('fiscalYearが2100を超える場合はエラーになる', () => {
    expect(() =>
      PersonnelPlanEntrySchema.parse({ ...validEntry, fiscalYear: 2101 }),
    ).toThrow()
  })

  it('label/isProper/unitPrice/status等の旧フィールドは存在しない', () => {
    const parsed = PersonnelPlanEntrySchema.parse(validEntry)
    expect(parsed).not.toHaveProperty('label')
    expect(parsed).not.toHaveProperty('isProper')
    expect(parsed).not.toHaveProperty('unitPrice')
    expect(parsed).not.toHaveProperty('status')
    expect(parsed).not.toHaveProperty('realizedMemberId')
    expect(parsed).not.toHaveProperty('realizedAt')
  })
})

describe('CreatePersonnelPlanEntrySchema', () => {
  it('id/日時を含まずに作成データをバリデーションできる', () => {
    const parsed = CreatePersonnelPlanEntrySchema.parse({
      divisionId: crypto.randomUUID(),
      fiscalYear: 2025,
      category: 'planned_external',
      monthlyHeadcount: { '2025-04': 1 },
    })
    expect(parsed).not.toHaveProperty('id')
    expect(parsed).not.toHaveProperty('createdAt')
  })
})

describe('UpdatePersonnelPlanEntrySchema', () => {
  it('idのみ必須で、他は任意項目としてバリデーションできる', () => {
    const parsed = UpdatePersonnelPlanEntrySchema.parse({
      id: crypto.randomUUID(),
      monthlyHeadcount: { '2025-05': 3 },
    })
    expect(parsed.monthlyHeadcount).toEqual({ '2025-05': 3 })
  })

  it('idがない場合はエラーになる', () => {
    expect(() =>
      UpdatePersonnelPlanEntrySchema.parse({ monthlyHeadcount: {} }),
    ).toThrow()
  })
})
