import type { FastifyInstance } from 'fastify'
import {
  CreateBillingMilestoneSchema,
  CreateChangeRequestSchema,
} from '@/shared/types'
import { requirePermission } from '../../auth/rbac.js'
import { billingMilestones, changeRequests } from '../../db/schema.js'
import { fireChangeRequestNotification } from '../../notifications/events.js'
import { registerCrudRoutes } from '../crud-factory.js'

/**
 * 商流系エンティティ（変更管理・請求マイルストン、PROPOSAL §4.3/§4.4）。
 * 承認時のProject反映・ステータス遷移の制約（pendingのみ削除可等）は
 * クライアント側ストアが担い、サーバーは汎用CRUDのみ提供する。
 */
export default async function commerceRoutes(fastify: FastifyInstance) {
  registerCrudRoutes(fastify, {
    // 変更要求は受注額差分（金額）を内包する
    readGuard: requirePermission('financials:read'),
    path: '/api/changeRequests',
    table: changeRequests,
    createSchema: CreateChangeRequestSchema,
    updateSchema: CreateChangeRequestSchema.partial(),
    // noteはクライアントZod側で`.optional()`のみ（`.nullable()`を伴わない）のため
    // DBのNULLをundefinedへ変換する（既知のパターン、docs/development-patterns.md参照）
    normalizeRow: (row) => ({ ...row, note: row.note ?? undefined }),
    // 即時イベント通知（Phase 3）。pending→approved/rejectedの遷移のみ
    // events.ts側で判定する。fire-and-forget＝CR PATCHのレスポンスをブロックしない
    afterUpdate: async (row, context) => {
      fireChangeRequestNotification(row, context?.previous)
    },
  })

  registerCrudRoutes(fastify, {
    // 請求マイルストンは請求額（金額）を内包する
    readGuard: requirePermission('financials:read'),
    path: '/api/billingMilestones',
    table: billingMilestones,
    createSchema: CreateBillingMilestoneSchema,
    updateSchema: CreateBillingMilestoneSchema.partial(),
    normalizeRow: (row) => ({ ...row, note: row.note ?? undefined }),
  })
}
