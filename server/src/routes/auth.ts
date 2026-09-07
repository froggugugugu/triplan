import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiryDate,
  signAccessToken,
} from '../auth/jwt.js'
import { verifyPassword } from '../auth/password.js'
import { db } from '../db/client.js'
import { refreshTokens, users } from '../db/schema.js'

const REFRESH_COOKIE = 'refresh_token'

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/api/auth/login', async (req, reply) => {
    const parsed = loginBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'メールアドレスとパスワードを入力してください' })
    }
    const { email, password } = parsed.data

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    if (!user || !user.isActive || !user.passwordHash) {
      // ユーザー不存在・無効化・SSO専用アカウントのいずれも同一メッセージで返す
      // （アカウントの存在有無を推測されるユーザー列挙攻撃を防ぐ）
      return reply
        .code(401)
        .send({ error: 'メールアドレスまたはパスワードが正しくありません' })
    }

    const valid = await verifyPassword(user.passwordHash, password)
    if (!valid) {
      return reply
        .code(401)
        .send({ error: 'メールアドレスまたはパスワードが正しくありません' })
    }

    const accessToken = await signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    })

    const refreshToken = generateRefreshToken()
    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiryDate(),
    })

    reply.setCookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/auth',
    })

    return reply.send({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        // 「自分の担当タスク」を認証直後から引けるよう紐づけ担当者も返す
        memberId: user.memberId,
      },
    })
  })

  fastify.post('/api/auth/refresh', async (req, reply) => {
    const token = req.cookies[REFRESH_COOKIE]
    if (!token) {
      return reply.code(401).send({ error: 'リフレッシュトークンがありません' })
    }

    const tokenHash = hashRefreshToken(token)
    const [record] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1)

    if (
      !record ||
      record.revokedAt !== null ||
      record.expiresAt.getTime() < Date.now()
    ) {
      reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' })
      return reply
        .code(401)
        .send({ error: 'セッションが切れました。再ログインしてください' })
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, record.userId))
      .limit(1)

    if (!user || !user.isActive) {
      reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' })
      return reply
        .code(401)
        .send({ error: 'セッションが切れました。再ログインしてください' })
    }

    // ローテーション: 旧トークンを即時失効させ、新しいトークンを発行する（§12.1）
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, record.id))

    const newRefreshToken = generateRefreshToken()
    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: hashRefreshToken(newRefreshToken),
      expiresAt: refreshTokenExpiryDate(),
    })

    const accessToken = await signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    })

    reply.setCookie(REFRESH_COOKIE, newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/auth',
    })

    return reply.send({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        // 「自分の担当タスク」を認証直後から引けるよう紐づけ担当者も返す
        memberId: user.memberId,
      },
    })
  })

  fastify.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[REFRESH_COOKIE]
    if (token) {
      const tokenHash = hashRefreshToken(token)
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.tokenHash, tokenHash))
    }
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' })
    return reply.send({ ok: true })
  })

  fastify.get(
    '/api/auth/me',
    { preHandler: fastify.authenticate },
    async (req, reply) => {
      return reply.send({ user: req.user })
    },
  )
}
