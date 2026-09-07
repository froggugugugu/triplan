import { z } from 'zod'

/**
 * ドキュメントテンプレート。
 * システム開発の各工程で作成するドキュメント（要件定義書・基本設計書等）の
 * マークダウン雛形を全社共通のストックとして管理する。
 *
 * 本文（content）はOKF準拠のマークダウン（先頭にYAML frontmatter、h1はタイトル1つのみ、
 * 以降h2から階層順）とする運用。詳細は
 * 非公開の設計文書 を参照。
 * スキーマ自体はマークダウンの構文を検証しない（自由編集を許容し、規約はプリセットと
 * 新規作成時の初期本文で担保する）。
 *
 * `WbsTemplateNode.documentTemplateIds`から参照される（WBSテンプレートへの紐づけ）。
 */
export const DocumentTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  // 対象工程の表示名（自由記述）。一覧のグルーピング・WBSテンプレート紐づけ時の絞り込みに使う。
  // null = 工程横断（どの工程にも属さない汎用テンプレート）
  phase: z.string().max(100).nullable(),
  description: z.string().max(2000).nullable(),
  // マークダウン本文。新規作成直後は空文字を許容する
  content: z.string().max(100000),
  // 出典（IPA資料名・URL等）。プリセットの根拠追跡用
  sourceRefs: z.array(z.string().max(500)).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type DocumentTemplate = z.infer<typeof DocumentTemplateSchema>

/**
 * 作成用スキーマ（IDと日時は自動生成）
 */
export const CreateDocumentTemplateSchema = DocumentTemplateSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type CreateDocumentTemplate = z.infer<
  typeof CreateDocumentTemplateSchema
>

/**
 * 更新用スキーマ
 */
export const UpdateDocumentTemplateSchema =
  DocumentTemplateSchema.partial().required({
    id: true,
  })
export type UpdateDocumentTemplate = z.infer<
  typeof UpdateDocumentTemplateSchema
>
