import type { FastifyInstance } from 'fastify'
import { DatabaseSchema } from '@/shared/types'
import { requireAdmin } from '../auth/rbac.js'
import { exportDatabaseData } from '../db/export-database.js'
import { importDatabaseData } from '../db/import-database.js'

/**
 * DataAdapter.loadDatabase()/importDatabase()のpostgres実装（ARCH §5.1）。
 * 移行スクリプト（scripts/migrate-to-postgres.ts）やバックアップ復元等、
 * 「丸ごと」操作専用のエンドポイント。通常のストア操作（list/create/update/remove）
 * からは呼ばない契約になっている。importは全business-dataを置換する破壊的操作のため
 * admin限定とする（editorには許可しない、users API等より厳しい制約）。
 */
export default async function databaseRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/database/export',
    { preHandler: [fastify.authenticate, requireAdmin()] },
    async (_req, reply) => {
      const data = await exportDatabaseData()
      return reply.send(data)
    },
  )

  fastify.post(
    '/api/database/import',
    { preHandler: [fastify.authenticate, requireAdmin()] },
    async (req, reply) => {
      const parsed = DatabaseSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues })
      }
      await importDatabaseData(parsed.data)
      return reply.code(204).send()
    },
  )
}
