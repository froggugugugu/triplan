import type { FastifyInstance } from 'fastify'
import { CreatePersonnelPlanEntrySchema } from '@/shared/types'
import { requirePermission } from '../../auth/rbac.js'
import { personnelPlans } from '../../db/schema.js'
import { registerCrudRoutes } from '../crud-factory.js'

export default async function personnelPlanRoutes(fastify: FastifyInstance) {
  registerCrudRoutes(fastify, {
    // 人員計画は人件費予算の算出元のため金額情報として扱う
    readGuard: requirePermission('financials:read'),
    path: '/api/personnelPlans',
    table: personnelPlans,
    createSchema: CreatePersonnelPlanEntrySchema,
    updateSchema: CreatePersonnelPlanEntrySchema.partial(),
  })
}
