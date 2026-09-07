import type { FastifyInstance } from 'fastify'
import {
  CreateSkillEvaluationSchema,
  CreateSkillRoadmapGoalSchema,
} from '@/shared/types'
import { skillEvaluations, skillRoadmapGoals } from '../../db/schema.js'
import { registerCrudRoutes } from '../crud-factory.js'

/**
 * スキル評価履歴・成長ロードマップ目標は追記専用（data-model.md）。
 * 更新・削除APIを持たないため readOnly:true でGET/POSTのみ登録する。
 */
export default async function skillsRoutes(fastify: FastifyInstance) {
  registerCrudRoutes(fastify, {
    path: '/api/skillEvaluations',
    table: skillEvaluations,
    createSchema: CreateSkillEvaluationSchema,
    updateSchema: CreateSkillEvaluationSchema.partial(),
    readOnly: true,
  })

  registerCrudRoutes(fastify, {
    path: '/api/skillRoadmapGoals',
    table: skillRoadmapGoals,
    createSchema: CreateSkillRoadmapGoalSchema,
    updateSchema: CreateSkillRoadmapGoalSchema.partial(),
    readOnly: true,
  })
}
