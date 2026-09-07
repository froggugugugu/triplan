import type { FastifyInstance } from 'fastify'
import { AppSettingsPatchSchema } from '@/shared/types'
import { hasPermission, type Role, requirePermission } from '../auth/rbac.js'
import { db } from '../db/client.js'
import { appSettings } from '../db/schema.js'

/**
 * 全社共通の単一設定値（appSettings）の専用ルート（P0-b）。
 * `DataAdapter.loadAppSettings()/updateAppSettings()`のpostgres実装が呼ぶ。
 * 概算単価・係数・為替レートの4フィールドが「postgresモードでは未反映」だった
 * 既知ギャップ（entity-registry.tsの設計判断でEntityMap対象外）の解消。
 *
 * - GET: 認証のみ（data:read相当）。ただし金額系フィールド（概算単価・係数・案件別係数・
 *   為替レート）は`financials:read`を持たないロール（partner）にはキー自体を返さない
 * - PATCH: `settings:manage`（admin/manager）。全社設定の変更は権限マトリクスどおり
 *   管理職以上に限定する。**指定キーのみ**を上書きするフィールド単位パッチ
 */
export default async function appSettingsRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/appSettings',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const [row] = await db.select().from(appSettings).limit(1)
      const data: Record<string, unknown> = {
        estimatedUnitPrice: row?.estimatedUnitPrice ?? undefined,
        defaultCoefficient: row?.defaultCoefficient ?? undefined,
        projectCoefficients: row?.projectCoefficients ?? undefined,
        exchangeRateHistory: row?.exchangeRateHistory ?? undefined,
        workdaysPerMonth: row?.workdaysPerMonth ?? undefined,
        skillReviewCycleMonths: row?.skillReviewCycleMonths ?? undefined,
        baselineStaleThreshold: row?.baselineStaleThreshold ?? undefined,
        hoursPerDay: row?.hoursPerDay ?? undefined,
        hoursPerFunctionPoint: row?.hoursPerFunctionPoint ?? undefined,
        // サマリー判定閾値。無次元の比率のため金額マスク対象外
        summaryBudgetProgressGapThreshold:
          row?.summaryBudgetProgressGapThreshold ?? undefined,
        summarySpiWarningThreshold:
          row?.summarySpiWarningThreshold ?? undefined,
      }

      const role = req.user?.role as Role
      if (!hasPermission(role, 'financials:read')) {
        delete data.estimatedUnitPrice
        delete data.defaultCoefficient
        delete data.projectCoefficients
        delete data.exchangeRateHistory
      }
      return reply.send(data)
    },
  )

  fastify.patch(
    '/api/appSettings',
    {
      preHandler: [fastify.authenticate, requirePermission('settings:manage')],
    },
    async (req, reply) => {
      const parsed = AppSettingsPatchSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues })
      }

      // 指定されたキーのみ上書きする（undefined値のキーで既存値を消さない）
      const patch: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(parsed.data)) {
        if (value !== undefined) {
          patch[key] = value
        }
      }

      const [existing] = await db.select().from(appSettings).limit(1)
      if (existing) {
        await db.update(appSettings).set({
          ...patch,
          updatedAt: new Date(),
        })
      } else {
        // 初回PATCH時に単一行（id=1）を作成する。fiscalYear/metadataはnotNullのため
        // 既定値を補う（fiscalYearは4月始まりの現在年度）
        const now = new Date()
        const fiscalYear =
          now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1
        await db.insert(appSettings).values({
          id: 1,
          fiscalYear,
          metadata: {
            lastModified: now.toISOString(),
            createdBy: 'system',
            version: '1.0.0',
          },
          ...patch,
        })
      }

      // 更新後の状態をGETと同じ形（金額系含む＝settings:manage保持者はfinancials:readも
      // 持つ運用のため再マスク不要だが、念のためGETと同じマスクを通す）で返す
      const [row] = await db.select().from(appSettings).limit(1)
      const data: Record<string, unknown> = {
        estimatedUnitPrice: row?.estimatedUnitPrice ?? undefined,
        defaultCoefficient: row?.defaultCoefficient ?? undefined,
        projectCoefficients: row?.projectCoefficients ?? undefined,
        exchangeRateHistory: row?.exchangeRateHistory ?? undefined,
        workdaysPerMonth: row?.workdaysPerMonth ?? undefined,
        skillReviewCycleMonths: row?.skillReviewCycleMonths ?? undefined,
        baselineStaleThreshold: row?.baselineStaleThreshold ?? undefined,
        hoursPerDay: row?.hoursPerDay ?? undefined,
        hoursPerFunctionPoint: row?.hoursPerFunctionPoint ?? undefined,
        summaryBudgetProgressGapThreshold:
          row?.summaryBudgetProgressGapThreshold ?? undefined,
        summarySpiWarningThreshold:
          row?.summarySpiWarningThreshold ?? undefined,
      }
      const role = req.user?.role as Role
      if (!hasPermission(role, 'financials:read')) {
        delete data.estimatedUnitPrice
        delete data.defaultCoefficient
        delete data.projectCoefficients
        delete data.exchangeRateHistory
      }
      return reply.send(data)
    },
  )
}
