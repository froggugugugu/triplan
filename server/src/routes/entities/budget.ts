import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  BudgetBreakdownActualRecordSchema,
  BudgetBreakdownSchema,
  CreateAiUsageEntrySchema,
  CreateAiUsageMemberAllocationSchema,
  CreateAiUsageProviderSchema,
  CreateBudgetAdjustmentSchema,
  CreateBudgetBreakdownSchema,
  CreateDivisionBudgetSchema,
  CreateSaasContractSchema,
  SaasContractSchema,
} from '@/shared/types'
import { requireEditorOrAbove, requirePermission } from '../../auth/rbac.js'
import { db } from '../../db/client.js'
import {
  aiUsageEntries,
  aiUsageMemberAllocations,
  aiUsageProviders,
  budgetAdjustments,
  budgetBreakdowns,
  divisionBudgets,
  saasContracts,
} from '../../db/schema.js'
import { registerCrudRoutes } from '../crud-factory.js'

// budgetBreakdowns/saasContractsのmonthlyActuals、budgetBreakdownsのactualRecordsは
// 「専用アクション経由でのみ更新」という制約があるため、汎用PATCHの対象外にする
// （UpdateBudgetBreakdownSchema/UpdateSaasContractSchemaの既存omitと同じ方針）
const UpdateBudgetBreakdownBodySchema = BudgetBreakdownSchema.omit({
  id: true,
  createdAt: true,
  monthlyActuals: true,
  actualRecords: true,
}).partial()

const UpdateSaasContractBodySchema = SaasContractSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  monthlyActuals: true,
}).partial()

const monthlyActualBodySchema = z.object({
  amount: z.number().min(0),
})

/** registerCrudRoutesのnormalizeRowと同じ理由（estimateAmount/coefficientのnull→undefined変換） */
function normalizeBudgetBreakdown<T extends Record<string, unknown>>(row: T) {
  return {
    ...row,
    estimateAmount: row.estimateAmount ?? undefined,
    coefficient: row.coefficient ?? undefined,
  }
}

export default async function budgetRoutes(fastify: FastifyInstance) {
  // divisionBudgets: initialAmountはクライアント（budget-store.ts）が算出した値を
  // そのまま永続化する（LocalJsonAdapterと同じ「storeが計算・adapterは保存に徹する」設計）。
  // サーバー側で再計算カスケードを複製すると計算ロジックが2箇所に分裂し決定性が損なわれるため、
  // あえて行わない。
  registerCrudRoutes(fastify, {
    readGuard: requirePermission('financials:read'),
    path: '/api/divisionBudgets',
    table: divisionBudgets,
    createSchema: CreateDivisionBudgetSchema,
    updateSchema: CreateDivisionBudgetSchema.partial(),
  })

  registerCrudRoutes(fastify, {
    readGuard: requirePermission('financials:read'),
    path: '/api/budgetAdjustments',
    table: budgetAdjustments,
    createSchema: CreateBudgetAdjustmentSchema,
    updateSchema: CreateBudgetAdjustmentSchema.partial(),
    readOnly: true,
  })

  registerCrudRoutes(fastify, {
    readGuard: requirePermission('financials:read'),
    path: '/api/budgetBreakdowns',
    table: budgetBreakdowns,
    createSchema: CreateBudgetBreakdownSchema,
    updateSchema: UpdateBudgetBreakdownBodySchema,
    // estimateAmount/coefficientはクライアントZodスキーマ側で`.optional()`のみのため、
    // DBのNULLをそのまま返すとZod検証に失敗する（projects.tsと同じ理由）
    normalizeRow: (row) => ({
      ...row,
      estimateAmount: row.estimateAmount ?? undefined,
      coefficient: row.coefficient ?? undefined,
    }),
  })

  registerCrudRoutes(fastify, {
    readGuard: requirePermission('financials:read'),
    path: '/api/aiUsageProviders',
    table: aiUsageProviders,
    createSchema: CreateAiUsageProviderSchema,
    updateSchema: CreateAiUsageProviderSchema.partial(),
  })

  registerCrudRoutes(fastify, {
    readGuard: requirePermission('financials:read'),
    path: '/api/aiUsageEntries',
    table: aiUsageEntries,
    createSchema: CreateAiUsageEntrySchema,
    updateSchema: CreateAiUsageEntrySchema.partial(),
  })

  registerCrudRoutes(fastify, {
    readGuard: requirePermission('financials:read'),
    path: '/api/aiUsageMemberAllocations',
    table: aiUsageMemberAllocations,
    createSchema: CreateAiUsageMemberAllocationSchema,
    updateSchema: CreateAiUsageMemberAllocationSchema.partial(),
  })

  registerCrudRoutes(fastify, {
    readGuard: requirePermission('financials:read'),
    path: '/api/saasContracts',
    table: saasContracts,
    createSchema: CreateSaasContractSchema,
    updateSchema: UpdateSaasContractBodySchema,
  })

  // ---- 専用アクション（追記専用原則の限定的な例外、data-model.md参照） ----
  const writeGuard = requireEditorOrAbove()

  fastify.put<{ Params: { id: string; month: string } }>(
    '/api/budgetBreakdowns/:id/monthly-actuals/:month',
    { preHandler: [fastify.authenticate, writeGuard] },
    async (req, reply) => {
      const parsed = monthlyActualBodySchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues })
      }
      const [row] = await db
        .select()
        .from(budgetBreakdowns)
        .where(eq(budgetBreakdowns.id, req.params.id))
      if (!row) return reply.code(404).send({ error: '対象が見つかりません' })

      const monthlyActuals = {
        ...row.monthlyActuals,
        [req.params.month]: parsed.data.amount,
      }
      const [updated] = await db
        .update(budgetBreakdowns)
        .set({ monthlyActuals })
        .where(eq(budgetBreakdowns.id, req.params.id))
        .returning()
      if (!updated) return reply.code(500).send({ error: '更新に失敗しました' })
      return reply.send(normalizeBudgetBreakdown(updated))
    },
  )

  fastify.post<{ Params: { id: string } }>(
    '/api/budgetBreakdowns/:id/actual-records',
    { preHandler: [fastify.authenticate, writeGuard] },
    async (req, reply) => {
      const parsed = BudgetBreakdownActualRecordSchema.omit({
        id: true,
      }).safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues })
      }
      const [row] = await db
        .select()
        .from(budgetBreakdowns)
        .where(eq(budgetBreakdowns.id, req.params.id))
      if (!row) return reply.code(404).send({ error: '対象が見つかりません' })

      const newRecord = { id: crypto.randomUUID(), ...parsed.data }
      const actualRecords = [...row.actualRecords, newRecord]
      const [updated] = await db
        .update(budgetBreakdowns)
        .set({ actualRecords })
        .where(eq(budgetBreakdowns.id, req.params.id))
        .returning()
      if (!updated) return reply.code(500).send({ error: '作成に失敗しました' })
      return reply.code(201).send(normalizeBudgetBreakdown(updated))
    },
  )

  fastify.patch<{ Params: { id: string; recordId: string } }>(
    '/api/budgetBreakdowns/:id/actual-records/:recordId',
    { preHandler: [fastify.authenticate, writeGuard] },
    async (req, reply) => {
      const parsed = BudgetBreakdownActualRecordSchema.omit({
        id: true,
      })
        .partial()
        .safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues })
      }
      const [row] = await db
        .select()
        .from(budgetBreakdowns)
        .where(eq(budgetBreakdowns.id, req.params.id))
      if (!row) return reply.code(404).send({ error: '対象が見つかりません' })

      let found = false
      const actualRecords = row.actualRecords.map((record) => {
        if (record.id !== req.params.recordId) return record
        found = true
        return { ...record, ...parsed.data }
      })
      if (!found) {
        return reply.code(404).send({ error: '実績明細が見つかりません' })
      }
      const [updated] = await db
        .update(budgetBreakdowns)
        .set({ actualRecords })
        .where(eq(budgetBreakdowns.id, req.params.id))
        .returning()
      if (!updated) return reply.code(500).send({ error: '更新に失敗しました' })
      return reply.send(normalizeBudgetBreakdown(updated))
    },
  )

  fastify.delete<{ Params: { id: string; recordId: string } }>(
    '/api/budgetBreakdowns/:id/actual-records/:recordId',
    { preHandler: [fastify.authenticate, writeGuard] },
    async (req, reply) => {
      const [row] = await db
        .select()
        .from(budgetBreakdowns)
        .where(eq(budgetBreakdowns.id, req.params.id))
      if (!row) return reply.code(404).send({ error: '対象が見つかりません' })

      const originalLength = row.actualRecords.length
      const actualRecords = row.actualRecords.filter(
        (record) => record.id !== req.params.recordId,
      )
      if (actualRecords.length === originalLength) {
        return reply.code(404).send({ error: '実績明細が見つかりません' })
      }
      await db
        .update(budgetBreakdowns)
        .set({ actualRecords })
        .where(eq(budgetBreakdowns.id, req.params.id))
      return reply.code(204).send()
    },
  )

  fastify.put<{ Params: { id: string; month: string } }>(
    '/api/saasContracts/:id/monthly-actuals/:month',
    { preHandler: [fastify.authenticate, writeGuard] },
    async (req, reply) => {
      const parsed = monthlyActualBodySchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues })
      }
      const [row] = await db
        .select()
        .from(saasContracts)
        .where(eq(saasContracts.id, req.params.id))
      if (!row) return reply.code(404).send({ error: '対象が見つかりません' })

      const monthlyActuals = {
        ...row.monthlyActuals,
        [req.params.month]: parsed.data.amount,
      }
      const [updated] = await db
        .update(saasContracts)
        .set({ monthlyActuals, updatedAt: new Date() })
        .where(eq(saasContracts.id, req.params.id))
        .returning()
      return reply.send(updated)
    },
  )
}
