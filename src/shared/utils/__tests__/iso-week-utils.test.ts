import { describe, expect, it } from 'vitest'
import {
  getIsoWeekKey,
  getIsoWeekMonday,
  getIsoWeekSunday,
  getIsoWeeksInRange,
  isValidDateOnly,
} from '@/shared/utils/iso-week-utils'

describe('getIsoWeekKey', () => {
  it('月曜始まりの通常週: 2024-01-01（月）は2024-W01', () => {
    expect(getIsoWeekKey(new Date(2024, 0, 1))).toBe('2024-W01')
  })

  it('反証: 日曜日は「その週の月曜日が属する年」のISO週になる（2023-01-01は日曜で前年の週）', () => {
    expect(getIsoWeekKey(new Date(2023, 0, 1))).toBe('2022-W52')
  })

  it('2023-01-02（月）は2023-W01', () => {
    expect(getIsoWeekKey(new Date(2023, 0, 2))).toBe('2023-W01')
  })

  it('反証: 53週年（2020年）の最終週は2020-W53になる', () => {
    expect(getIsoWeekKey(new Date(2020, 11, 31))).toBe('2020-W53')
  })

  it('反証: 53週年の翌年1/1（金）は前年の最終週に属する', () => {
    expect(getIsoWeekKey(new Date(2021, 0, 1))).toBe('2020-W53')
  })

  it('2021-01-04（月）は2021-W01', () => {
    expect(getIsoWeekKey(new Date(2021, 0, 4))).toBe('2021-W01')
  })

  it('反証: 月またぎでも週番号が正しく連続する（1/29〜2/4が同一週）', () => {
    // 2024-01-29(月)〜2024-02-04(日)は同一週のはず
    expect(getIsoWeekKey(new Date(2024, 0, 29))).toBe(
      getIsoWeekKey(new Date(2024, 1, 4)),
    )
  })

  it('反証: 年またぎの月曜（2024-12-30）は年内最終週として扱われる', () => {
    // 2024-12-30(月)〜2025-01-05(日)が同一週
    expect(getIsoWeekKey(new Date(2024, 11, 30))).toBe(
      getIsoWeekKey(new Date(2025, 0, 5)),
    )
  })
})

describe('getIsoWeekMonday / getIsoWeekSunday', () => {
  it('2024-W01の月曜日は2024-01-01', () => {
    const monday = getIsoWeekMonday('2024-W01')
    expect(monday.getFullYear()).toBe(2024)
    expect(monday.getMonth()).toBe(0)
    expect(monday.getDate()).toBe(1)
  })

  it('反証: 53週年の最終週（2020-W53）の月曜は年をまたいで2020-12-28になる', () => {
    const monday = getIsoWeekMonday('2020-W53')
    expect(monday.getFullYear()).toBe(2020)
    expect(monday.getMonth()).toBe(11)
    expect(monday.getDate()).toBe(28)
  })

  it('反証: 2020-W53の日曜は年をまたいで2021-01-03になる', () => {
    const sunday = getIsoWeekSunday('2020-W53')
    expect(sunday.getFullYear()).toBe(2021)
    expect(sunday.getMonth()).toBe(0)
    expect(sunday.getDate()).toBe(3)
  })

  it('往復性: 任意の日付から得たweekKeyのMonday〜Sundayが元の日付を含む', () => {
    const original = new Date(2025, 5, 18) // 2025-06-18
    const weekKey = getIsoWeekKey(original)
    const monday = getIsoWeekMonday(weekKey)
    const sunday = getIsoWeekSunday(weekKey)
    expect(monday.getTime()).toBeLessThanOrEqual(original.getTime())
    expect(sunday.getTime()).toBeGreaterThanOrEqual(original.getTime())
  })

  it('反証: 不正な週キー形式はエラーになる', () => {
    expect(() => getIsoWeekMonday('invalid')).toThrow()
    expect(() => getIsoWeekMonday('2024-13')).toThrow()
    expect(() => getIsoWeekMonday('2024-W54')).not.toThrow() // 形式は正しいので値の妥当性チェックはしない
  })
})

describe('getIsoWeeksInRange', () => {
  it('単日の範囲（月曜のみ）は1週分のみ返す', () => {
    expect(getIsoWeeksInRange('2024-01-01', '2024-01-01')).toEqual(['2024-W01'])
  })

  it('週の範囲がちょうど1週間（月〜日）なら1週分のみ返す', () => {
    expect(getIsoWeeksInRange('2024-01-01', '2024-01-07')).toEqual(['2024-W01'])
  })

  it('反証: 1日でも週をまたぐと2週分返す（1週+1日）', () => {
    expect(getIsoWeeksInRange('2024-01-01', '2024-01-08')).toEqual([
      '2024-W01',
      '2024-W02',
    ])
  })

  it('反証: 開始日が終了日より後（逆転範囲）の場合は空配列を返す（例外を投げない）', () => {
    expect(getIsoWeeksInRange('2024-02-01', '2024-01-01')).toEqual([])
  })

  it('反証: 年をまたぐ範囲でも週キーが正しく連続する', () => {
    expect(getIsoWeeksInRange('2020-12-28', '2021-01-04')).toEqual([
      '2020-W53',
      '2021-W01',
    ])
  })

  it('反証: 開始日・終了日が週の途中（火曜〜木曜等）でも該当する週をすべて含む', () => {
    // 2024-01-03(水)〜2024-01-17(水): W01, W02, W03の3週にまたがる
    expect(getIsoWeeksInRange('2024-01-03', '2024-01-17')).toEqual([
      '2024-W01',
      '2024-W02',
      '2024-W03',
    ])
  })
})

describe('isValidDateOnly', () => {
  it('実在する日付だけを受理する（うるう年の400年・100年ルール含む）', () => {
    for (const v of ['2026-01-31', '2026-04-30', '2024-02-29', '2000-02-29']) {
      expect(isValidDateOnly(v), v).toBe(true)
    }
  })

  it('反証: 月ごとの日数を超える日・平年の2/29を拒否する', () => {
    // 形式の正規表現だけでは通ってしまう値
    for (const v of [
      '2026-02-30',
      '2026-04-31',
      '2026-06-31',
      '2026-09-31',
      '2026-11-31',
      '2025-02-29',
      '1900-02-29',
    ]) {
      expect(isValidDateOnly(v), v).toBe(false)
    }
  })

  it('反証: 形式違反・範囲外を拒否する', () => {
    for (const v of ['2026-99-99', '2026-1-5', '2026/01/05', '', 'x']) {
      expect(isValidDateOnly(v), v).toBe(false)
    }
  })
})
