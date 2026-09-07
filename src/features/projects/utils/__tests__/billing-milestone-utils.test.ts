import { describe, expect, it } from 'vitest'
import type { BillingMilestone } from '@/shared/types/billing-milestone'
import {
  calcBillingAllocationGap,
  calcBillingTotals,
  calcOrderBacklog,
} from '../billing-milestone-utils'

const PROJECT_ID = crypto.randomUUID()

function makeMilestone(
  overrides: Partial<BillingMilestone> = {},
): BillingMilestone {
  return {
    id: crypto.randomUUID(),
    projectId: PROJECT_ID,
    label: '中間金',
    amount: 100,
    plannedAcceptanceDate: '2025-09-30',
    status: 'planned',
    createdAt: '2025-04-01T00:00:00.000Z',
    updatedAt: '2025-04-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('calcBillingTotals', () => {
  it('配分合計・売上計上額（検収済以降）・入金済合計を算出する', () => {
    const totals = calcBillingTotals([
      makeMilestone({ amount: 100, status: 'planned' }),
      makeMilestone({ amount: 200, status: 'accepted' }),
      makeMilestone({ amount: 300, status: 'invoiced' }),
      makeMilestone({ amount: 400, status: 'paid' }),
    ])
    expect(totals.allocatedTotal).toBe(1000)
    // 検収基準: accepted/invoiced/paid が売上計上
    expect(totals.recognizedTotal).toBe(900)
    expect(totals.paidTotal).toBe(400)
  })

  // 反証: 予定（planned）を売上に含めると検収前に売上計上され粉飾になる
  it('反証: planned（未検収）は売上計上額に含めない', () => {
    const totals = calcBillingTotals([makeMilestone({ status: 'planned' })])
    expect(totals.recognizedTotal).toBe(0)
  })

  it('0件なら全て0を返す', () => {
    expect(calcBillingTotals([])).toEqual({
      allocatedTotal: 0,
      recognizedTotal: 0,
      paidTotal: 0,
    })
  })
})

describe('calcBillingAllocationGap', () => {
  it('配分合計と受注額の差を返す（正=配分超過、負=未配分）', () => {
    expect(calcBillingAllocationGap(1000, 1000)).toBe(0)
    expect(calcBillingAllocationGap(1000, 1200)).toBe(200)
    expect(calcBillingAllocationGap(1000, 700)).toBe(-300)
  })

  // 反証: 受注額が未設定の案件を「未配分」と警告すると誤報になる
  // （受注額が現場に降りてこないまま進む商習慣を踏まえ、判定不能とする）
  it('反証: 受注額が未設定（null/0）の場合はnullを返す', () => {
    expect(calcBillingAllocationGap(null, 500)).toBeNull()
    expect(calcBillingAllocationGap(undefined, 500)).toBeNull()
    expect(calcBillingAllocationGap(0, 500)).toBeNull()
  })
})

describe('calcOrderBacklog', () => {
  it('受注残（受注額−売上計上額）を返す', () => {
    expect(calcOrderBacklog(1000, 300)).toBe(700)
    expect(calcOrderBacklog(1000, 1000)).toBe(0)
  })

  it('受注額未設定の場合はnullを返す', () => {
    expect(calcOrderBacklog(null, 300)).toBeNull()
  })
})
