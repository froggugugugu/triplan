import type { FastifyInstance } from 'fastify'
import { CreateProjectProgressEntrySchema } from '@/shared/types'
import { projectProgressEntries } from '../../db/schema.js'
import { registerCrudRoutes } from '../crud-factory.js'

export default async function projectProgressRoutes(fastify: FastifyInstance) {
  registerCrudRoutes(fastify, {
    path: '/api/projectProgressEntries',
    table: projectProgressEntries,
    createSchema: CreateProjectProgressEntrySchema,
    updateSchema: CreateProjectProgressEntrySchema.partial(),
  })
}
