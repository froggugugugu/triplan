import type { FastifyInstance } from 'fastify'
import {
  CreateAssignmentNoteSchema,
  CreateAssignmentSnapshotSchema,
} from '@/shared/types'
import { assignmentNotes, assignmentSnapshots } from '../../db/schema.js'
import { registerCrudRoutes } from '../crud-factory.js'
import { resolveAuthorName, toDates } from '../resolve-author-name.js'

/**
 * 体制メモ・アサインスナップショット。
 *
 * どちらも投稿者名を**サーバー側で`req.user`からスタンプ**する
 * （クライアント申告は採用しない＝なりすまし防止。monthlyCloseEventsと同じ整理）。
 * usersテーブルの表示名を優先し、見つからなければJWTのemailを使う。
 */
export default async function assignmentNotesRoutes(fastify: FastifyInstance) {
  // 体制メモ: 申し送りは書き直しが要るため通常のCRUD（変更履歴は監査証跡が拾う）
  registerCrudRoutes(fastify, {
    path: '/api/assignmentNotes',
    table: assignmentNotes,
    createSchema: CreateAssignmentNoteSchema,
    updateSchema: CreateAssignmentNoteSchema.partial(),
    beforeCreate: async (data, user) => ({
      ...toDates(data, ['createdAt', 'updatedAt']),
      authorName: await resolveAuthorName(user),
    }),
    beforeUpdate: async (_id, data) => toDates(data, ['updatedAt']),
  })

  // アサインスナップショット: 記録なので**クライアント側のストアが追記専用**
  // （更新アクションを持たない）。サーバーはprojectBaselinesと同じく汎用CRUDのまま
  // 開けておく＝取り違えた記録を削除できるようにするため
  // （`readOnly: true`はDELETEも塞いでしまう）
  registerCrudRoutes(fastify, {
    path: '/api/assignmentSnapshots',
    table: assignmentSnapshots,
    createSchema: CreateAssignmentSnapshotSchema,
    updateSchema: CreateAssignmentSnapshotSchema.partial(),
    beforeCreate: async (data, user) => ({
      // takenAtはtext列（ISO文字列を無変換往復）なので変換しない
      ...toDates(data, ['createdAt']),
      authorName: await resolveAuthorName(user),
    }),
  })
}
