import type { FastifyInstance } from 'fastify'
import { CreateProjectBaselineSchema } from '@/shared/types'
import { requirePermission } from '../../auth/rbac.js'
import { projectBaselines } from '../../db/schema.js'
import { registerCrudRoutes } from '../crud-factory.js'

// 追記専用エンティティ（クライアント側は作成と参照のみ行う）。
// 汎用CRUDファクトリを流用するためPATCH/DELETEも生成されるが、
// skillEvaluations等と同じくクライアントからは呼び出さない運用とする
export default async function projectBaselineRoutes(fastify: FastifyInstance) {
  registerCrudRoutes(fastify, {
    // ベースラインはBAC・月次計画コスト（金額）を内包する
    readGuard: requirePermission('financials:read'),
    path: '/api/projectBaselines',
    table: projectBaselines,
    createSchema: CreateProjectBaselineSchema,
    updateSchema: CreateProjectBaselineSchema.partial(),
    // CreateProjectBaselineSchemaはidのみ除外＝createdAt（ISO文字列）を含むが、
    // created_at列はtimestamp（Drizzleの期待はDate）のため文字列のままINSERTすると
    // 「value.toISOString is not a function」で500になる。skillEvaluations等の他の
    // 追記専用エンティティはCreate*からcreatedAtを除外しておりこの問題が無い。
    // クライアント契約（LocalJsonAdapterはcreatedAt必須）を変えず、サーバー側で
    // Dateへ変換する（Phase 3 Phase Dのダイジェスト統合テストで発見した実バグ）
    beforeCreate: (data) => ({
      ...data,
      createdAt:
        typeof data.createdAt === 'string'
          ? new Date(data.createdAt)
          : data.createdAt,
    }),
  })
}
