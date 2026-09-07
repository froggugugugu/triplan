import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { db } from '../db/client.js'
import { apiKeys } from '../db/schema.js'

/**
 * 公開API v1のAPIキー認証。
 * - キー形式: `rpk_`＋32バイトのランダム16進（発行時に一度だけ平文を返す）
 * - 保存はSHA-256ハッシュのみ（漏えい時にキー本体が復元できない）
 * - 送り方: `X-Api-Key: rpk_...` ヘッダ（`Authorization: Bearer rpk_...`も受理）
 * - スコープは現状read-onlyのみ（v1エンドポイントは全て読み取り）
 */

export function generateApiKey(): string {
  return `rpk_${randomBytes(32).toString('hex')}`
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

function extractApiKey(req: FastifyRequest): string | null {
  const headerKey = req.headers['x-api-key']
  if (typeof headerKey === 'string' && headerKey.startsWith('rpk_')) {
    return headerKey
  }
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer rpk_')) {
    return auth.slice('Bearer '.length)
  }
  return null
}

/**
 * v1ルートのpreHandler。無効・不明・未指定のキーは401。
 * lastUsedAtの更新はfire-and-forget（レスポンスを待たせない・失敗しても認証は成立）
 */
export async function requireApiKey(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const key = extractApiKey(req)
  if (!key) {
    reply
      .code(401)
      .send({ error: 'APIキーが必要です（X-Api-Keyヘッダで指定してください）' })
    return
  }
  const [record] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashApiKey(key)))
    .limit(1)
  if (!record || !record.enabled) {
    reply.code(401).send({ error: 'APIキーが無効です' })
    return
  }
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, record.id))
    .catch(() => {})
}
