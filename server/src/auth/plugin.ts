import type { FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { verifyAccessToken } from './jwt.js'

export interface AuthenticatedUser {
  id: string
  email: string
  role: 'admin' | 'manager' | 'editor' | 'viewer' | 'partner'
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

/**
 * Authorizationヘッダーのアクセストークンを検証し、req.userへ設定するデコレータ。
 * 各ルートのpreHandlerとして明示的に指定して使う（全ルート一律ではなく、
 * ルートごとに要否を明示することでヘルスチェック等の公開エンドポイントと区別する）。
 */
export default fp(async (fastify) => {
  fastify.decorate(
    'authenticate',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const header = req.headers.authorization
      if (!header?.startsWith('Bearer ')) {
        return reply.code(401).send({ error: '認証が必要です' })
      }
      const token = header.slice('Bearer '.length)
      try {
        const claims = await verifyAccessToken(token)
        req.user = {
          id: claims.sub,
          email: claims.email,
          role: claims.role,
        }
      } catch {
        return reply
          .code(401)
          .send({ error: 'アクセストークンが無効または期限切れです' })
      }
    },
  )
})
