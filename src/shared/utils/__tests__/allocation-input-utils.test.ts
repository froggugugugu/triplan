import { describe, expect, it } from 'vitest'
import { parseAllocationInput } from '@/shared/utils/allocation-input-utils'

describe('parseAllocationInput', () => {
  it('通常の数値をパースする', () => {
    expect(parseAllocationInput('0.5')).toBe(0.5)
    expect(parseAllocationInput('1')).toBe(1)
    expect(parseAllocationInput('0')).toBe(0)
  })

  it('全角数字・全角ピリオドを半角に変換してパースする', () => {
    expect(parseAllocationInput('０．５')).toBe(0.5)
    expect(parseAllocationInput('１')).toBe(1)
  })

  it('空文字・空白のみは0を返す（既存挙動の維持）', () => {
    expect(parseAllocationInput('')).toBe(0)
    expect(parseAllocationInput('  ')).toBe(0)
  })

  it('数値以外・負値はnullを返す', () => {
    expect(parseAllocationInput('abc')).toBeNull()
    expect(parseAllocationInput('-0.5')).toBeNull()
    expect(parseAllocationInput('1.2.3')).toBeNull()
  })

  it('0.01刻みに丸める', () => {
    expect(parseAllocationInput('0.123')).toBe(0.12)
    expect(parseAllocationInput('0.567')).toBe(0.57)
  })

  describe('上限オプション', () => {
    it('反証: maxを指定しない場合は1を超える値も受け付ける（実績は上限でブロックしない）', () => {
      expect(parseAllocationInput('1.2')).toBe(1.2)
      expect(parseAllocationInput('2.5')).toBe(2.5)
    })

    it('max=1を指定すると1を超える値はnull（計画値の既存挙動）', () => {
      expect(parseAllocationInput('1.01', { max: 1 })).toBeNull()
      expect(parseAllocationInput('2', { max: 1 })).toBeNull()
    })

    it('max境界値: 丸め後がちょうどmaxなら受け付ける', () => {
      expect(parseAllocationInput('1', { max: 1 })).toBe(1)
      // 丸めでmax以下に収まる場合も受け付ける（1.001 → 1.00）
      expect(parseAllocationInput('1.001', { max: 1 })).toBe(1)
    })
  })
})
