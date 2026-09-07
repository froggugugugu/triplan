import { describe, expect, it } from 'vitest'
import { DateOnlySchema } from '../date-only'

/**
 * 日付のみスキーマの暦検証。
 *
 * 従来は`z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`だったため、形式さえ合えば
 * `2026-99-99`のような値まで通っていた。画面は`<input type="date">`が守るが、
 * CSV取込・Webhook受信・公開APIは外部から任意の文字列が届く経路のため暦まで見る。
 */
describe('DateOnlySchema', () => {
  it('実在する日付を受理する', () => {
    for (const v of [
      '2026-01-01',
      '2026-12-31',
      '2026-01-31',
      '2026-04-30',
      '2024-02-29', // 4年ルールの閏年
      '2000-02-29', // 400年ルールの閏年
    ]) {
      expect(DateOnlySchema.safeParse(v).success, v).toBe(true)
    }
  })

  it('反証: 月ごとの日数を超える日付を拒否する', () => {
    for (const v of [
      '2026-02-30',
      '2026-02-31',
      '2026-04-31', // 4月は30日まで
      '2026-06-31',
      '2026-09-31',
      '2026-11-31',
    ]) {
      expect(DateOnlySchema.safeParse(v).success, v).toBe(false)
    }
  })

  it('反証: 平年の2月29日を拒否する（うるう年判定）', () => {
    expect(DateOnlySchema.safeParse('2025-02-29').success).toBe(false)
    expect(DateOnlySchema.safeParse('2026-02-29').success).toBe(false)
    // 100年ルール: 1900年は閏年ではない
    expect(DateOnlySchema.safeParse('1900-02-29').success).toBe(false)
  })

  it('反証: 範囲外の月日・形式違反を拒否する', () => {
    for (const v of [
      '2026-99-99',
      '2026-13-01',
      '2026-00-10',
      '2026-01-32',
      '2026-01-00',
      '2026-1-5', // ゼロ埋めなし
      '2026/01/05',
      '26-01-05',
      '2026-01-05T00:00:00Z',
      '',
    ]) {
      expect(DateOnlySchema.safeParse(v).success, v).toBe(false)
    }
  })
})
