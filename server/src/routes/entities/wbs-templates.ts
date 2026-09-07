import type { FastifyInstance } from 'fastify'
import {
  CreateWbsSettingsEntrySchema,
  CreateWbsTemplateSchema,
} from '@/shared/types'
import { wbsColumnSettingsEntries, wbsTemplates } from '../../db/schema.js'
import { registerCrudRoutes } from '../crud-factory.js'

// levelColorsはnullable jsonb列（未設定時null）だが、対応するクライアントZodフィールドは
// .optional()のみ（.nullable()を伴わない）のため、null→undefined変換が必要
// （export-database.tsと同じ既知のパターン、docs/development-patterns.md参照）
function normalizeWbsColumnSettingsEntry(row: Record<string, unknown>) {
  return { ...row, levelColors: row.levelColors ?? undefined }
}

export default async function wbsTemplatesRoutes(fastify: FastifyInstance) {
  registerCrudRoutes(fastify, {
    path: '/api/wbsTemplates',
    table: wbsTemplates,
    createSchema: CreateWbsTemplateSchema,
    updateSchema: CreateWbsTemplateSchema.partial(),
  })

  // 案件別のWBS列設定（WbsSettings、案件×1レコード）。旧wbs-settings-store（Zustand persist、
  // 独立localStorageキー）からの移行先。17ストアのDataAdapter配線・第11弾
  registerCrudRoutes(fastify, {
    path: '/api/wbsColumnSettingsEntries',
    table: wbsColumnSettingsEntries,
    createSchema: CreateWbsSettingsEntrySchema,
    updateSchema: CreateWbsSettingsEntrySchema.partial(),
    normalizeRow: normalizeWbsColumnSettingsEntry,
  })
}
