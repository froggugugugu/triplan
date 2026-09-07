import type { FastifyInstance } from 'fastify'
import {
  CreatePhaseSettingsEntrySchema,
  PhaseDependencySchema,
  ScheduleEntrySchema,
} from '@/shared/types'
import {
  phaseDependencies,
  scheduleEntries,
  scheduleSettingsEntries,
} from '../../db/schema.js'
import { registerCrudRoutes } from '../crud-factory.js'

// ScheduleEntry/PhaseDependencyはCreate/Update用の専用スキーマをshared/types側に
// 持たないため、ここで基底スキーマからomit/partialして導出する
const CreateScheduleEntrySchema = ScheduleEntrySchema.omit({ id: true })
const CreatePhaseDependencySchema = PhaseDependencySchema.omit({ id: true })

export default async function scheduleRoutes(fastify: FastifyInstance) {
  registerCrudRoutes(fastify, {
    path: '/api/scheduleEntries',
    table: scheduleEntries,
    createSchema: CreateScheduleEntrySchema,
    updateSchema: CreateScheduleEntrySchema.partial(),
  })

  registerCrudRoutes(fastify, {
    path: '/api/dependencies',
    table: phaseDependencies,
    createSchema: CreatePhaseDependencySchema,
    updateSchema: CreatePhaseDependencySchema.partial(),
  })

  // 案件別の工程設定（PhaseSettings、案件×1レコード）。旧schedule-settings-store
  // （Zustand persist、独立localStorageキー）からの移行先。17ストアのDataAdapter配線・第11弾
  registerCrudRoutes(fastify, {
    path: '/api/scheduleSettingsEntries',
    table: scheduleSettingsEntries,
    createSchema: CreatePhaseSettingsEntrySchema,
    updateSchema: CreatePhaseSettingsEntrySchema.partial(),
  })
}
