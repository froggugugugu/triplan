import { describe, expect, it } from 'vitest'
import {
  parseNumericInput,
  stripLeadingZeros,
  toHalfWidthNumeral,
} from '@/shared/utils/numeric-input-utils'

describe('toHalfWidthNumeral', () => {
  it('全角数字を半角に変換する', () => {
    expect(toHalfWidthNumeral('０１２３４５６７８９')).toBe('0123456789')
  })

  it('全角ピリオドを半角ピリオドに変換する', () => {
    expect(toHalfWidthNumeral('１２．５')).toBe('12.5')
  })

  it('半角文字はそのまま維持する', () => {
    expect(toHalfWidthNumeral('123.45')).toBe('123.45')
  })

  it('全角と半角が混在していても変換する', () => {
    expect(toHalfWidthNumeral('1２3４')).toBe('1234')
  })

  it('空文字列はそのまま返す', () => {
    expect(toHalfWidthNumeral('')).toBe('')
  })
})

describe('stripLeadingZeros', () => {
  it('先頭のゼロを除去する（例: 05 -> 5）', () => {
    expect(stripLeadingZeros('05')).toBe('5')
  })

  it('複数の先頭ゼロを除去する（例: 007 -> 7）', () => {
    expect(stripLeadingZeros('007')).toBe('7')
  })

  it('全て0の場合は単一の0を残す（例: 00 -> 0）', () => {
    expect(stripLeadingZeros('00')).toBe('0')
  })

  it('単一の0はそのまま維持する', () => {
    expect(stripLeadingZeros('0')).toBe('0')
  })

  it('小数点前の0は除去しない（例: 0.5 -> 0.5）', () => {
    expect(stripLeadingZeros('0.5')).toBe('0.5')
  })

  it('先頭ゼロ+小数の場合は先頭ゼロのみ除去する（例: 007.5 -> 7.5）', () => {
    expect(stripLeadingZeros('007.5')).toBe('7.5')
  })

  it('先頭にゼロがない場合はそのまま返す', () => {
    expect(stripLeadingZeros('123')).toBe('123')
  })

  it('空文字列はそのまま返す', () => {
    expect(stripLeadingZeros('')).toBe('')
  })

  // 反証: 「小数点前の0は除去しない」というルールが、複数の先頭ゼロがある場合にも
  // 正しく適用されるか（末尾の1個だけ残るか）を検証する
  it('複数の先頭ゼロ+小数点の場合も単一の0が残る（例: 00.5 -> 0.5）', () => {
    expect(stripLeadingZeros('00.5')).toBe('0.5')
  })

  // 反証: 小数点の直後に何も入力されていない途中入力状態（例: "000." と入力中）でも
  // クラッシュせず、末尾の0が保持されるか
  it('小数点直後が未入力の途中状態でも単一の0を残す（例: 000. -> 0.）', () => {
    expect(stripLeadingZeros('000.')).toBe('0.')
  })

  // 反証: 4桁以上の連続ゼロでも正しく単一の0に収束するか
  it('4桁以上の連続ゼロでも単一の0に収束する（例: 0000 -> 0）', () => {
    expect(stripLeadingZeros('0000')).toBe('0')
  })
})

describe('parseNumericInput', () => {
  it('空文字列は0を返す', () => {
    expect(parseNumericInput('')).toBe(0)
    expect(parseNumericInput('  ')).toBe(0)
  })

  it('全角数字を半角変換してパースする', () => {
    expect(parseNumericInput('１２３')).toBe(123)
  })

  it('全角ピリオドを含む小数をパースする', () => {
    expect(parseNumericInput('１２．５')).toBe(12.5)
  })

  it('先頭ゼロを許容してパースする', () => {
    expect(parseNumericInput('05')).toBe(5)
  })

  it('無効な入力はnullを返す', () => {
    expect(parseNumericInput('abc')).toBeNull()
  })

  it('負の値はnullを返す', () => {
    expect(parseNumericInput('-1')).toBeNull()
  })

  // 反証: ピリオドが複数含まれる不正な小数表記を数値として誤って通してしまわないか
  it('ピリオドが複数含まれる不正な入力はnullを返す（例: 1.2.3）', () => {
    expect(parseNumericInput('1.2.3')).toBeNull()
  })

  // 反証: 全角変換後にtrimが正しく効き、前後の半角スペースが混入しても
  // パースエラーにならないか
  it('前後に半角スペースを含む全角数字も正しくパースする', () => {
    expect(parseNumericInput('  ５  ')).toBe(5)
  })

  // 反証: 数値として解釈できても符号なし想定の当アプリでは、
  // 明示的な "+" 付き入力を許容してよいかは未検証だった（Number("+5")はNaNにならない）
  it('先頭に+記号を含む入力は数値としてパースされる（Number()の仕様どおり）', () => {
    expect(parseNumericInput('+5')).toBe(5)
  })
})
