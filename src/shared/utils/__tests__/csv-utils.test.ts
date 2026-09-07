import { describe, expect, it } from 'vitest'
import { CSV_BOM, escapeCsvField, parseCsv, toCsvContent } from '../csv-utils'

describe('escapeCsvField', () => {
  it('通常の文字列・数値はそのまま返す', () => {
    expect(escapeCsvField('プロジェクトA')).toBe('プロジェクトA')
    expect(escapeCsvField(1234.5)).toBe('1234.5')
    expect(escapeCsvField(0)).toBe('0')
  })

  it('null/undefinedは空文字にする', () => {
    expect(escapeCsvField(null)).toBe('')
    expect(escapeCsvField(undefined)).toBe('')
  })

  // 反証: カンマを含む値をエスケープしないと列がずれる
  it('反証: カンマを含む値はダブルクォートで囲む', () => {
    expect(escapeCsvField('開発,運用')).toBe('"開発,運用"')
  })

  // 反証: ダブルクォートを2連にしないとExcelで壊れる（RFC 4180）
  it('反証: ダブルクォートは2連へエスケープして囲む', () => {
    expect(escapeCsvField('案件"重要"')).toBe('"案件""重要"""')
  })

  it('改行を含む値はダブルクォートで囲む', () => {
    expect(escapeCsvField('1行目\n2行目')).toBe('"1行目\n2行目"')
  })
})

describe('toCsvContent', () => {
  it('行をCRLFで連結し末尾にも改行を付ける', () => {
    const csv = toCsvContent([
      ['コード', '名前'],
      ['P001', 'テスト'],
    ])
    expect(csv).toBe('コード,名前\r\nP001,テスト\r\n')
  })

  it('数値・null混在の行を正しく整形する', () => {
    expect(toCsvContent([['P001', 100, null]])).toBe('P001,100,\r\n')
  })

  // BOMは生成結果に含めない（ダウンロード時に先頭へ1回だけ付与する契約）
  it('反証: 生成結果にBOMは含まれない', () => {
    const csv = toCsvContent([['a']])
    expect(csv.startsWith(CSV_BOM)).toBe(false)
  })

  it('CSV_BOMはU+FEFFである', () => {
    expect(CSV_BOM).toBe('\ufeff')
    expect(CSV_BOM.charCodeAt(0)).toBe(0xfeff)
  })
})

describe('parseCsv（P1-a CSV取込）', () => {
  it('基本的なCSVを2次元配列へパースする', () => {
    expect(parseCsv('a,b,c\r\n1,2,3\r\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('先頭のBOMを除去する（Excel出力のUTF-8 BOM付きを受け付ける）', () => {
    expect(parseCsv(`${CSV_BOM}a,b\r\n1,2\r\n`)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('クォート内のカンマ・改行・2連ダブルクォートを正しく扱う（RFC 4180）', () => {
    expect(parseCsv('"a,x","b\r\ny","c""z"\r\n')).toEqual([
      ['a,x', 'b\r\ny', 'c"z'],
    ])
  })

  it('LF改行・CR改行・改行なし末尾行も受け付ける', () => {
    expect(parseCsv('a,b\n1,2\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
    expect(parseCsv('a,b\r1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('反証: 完全な空行は行として数えない（Excelの末尾空行への防御）', () => {
    expect(parseCsv('a,b\r\n\r\n1,2\r\n\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('反証: 空フィールドを含む行は空行ではない（",a"や"a,"を消さない）', () => {
    expect(parseCsv(',a\r\na,\r\n')).toEqual([
      ['', 'a'],
      ['a', ''],
    ])
  })

  it('toCsvContentとの往復でデータが保存される', () => {
    const rows = [
      ['名前', '説明'],
      ['テスト, 太郎', '改行\r\n入り"引用"'],
    ]
    expect(parseCsv(toCsvContent(rows))).toEqual(rows)
  })
})
