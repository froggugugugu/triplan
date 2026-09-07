import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  CreateActualsImportLogSchema,
  CreateMonthlyActualsConfirmationSchema,
  CreateMonthlyCloseEventSchema,
} from '@/shared/types'
import { requirePermission } from '../../auth/rbac.js'
import { db } from '../../db/client.js'
import {
  actualsImportLogs,
  monthlyActualsConfirmations,
  monthlyCloseEvents,
  users,
} from '../../db/schema.js'
import { fireMonthlyCloseNotification } from '../../notifications/events.js'
import { registerCrudRoutes } from '../crud-factory.js'

/**
 * 月次実績（P1-a）: 確定マーク＋CSV取込履歴。
 * 実績値そのもの（AssignmentEntry.actualMonthlyValues）は既存のassignmentsルートが受け皿。
 * 金額を含まないエンティティのためreadGuardは設けない（認証のみ）。
 */
export default async function actualsRoutes(fastify: FastifyInstance) {
  // 全社×月1レコードの確定マーク。再確定はconfirmedAtのPATCH（monthのunique制約が重複を防ぐ）
  registerCrudRoutes(fastify, {
    path: '/api/monthlyActualsConfirmations',
    table: monthlyActualsConfirmations,
    createSchema: CreateMonthlyActualsConfirmationSchema,
    updateSchema: CreateMonthlyActualsConfirmationSchema.partial(),
  })

  // CSV取込履歴は追記専用（BudgetAdjustment等と同じパターン。PATCH/DELETEを登録しない）
  registerCrudRoutes(fastify, {
    path: '/api/actualsImportLogs',
    table: actualsImportLogs,
    createSchema: CreateActualsImportLogSchema,
    updateSchema: CreateActualsImportLogSchema.partial(),
    readOnly: true,
  })

  // 月次締めイベント（P1-b）。追記専用＋governance:approve（admin/manager）。
  // actorNameはサーバー側でreq.userからスタンプする（クライアント申告は無視＝偽装防止。
  // usersテーブルの表示名を優先し、見つからなければJWTのemailを使う）
  registerCrudRoutes(fastify, {
    path: '/api/monthlyCloseEvents',
    table: monthlyCloseEvents,
    createSchema: CreateMonthlyCloseEventSchema,
    updateSchema: CreateMonthlyCloseEventSchema.partial(),
    readOnly: true,
    writeGuard: requirePermission('governance:approve'),
    beforeCreate: async (data, user) => {
      let actorName: string | null = user?.email ?? null
      if (user) {
        const [row] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1)
        if (row?.name) actorName = row.name
      }
      return { ...data, actorName }
    },
    // 即時イベント通知（Phase 3）。fire-and-forget＝締めPOSTのレスポンスを
    // 通知の遅延・失敗でブロックしない
    afterCreate: async (row) => {
      fireMonthlyCloseNotification(row)
    },
  })
}
