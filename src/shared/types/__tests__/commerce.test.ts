import { describe, expect, it } from 'vitest'
import {
  BillingMilestoneSchema,
  ChangeRequestSchema,
  DatabaseSchema,
} from '@/shared/types'

function baseChangeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    title: 'CR#1 追加開発分',
    requestedAt: '2026-07-01',
    status: 'pending',
    contractAmountDelta: 300,
    contractAmountDeltaType: 'increase',
    effortDeltaDays: 60,
    effortDeltaType: 'increase',
    newDueDate: null,
    decidedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function baseMilestone(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    label: '中間金',
    amount: 300,
    plannedAcceptanceDate: '2026-09-30',
    status: 'planned',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('ChangeRequestSchema', () => {
  it('必須フィールドが揃っていればパースできる', () => {
    expect(() => ChangeRequestSchema.parse(baseChangeRequest())).not.toThrow()
  })

  // 反証: 差分額は絶対値＋増減区分で表す（NumericInputが負値を受け付けないため）
  it('反証: 受注額差分・工数差分の負値は拒否する', () => {
    expect(() =>
      ChangeRequestSchema.parse(baseChangeRequest({ contractAmountDelta: -1 })),
    ).toThrow()
    expect(() =>
      ChangeRequestSchema.parse(baseChangeRequest({ effortDeltaDays: -1 })),
    ).toThrow()
  })

  it('反証: statusに定義外の値は拒否する', () => {
    expect(() =>
      ChangeRequestSchema.parse(baseChangeRequest({ status: 'done' })),
    ).toThrow()
  })

  it('反証: titleが空文字だと拒否する（何の変更か追跡できなくなる）', () => {
    expect(() =>
      ChangeRequestSchema.parse(baseChangeRequest({ title: '' })),
    ).toThrow()
  })

  it('新納期はnull（変更なし）とYYYY-MM-DDを受け付け、他形式は拒否する', () => {
    expect(() =>
      ChangeRequestSchema.parse(
        baseChangeRequest({ newDueDate: '2026-06-30' }),
      ),
    ).not.toThrow()
    expect(() =>
      ChangeRequestSchema.parse(
        baseChangeRequest({ newDueDate: '2026/06/30' }),
      ),
    ).toThrow()
  })
})

describe('BillingMilestoneSchema', () => {
  it('必須フィールドが揃っていればパースできる', () => {
    expect(() => BillingMilestoneSchema.parse(baseMilestone())).not.toThrow()
  })

  it('4つのステータスを受け付ける', () => {
    for (const status of ['planned', 'accepted', 'invoiced', 'paid']) {
      expect(() =>
        BillingMilestoneSchema.parse(baseMilestone({ status })),
      ).not.toThrow()
    }
  })

  it('反証: 金額の負値・定義外ステータスは拒否する', () => {
    expect(() =>
      BillingMilestoneSchema.parse(baseMilestone({ amount: -1 })),
    ).toThrow()
    expect(() =>
      BillingMilestoneSchema.parse(baseMilestone({ status: 'billed' })),
    ).toThrow()
  })
})

describe('DatabaseSchema（changeRequests / billingMilestones）', () => {
  const emptyDatabase = {
    version: '1.0.0',
    fiscalYear: 2026,
    projects: [],
    members: [],
    metadata: {
      lastModified: new Date().toISOString(),
      createdBy: 'test',
      version: '1.0.0',
    },
  }

  // 後方互換: 既存データに新フィールドが無くても読み込める
  it('新フィールドを持たない既存データもパースできる', () => {
    const parsed = DatabaseSchema.parse(emptyDatabase)
    expect(parsed.changeRequests).toBeUndefined()
    expect(parsed.billingMilestones).toBeUndefined()
  })

  it('新エンティティを含むデータをパースできる', () => {
    const parsed = DatabaseSchema.parse({
      ...emptyDatabase,
      changeRequests: [baseChangeRequest()],
      billingMilestones: [baseMilestone()],
    })
    expect(parsed.changeRequests).toHaveLength(1)
    expect(parsed.billingMilestones).toHaveLength(1)
  })
})
