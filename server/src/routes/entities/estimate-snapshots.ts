import { and, eq, gt } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  CreateEstimateSnapshotSchema,
  EstimateSnapshotFieldsSchema,
} from '@/shared/types'
import { requirePermission } from '../../auth/rbac.js'
import { db } from '../../db/client.js'
import { estimateSnapshots } from '../../db/schema.js'
import { CrudValidationError, registerCrudRoutes } from '../crud-factory.js'
import { resolveAuthorName, toDates } from '../resolve-author-name.js'

/**
 * 見積スナップショット（非公開の設計文書）。
 *
 * - 金額（万円）を内包するため`financials:read`必須（partnerは403）。
 *   projectBaselinesと同じ整理
 * - クライアント側ストアは追記専用（更新アクションを持たない）だが、取り違えた記録を
 *   消せるようDELETEは開けておく（`readOnly: true`はDELETEも塞ぐため付けない。
 *   assignmentSnapshotsと同型）。**削除できるのは案件内の最新版だけ**
 *   （途中の版を消すと連番と差分が壊れる。クライアントの`revokeLatestEstimate`と同じ制約を
 *   サーバー側でも強制する）
 * - `takenAt`はtext列（ISO文字列を無変換往復）、`createdAt`はtimestamp列のためDateへ変換
 * - 投稿者名はサーバーがスタンプする（クライアント申告は採用しない）
 */
export default async function estimateSnapshotsRoutes(
  fastify: FastifyInstance,
) {
  registerCrudRoutes(fastify, {
    path: '/api/estimateSnapshots',
    table: estimateSnapshots,
    readGuard: requirePermission('financials:read'),
    createSchema: CreateEstimateSnapshotSchema,
    // superRefine済みのスキーマは.partial()を持たないため素のフィールド定義から作る
    updateSchema: EstimateSnapshotFieldsSchema.omit({ id: true }).partial(),
    beforeCreate: async (data, user) => ({
      ...toDates(data, ['createdAt']),
      authorName: await resolveAuthorName(user),
    }),
    beforeDelete: async (row) => {
      const projectId = row.projectId as string
      const version = row.version as number
      const [newer] = await db
        .select({ id: estimateSnapshots.id })
        .from(estimateSnapshots)
        .where(
          and(
            eq(estimateSnapshots.projectId, projectId),
            gt(estimateSnapshots.version, version),
          ),
        )
        .limit(1)
      if (newer) {
        throw new CrudValidationError(
          '見積の記録は最新版しか取り消せません（途中の版を消すと履歴の連番が壊れます）',
        )
      }
    },
  })
}
