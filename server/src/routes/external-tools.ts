import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { encryptSecret } from '../auth/crypto.js'
import { requirePermission } from '../auth/rbac.js'
import { db } from '../db/client.js'
import {
  type ExternalToolConnectionRow,
  externalToolConnections,
} from '../db/schema.js'
import { fetchToolMetadata, testConnection } from '../external-tools/client.js'
import {
  EXTERNAL_TOOLS,
  type ExternalTool,
  parseTargetConfig,
  validateConnectionInput,
} from '../external-tools/config.js'

/**
 * 外部ツール接続管理API（API起票基盤 Phase 2、非公開の設計文書・
 *）。notificationsルートと同じ整理でサーバー専用（crud-factory/EntityMap非登録）、
 * すべて`users:manage`権限（admin限定）。
 *
 * - APIトークンは書き込み専用: 保存時にAES-256-GCM暗号化し、GETは「設定済みか」の
 *   booleanのみ返す（平文・暗号文とも返さない）
 * - PATCHはフィールド単位で「undefined=変更なし、null=クリア、文字列=再設定」の3値
 * - 設定は2段階フロー: ①認証情報を保存 → ②保存済みトークンでmetadataを引いて起票先を
 *   選択しPATCH。トークンを保存前に平文でmetadata APIへ渡す経路は作らない
 */

const toolSchema = z.enum(EXTERNAL_TOOLS)

const createBodySchema = z.object({
  tool: toolSchema,
  name: z.string().min(1).max(100),
  baseUrl: z.string().max(500).nullish(),
  authEmail: z.string().email().max(200).nullish(),
  apiToken: z.string().min(1).max(500).nullish(),
  targetConfig: z.unknown().nullish(),
  enabled: z.boolean().optional(),
})

/** toolは作成後に変更できない（起票先設定・認証方式ごと作り直すべきため） */
const updateBodySchema = createBodySchema.omit({ tool: true }).partial()

/** トークンを一切含まない公開形。UIにはこの形しか渡さない */
function toPublicConnection(row: ExternalToolConnectionRow) {
  return {
    id: row.id,
    tool: row.tool,
    name: row.name,
    baseUrl: row.baseUrl,
    authEmail: row.authEmail,
    targetConfig: row.targetConfig ?? null,
    enabled: row.enabled,
    apiTokenConfigured: Boolean(row.apiTokenEncrypted),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export default async function externalToolsRoutes(fastify: FastifyInstance) {
  /** 接続の作成・変更・削除・疎通確認・起票先の選択肢取得（管理操作） */
  const guard = [fastify.authenticate, requirePermission('users:manage')]
  /**
   * 一覧参照のみ`data:write`（editor以上）。起票実行（`POST /api/taskCreation/execute`）が
   * data:writeである以上、起票先を選べなければ機能が成立しないため揃える。
   * レスポンスはAPIトークンを含まない（`apiTokenConfigured`のフラグのみ）。
   * WBS画面の外部タスクリンクもこの一覧のbaseUrlを使う。
   */
  const readGuard = [fastify.authenticate, requirePermission('data:write')]

  fastify.get(
    '/api/externalToolConnections',
    { preHandler: readGuard },
    async (_req, reply) => {
      const rows = await db
        .select()
        .from(externalToolConnections)
        .orderBy(externalToolConnections.createdAt)
      return reply.send({ connections: rows.map(toPublicConnection) })
    },
  )

  fastify.post(
    '/api/externalToolConnections',
    { preHandler: guard },
    async (req, reply) => {
      const parsed = createBodySchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues })
      }
      const { tool, baseUrl, authEmail, apiToken, targetConfig, ...rest } =
        parsed.data

      const inputError = validateConnectionInput(tool, { baseUrl, authEmail })
      if (inputError) return reply.code(400).send({ error: inputError })

      let target: unknown = null
      try {
        target = parseTargetConfig(tool, targetConfig)
      } catch {
        return reply.code(400).send({ error: '起票先の設定が不正です' })
      }

      const [created] = await db
        .insert(externalToolConnections)
        .values({
          ...rest,
          tool,
          baseUrl: baseUrl?.trim() || null,
          authEmail: authEmail?.trim() || null,
          apiTokenEncrypted: apiToken ? encryptSecret(apiToken) : null,
          targetConfig: target,
        })
        .returning()
      if (!created) {
        return reply.code(500).send({ error: '接続の作成に失敗しました' })
      }
      return reply.code(201).send({ connection: toPublicConnection(created) })
    },
  )

  fastify.patch<{ Params: { id: string } }>(
    '/api/externalToolConnections/:id',
    { preHandler: guard },
    async (req, reply) => {
      const parsed = updateBodySchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues })
      }
      const [existing] = await db
        .select()
        .from(externalToolConnections)
        .where(eq(externalToolConnections.id, req.params.id))
      if (!existing) {
        return reply.code(404).send({ error: '対象が見つかりません' })
      }
      const tool = existing.tool as ExternalTool
      const { baseUrl, authEmail, apiToken, targetConfig, ...rest } =
        parsed.data

      // 未指定フィールドは既存値で埋めてから検証する（部分更新でも整合を崩さない）
      const inputError = validateConnectionInput(tool, {
        baseUrl: baseUrl === undefined ? existing.baseUrl : baseUrl,
        authEmail: authEmail === undefined ? existing.authEmail : authEmail,
      })
      if (inputError) return reply.code(400).send({ error: inputError })

      const setValues: Record<string, unknown> = {
        ...rest,
        updatedAt: new Date(),
      }
      if (baseUrl !== undefined) setValues.baseUrl = baseUrl?.trim() || null
      if (authEmail !== undefined) {
        setValues.authEmail = authEmail?.trim() || null
      }
      // undefined=変更なし／null=クリア／文字列=再暗号化して差し替え
      if (apiToken !== undefined) {
        setValues.apiTokenEncrypted = apiToken ? encryptSecret(apiToken) : null
      }
      if (targetConfig !== undefined) {
        try {
          setValues.targetConfig = parseTargetConfig(tool, targetConfig)
        } catch {
          return reply.code(400).send({ error: '起票先の設定が不正です' })
        }
      }

      const [updated] = await db
        .update(externalToolConnections)
        .set(setValues)
        .where(eq(externalToolConnections.id, req.params.id))
        .returning()
      if (!updated) {
        return reply.code(404).send({ error: '対象が見つかりません' })
      }
      return reply.send({ connection: toPublicConnection(updated) })
    },
  )

  fastify.delete<{ Params: { id: string } }>(
    '/api/externalToolConnections/:id',
    { preHandler: guard },
    async (req, reply) => {
      const [deleted] = await db
        .delete(externalToolConnections)
        .where(eq(externalToolConnections.id, req.params.id))
        .returning()
      if (!deleted) {
        return reply.code(404).send({ error: '対象が見つかりません' })
      }
      return reply.code(204).send()
    },
  )

  /** 接続テスト（保存済みトークンで軽量GETを1本投げるだけ） */
  fastify.post<{ Params: { id: string } }>(
    '/api/externalToolConnections/:id/test',
    { preHandler: guard },
    async (req, reply) => {
      const [row] = await db
        .select()
        .from(externalToolConnections)
        .where(eq(externalToolConnections.id, req.params.id))
      if (!row) return reply.code(404).send({ error: '対象が見つかりません' })
      const result = await testConnection(row)
      return reply.send({ ok: result.ok, detail: result.detail })
    },
  )

  /** 起票先設定の選択肢（名前→ID解決）。GitHubはowner/repo直接入力のため空で返る */
  fastify.get<{ Params: { id: string } }>(
    '/api/externalToolConnections/:id/metadata',
    { preHandler: guard },
    async (req, reply) => {
      const [row] = await db
        .select()
        .from(externalToolConnections)
        .where(eq(externalToolConnections.id, req.params.id))
      if (!row) return reply.code(404).send({ error: '対象が見つかりません' })
      const result = await fetchToolMetadata(row)
      if (!result.ok) {
        return reply
          .code(502)
          .send({ error: result.detail ?? '取得に失敗しました' })
      }
      return reply.send(result.data)
    },
  )
}
