import type { FastifyInstance } from 'fastify'
import {
  CreateTechTagCategorySchema,
  CreateTechTagSchema,
  CreateTechTagSubCategorySchema,
} from '@/shared/types'
import {
  techTagCategories,
  techTagSubCategories,
  techTags,
} from '../../db/schema.js'
import { registerCrudRoutes } from '../crud-factory.js'

export default async function techTagsRoutes(fastify: FastifyInstance) {
  registerCrudRoutes(fastify, {
    path: '/api/techTagCategories',
    table: techTagCategories,
    createSchema: CreateTechTagCategorySchema,
    updateSchema: CreateTechTagCategorySchema.partial(),
  })

  registerCrudRoutes(fastify, {
    path: '/api/techTagSubCategories',
    table: techTagSubCategories,
    createSchema: CreateTechTagSubCategorySchema,
    updateSchema: CreateTechTagSubCategorySchema.partial(),
  })

  registerCrudRoutes(fastify, {
    path: '/api/techTags',
    table: techTags,
    createSchema: CreateTechTagSchema,
    updateSchema: CreateTechTagSchema.partial(),
  })
}
