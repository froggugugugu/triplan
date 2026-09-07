import type { BillingMilestone } from '@/shared/types/billing-milestone'
import type {
  CsvMappingColumn,
  CsvMappingProfile,
} from '@/shared/types/csv-mapping'
import type { Project } from '@/shared/types/project'
import { toCsvContent } from '@/shared/utils/csv-utils'

/**
 * 汎用CSVマッピング基盤の変換コア（非公開の設計文書）。
 * すべて純関数。データソースは「フィールドカタログ＋行データ（Record）」を提供し、
 * マッピングプロファイル（列の選択・並び・改名）を適用してCSVへ変換する。
 */

/** データソースが提供する1フィールドの定義 */
export interface CsvExportField {
  /** 行データRecordのキー */
  key: string
  /** 既定のヘッダ名（日本語。プロファイルで外部システム側の列名へ改名できる） */
  label: string
}

/** 行データ。値はセル出力可能なプリミティブ（null/undefined=空欄） */
export type CsvExportRow = Record<string, string | number | null | undefined>

/**
 * フィールドカタログから既定のマッピング列（全列有効・カタログ順・ラベル=ヘッダ）を作る。
 * 新規プロファイルの初期値、およびプロファイル未選択時の既定出力に使う
 */
export function buildDefaultColumns(
  fields: CsvExportField[],
): CsvMappingColumn[] {
  return fields.map((field, index) => ({
    field: field.key,
    header: field.label,
    enabled: true,
    order: index,
  }))
}

/**
 * マッピングを適用して出力テーブル（ヘッダ行＋データ行）を作る。
 * - enabledな列だけをorder昇順（同順位は定義順）で出力する
 * - 行データに存在しないfieldは空欄（プロファイルとソースの版ずれ=弱参照。エラーにしない）
 * - null/undefinedは空欄、数値はそのまま文字列化（丸め・書式変更はデータソース側の責務）
 */
export function applyMappingProfile(
  rows: CsvExportRow[],
  profile: Pick<CsvMappingProfile, 'columns' | 'includeHeader'>,
): (string | number)[][] {
  const activeColumns = profile.columns
    .filter((c) => c.enabled)
    .sort((a, b) => a.order - b.order)
  const table: (string | number)[][] = []
  if (profile.includeHeader) {
    table.push(activeColumns.map((c) => c.header))
  }
  for (const row of rows) {
    table.push(
      activeColumns.map((c) => {
        const value = row[c.field]
        return value ?? ''
      }),
    )
  }
  return table
}

/** マッピング適用済みテーブルをCSV文字列にする（BOMはダウンロード時に1回だけ付与する契約） */
export function buildMappedCsv(
  rows: CsvExportRow[],
  profile: Pick<CsvMappingProfile, 'columns' | 'includeHeader'>,
): string {
  return toCsvContent(applyMappingProfile(rows, profile))
}

// ============================================================================
// データソース定義
// ============================================================================

/** データソースのメタデータ（行データは各ソースのbuild関数が別途作る） */
export interface CsvSourceDefinition {
  key: string
  label: string
  fields: CsvExportField[]
}

const BILLING_STATUS_LABELS: Record<BillingMilestone['status'], string> = {
  planned: '予定',
  accepted: '検収済',
  invoiced: '請求済',
  paid: '入金済',
}

/**
 * 請求データソース（第1弾の新規ソース。請求マイルストン×案件）。
 * 請求書発行サービス・会計ソフトへの受け渡しを想定し、1マイルストン=1行で出力する。
 * 金額は万円のまま（通貨変換はしない。列名変更で先方レイアウトに合わせる用途）
 */
export const BILLING_SOURCE: CsvSourceDefinition = {
  key: 'billing',
  label: '請求データ（請求マイルストン）',
  fields: [
    { key: 'projectCode', label: 'プロジェクトコード' },
    { key: 'projectName', label: 'プロジェクト名' },
    { key: 'clientName', label: '発注元' },
    { key: 'label', label: 'マイルストン名' },
    { key: 'amount', label: '請求額（万円）' },
    { key: 'plannedAcceptanceDate', label: '検収予定日' },
    { key: 'status', label: 'ステータス' },
    { key: 'note', label: '備考' },
  ],
}

/**
 * 請求データソースの行データを構築する。検収予定日昇順→案件コード順。
 * `projectId`を指定すると該当案件のみに絞り込む（商流ダイアログからの特化用、Phase C）
 */
export function buildBillingRows(
  projects: Project[],
  milestones: BillingMilestone[],
  projectId?: string,
): CsvExportRow[] {
  const projectById = new Map(projects.map((p) => [p.id, p]))
  return (
    milestones
      .filter((m) => projectId === undefined || m.projectId === projectId)
      .map((m) => ({ milestone: m, project: projectById.get(m.projectId) }))
      // 案件が削除済みのマイルストンは出力しない（参照切れの行は外部システムでも使えない）
      .filter(
        (x): x is { milestone: BillingMilestone; project: Project } =>
          x.project !== undefined,
      )
      .sort(
        (a, b) =>
          a.milestone.plannedAcceptanceDate.localeCompare(
            b.milestone.plannedAcceptanceDate,
          ) || a.project.code.localeCompare(b.project.code),
      )
      .map(({ milestone, project }) => ({
        projectCode: project.code,
        projectName: project.name,
        clientName: project.clientName ?? '',
        label: milestone.label,
        amount: milestone.amount,
        plannedAcceptanceDate: milestone.plannedAcceptanceDate,
        status: BILLING_STATUS_LABELS[milestone.status],
        note: milestone.note ?? '',
      }))
  )
}
