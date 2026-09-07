import { describe, expect, it } from 'vitest'
import type { FpItem } from '@/shared/types/estimate-snapshot'
import {
  buildFpEstimate,
  calcEstimateAmount,
  calcTotalFp,
  convertFpToEffortDays,
  FP_WEIGHTS,
  getCountableFpItemTypes,
  isFpItemTypeCountable,
  roundEffortDays,
} from '@/shared/utils/function-point-utils'

const basis = {
  estimatedUnitPrice: 100,
  coefficient: 1,
  workdaysPerMonth: 20,
  hoursPerDay: 8,
  hoursPerFunctionPoint: 10,
}

function item(type: FpItem['type'], count: number): FpItem {
  return { name: `${type}-${count}`, type, count }
}

describe('簡易FPの重み表', () => {
  it('概算法はILF×35・EIF×15だけを数える', () => {
    expect(FP_WEIGHTS.nesma_indicative).toEqual({ ILF: 35, EIF: 15 })
    expect(getCountableFpItemTypes('nesma_indicative')).toEqual(['ILF', 'EIF'])
    expect(isFpItemTypeCountable('nesma_indicative', 'EI')).toBe(false)
  })

  it('推定法はEI×4・EO×5・EQ×4・ILF×7・EIF×5の5種を数える', () => {
    expect(FP_WEIGHTS.nesma_estimated).toEqual({
      EI: 4,
      EO: 5,
      EQ: 4,
      ILF: 7,
      EIF: 5,
    })
    expect(getCountableFpItemTypes('nesma_estimated')).toEqual([
      'EI',
      'EO',
      'EQ',
      'ILF',
      'EIF',
    ])
  })
})

describe('calcTotalFp', () => {
  it('件数×重みを合計した整数を返す', () => {
    expect(
      calcTotalFp('nesma_estimated', [
        item('EI', 3),
        item('EO', 2),
        item('EQ', 1),
        item('ILF', 2),
        item('EIF', 1),
      ]),
    ).toBe(3 * 4 + 2 * 5 + 1 * 4 + 2 * 7 + 1 * 5)
    expect(
      calcTotalFp('nesma_indicative', [item('ILF', 2), item('EIF', 1)]),
    ).toBe(85)
  })

  it('項目が無ければ0', () => {
    expect(calcTotalFp('nesma_estimated', [])).toBe(0)
  })

  it('反証: 概算法でEI/EO/EQの行があっても数えない（保存時はZodが拒否する）', () => {
    expect(
      calcTotalFp('nesma_indicative', [item('EI', 10), item('ILF', 1)]),
    ).toBe(35)
  })

  it('同じ種別が複数行あっても件数ぶんだけ加算する', () => {
    expect(calcTotalFp('nesma_estimated', [item('EI', 1), item('EI', 2)])).toBe(
      12,
    )
  })
})

describe('convertFpToEffortDays', () => {
  it('FP × 人時/FP ÷ 時間/日 を人日にする', () => {
    expect(convertFpToEffortDays(100, 10, 8)).toBe(125)
  })

  it('小数2桁に四捨五入する', () => {
    expect(convertFpToEffortDays(7, 10, 8)).toBe(8.75)
    expect(convertFpToEffortDays(1, 10, 6)).toBe(1.67)
    expect(convertFpToEffortDays(1, 10, 7)).toBe(1.43)
  })

  it('反証: 時間/日が0以下ならNaN・Infinityではなく0', () => {
    expect(convertFpToEffortDays(100, 10, 0)).toBe(0)
    expect(convertFpToEffortDays(100, 10, -1)).toBe(0)
  })

  it('roundEffortDaysは2桁丸め', () => {
    expect(roundEffortDays(1.005)).toBe(1)
    expect(roundEffortDays(2.345)).toBe(2.35)
    expect(roundEffortDays(2.344)).toBe(2.34)
  })
})

describe('calcEstimateAmount', () => {
  it('人日÷人日/人月×概算単価×係数を整数の万円にする', () => {
    expect(calcEstimateAmount(125, basis)).toBe(625)
    expect(calcEstimateAmount(125, { ...basis, coefficient: 1.2 })).toBe(750)
  })

  it('整数に四捨五入する（WBS概算予算と同じ丸め）', () => {
    expect(calcEstimateAmount(125, { ...basis, estimatedUnitPrice: 101 })).toBe(
      631,
    )
  })

  it('反証: 人日/人月が0以下なら0', () => {
    expect(calcEstimateAmount(125, { ...basis, workdaysPerMonth: 0 })).toBe(0)
  })
})

describe('buildFpEstimate', () => {
  it('合計FP・人日・人月・万円をまとめて返す', () => {
    const result = buildFpEstimate(
      'nesma_indicative',
      [item('ILF', 2), item('EIF', 2)],
      basis,
    )
    expect(result.totalFp).toBe(100)
    expect(result.effortDays).toBe(125)
    expect(result.effortMonths).toBe(6.25)
    expect(result.amount).toBe(625)
  })

  it('人月は中間丸めせず人日から直接割る（表示側で2桁にする）', () => {
    const result = buildFpEstimate('nesma_estimated', [item('EI', 1)], basis)
    expect(result.effortDays).toBe(5)
    expect(result.effortMonths).toBe(0.25)
  })

  it('反証: 同じ入力なら常に同じ結果（設定値を凍結すれば履歴が動かない根拠）', () => {
    const items = [item('ILF', 3)]
    expect(buildFpEstimate('nesma_indicative', items, basis)).toEqual(
      buildFpEstimate('nesma_indicative', items, { ...basis }),
    )
  })
})
