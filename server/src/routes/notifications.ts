import { desc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { encryptSecret } from '../auth/crypto.js'
import { requirePermission } from '../auth/rbac.js'
import { db } from '../db/client.js'
import {
  type NotificationChannelRow,
  notificationChannels,
  notificationLogs,
} from '../db/schema.js'
import { sendDailyDigest } from '../notifications/digest.js'
import { sendToChannel } from '../notifications/sender.js'

/**
 * 通知チャンネル管理API（Phase 3 Phase B、非公開の設計文書）。
 * サーバー専用エンティティのためcrud-factory/EntityMapには載せず、専用ルートとする
 * （usersルートと同じ整理）。すべて`users:manage`権限（admin限定）。
 *
 * - Webhook URL・APIトークンは書き込み専用: 保存時にAES-256-GCM暗号化し、
 *   GETでは「設定済みか」のbooleanのみ返す（平文・暗号文とも返さない）
 * - PATCHはフィールド単位: webhookUrl/apiTokenは「undefined=変更なし、null=クリア、
 *   文字列=再設定」の3値セマンティクス
 */

const providerSchema = z.enum([
  'slack',
  'teams',
  'google_chat',
  'discord',
  'chatwork',
  'generic',
])
const severitySchema = z.enum(['critical', 'warning', 'info'])

const createChannelBodySchema = z.object({
  name: z.string().min(1).max(100),
  provider: providerSchema,
  webhookUrl: z.string().url().max(2000).nullish(),
  apiToken: z.string().min(1).max(500).nullish(),
  roomId: z.string().max(100).nullish(),
  enabled: z.boolean().optional(),
  minSeverity: severitySchema.optional(),
  notifyEvents: z.boolean().optional(),
  notifyDigest: z.boolean().optional(),
})

const updateChannelBodySchema = createChannelBodySchema.partial()

/** シークレットを一切含まない公開形。UIにはこの形しか渡さない */
function toPublicChannel(row: NotificationChannelRow) {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    roomId: row.roomId,
    enabled: row.enabled,
    minSeverity: row.minSeverity,
    notifyEvents: row.notifyEvents,
    notifyDigest: row.notifyDigest,
    webhookUrlConfigured: Boolean(row.webhookUrlEncrypted),
    apiTokenConfigured: Boolean(row.apiTokenEncrypted),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export default async function notificationsRoutes(fastify: FastifyInstance) {
  const guard = [fastify.authenticate, requirePermission('users:manage')]

  fastify.get(
    '/api/notificationChannels',
    { preHandler: guard },
    async (_req, reply) => {
      const rows = await db
        .select()
        .from(notificationChannels)
        .orderBy(notificationChannels.createdAt)
      return reply.send({ channels: rows.map(toPublicChannel) })
    },
  )

  fastify.post(
    '/api/notificationChannels',
    { preHandler: guard },
    async (req, reply) => {
      const parsed = createChannelBodySchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues })
      }
      const { webhookUrl, apiToken, ...rest } = parsed.data
      const [created] = await db
        .insert(notificationChannels)
        .values({
          ...rest,
          roomId: rest.roomId ?? null,
          webhookUrlEncrypted: webhookUrl ? encryptSecret(webhookUrl) : null,
          apiTokenEncrypted: apiToken ? encryptSecret(apiToken) : null,
        })
        .returning()
      if (!created) {
        return reply.code(500).send({ error: 'チャンネル作成に失敗しました' })
      }
      return reply.code(201).send({ channel: toPublicChannel(created) })
    },
  )

  fastify.patch<{ Params: { id: string } }>(
    '/api/notificationChannels/:id',
    { preHandler: guard },
    async (req, reply) => {
      const parsed = updateChannelBodySchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues })
      }
      const { webhookUrl, apiToken, ...rest } = parsed.data
      const setValues: Record<string, unknown> = {
        ...rest,
        updatedAt: new Date(),
      }
      // undefined=変更なし／null=クリア／文字列=再暗号化して差し替え
      if (webhookUrl !== undefined) {
        setValues.webhookUrlEncrypted = webhookUrl
          ? encryptSecret(webhookUrl)
          : null
      }
      if (apiToken !== undefined) {
        setValues.apiTokenEncrypted = apiToken ? encryptSecret(apiToken) : null
      }
      const [updated] = await db
        .update(notificationChannels)
        .set(setValues)
        .where(eq(notificationChannels.id, req.params.id))
        .returning()
      if (!updated) {
        return reply.code(404).send({ error: '対象が見つかりません' })
      }
      return reply.send({ channel: toPublicChannel(updated) })
    },
  )

  fastify.delete<{ Params: { id: string } }>(
    '/api/notificationChannels/:id',
    { preHandler: guard },
    async (req, reply) => {
      const [deleted] = await db
        .delete(notificationChannels)
        .where(eq(notificationChannels.id, req.params.id))
        .returning()
      if (!deleted) {
        return reply.code(404).send({ error: '対象が見つかりません' })
      }
      return reply.code(204).send()
    },
  )

  // テスト送信。enabled=falseのチャンネルでも送れる（有効化前の接続確認のため）。
  // 結果は同期で返しつつkind='test'としてログにも残す
  fastify.post<{ Params: { id: string } }>(
    '/api/notificationChannels/:id/test',
    { preHandler: guard },
    async (req, reply) => {
      const [channel] = await db
        .select()
        .from(notificationChannels)
        .where(eq(notificationChannels.id, req.params.id))
        .limit(1)
      if (!channel) {
        return reply.code(404).send({ error: '対象が見つかりません' })
      }
      const result = await sendToChannel(channel, {
        title: 'テスト送信',
        severity: 'info',
        lines: [`チャンネル「${channel.name}」の接続確認です`],
      })
      await db.insert(notificationLogs).values({
        sentAt: new Date().toISOString(),
        channelId: channel.id,
        kind: 'test',
        subject: 'テスト送信',
        ok: result.ok,
        detail: result.detail,
      })
      return reply.send(result)
    },
  )

  // ダイジェストの手動送信（Phase C）。管理者の明示操作のため同日再送防止はバイパスする。
  // スケジューラ（NOTIFY_DIGEST_TIME）とは独立にいつでも実行できる
  fastify.post(
    '/api/notifications/digest/send',
    { preHandler: guard },
    async (_req, reply) => {
      const result = await sendDailyDigest({ force: true })
      return reply.send(result)
    },
  )

  fastify.get<{ Querystring: { limit?: string } }>(
    '/api/notificationLogs',
    { preHandler: guard },
    async (req, reply) => {
      const rawLimit = Number(req.query.limit ?? 50)
      const limit = Number.isInteger(rawLimit)
        ? Math.min(Math.max(rawLimit, 1), 200)
        : 50
      const rows = await db
        .select({
          id: notificationLogs.id,
          sentAt: notificationLogs.sentAt,
          channelId: notificationLogs.channelId,
          channelName: notificationChannels.name,
          kind: notificationLogs.kind,
          subject: notificationLogs.subject,
          ok: notificationLogs.ok,
          detail: notificationLogs.detail,
        })
        .from(notificationLogs)
        .leftJoin(
          notificationChannels,
          eq(notificationLogs.channelId, notificationChannels.id),
        )
        .orderBy(desc(notificationLogs.sentAt))
        .limit(limit)
      return reply.send({ logs: rows })
    },
  )
}
