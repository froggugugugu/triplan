import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { diffChangedFields } from '../audit/diff.js'
import { recordAudit } from '../audit/record.js'
import { hashPassword } from '../auth/password.js'
import { requireAdmin } from '../auth/rbac.js'
import { db } from '../db/client.js'
import { users } from '../db/schema.js'

const createUserBodySchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8, 'パスワードは8文字以上にしてください'),
  role: z.enum(['admin', 'manager', 'editor', 'viewer', 'partner']),
})

const updateUserBodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.enum(['admin', 'manager', 'editor', 'viewer', 'partner']).optional(),
  isActive: z.boolean().optional(),
  // 業務データ上の担当者との紐づけ。
  // undefined=変更なし／null=解除／uuid=紐づけ の3値（notificationChannelsと同じ整理）
  memberId: z.string().uuid().nullable().optional(),
})

function toPublicUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    authProvider: user.authProvider,
    isActive: user.isActive,
    memberId: user.memberId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

/**
 * ユーザー管理API。すべてadmin限定（§12.2）。
 * 「招待」はメール送信基盤を持たないため、adminが直接初期パスワードを設定する
 * 簡易フローとする（過剰設計回避。招待メール等は§16の拡張ポイント）。
 */
export default async function usersRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/users',
    { preHandler: [fastify.authenticate, requireAdmin()] },
    async (_req, reply) => {
      const all = await db.select().from(users).orderBy(users.createdAt)
      return reply.send({ users: all.map(toPublicUser) })
    },
  )

  fastify.post(
    '/api/users',
    { preHandler: [fastify.authenticate, requireAdmin()] },
    async (req, reply) => {
      const parsed = createUserBodySchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues })
      }
      const { email, name, password, role } = parsed.data

      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1)
      if (existing) {
        return reply
          .code(409)
          .send({ error: 'このメールアドレスは既に登録されています' })
      }

      const passwordHash = await hashPassword(password)
      // 「いつ誰がどのロールでユーザーを作ったか」も証跡に残す。
      // パスワードは平文もハッシュも記録しない（changesはnull＝作成の事実のみ）
      const created = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(users)
          .values({ email, name, passwordHash, role, authProvider: 'local' })
          .returning()
        if (!row) return undefined
        await recordAudit(tx, req.user, [
          { entity: 'users', entityId: row.id, action: 'create' },
        ])
        return row
      })

      if (!created) {
        return reply.code(500).send({ error: 'ユーザー作成に失敗しました' })
      }
      return reply.code(201).send({ user: toPublicUser(created) })
    },
  )

  fastify.patch<{ Params: { id: string } }>(
    '/api/users/:id',
    { preHandler: [fastify.authenticate, requireAdmin()] },
    async (req, reply) => {
      const parsed = updateUserBodySchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues })
      }
      const { id } = req.params

      if (
        id === req.user?.id &&
        parsed.data.role &&
        parsed.data.role !== 'admin'
      ) {
        // 自分自身のadmin権限を剥奪すると誰も管理できなくなる可能性があるため禁止
        return reply
          .code(400)
          .send({ error: '自分自身のロールをadmin以外へは変更できません' })
      }
      if (id === req.user?.id && parsed.data.isActive === false) {
        return reply
          .code(400)
          .send({ error: '自分自身を無効化することはできません' })
      }

      // ロール変更＝権限昇格は監査上もっとも重要な操作のため、業務更新と
      // 同一トランザクションで証跡を残す（crud-factory配下の業務エンティティと同じ扱い）
      const updated = await db.transaction(async (tx) => {
        const [before] = await tx.select().from(users).where(eq(users.id, id))
        if (!before) return undefined

        const [row] = await tx
          .update(users)
          .set({ ...parsed.data, updatedAt: new Date() })
          .where(eq(users.id, id))
          .returning()
        if (!row) return undefined

        const changes = diffChangedFields(
          before as unknown as Record<string, unknown>,
          parsed.data as Record<string, unknown>,
        )
        await recordAudit(
          tx,
          req.user,
          changes
            ? [{ entity: 'users', entityId: id, action: 'update', changes }]
            : [],
        )
        return row
      })

      if (!updated) {
        return reply.code(404).send({ error: 'ユーザーが見つかりません' })
      }
      return reply.send({ user: toPublicUser(updated) })
    },
  )
}
