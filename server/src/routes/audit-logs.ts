import { and, desc, eq, lt, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { recordAudit } from '../audit/record.js'
import { requirePermission } from '../auth/rbac.js'
import { db } from '../db/client.js'
import { auditLogs, users } from '../db/schema.js'

/**
 * 監査証跡の参照と保持管理。postgresモード専用。
 *
 * 追記は`crud-factory`が業務操作と同一トランザクションで行うため、ここには
 * **追記・更新の経路を持たない**（記録の書き換えをAPIとして提供しない）。
 * 削除は保持期間を過ぎたログの一括パージ（`DELETE ?before=`）だけを認め、
 * id指定の個別削除は提供しない＝「都合の悪い記録だけを抜く」経路を作らない。
 *
 * 差分（`changes`）には金額を含む業務データがそのまま入るため、
 * 参照・パージとも`users:manage`（admin限定）とする。
 */

/**
 * パージで指定できる保持日数の許可リスト。
 * 任意の日数を受けると「直近1日以外を全部消す」ような使い方ができてしまうため、
 * 運用上ありうる期間だけに限定する（画面の選択肢と一致させる）。
 */
const RETENTION_DAYS_OPTIONS = ['365', '180', '90'] as const

const querySchema = z.object({
  entity: z.string().max(50).optional(),
  entityId: z.string().max(100).optional(),
  actorId: z.string().uuid().optional(),
  action: z.enum(['create', 'update', 'delete']).optional(),
  /** 監査ログは単調増加するため既定100件・最大500件で打ち切る */
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

export default async function auditLogRoutes(fastify: FastifyInstance) {
  const guard = [fastify.authenticate, requirePermission('users:manage')]

  fastify.get('/api/auditLogs', { preHandler: guard }, async (req, reply) => {
    const parsed = querySchema.safeParse(req.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues })
    }
    const { entity, entityId, actorId, action, limit } = parsed.data

    const conditions = [
      entity ? eq(auditLogs.entity, entity) : undefined,
      entityId ? eq(auditLogs.entityId, entityId) : undefined,
      actorId ? eq(auditLogs.actorId, actorId) : undefined,
      action ? eq(auditLogs.action, action) : undefined,
    ].filter((c): c is NonNullable<typeof c> => c !== undefined)

    // 操作者の表示名はusersから解決する（ログ側はidとメールのみ保持）。
    // 退職・削除済みユーザーの操作はnameがnullになり、UIはactorEmailへフォールバックする
    const rows = await db
      .select({
        id: auditLogs.id,
        entity: auditLogs.entity,
        entityId: auditLogs.entityId,
        action: auditLogs.action,
        actorId: auditLogs.actorId,
        actorEmail: auditLogs.actorEmail,
        actorName: users.name,
        changes: auditLogs.changes,
        occurredAt: auditLogs.occurredAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLogs.occurredAt))
      .limit(limit)

    return reply.send({ logs: rows })
  })

  /** 絞り込みUI用のエンティティ一覧（実際にログが存在するものだけ） */
  fastify.get(
    '/api/auditLogs/entities',
    { preHandler: guard },
    async (_req, reply) => {
      const rows = await db
        .select({ entity: auditLogs.entity })
        .from(auditLogs)
        .groupBy(auditLogs.entity)
        .orderBy(sql`${auditLogs.entity} asc`)
      return reply.send({ entities: rows.map((r) => r.entity) })
    },
  )

  /** 保持状況（パージ判断のための総件数と最古の記録日時） */
  fastify.get(
    '/api/auditLogs/stats',
    { preHandler: guard },
    async (_req, reply) => {
      const [row] = await db
        .select({
          total: sql<number>`count(*)::int`,
          oldestAt: sql<string | null>`min(${auditLogs.occurredAt})`,
        })
        .from(auditLogs)
      return reply.send({
        total: row?.total ?? 0,
        oldestAt: row?.oldestAt ?? null,
      })
    },
  )

  /**
   * 保持期間を過ぎたログの削除。
   *
   * **保持日数（`days`）でしか消せない**（任意の基準日時もid指定の個別削除も受けない）。
   * 監査証跡の価値は「都合の悪い記録だけを抜けない」ことにあるため、恣意的な抹消の
   * 経路を作らず、古いものから一括で切り落とす運用に限定する。
   *
   * 基準日時は**サーバー時計**で算出する。クライアントが送ったISO文字列をそのまま
   * 使うと、端末の時計がずれている・意図的に細工された場合に想定外の範囲まで消える
   * （監査ログの削除は取り返しがつかない）。
   *
   * 削除とメタ監査は同一トランザクション。別々だと「消したがその記録が残らない」
   * 状態が起こりうる。
   */
  fastify.delete<{ Querystring: { days?: string } }>(
    '/api/auditLogs',
    { preHandler: guard },
    async (req, reply) => {
      const parsed = z
        .enum(RETENTION_DAYS_OPTIONS)
        .safeParse(String(req.query.days ?? ''))
      if (!parsed.success) {
        return reply.code(400).send({
          error: `daysには保持日数（${RETENTION_DAYS_OPTIONS.join(' / ')}）を指定してください`,
        })
      }
      const days = Number(parsed.data)
      const before = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

      const deletedCount = await db.transaction(async (tx) => {
        const deleted = await tx
          .delete(auditLogs)
          .where(lt(auditLogs.occurredAt, before))
          .returning({ id: auditLogs.id })

        // パージ操作自体を証跡に残す（メタ監査）。削除の後に書くため自身は消えない
        await recordAudit(tx, req.user, [
          {
            entity: 'auditLogs',
            entityId: 'purge',
            action: 'delete',
            changes: {
              retentionDays: days,
              before: before.toISOString(),
              deletedCount: deleted.length,
            },
          },
        ])
        return deleted.length
      })

      return reply.send({ deletedCount })
    },
  )
}
