import { z } from 'zod'

/**
 * WBSテンプレートのノード（工程/タスク）。子を持つ再帰構造。
 * `completionCriteria`（完了条件）を軸に、ノードごとの完了基準を明示する
 * （`Project.completionCriteria`と同じ役割。テンプレート適用時にそのまま転記する）。
 * `documentTemplateIds`はこのノードで作成するドキュメントのテンプレート
 * （`DocumentTemplate`）への紐づけ。紐づけはテンプレート側にのみ存在し、
 * `applyWbsTemplate`でのProject変換では転記しない（Projectはドキュメント概念を持たない）。
 */
export interface WbsTemplateNode {
  name: string
  completionCriteria?: string
  documentTemplateIds?: string[]
  children?: WbsTemplateNode[]
}

export const WbsTemplateNodeSchema: z.ZodType<WbsTemplateNode> = z.lazy(() =>
  z.object({
    name: z.string().min(1).max(200),
    completionCriteria: z.string().max(2000).optional(),
    documentTemplateIds: z.array(z.string().uuid()).optional(),
    children: z.array(WbsTemplateNodeSchema).optional(),
  }),
)

/**
 * WBSテンプレート。ユーザーがストックする複数のテンプレートの1件を表す。
 * `nodes`はWBS画面の「テンプレートを適用」機能（`applyWbsTemplate`）でそのまま
 * プロジェクト配下のタスクツリーへ変換される。
 */
export const WbsTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  nodes: z.array(WbsTemplateNodeSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type WbsTemplate = z.infer<typeof WbsTemplateSchema>

/**
 * テンプレート作成用スキーマ（IDと日時は自動生成）
 */
export const CreateWbsTemplateSchema = WbsTemplateSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type CreateWbsTemplate = z.infer<typeof CreateWbsTemplateSchema>

/**
 * テンプレート更新用スキーマ
 */
export const UpdateWbsTemplateSchema = WbsTemplateSchema.partial().required({
  id: true,
})
export type UpdateWbsTemplate = z.infer<typeof UpdateWbsTemplateSchema>
