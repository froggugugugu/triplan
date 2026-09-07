import type { FastifyInstance } from 'fastify'
import { CreateDocumentTemplateSchema } from '@/shared/types'
import { documentTemplates } from '../../db/schema.js'
import { registerCrudRoutes } from '../crud-factory.js'

export default async function documentTemplatesRoutes(
  fastify: FastifyInstance,
) {
  // ドキュメントテンプレート。金額情報を含まないためreadGuardは不要
  // （data:read＝全ロールで閲覧可。書き込みは既定のdata:writeガード）
  registerCrudRoutes(fastify, {
    path: '/api/documentTemplates',
    table: documentTemplates,
    createSchema: CreateDocumentTemplateSchema,
    updateSchema: CreateDocumentTemplateSchema.partial(),
    // sourceRefsはクライアントZod側で`.optional()`のみ（`.nullable()`を伴わない）のため
    // DBのNULLをundefinedへ変換する（既知のパターン、docs/development-patterns.md参照）
    normalizeRow: (row) => ({
      ...row,
      sourceRefs: row.sourceRefs ?? undefined,
    }),
  })
}
