import { z } from 'zod'

/**
 * 汎用CSVマッピング基盤（非公開の設計文書）。
 * 「データソース（行の集合を作る純関数）× マッピングプロファイル（列の選択・並び・
 * 外部システム側の列名）→ CSV」の、プロファイル側の永続化スキーマ。
 * 請求書PDFではなく「外部システム（会計ソフト・請求書発行サービス等）が食べられる形に
 * 自在に変換して渡す」ためのユーザー定義レイアウト（餅は餅屋）。
 */

/** プロファイル内の1列の定義 */
export const CsvMappingColumnSchema = z.object({
  /** データソースのフィールドカタログ上のキー（CsvExportField.key） */
  field: z.string().min(1).max(100),
  /** 出力CSVのヘッダ名（外部システム側の列名に合わせて改名できる） */
  header: z.string().min(1).max(100),
  enabled: z.boolean(),
  /** 出力順（0起点。enabled列をorder昇順で出力する） */
  order: z.number().int().min(0),
})
export type CsvMappingColumn = z.infer<typeof CsvMappingColumnSchema>

export const CsvMappingProfileSchema = z.object({
  id: z.string().uuid(),
  /** 例: "○○会計ソフト向け仕訳"。用途が分かる名前をユーザーが付ける */
  name: z.string().min(1).max(100),
  /**
   * 対象データソースの識別子（'billing' | 'partnerPayment' | 'clientStatement' |
   * 'memberUtilization' | 'projectProfit' 等。ソースは今後追加されるためenumにしない。
   * 未知のsourceKeyを持つプロファイルはUI側が一覧から除外する=弱参照）
   */
  sourceKey: z.string().min(1).max(50),
  /**
   * 方向。第1弾はexportのみ実装（importプロファイル=取込ウィザードの列マッピング保存は
   * Phase Cで同じ器に載せる）
   */
  direction: z.enum(['export', 'import']),
  columns: z.array(CsvMappingColumnSchema),
  /** ヘッダ行を出力するか（会計ソフトによってはヘッダ無しを要求するため）。既定true */
  includeHeader: z.boolean(),
  /**
   * ソース固有の追加設定（例: 実績取込プロファイルの単位=unit）。
   * 汎用スキーマを汚さずソースごとの拡張を許すための逃し場（Phase C）
   */
  options: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type CsvMappingProfile = z.infer<typeof CsvMappingProfileSchema>

export const CreateCsvMappingProfileSchema = CsvMappingProfileSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type CreateCsvMappingProfile = z.infer<
  typeof CreateCsvMappingProfileSchema
>

export const UpdateCsvMappingProfileSchema =
  CreateCsvMappingProfileSchema.partial().extend({
    id: z.string().uuid(),
  })
export type UpdateCsvMappingProfile = z.infer<
  typeof UpdateCsvMappingProfileSchema
>
