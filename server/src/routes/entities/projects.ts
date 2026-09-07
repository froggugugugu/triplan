import { and, eq, ne } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  CreateEffortEntrySchema,
  CreateProjectSchema,
  CreateTaskSyncLogSchema,
} from '@/shared/types'
import { hasPermission } from '../../auth/rbac.js'
import { db } from '../../db/client.js'
import {
  assignments,
  efforts,
  projects,
  taskSyncLogs,
} from '../../db/schema.js'
import { CrudValidationError, registerCrudRoutes } from '../crud-factory.js'
import { getClosedMonths } from './assignments.js'

/**
 * コード一意性の検証（非公開の設計文書）。
 * コードは外部連携の突合キーのため、新たな重複を作る書込みを拒否する。
 * DBのunique制約は既存データに重複がありうるため張らず、アプリ層で担保する
 */
async function validateCodeUniqueness(
  code: string,
  excludeId?: string,
): Promise<void> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      excludeId
        ? and(eq(projects.code, code), ne(projects.id, excludeId))
        : eq(projects.code, code),
    )
    .limit(1)
  if (rows.length > 0) {
    throw new CrudValidationError(
      `コード「${code}」は既に使われています（外部連携の突合キーのため重複できません）`,
    )
  }
}

export default async function projectsRoutes(fastify: FastifyInstance) {
  registerCrudRoutes(fastify, {
    path: '/api/projects',
    table: projects,
    createSchema: CreateProjectSchema,
    updateSchema: CreateProjectSchema.partial(),
    beforeCreate: async (data) => {
      await validateCodeUniqueness(data.code as string)
      return data
    },
    beforeUpdate: async (id, data) => {
      // コードが変わる更新のみ検証（既存重複データの無関係な編集をブロックしない）
      if (data.code !== undefined) {
        const [current] = await db
          .select({ code: projects.code })
          .from(projects)
          .where(eq(projects.id, id))
        if (current && current.code !== data.code) {
          await validateCodeUniqueness(data.code as string, id)
        }
      }
      return data
    },
    // description/background/purpose/completionCriteriaはクライアントZodスキーマ側で
    // `.optional()`のみ（`.nullable()`を伴わない）。DBの未設定値（NULL）をそのまま
    // 返すとJSON上null扱いになりZod検証に失敗するため、undefinedへ変換する
    normalizeRow: (row) => ({
      ...row,
      description: row.description ?? undefined,
      background: row.background ?? undefined,
      purpose: row.purpose ?? undefined,
      completionCriteria: row.completionCriteria ?? undefined,
      // .optional()のみのenumフィールド（未設定=frozen扱い）。NULLのままだと
      // クライアント側のDatabaseSchema検証に弾かれる（export-database.tsと同じ対応）
      evmUnitPriceMode: row.evmUnitPriceMode ?? undefined,
    }),
    // financials:readを持たないロール（partner）には受注金額をnullへマスクして返す
    // （nullはProjectSchema上有効な値＝「未設定」のためクライアントの検証を壊さない）
    redactRow: (row, role) =>
      hasPermission(role, 'financials:read')
        ? row
        : { ...row, contractAmount: null },
    // 締め済み月に値（計画>0または実績の明示キー）を持つアサインが対象ツリーに存在する
    // 場合、削除のカスケードが締め済みの事実を道連れに消すため400で拒否する
    // （P1-b段階2＝まで既知の制限として残置していたものを解消）
    beforeDelete: async (row) => {
      const allProjects = await db
        .select({ id: projects.id, parentId: projects.parentId })
        .from(projects)
      const targetIds = new Set<string>([row.id as string])
      let changed = true
      while (changed) {
        changed = false
        for (const p of allProjects) {
          if (p.parentId && targetIds.has(p.parentId) && !targetIds.has(p.id)) {
            targetIds.add(p.id)
            changed = true
          }
        }
      }
      const closedMonths = await getClosedMonths()
      if (closedMonths.size === 0) return
      const assignmentRows = await db.select().from(assignments)
      for (const entry of assignmentRows) {
        if (!targetIds.has(entry.projectId) && !targetIds.has(entry.taskId)) {
          continue
        }
        for (const month of closedMonths) {
          const plan =
            (entry.monthlyValues as Record<string, number>)[month] ?? 0
          const hasActual =
            (entry.actualMonthlyValues as Record<string, number> | null)?.[
              month
            ] !== undefined
          if (plan > 0 || hasActual) {
            throw new CrudValidationError(
              `締め済み月（${month}）の実績を含むアサインがあるため削除できません。先に月次実績画面で該当月の締めを解除してください`,
            )
          }
        }
      }
    },
  })

  registerCrudRoutes(fastify, {
    path: '/api/efforts',
    table: efforts,
    createSchema: CreateEffortEntrySchema,
    updateSchema: CreateEffortEntrySchema.partial(),
  })

  // 外部完了同期ログ（追記専用。ActualsImportLogと同じパターン）
  registerCrudRoutes(fastify, {
    path: '/api/taskSyncLogs',
    table: taskSyncLogs,
    createSchema: CreateTaskSyncLogSchema,
    updateSchema: CreateTaskSyncLogSchema.partial(),
    readOnly: true,
  })
}
