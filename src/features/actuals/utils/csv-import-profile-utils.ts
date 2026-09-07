import type {
  CsvMappingColumn,
  CsvMappingProfile,
} from '@/shared/types/csv-mapping'
import type { CsvColumnMapping } from './csv-import-utils'
import { EFFORT_UNIT_LABELS, type EffortUnit } from './csv-import-utils'

/**
 * 実績CSV取込の列マッピングをプロファイルとして保存・適用するための変換（Phase C、
 *）。保存は「役割→**列名**」で行う（列の並びがファイルごとに変わっても
 * ヘッダ名で突合できる。列インデックスで保存すると並び替えただけで壊れる）。
 * - `field`=役割キー（member/project/period/value/task）
 * - `header`=CSVのヘッダ名（この名前で次回のファイルから列を探す）
 * - `enabled`=その役割を使うか（task列の「使用しない」を表現）
 */

export const ACTUALS_IMPORT_SOURCE_KEY = 'monthlyActualsImport'

const ROLE_KEYS = ['member', 'project', 'period', 'value', 'task'] as const
type RoleKey = (typeof ROLE_KEYS)[number]

const ROLE_FALLBACK_LABELS: Record<RoleKey, string> = {
  member: '担当者',
  project: 'プロジェクト',
  period: '期間',
  value: '工数値',
  task: 'タスク',
}

/** 現在のマッピング＋ヘッダ行から保存用のプロファイル列を作る */
export function mappingToProfileColumns(
  mapping: Partial<CsvColumnMapping>,
  headers: string[],
): CsvMappingColumn[] {
  return ROLE_KEYS.map((role, index) => {
    const columnIndex = mapping[role]
    const header = columnIndex !== undefined ? (headers[columnIndex] ?? '') : ''
    return {
      field: role,
      // headerはスキーマ上1文字以上必須のため、未割当・空ヘッダはフォールバックラベル
      header: header || ROLE_FALLBACK_LABELS[role],
      enabled: columnIndex !== undefined,
      order: index,
    }
  })
}

export interface AppliedImportProfile {
  mapping: Partial<CsvColumnMapping>
  /** プロファイルの列名が今回のファイルに見つからなかった役割（日本語ラベル） */
  missing: string[]
}

/**
 * プロファイルを現在のファイルのヘッダ行へ適用してマッピングを復元する。
 * 列名の完全一致で探す（同名列が複数ある場合は最初の列）。見つからない役割は
 * マッピングに含めず`missing`へ報告する（ユーザーが手動で選び直す）
 */
export function profileToMapping(
  profile: Pick<CsvMappingProfile, 'columns'>,
  headers: string[],
): AppliedImportProfile {
  const mapping: Partial<CsvColumnMapping> = {}
  const missing: string[] = []
  for (const column of profile.columns) {
    if (!column.enabled) continue
    const role = column.field as RoleKey
    if (!ROLE_KEYS.includes(role)) continue
    const index = headers.indexOf(column.header)
    if (index >= 0) {
      mapping[role] = index
    } else {
      missing.push(`${ROLE_FALLBACK_LABELS[role]}（${column.header}）`)
    }
  }
  return { mapping, missing }
}

/** プロファイルのoptionsから単位を復元する（不正値・未設定は人月へフォールバック） */
export function unitFromProfile(
  profile: Pick<CsvMappingProfile, 'options'>,
): EffortUnit {
  const unit = profile.options?.unit
  if (typeof unit === 'string' && unit in EFFORT_UNIT_LABELS) {
    return unit as EffortUnit
  }
  return 'manMonth'
}
