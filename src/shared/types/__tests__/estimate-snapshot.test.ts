import { describe, expect, it } from 'vitest'
import {
  CreateEstimateSnapshotSchema,
  EstimateSnapshotSchema,
} from '@/shared/types/estimate-snapshot'

const base = {
  id: '00000000-0000-4000-8000-0000000000e1',
  projectId: '00000000-0000-4000-8000-0000000000a1',
  version: 1,
  stage: 'product_definition' as const,
  method: 'function_point' as const,
  label: '引合時の超概算',
  takenAt: '2026-09-01T00:00:00.000Z',
  effortDays: 125,
  amount: 625,
  basis: {
    estimatedUnitPrice: 100,
    coefficient: 1,
    workdaysPerMonth: 20,
    hoursPerDay: 8,
    hoursPerFunctionPoint: 10,
  },
  fp: {
    method: 'nesma_indicative' as const,
    items: [{ name: '顧客', type: 'ILF' as const, count: 2 }],
    totalFp: 70,
  },
  changeRequestId: null,
  authorName: null,
  createdAt: '2026-09-01T00:00:00.000Z',
}

describe('EstimateSnapshotSchema', () => {
  it('FP法の記録を受理する', () => {
    expect(EstimateSnapshotSchema.safeParse(base).success).toBe(true)
  })

  it('WBS法・手入力・実績の記録を受理する', () => {
    expect(
      EstimateSnapshotSchema.safeParse({
        ...base,
        method: 'wbs',
        fp: undefined,
        wbs: { leafCount: 12, totalEffortDays: 125 },
        basis: { ...base.basis, hoursPerFunctionPoint: undefined },
      }).success,
    ).toBe(true)
    expect(
      EstimateSnapshotSchema.safeParse({
        ...base,
        method: 'manual',
        fp: undefined,
        note: '協力会社の見積書を転記',
      }).success,
    ).toBe(true)
    expect(
      EstimateSnapshotSchema.safeParse({
        ...base,
        method: 'actual',
        stage: 'completed',
        fp: null,
      }).success,
    ).toBe(true)
  })

  it('反証: 概算法でEI/EO/EQの行があると拒否する', () => {
    const result = EstimateSnapshotSchema.safeParse({
      ...base,
      fp: {
        method: 'nesma_indicative',
        items: [{ name: '登録画面', type: 'EI', count: 1 }],
        totalFp: 4,
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['fp', 'items'])
    }
  })

  it('推定法ならEI/EO/EQを受理する', () => {
    expect(
      EstimateSnapshotSchema.safeParse({
        ...base,
        fp: {
          method: 'nesma_estimated',
          items: [{ name: '登録画面', type: 'EI', count: 1 }],
          totalFp: 4,
        },
      }).success,
    ).toBe(true)
  })

  it('反証: 実績（actual）は完了段階以外では拒否する', () => {
    expect(
      EstimateSnapshotSchema.safeParse({
        ...base,
        method: 'actual',
        stage: 'requirements_complete',
        fp: undefined,
      }).success,
    ).toBe(false)
  })

  it('反証: FP法なのにFP項目が無い／FP法以外にFP項目がある', () => {
    expect(
      EstimateSnapshotSchema.safeParse({ ...base, fp: undefined }).success,
    ).toBe(false)
    expect(
      EstimateSnapshotSchema.safeParse({ ...base, method: 'manual' }).success,
    ).toBe(false)
  })

  it('反証: WBS法なのに要約が無い／WBS法以外に要約がある', () => {
    expect(
      EstimateSnapshotSchema.safeParse({
        ...base,
        method: 'wbs',
        fp: undefined,
      }).success,
    ).toBe(false)
    expect(
      EstimateSnapshotSchema.safeParse({
        ...base,
        wbs: { leafCount: 1, totalEffortDays: 1 },
      }).success,
    ).toBe(false)
  })

  it('反証: FP法で人時/FPが凍結されていなければ拒否する', () => {
    expect(
      EstimateSnapshotSchema.safeParse({
        ...base,
        basis: { ...base.basis, hoursPerFunctionPoint: undefined },
      }).success,
    ).toBe(false)
  })

  it('反証: 件数0・名前空のFP項目、空ラベル、版0、負の工数は拒否する', () => {
    expect(
      EstimateSnapshotSchema.safeParse({
        ...base,
        fp: { ...base.fp, items: [{ name: '顧客', type: 'ILF', count: 0 }] },
      }).success,
    ).toBe(false)
    expect(
      EstimateSnapshotSchema.safeParse({
        ...base,
        fp: { ...base.fp, items: [{ name: '', type: 'ILF', count: 1 }] },
      }).success,
    ).toBe(false)
    expect(
      EstimateSnapshotSchema.safeParse({ ...base, label: '' }).success,
    ).toBe(false)
    expect(
      EstimateSnapshotSchema.safeParse({ ...base, version: 0 }).success,
    ).toBe(false)
    expect(
      EstimateSnapshotSchema.safeParse({ ...base, effortDays: -1 }).success,
    ).toBe(false)
  })

  it('定義外の段階・方法は拒否する', () => {
    expect(
      EstimateSnapshotSchema.safeParse({ ...base, stage: 'kickoff' }).success,
    ).toBe(false)
    expect(
      EstimateSnapshotSchema.safeParse({ ...base, method: 'guess' }).success,
    ).toBe(false)
  })

  it('CreateEstimateSnapshotSchemaはidを持たず、同じ整合検証を行う', () => {
    const { id: _id, ...create } = base
    expect(CreateEstimateSnapshotSchema.safeParse(create).success).toBe(true)
    expect(
      CreateEstimateSnapshotSchema.safeParse({
        ...create,
        method: 'actual',
        stage: 'initial_concept',
        fp: undefined,
      }).success,
    ).toBe(false)
  })
})
