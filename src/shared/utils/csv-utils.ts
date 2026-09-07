/**
 * CSV生成ユーティリティ（非公開の設計文書 レポート出力基盤）。
 *
 * 文字コードは**UTF-8 BOM付き**を既定とする。日本の実務では出力先がほぼExcelであり、
 * BOMが無いとExcelがShift_JISとして誤解釈し文字化けする（Excel 2016以降はBOM付きUTF-8を
 * 正しく開けるため、Shift_JISとの二重管理はしない）。
 */

/** ExcelにUTF-8と認識させるためのBOM。ダウンロード時にファイル先頭へ付与する */
export const CSV_BOM = '\ufeff'

/**
 * 1フィールドをCSV用にエスケープする。カンマ・ダブルクォート・改行を含む場合は
 * ダブルクォートで囲み、内部のダブルクォートは2連にする（RFC 4180準拠）。
 * null/undefinedは空文字にする。
 */
export function escapeCsvField(
  value: string | number | null | undefined,
): string {
  if (value == null) return ''
  const str = String(value)
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * 2次元配列をCSV文字列へ変換する（改行はCRLF、末尾に改行1つ。RFC 4180準拠）。
 * BOMは含めない（ダウンロード時に`CSV_BOM`を先頭へ連結する）。
 */
export function toCsvContent(
  rows: (string | number | null | undefined)[][],
): string {
  return `${rows.map((row) => row.map(escapeCsvField).join(',')).join('\r\n')}\r\n`
}

/**
 * CSV文字列を2次元配列へパースする（RFC 4180準拠、P1-a CSV取込）。
 * - 先頭のBOM（U+FEFF）は除去する（Excel出力のUTF-8 BOM付きを受け付ける）
 * - クォート内のカンマ・改行・2連ダブルクォート（`""`→`"`）を正しく扱う
 * - 改行はCRLF/LF/CR混在を許容
 * - 末尾の空行（最終改行の後）は行として数えない。それ以外の完全な空行はスキップする
 *   （Excelが末尾に空行を残すケースへの防御。列数の検証は呼び出し側の責務）
 */
export function parseCsv(content: string): string[][] {
  const text = content.startsWith(CSV_BOM) ? content.slice(1) : content
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    // 完全な空行（1フィールドのみ・空文字）は行として数えない
    if (!(row.length === 1 && row[0] === '')) {
      rows.push(row)
    }
    row = []
  }

  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"' && field === '') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      pushField()
      i++
      continue
    }
    if (ch === '\r' || ch === '\n') {
      pushRow()
      // CRLFは1つの改行として扱う
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1
      continue
    }
    field += ch
    i++
  }
  // 最終行（末尾に改行が無い場合）
  if (field !== '' || row.length > 0) {
    pushRow()
  }
  return rows
}
