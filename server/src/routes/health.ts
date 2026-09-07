import type { FastifyInstance } from 'fastify'

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/api/health', async (_req, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() })
  })
}
