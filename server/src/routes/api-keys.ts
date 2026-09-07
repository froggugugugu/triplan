import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { generateApiKey, hashApiKey } from '../auth/api-key.js'
import { requirePermission } from '../auth/rbac.js'
import { db } from '../db/client.js'
import { type ApiKeyRow, apiKeys } from '../db/schema.js'

/**
 * APIキー管理（公開API v1）。すべて`users:manage`権限（admin限定）。
 * キー平文は発行レスポンスで一度だけ返し、以降はハッシュのみ保持（GETに平文は無い）
 */

const createKeyBodySchema = z.object({
  name: z.string().min(1).max(100),
})

function toPublicKey(row: ApiKeyRow) {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  }
}

export default async function apiKeysRoutes(fastify: FastifyInstance) {
  const guard = [fastify.authenticate, requirePermission('users:manage')]

  fastify.get('/api/apiKeys', { preHandler: guard }, async (_req, reply) => {
    const rows = await db.select().from(apiKeys).orderBy(apiKeys.createdAt)
    return reply.send({ apiKeys: rows.map(toPublicKey) })
  })

  fastify.post('/api/apiKeys', { preHandler: guard }, async (req, reply) => {
    const parsed = createKeyBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues })
    }
    const plainKey = generateApiKey()
    const [created] = await db
      .insert(apiKeys)
      .values({ name: parsed.data.name, keyHash: hashApiKey(plainKey) })
      .returning()
    if (!created) {
      return reply.code(500).send({ error: 'APIキーの発行に失敗しました' })
    }
    // 平文キーはこのレスポンスでのみ返す（再表示不可）
    return reply.code(201).send({ apiKey: toPublicKey(created), key: plainKey })
  })

  fastify.patch<{ Params: { id: string } }>(
    '/api/apiKeys/:id',
    { preHandler: guard },
    async (req, reply) => {
      const parsed = z
        .object({
          enabled: z.boolean().optional(),
          name: z.string().min(1).max(100).optional(),
        })
        .safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues })
      }
      const [updated] = await db
        .update(apiKeys)
        .set(parsed.data)
        .where(eq(apiKeys.id, req.params.id))
        .returning()
      if (!updated) {
        return reply.code(404).send({ error: '対象が見つかりません' })
      }
      return reply.send({ apiKey: toPublicKey(updated) })
    },
  )

  fastify.delete<{ Params: { id: string } }>(
    '/api/apiKeys/:id',
    { preHandler: guard },
    async (req, reply) => {
      const [deleted] = await db
        .delete(apiKeys)
        .where(eq(apiKeys.id, req.params.id))
        .returning()
      if (!deleted) {
        return reply.code(404).send({ error: '対象が見つかりません' })
      }
      return reply.code(204).send()
    },
  )
}
