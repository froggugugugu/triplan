import type { FastifyInstance } from 'fastify'
import { CreateCsvMappingProfileSchema } from '@/shared/types'
import { csvMappingProfiles } from '../../db/schema.js'
import { registerCrudRoutes } from '../crud-factory.js'

/**
 * 汎用CSVマッピングプロファイル（非公開の設計文書）。
 * プロファイルは列名・並びのユーザー定義であり金額データを含まないため、
 * readGuardは設けない（認証のみ。書き込みは既定のdata:write）。
 * CreateスキーマはcreatedAt/updatedAtを含まない（DB既定値now()に委譲）ため、
 * projectBaselinesで発見したtimestamp列×ISO文字列の型不一致は起きない
 */
export default async function csvMappingRoutes(fastify: FastifyInstance) {
  registerCrudRoutes(fastify, {
    path: '/api/csvMappingProfiles',
    table: csvMappingProfiles,
    createSchema: CreateCsvMappingProfileSchema,
    updateSchema: CreateCsvMappingProfileSchema.partial(),
    // optionsは.optional()のみ（.nullable()なし）のためnull→undefined変換
    normalizeRow: (row) => ({ ...row, options: row.options ?? undefined }),
  })
}
