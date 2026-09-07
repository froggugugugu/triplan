import { describe, expect, it } from 'vitest'
import { ESTIMATE_STAGES } from '@/shared/types/estimate-snapshot'
import {
  calcConeBounds,
  calcErrorRatio,
  ESTIMATE_STAGE_LABELS,
  formatConeWidth,
  getStageIndex,
  isWithinCone,
  UNCERTAINTY_CONE,
} from '@/shared/utils/uncertainty-cone'

describe('UNCERTAINTY_CONE', () => {
  it('6段階の幅が出典（Boehm/McConnell）の値になっている', () => {
    expect(UNCERTAINTY_CONE.initial_concept).toEqual({ low: 0.25, high: 4 })
    expect(UNCERTAINTY_CONE.product_definition).toEqual({ low: 0.5, high: 2 })
    expect(UNCERTAINTY_CONE.requirements_complete).toEqual({
      low: 0.67,
      high: 1.5,
    })
    expect(UNCERTAINTY_CONE.ui_design_complete).toEqual({
      low: 0.8,
      high: 1.25,
    })
    expect(UNCERTAINTY_CONE.detailed_design_complete).toEqual({
      low: 0.9,
      high: 1.1,
    })
  })

  it('完了は幅1x（実績そのもの）', () => {
    expect(UNCERTAINTY_CONE.completed).toEqual({ low: 1, high: 1 })
    expect(formatConeWidth('completed')).toBe('1x')
  })

  it('全段階にラベルと幅がある', () => {
    for (const stage of ESTIMATE_STAGES) {
      expect(ESTIMATE_STAGE_LABELS[stage]).toBeTruthy()
      expect(UNCERTAINTY_CONE[stage].low).toBeLessThanOrEqual(
        UNCERTAINTY_CONE[stage].high,
      )
    }
  })

  it('段階が進むほど幅が狭まる（単調）', () => {
    const widths = ESTIMATE_STAGES.map(
      (stage) => UNCERTAINTY_CONE[stage].high - UNCERTAINTY_CONE[stage].low,
    )
    widths.forEach((width, i) => {
      if (i === 0) return
      expect(width).toBeLessThanOrEqual(widths[i - 1] ?? Number.NaN)
    })
  })

  it('getStageIndexは定義順', () => {
    expect(getStageIndex('initial_concept')).toBe(0)
    expect(getStageIndex('completed')).toBe(5)
  })

  it('幅の表示は "low x〜high x"', () => {
    expect(formatConeWidth('requirements_complete')).toBe('0.67x〜1.5x')
  })
})

describe('calcConeBounds', () => {
  it('見積額に幅を掛けて整数の万円にする', () => {
    expect(calcConeBounds(1000, 'requirements_complete')).toEqual({
      low: 670,
      high: 1500,
    })
    expect(calcConeBounds(333, 'initial_concept')).toEqual({
      low: 83,
      high: 1332,
    })
  })

  it('見積0なら0〜0', () => {
    expect(calcConeBounds(0, 'initial_concept')).toEqual({ low: 0, high: 0 })
  })
})

describe('calcErrorRatio', () => {
  it('実績÷見積を返す', () => {
    expect(calcErrorRatio(1200, 1000)).toBeCloseTo(1.2)
  })

  it('反証: 見積が0以下なら判定不能（null）＝ゼロ除算しない', () => {
    expect(calcErrorRatio(1000, 0)).toBeNull()
    expect(calcErrorRatio(1000, -5)).toBeNull()
  })

  it('実績0は誤差比0（判定不能ではない）', () => {
    expect(calcErrorRatio(0, 1000)).toBe(0)
  })
})

describe('isWithinCone', () => {
  it('幅の内側はtrue、外側はfalse', () => {
    expect(isWithinCone(1.0, 'requirements_complete')).toBe(true)
    expect(isWithinCone(1.6, 'requirements_complete')).toBe(false)
    expect(isWithinCone(0.6, 'requirements_complete')).toBe(false)
  })

  it('反証: 境界（下限・上限ちょうど）は内側', () => {
    expect(isWithinCone(0.67, 'requirements_complete')).toBe(true)
    expect(isWithinCone(1.5, 'requirements_complete')).toBe(true)
    expect(isWithinCone(0.25, 'initial_concept')).toBe(true)
    expect(isWithinCone(4, 'initial_concept')).toBe(true)
  })

  it('反証: 計算で作った境界値（670/1000）を丸め誤差で外側と誤判定しない', () => {
    expect(isWithinCone(670 / 1000, 'requirements_complete')).toBe(true)
    expect(isWithinCone(3 * 0.1 + 0.37, 'requirements_complete')).toBe(true)
  })

  it('完了段階は1.0ちょうどだけが内側', () => {
    expect(isWithinCone(1, 'completed')).toBe(true)
    expect(isWithinCone(1.01, 'completed')).toBe(false)
  })
})
