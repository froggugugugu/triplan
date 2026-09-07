import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { encryptSecret } from '../auth/crypto.js'
import { requireAdmin } from '../auth/rbac.js'
import { db } from '../db/client.js'
import { ssoProviderConfigs } from '../db/schema.js'

const PROVIDERS = ['azure_ad', 'google_workspace'] as const
type SsoProvider = (typeof PROVIDERS)[number]

const updateSsoProviderBodySchema = z.object({
  enabled: z.boolean(),
  clientId: z.string().nullable(),
  // 省略時は既存のclientSecretを保持する（毎回入力必須にしない、書き込み専用フィールド）
  clientSecret: z.string().min(1).optional(),
  tenantId: z.string().nullable().optional(),
  redirectUri: z.string().nullable(),
})

function toPublicConfig(
  provider: SsoProvider,
  row: typeof ssoProviderConfigs.$inferSelect | undefined,
) {
  return {
    provider,
    enabled: row?.enabled ?? false,
    clientId: row?.clientId ?? null,
    tenantId: row?.tenantId ?? null,
    redirectUri: row?.redirectUri ?? null,
    // clientSecretそのものはAPIレスポンスに一切含めない（書き込み専用）。
    // 設定済みかどうかだけをUIへ伝える
    hasSecret: Boolean(row?.clientSecretEncrypted),
    updatedAt: row?.updatedAt ?? null,
  }
}

/**
 * SSOプロバイダ（AzureAD/Google Workspace）の接続設定API。すべてadmin限定（§12.2と同じ方針）。
 * 実際のOIDC認可コードフロー（/authorize・/callback）は未実装（のスコープ、
 * 実テナントでのアプリ登録情報が無いと実機検証できないため）。設定の保存・参照のみを提供する。
 */
export default async function ssoProvidersRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/sso-providers',
    { preHandler: [fastify.authenticate, requireAdmin()] },
    async (_req, reply) => {
      const rows = await db.select().from(ssoProviderConfigs)
      const byProvider = new Map(rows.map((r) => [r.provider, r]))
      const providers = PROVIDERS.map((p) =>
        toPublicConfig(p, byProvider.get(p)),
      )
      return reply.send({ providers })
    },
  )

  fastify.put<{ Params: { provider: string } }>(
    '/api/sso-providers/:provider',
    { preHandler: [fastify.authenticate, requireAdmin()] },
    async (req, reply) => {
      const provider = req.params.provider
      if (!PROVIDERS.includes(provider as SsoProvider)) {
        return reply
          .code(400)
          .send({ error: `不明なプロバイダです: ${provider}` })
      }
      const parsed = updateSsoProviderBodySchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues })
      }
      const { enabled, clientId, clientSecret, tenantId, redirectUri } =
        parsed.data

      const [existing] = await db
        .select()
        .from(ssoProviderConfigs)
        .where(eq(ssoProviderConfigs.provider, provider as SsoProvider))
        .limit(1)

      const clientSecretEncrypted = clientSecret
        ? encryptSecret(clientSecret)
        : (existing?.clientSecretEncrypted ?? null)

      if (existing) {
        const [updated] = await db
          .update(ssoProviderConfigs)
          .set({
            enabled,
            clientId,
            clientSecretEncrypted,
            tenantId: tenantId ?? null,
            redirectUri,
            updatedAt: new Date(),
          })
          .where(eq(ssoProviderConfigs.id, existing.id))
          .returning()
        return reply.send({
          provider: toPublicConfig(provider as SsoProvider, updated),
        })
      }

      const [created] = await db
        .insert(ssoProviderConfigs)
        .values({
          provider: provider as SsoProvider,
          enabled,
          clientId,
          clientSecretEncrypted,
          tenantId: tenantId ?? null,
          redirectUri,
        })
        .returning()
      return reply.send({
        provider: toPublicConfig(provider as SsoProvider, created),
      })
    },
  )
}
