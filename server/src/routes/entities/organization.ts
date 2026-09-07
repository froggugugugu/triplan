import type { FastifyInstance } from 'fastify'
import {
  CreateCompanySchema,
  CreateDivisionSchema,
  CreateSectionSchema,
} from '@/shared/types'
import { companies, divisions, sections } from '../../db/schema.js'
import { registerCrudRoutes } from '../crud-factory.js'

/**
 * 組織マスタ（部門・課・所属会社）のCRUD。いずれもクライアントのCreateXSchemaを
 * そのまま流用し、部分更新用スキーマは`.partial()`で導出する（`UpdateXSchema`は
 * `id`必須のため、ボディにidを含めないPATCH契約とは形が合わずここでは使わない）。
 */
export default async function organizationRoutes(fastify: FastifyInstance) {
  registerCrudRoutes(fastify, {
    path: '/api/divisions',
    table: divisions,
    createSchema: CreateDivisionSchema,
    updateSchema: CreateDivisionSchema.partial(),
  })

  registerCrudRoutes(fastify, {
    path: '/api/sections',
    table: sections,
    createSchema: CreateSectionSchema,
    updateSchema: CreateSectionSchema.partial(),
  })

  registerCrudRoutes(fastify, {
    path: '/api/companies',
    table: companies,
    createSchema: CreateCompanySchema,
    updateSchema: CreateCompanySchema.partial(),
  })
}
