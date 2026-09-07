import type { FastifyInstance } from 'fastify'
import { CreateMemberSchema } from '@/shared/types'
import { hasPermission } from '../../auth/rbac.js'
import { members } from '../../db/schema.js'
import { registerCrudRoutes } from '../crud-factory.js'

export default async function membersRoutes(fastify: FastifyInstance) {
  registerCrudRoutes(fastify, {
    path: '/api/members',
    table: members,
    createSchema: CreateMemberSchema,
    updateSchema: CreateMemberSchema.partial(),
    // 金額情報の閲覧権限（financials:read）を持たないロール（partner）には、
    // 単価履歴・契約単価履歴を空配列へマスクして返す（多層防御の
    // サーバー側。空配列はMemberSchema上有効な値のためクライアントの検証を壊さない）
    redactRow: (row, role) =>
      hasPermission(role, 'financials:read')
        ? row
        : { ...row, unitPriceHistory: [], contractUnitPriceHistory: [] },
  })
}
