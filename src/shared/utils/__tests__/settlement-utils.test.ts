import { describe, expect, it } from 'vitest'
import {
  calcQuasiDelegationSettlement,
  getApplicableContractEntry,
  hasSettlementRange,
} from '../settlement-utils'

// 基準額80万円・精算幅140h〜180h・換算20人日×8h=160h/人月
const ENTRY = {
  amount: 80,
  settlementLowerHours: 140,
  settlementUpperHours: 180,
}

describe('calcQuasiDelegationSettlement', () => {
  it('幅内（140h≤実績≤180h）は固定額を支払う', () => {
    // 1.0人月 = 160h → 幅内
    const result = calcQuasiDelegationSettlement(ENTRY, 1.0, 20, 8)
    expect(result).toMatchObject({
      kind: 'within',
      actualHours: 160,
      payableAmount: 80,
    })
  })

  it('反証: 境界値（下限140hちょうど・上限180hちょうど）は幅内=固定額', () => {
    expect(calcQuasiDelegationSettlement(ENTRY, 140 / 160, 20, 8).kind).toBe(
      'within',
    )
    expect(calcQuasiDelegationSettlement(ENTRY, 180 / 160, 20, 8).kind).toBe(
      'within',
    )
  })

  it('下回り: 基準額÷下限×実績hで控除される', () => {
    // 0.5人月 = 80h < 140h → 80/140×80h = 45.71万円
    const result = calcQuasiDelegationSettlement(ENTRY, 0.5, 20, 8)
    expect(result.kind).toBe('deduction')
    expect(result.actualHours).toBe(80)
    expect(result.payableAmount).toBe(45.71)
  })

  it('超過: 基準額＋基準額÷上限×超過hで追加請求される', () => {
    // 1.25人月 = 200h > 180h → 80 + 80/180×20h = 88.89万円
    const result = calcQuasiDelegationSettlement(ENTRY, 1.25, 20, 8)
    expect(result.kind).toBe('overage')
    expect(result.actualHours).toBe(200)
    expect(result.payableAmount).toBe(88.89)
  })

  it('反証: 実績0は控除0円（固定額を払わない）', () => {
    const result = calcQuasiDelegationSettlement(ENTRY, 0, 20, 8)
    expect(result.kind).toBe('deduction')
    expect(result.payableAmount).toBe(0)
  })

  it('反証: 幅未設定は従来どおり 単価×実績人月（後方互換）', () => {
    const result = calcQuasiDelegationSettlement({ amount: 80 }, 0.5, 20, 8)
    expect(result.kind).toBe('fixed')
    expect(result.payableAmount).toBe(40)
  })

  it('反証: 片側のみ設定・上下逆転は防御的に固定扱い（精算計算しない）', () => {
    expect(
      calcQuasiDelegationSettlement(
        { amount: 80, settlementLowerHours: 140 },
        0.5,
        20,
        8,
      ).kind,
    ).toBe('fixed')
    expect(
      calcQuasiDelegationSettlement(
        { amount: 80, settlementLowerHours: 180, settlementUpperHours: 140 },
        0.5,
        20,
        8,
      ).kind,
    ).toBe('fixed')
  })

  it('換算はシステム設定値（workdaysPerMonth・hoursPerDay）を反映する', () => {
    // 21人日×7.5h = 157.5h/人月 → 1.0人月で幅内
    const result = calcQuasiDelegationSettlement(ENTRY, 1.0, 21, 7.5)
    expect(result.actualHours).toBe(157.5)
    expect(result.kind).toBe('within')
  })
})

describe('hasSettlementRange / getApplicableContractEntry', () => {
  it('上下限が揃って上限≥下限のときのみ有効', () => {
    expect(hasSettlementRange(ENTRY)).toBe(true)
    expect(hasSettlementRange({ amount: 80 } as never)).toBe(false)
    expect(
      hasSettlementRange({
        settlementLowerHours: 140,
        settlementUpperHours: 140,
      }),
    ).toBe(true)
  })

  it('対象月以下で最新のエントリを返す（単価改定と同時に幅も切り替わる）', () => {
    const history = [
      { effectiveFrom: '2026-01', amount: 80, settlementLowerHours: 140 },
      {
        effectiveFrom: '2026-04',
        amount: 90,
        settlementLowerHours: 150,
        settlementUpperHours: 190,
      },
    ]
    expect(getApplicableContractEntry(history, '2026-03')?.amount).toBe(80)
    expect(getApplicableContractEntry(history, '2026-04')?.amount).toBe(90)
    expect(getApplicableContractEntry(history, '2025-12')).toBeUndefined()
  })
})
