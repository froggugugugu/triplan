import type { FastifyInstance } from 'fastify'
import { CreateRiskEntrySchema } from '@/shared/types'
import { riskEntries } from '../../db/schema.js'
import { registerCrudRoutes } from '../crud-factory.js'

/**
 * リスク登録簿（非公開の設計文書）。
 *
 * 金額を持たないためfinancials:readのガード対象外（既定の
 * data:read / data:write）＝partnerも閲覧できる（体制・進捗と同じ扱い）。
 * `Create*Schema`がcreatedAt/updatedAtを含まないためtimestamp列は
 * DB既定値now()に委譲する（projectBaselinesの型不一致バグを踏まない整理）。
 * 変更履歴はcrud-factoryの監査証跡が自動で拾う。
 */
export default async function risksRoutes(fastify: FastifyInstance) {
  registerCrudRoutes(fastify, {
    path: '/api/riskEntries',
    table: riskEntries,
    createSchema: CreateRiskEntrySchema,
    updateSchema: CreateRiskEntrySchema.partial(),
  })
}
