import { describe, expect, it } from 'vitest'
import { CSV_BOM, parseCsv } from '../csv-utils'
import {
  buildHeaderIndex,
  buildTemplateCsv,
  COLUMN_SPECS,
  detectMonthColumns,
  normalizeHeader,
  parseOptionalNumber,
} from '../master-import-core'

/**
 * マスタCSV取込の列定義とヘッダ解決。
 * テンプレートと取込の実装がずれると「配ったテンプレートが通らない」ことになるため、
 * **テンプレートのヘッダがそのまま解決できる**ことをここで固定する。
 */

describe('normalizeHeader', () => {
  it('前後の空白（全角含む）を落とす', () => {
    expect(normalizeHeader('  氏名 ')).toBe('氏名')
    expect(normalizeHeader('　氏名　')).toBe('氏名')
  })

  it('反証: 必須マークの*を落とす（テンプレートをそのまま取り込めないと意味がない）', () => {
    expect(normalizeHeader('氏名*')).toBe('氏名')
    expect(normalizeHeader('氏名＊')).toBe('氏名')
  })

  it('全角英数を半角にする（Excelの自動変換に耐える）', () => {
    expect(normalizeHeader('２０２６－０４')).toBe('2026-04')
  })
})

describe('buildHeaderIndex', () => {
  it('列の並びが違っても列名で引ける', () => {
    const index = buildHeaderIndex(['メール', '氏名'])
    expect(index.get('氏名')).toBe(1)
    expect(index.get('メール')).toBe(0)
  })

  it('反証: 同じ列名が2つあっても先勝ちで壊れない', () => {
    const index = buildHeaderIndex(['氏名', '氏名'])
    expect(index.get('氏名')).toBe(0)
  })

  it('空の列名は無視する（末尾のカンマで空列ができても拾わない）', () => {
    const index = buildHeaderIndex(['氏名', '', '  '])
    expect(index.size).toBe(1)
  })
})

describe('detectMonthColumns', () => {
  it('YYYY-MM形式の列だけを月として拾い、昇順で返す', () => {
    const found = detectMonthColumns([
      'タスクコード',
      '2026-05',
      '担当者',
      '2026-04',
    ])
    expect(found).toEqual([
      { month: '2026-04', index: 3 },
      { month: '2026-05', index: 1 },
    ])
  })

  it('反証: 月として成立しない値は拾わない', () => {
    expect(
      detectMonthColumns(['2026-13', '2026-00', '2026-4', '26-04', '備考']),
    ).toEqual([])
  })

  it('反証: 同じ月が2列あっても1つに畳む（値が二重計上されない）', () => {
    expect(detectMonthColumns(['2026-04', '2026-04'])).toEqual([
      { month: '2026-04', index: 0 },
    ])
  })
})

describe('parseOptionalNumber', () => {
  it('空欄はnull', () => {
    expect(parseOptionalNumber('')).toBeNull()
    expect(parseOptionalNumber('   ')).toBeNull()
  })

  it('全角数字・桁区切りを受ける', () => {
    expect(parseOptionalNumber('０.５')).toBe(0.5)
    expect(parseOptionalNumber('1,000')).toBe(1000)
  })

  it('反証: 数値でない文字列はnull（0として扱わない）', () => {
    expect(parseOptionalNumber('abc')).toBeNull()
    expect(parseOptionalNumber('-')).toBeNull()
  })

  it('0は0として返す（欠損と区別する）', () => {
    expect(parseOptionalNumber('0')).toBe(0)
  })
})

describe('buildTemplateCsv', () => {
  it.each(['members', 'projects', 'assignments'] as const)(
    '%s: 必須列に*が付き、BOM付きで出力される',
    (kind) => {
      const csv = buildTemplateCsv(kind)
      expect(csv.startsWith(CSV_BOM)).toBe(true)

      const [header] = parseCsv(csv)
      const specs = COLUMN_SPECS[kind]
      for (const spec of specs) {
        expect(header).toContain(spec.required ? `${spec.key}*` : spec.key)
      }
    },
  )

  it('反証: テンプレートのヘッダは正規化すると列定義と完全に一致する（配ったものが通る）', () => {
    for (const kind of ['members', 'projects', 'assignments'] as const) {
      const [header] = parseCsv(buildTemplateCsv(kind))
      const normalized = (header ?? []).map(normalizeHeader)
      for (const spec of COLUMN_SPECS[kind]) {
        expect(normalized).toContain(spec.key)
      }
    }
  })

  it('アサインは月の列を付け足せる', () => {
    const [header] = parseCsv(
      buildTemplateCsv('assignments', {
        monthColumns: ['2026-04', '2026-05'],
      }),
    )
    expect(header).toContain('2026-04')
    expect(header).toContain('2026-05')
  })

  it('反証: 記入例の行を入れない（消し忘れるとサンプルがそのまま登録されるため）', () => {
    for (const kind of ['members', 'projects', 'assignments'] as const) {
      expect(parseCsv(buildTemplateCsv(kind))).toHaveLength(1)
    }
  })
})
