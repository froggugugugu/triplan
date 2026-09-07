import { describe, expect, it } from 'vitest'
import {
  getContrastRatio,
  getRelativeLuminance,
  pickReadableTextColor,
} from '../color-contrast'

describe('getRelativeLuminance', () => {
  it('白は1、黒は0', () => {
    expect(getRelativeLuminance('#ffffff')).toBeCloseTo(1, 5)
    expect(getRelativeLuminance('#000000')).toBeCloseTo(0, 5)
  })

  it('3桁の省略形も解釈する', () => {
    expect(getRelativeLuminance('#fff')).toBeCloseTo(1, 5)
  })

  it('#なしでも解釈する', () => {
    expect(getRelativeLuminance('ffffff')).toBeCloseTo(1, 5)
  })
})

describe('getContrastRatio', () => {
  it('白と黒は21:1（最大）', () => {
    expect(getContrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1)
  })

  it('同色は1:1（最小）', () => {
    expect(getContrastRatio('#3b82f6', '#3b82f6')).toBeCloseTo(1, 5)
  })

  it('順序を入れ替えても同じ比になる', () => {
    expect(getContrastRatio('#3b82f6', '#ffffff')).toBeCloseTo(
      getContrastRatio('#ffffff', '#3b82f6'),
      5,
    )
  })
})

describe('pickReadableTextColor', () => {
  it('暗い背景には白を選ぶ', () => {
    expect(pickReadableTextColor('#1e3a8a')).toBe('#ffffff')
    expect(pickReadableTextColor('#000000')).toBe('#ffffff')
  })

  it('明るい背景には黒を選ぶ', () => {
    expect(pickReadableTextColor('#fef08a')).toBe('#000000')
    expect(pickReadableTextColor('#ffffff')).toBe('#000000')
  })

  // ── 反証 ────────────────────────────────────────────────────────────────

  it('反証: どんな色でもWCAG AA（4.5:1）を下回らない', () => {
    // 白/黒の分岐点付近を含め、全色空間を粗く走査する。
    // 「白か黒の二択で必ずAAを満たせる」という設計の前提そのものを検証する
    const step = 17 // 0,17,...,255 の16段階
    let worst = { color: '', ratio: Number.POSITIVE_INFINITY }
    for (let r = 0; r <= 255; r += step) {
      for (let g = 0; g <= 255; g += step) {
        for (let b = 0; b <= 255; b += step) {
          const hex = `#${[r, g, b]
            .map((c) => c.toString(16).padStart(2, '0'))
            .join('')}`
          const ratio = getContrastRatio(hex, pickReadableTextColor(hex))
          if (ratio < worst.ratio) worst = { color: hex, ratio }
        }
      }
    }
    expect(
      worst.ratio,
      `最悪ケース ${worst.color} のコントラスト比が${worst.ratio.toFixed(2)}`,
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('反証: 明るい色に白を選ばない（従来の#fff固定で違反していたケース）', () => {
    // 実際にaxeがcolor-contrast違反を報告した水準の明るいタグ色
    for (const bright of ['#fbbf24', '#a3e635', '#67e8f9', '#f0abfc']) {
      expect(pickReadableTextColor(bright), bright).toBe('#000000')
      expect(getContrastRatio(bright, '#ffffff')).toBeLessThan(4.5)
    }
  })

  it('反証: 不正な色は白へフォールバックする（表示を壊さない）', () => {
    for (const invalid of ['', '#', '#12', 'rgb(0,0,0)', 'not-a-color']) {
      expect(pickReadableTextColor(invalid), invalid).toBe('#ffffff')
    }
  })
})
