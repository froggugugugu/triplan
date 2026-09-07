import { CSV_BOM, toCsvContent } from './csv-utils'

/**
 * マスタCSV一括登録の列定義とヘッダ解決。
 *
 * 現行CSVで管理しているデータの移行を1回で終わらせるための取込。
 * **列定義をここ1箇所の正本**にして、①テンプレートCSVの生成
 * ②取込時の列解決 ③画面の列一覧表示 の3つが同じ定義を見る
 * （テンプレートと実装がずれると「テンプレートどおり書いたのに通らない」が起きる）。
 */

export type MasterImportKind = 'members' | 'projects' | 'assignments'

export interface ColumnSpec {
  /** 正規化後の列名。CSVヘッダはこれに一致させる */
  key: string
  required: boolean
  description: string
  /** 画面の一覧表に出す記入例 */
  example: string
}

/**
 * ヘッダの表記ゆれを吸収する。
 * - 前後の空白（全角含む）を除去
 * - 必須マークの`*`/`＊`を除去（テンプレートは`氏名*`の形で必須を示すが、
 *   それをそのまま取り込めないと「配ったテンプレートが通らない」ことになる）
 * - 全角英数を半角へ（月列`２０２６－０４`のような入力を拾う）
 */
export function normalizeHeader(raw: string): string {
  return raw
    .replace(/[﻿]/g, '')
    .replace(/[*＊]+$/u, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/[－―‐]/g, '-')
    .trim()
    .replace(/^[\s　]+|[\s　]+$/gu, '')
}

/** ヘッダ行から「正規化した列名 → 列index」を作る。重複列は先勝ち */
export function buildHeaderIndex(headerRow: string[]): Map<string, number> {
  const index = new Map<string, number>()
  headerRow.forEach((raw, i) => {
    const key = normalizeHeader(raw)
    if (key && !index.has(key)) index.set(key, i)
  })
  return index
}

/** 月列（YYYY-MM）を検出する。アサインの横持ちCSVで使う */
export function detectMonthColumns(
  headerRow: string[],
): Array<{ month: string; index: number }> {
  const found: Array<{ month: string; index: number }> = []
  const seen = new Set<string>()
  headerRow.forEach((raw, i) => {
    const key = normalizeHeader(raw)
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) return
    if (seen.has(key)) return
    seen.add(key)
    found.push({ month: key, index: i })
  })
  return found.sort((a, b) => a.month.localeCompare(b.month))
}

export function cellAt(
  row: string[],
  index: Map<string, number>,
  key: string,
): string {
  const i = index.get(key)
  if (i === undefined) return ''
  return (row[i] ?? '').trim()
}

/** 空文字はnull。全角数字も受ける */
export function parseOptionalNumber(raw: string): number | null {
  if (!raw.trim()) return null
  const normalized = raw
    .replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/,/g, '')
    .trim()
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

export interface ImportSkip {
  /** CSV上の行番号（ヘッダ=1行目、データ行は2始まり） */
  row: number
  reason: string
}

// ---------------------------------------------------------------------------
// 列定義
// ---------------------------------------------------------------------------

const MEMBER_COLUMNS: ColumnSpec[] = [
  { key: '氏名', required: true, description: '担当者名', example: '山田太郎' },
  {
    key: 'メール',
    required: false,
    description: '通知・外部ツール連携のキー。既存メンバーとの突合にも使う',
    example: 'yamada@example.com',
  },
  {
    key: '部門',
    required: false,
    description: '課を指定する場合は必須（同名の課を区別するため）',
    example: '開発部',
  },
  {
    key: '課',
    required: false,
    description: '未登録なら自動作成できる',
    example: '第1課',
  },
  {
    key: '所属会社',
    required: false,
    description: '協力会社等。未登録なら自動作成できる。空欄＝自社',
    example: '株式会社ABC',
  },
  { key: '役割', required: false, description: '自由記述', example: 'PL' },
  {
    key: '契約形態',
    required: false,
    description: '請負／準委任／派遣／正社員',
    example: '準委任',
  },
  {
    key: '稼働率上限',
    required: false,
    description: '0より大きく1以下。時短・兼務の人に指定する。空欄＝1.0',
    example: '0.5',
  },
  {
    key: '開始日',
    required: false,
    description: 'YYYY-MM-DD',
    example: '2026-04-01',
  },
  {
    key: '終了日',
    required: false,
    description: 'YYYY-MM-DD。空欄＝在籍中',
    example: '2027-03-31',
  },
  {
    key: '単価',
    required: false,
    description: '月額（万円）。予算の見積もりに使う',
    example: '100',
  },
  {
    key: '契約単価',
    required: false,
    description: '月額（万円）。協力会社への支払に使う。所属会社の指定が要る',
    example: '80',
  },
  {
    key: '単価適用開始',
    required: false,
    description: 'YYYY-MM。空欄＝開始日の月、開始日も空欄なら当月',
    example: '2026-04',
  },
]

const PROJECT_COLUMNS: ColumnSpec[] = [
  {
    key: 'コード',
    required: true,
    description: '一意。既存と重複する行は取り込まない',
    example: 'P001-01',
  },
  {
    key: '名前',
    required: true,
    description: 'プロジェクト名・タスク名',
    example: '要件定義',
  },
  {
    key: '親コード',
    required: false,
    description:
      '空欄＝プロジェクト（最上位）。同じCSV内の行も親にできる（行の順序は問わない）',
    example: 'P001',
  },
  { key: '説明', required: false, description: '', example: '' },
  { key: '完了条件', required: false, description: '', example: '' },
  {
    key: 'ステータス',
    required: false,
    description: '未着手／進行中／完了。空欄＝未着手',
    example: '進行中',
  },
  {
    key: '確度',
    required: false,
    description: 'S／A／B／C。最上位のみ',
    example: 'A',
  },
  {
    key: '担当部門',
    required: false,
    description: '最上位のみ。未登録なら自動作成できる',
    example: '開発部',
  },
  {
    key: '発注元',
    required: false,
    description: '最上位のみ',
    example: '株式会社XYZ',
  },
  {
    key: '受注金額',
    required: false,
    description: '万円。最上位のみ',
    example: '3000',
  },
  {
    key: '優先度',
    required: false,
    description: '高／中／低。最上位のみ',
    example: '高',
  },
  {
    key: '契約形態',
    required: false,
    description: '請負／準委任／派遣／混在。最上位のみ',
    example: '請負',
  },
  {
    key: 'マスター納期',
    required: false,
    description: 'YYYY-MM-DD。最上位のみ',
    example: '2027-03-31',
  },
]

const ASSIGNMENT_COLUMNS: ColumnSpec[] = [
  {
    key: 'タスクコード',
    required: true,
    description: '配分先のタスク。プロジェクトのコードでも指定できる',
    example: 'P001-01',
  },
  {
    key: '担当者',
    required: true,
    description: '氏名またはメール。同名が複数いる場合はメールで指定する',
    example: '山田太郎',
  },
  {
    key: 'プロジェクトコード',
    required: false,
    description:
      '書かれていれば整合チェックに使う（タスクコードから導出できる）',
    example: 'P001',
  },
]

export const COLUMN_SPECS: Record<MasterImportKind, ColumnSpec[]> = {
  members: MEMBER_COLUMNS,
  projects: PROJECT_COLUMNS,
  assignments: ASSIGNMENT_COLUMNS,
}

export const KIND_LABELS: Record<MasterImportKind, string> = {
  members: 'チームメンバー',
  projects: 'プロジェクト・タスク',
  assignments: 'アサイン',
}

/**
 * 記入用テンプレートCSV（BOM付き）。
 * 必須列は`*`付きで出し、Excelで開いたときにも必須が分かるようにする
 * （`normalizeHeader`が`*`を落とすので、そのまま書き込んで取り込める）。
 * サンプル行は入れない——消し忘れるとサンプルがそのまま登録されるため。
 */
export function buildTemplateCsv(
  kind: MasterImportKind,
  options?: { monthColumns?: string[] },
): string {
  const headers = COLUMN_SPECS[kind].map((c) =>
    c.required ? `${c.key}*` : c.key,
  )
  if (kind === 'assignments') {
    headers.push(...(options?.monthColumns ?? []))
  }
  return CSV_BOM + toCsvContent([headers])
}

export function templateFileName(kind: MasterImportKind): string {
  const suffix: Record<MasterImportKind, string> = {
    members: 'members',
    projects: 'projects',
    assignments: 'assignments',
  }
  return `import-template_${suffix[kind]}.csv`
}
