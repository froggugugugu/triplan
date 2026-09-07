import { describe, expect, it } from 'vitest'
import {
  calcPaymentDueDate,
  formatPaymentTermsLabel,
} from '../payment-terms-utils'

describe('calcPaymentDueDate', () => {
  it('月末締め翌月末払い: 対象月の翌月末日になる', () => {
    expect(
      calcPaymentDueDate('2026-01', {
        closingDay: 31,
        paymentMonthOffset: 1,
        paymentDay: 31,
      }),
    ).toBe('2026-02-28')
  })

  it('反証: 31日指定は月の実日数へクランプされる（うるう年2月=29日）', () => {
    expect(
      calcPaymentDueDate('2028-01', {
        closingDay: 31,
        paymentMonthOffset: 1,
        paymentDay: 31,
      }),
    ).toBe('2028-02-29')
  })

  it('反証: 年跨ぎ（12月対象・翌月払い）は翌年1月になる', () => {
    expect(
      calcPaymentDueDate('2026-12', {
        closingDay: 20,
        paymentMonthOffset: 1,
        paymentDay: 10,
      }),
    ).toBe('2027-01-10')
  })

  it('当月払い・翌々月払いのオフセットが正しく効く', () => {
    const terms = { closingDay: 31, paymentMonthOffset: 0, paymentDay: 25 }
    expect(calcPaymentDueDate('2026-05', terms)).toBe('2026-05-25')
    expect(
      calcPaymentDueDate('2026-05', { ...terms, paymentMonthOffset: 2 }),
    ).toBe('2026-07-25')
  })
})

describe('formatPaymentTermsLabel', () => {
  it('月末・日付の表記を使い分ける', () => {
    expect(
      formatPaymentTermsLabel({
        closingDay: 31,
        paymentMonthOffset: 1,
        paymentDay: 31,
      }),
    ).toBe('月末締め 翌月末払い')
    expect(
      formatPaymentTermsLabel({
        closingDay: 20,
        paymentMonthOffset: 2,
        paymentDay: 10,
      }),
    ).toBe('20日締め 翌々月10日払い')
  })
})
