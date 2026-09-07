import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type {
  AssignmentEntry,
  BillingMilestone,
  Company,
  Member,
  Project,
  ProjectBaseline,
} from '@/shared/types'
import {
  calcProjectEstimateBudget,
  getFiscalYearMonthKeys,
} from '@/shared/utils/budget-utils'
import {
  buildProjectCostBreakdownMap,
  calcDivisionOverheadPool,
} from '@/shared/utils/cost-breakdown-utils'
import { buildBillingRows } from '@/shared/utils/csv-mapping-utils'
import { computeProjectTotalEffort } from '@/shared/utils/effort-utils'
import {
  calcEvmSeries,
  getActiveBaseline,
  getFiscalYearWeekKeys,
  resolveProgressRateAtWeek,
} from '@/shared/utils/evm-utils'
import { getIsoWeekKey } from '@/shared/utils/iso-week-utils'
import { buildProjectFinanceRecords } from '@/shared/utils/project-finance'
import {
  buildClientStatementLines,
  buildPartnerPaymentLines,
} from '@/shared/utils/statement-utils'
import { requireApiKey } from '../auth/api-key.js'
import { db } from '../db/client.js'
import {
  aiUsageEntries,
  appSettings,
  assignments,
  billingMilestones,
  budgetBreakdowns,
  companies,
  divisionBudgets,
  divisions,
  efforts,
  members,
  projectBaselines,
  projectProgressEntries,
  projects,
  saasContracts,
  scheduleEntries,
  wbsColumnSettingsEntries,
} from '../db/schema.js'
import {
  buildProjectTree,
  collectServerAlerts,
} from '../notifications/digest.js'

/**
 * 公開API v1（read-only）。外部システム（BI・会計・スクリプト）が
 * 「判断の結果」を機械的に取りに来るためのAPI。認証はAPIキー（X-Api-Key）。
 * 集計ロジックはすべて画面・CSVと同一のshared純関数を再利用する（数値の単一実装）。
 * 仕様書はGET /api/v1/openapi.yaml（認証不要=ドキュメントとして公開）。
 */

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default async function v1Routes(fastify: FastifyInstance) {
  // OAS仕様書（認証不要。利用者への提供物）
  const openapiPath = fileURLToPath(
    new URL('../../openapi/v1.yaml', import.meta.url),
  )
  fastify.get('/api/v1/openapi.yaml', async (_req, reply) => {
    return reply
      .header('content-type', 'application/yaml; charset=utf-8')
      .send(readFileSync(openapiPath, 'utf-8'))
  })

  // 請求データ（請求マイルストン×案件）
  fastify.get<{ Querystring: { projectId?: string } }>(
    '/api/v1/billing',
    { preHandler: [requireApiKey] },
    async (req, reply) => {
      const [projectRows, milestoneRows] = await Promise.all([
        db.select().from(projects),
        db.select().from(billingMilestones),
      ])
      const rows = buildBillingRows(
        projectRows as unknown as Project[],
        milestoneRows as unknown as BillingMilestone[],
        req.query.projectId,
      )
      return reply.send({ items: rows })
    },
  )

  // 案件別収支（画面・CSVと同一の算出）
  fastify.get(
    '/api/v1/project-finance',
    { preHandler: [requireApiKey] },
    async (_req, reply) => {
      const [
        projectRows,
        divisionRows,
        effortRows,
        wbsSettingsRows,
        assignmentRows,
        memberRows,
        breakdownRows,
        companyRows,
        divisionBudgetRows,
        saasContractRows,
        aiUsageRows,
        [settings],
      ] = await Promise.all([
        db.select().from(projects),
        db.select().from(divisions),
        db.select().from(efforts),
        db.select().from(wbsColumnSettingsEntries),
        db.select().from(assignments),
        db.select().from(members),
        db.select().from(budgetBreakdowns),
        db.select().from(companies),
        db.select().from(divisionBudgets),
        db.select().from(saasContracts),
        db.select().from(aiUsageEntries),
        db.select().from(appSettings).limit(1),
      ])
      const settingsByProject = new Map(
        wbsSettingsRows.map((r) => [r.projectId, r.effortColumns]),
      )
      const roots = projectRows.filter((p) => p.level === 0)

      // 原価4区分。年度の解決はEVMエンドポイントと同一
      const now = new Date()
      const fiscalYear =
        settings?.fiscalYear ??
        (now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1)
      const monthKeys = getFiscalYearMonthKeys(fiscalYear)
      const typedBreakdowns = breakdownRows as never
      const overheadPoolByDivision = new Map<string, number>()
      for (const root of roots) {
        if (!root.divisionId || overheadPoolByDivision.has(root.divisionId)) {
          continue
        }
        overheadPoolByDivision.set(
          root.divisionId,
          calcDivisionOverheadPool({
            divisionId: root.divisionId,
            fiscalYear,
            monthKeys,
            divisionBudgets: divisionBudgetRows as never,
            budgetBreakdowns: typedBreakdowns,
            saasContracts: saasContractRows as never,
            aiUsageEntries: aiUsageRows as never,
            exchangeRateHistory: settings?.exchangeRateHistory ?? [],
          }),
        )
      }
      const costBreakdownByProjectId = buildProjectCostBreakdownMap({
        topLevelProjects: roots,
        assignments: assignmentRows as unknown as AssignmentEntry[],
        members: memberRows as unknown as Member[],
        companies: companyRows as never,
        budgetBreakdowns: typedBreakdowns,
        monthKeys,
        overheadPoolByDivision,
        referenceDate: now,
      })

      const rows = buildProjectFinanceRecords({
        projectTree: roots.map((root) => buildProjectTree(projectRows, root)),
        divisions: divisionRows,
        efforts: effortRows,
        getColumnIds: (projectId) => {
          const columns = settingsByProject.get(projectId)
          if (!columns || columns.length === 0) {
            return ['effort-1', 'effort-2', 'effort-3']
          }
          return columns.filter((c) => c.enabled).map((c) => c.id)
        },
        estimatedUnitPrice: settings?.estimatedUnitPrice ?? 0,
        workdaysPerMonth: settings?.workdaysPerMonth ?? undefined,
        getCoefficient: (projectId) =>
          settings?.projectCoefficients?.[projectId] ??
          settings?.defaultCoefficient ??
          1,
        assignments: assignmentRows as unknown as AssignmentEntry[],
        members: memberRows as unknown as Member[],
        budgetBreakdowns: breakdownRows as never,
        referenceDate: now,
        costBreakdownByProjectId,
      })
      return reply.send({ items: rows })
    },
  )

  // 月次明細（支払/発注元）。month省略時は当月・mode省略時は実績
  for (const [path, builder] of [
    ['/api/v1/statements/partner-payment', buildPartnerPaymentLines],
    ['/api/v1/statements/client', buildClientStatementLines],
  ] as const) {
    fastify.get<{ Querystring: { month?: string; mode?: string } }>(
      path,
      { preHandler: [requireApiKey] },
      async (req, reply) => {
        const month = req.query.month ?? currentMonthKey()
        if (!MONTH_PATTERN.test(month)) {
          return reply
            .code(400)
            .send({ error: 'monthはYYYY-MM形式で指定してください' })
        }
        const mode = req.query.mode ?? 'actual'
        if (mode !== 'actual' && mode !== 'plan') {
          return reply
            .code(400)
            .send({ error: 'modeはactualまたはplanを指定してください' })
        }
        const [
          memberRows,
          companyRows,
          projectRows,
          assignmentRows,
          [settings],
        ] = await Promise.all([
          db.select().from(members),
          db.select().from(companies),
          db.select().from(projects),
          db.select().from(assignments),
          db.select().from(appSettings).limit(1),
        ])
        const lines = builder({
          month,
          members: memberRows as unknown as Member[],
          companies: companyRows as unknown as Company[],
          projects: projectRows as unknown as Project[],
          assignments: assignmentRows as unknown as AssignmentEntry[],
          useActual: mode === 'actual',
          workdaysPerMonth: settings?.workdaysPerMonth ?? undefined,
          hoursPerDay: settings?.hoursPerDay ?? undefined,
        })
        return reply.send({ month, mode, items: lines })
      },
    )
  }

  // プロジェクト一覧・詳細（進捗報告の外部参照用）。
  // 金額は含めない（金額はproject-finance側の責務。エンドポイントの目的を分離する）
  const buildProjectSummaries = async (targetId?: string) => {
    const [
      projectRows,
      divisionRows,
      effortRows,
      wbsSettingsRows,
      progressRows,
    ] = await Promise.all([
      db.select().from(projects),
      db.select().from(divisions),
      db.select().from(efforts),
      db.select().from(wbsColumnSettingsEntries),
      db.select().from(projectProgressEntries),
    ])
    const divisionNameById = new Map(divisionRows.map((d) => [d.id, d.name]))
    const settingsByProject = new Map(
      wbsSettingsRows.map((r) => [r.projectId, r.effortColumns]),
    )
    const effortEntries = effortRows.map((e) => ({
      id: e.id,
      projectId: e.projectId,
      columnId: e.columnId,
      value: e.value,
    }))
    const currentWeek = getIsoWeekKey(new Date())
    const roots = projectRows.filter(
      (p) => p.level === 0 && (targetId === undefined || p.id === targetId),
    )
    return {
      projectRows,
      summaries: roots.map((root) => {
        const node = buildProjectTree(projectRows, root)
        const columns = settingsByProject.get(root.id)
        const columnIds =
          !columns || columns.length === 0
            ? ['effort-1', 'effort-2', 'effort-3']
            : columns.filter((c) => c.enabled).map((c) => c.id)
        const weeklyProgress =
          progressRows.find((e) => e.projectId === root.id)?.weeklyProgress ??
          {}
        // 進捗率は画面・EVM・ダイジェストと同じ解決順（週次手入力優先→WBS完了の工数加重）
        const progressRate = resolveProgressRateAtWeek(
          currentWeek,
          weeklyProgress,
          { node, columnIds, efforts: effortEntries },
        )
        const collectLeaves = (
          n: typeof node,
        ): { total: number; completed: number } =>
          n.children.length === 0
            ? { total: 1, completed: n.completed ? 1 : 0 }
            : n.children.reduce(
                (acc, child) => {
                  const r = collectLeaves(child)
                  return {
                    total: acc.total + r.total,
                    completed: acc.completed + r.completed,
                  }
                },
                { total: 0, completed: 0 },
              )
        const leaves = collectLeaves(node)
        return {
          id: root.id,
          code: root.code,
          name: root.name,
          status: root.status,
          confidence: root.confidence,
          priority: root.priority ?? null,
          clientName: root.clientName ?? null,
          contractType: root.contractType ?? null,
          masterDueDate: root.masterDueDate ?? null,
          divisionName: root.divisionId
            ? (divisionNameById.get(root.divisionId) ?? null)
            : null,
          progressRate: Math.round(progressRate * 100),
          taskCount: leaves.total,
          completedTaskCount: leaves.completed,
        }
      }),
    }
  }

  fastify.get(
    '/api/v1/projects',
    { preHandler: [requireApiKey] },
    async (_req, reply) => {
      const { summaries } = await buildProjectSummaries()
      return reply.send({
        items: summaries.sort((a, b) => a.code.localeCompare(b.code)),
      })
    },
  )

  fastify.get<{ Params: { id: string } }>(
    '/api/v1/projects/:id',
    { preHandler: [requireApiKey] },
    async (req, reply) => {
      const { summaries, projectRows } = await buildProjectSummaries(
        req.params.id,
      )
      const summary = summaries[0]
      if (!summary) {
        return reply.code(404).send({
          error:
            '対象が見つかりません（トップレベルプロジェクトのidを指定してください）',
        })
      }
      // 配下タスク（フラット＋parentIdで構造復元可能な形）
      const descendantIds = new Set<string>([summary.id])
      let changed = true
      while (changed) {
        changed = false
        for (const p of projectRows) {
          if (
            p.parentId &&
            descendantIds.has(p.parentId) &&
            !descendantIds.has(p.id)
          ) {
            descendantIds.add(p.id)
            changed = true
          }
        }
      }
      const tasks = projectRows
        .filter((p) => descendantIds.has(p.id) && p.id !== summary.id)
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          parentId: p.parentId,
          level: p.level,
          completed: p.completed ?? false,
          completedAt: p.completedAt ?? null,
          completionCriteria: p.completionCriteria ?? null,
        }))
      const schedule = (
        await db
          .select()
          .from(scheduleEntries)
          .where(eq(scheduleEntries.projectId, summary.id))
      ).map((e) => ({
        phaseKey: e.phaseKey,
        startDate: e.startDate,
        endDate: e.endDate,
      }))
      return reply.send({ ...summary, tasks, schedule })
    },
  )

  // EVM（PV/EV/AC週次系列）。EvmPanelと同一のshared関数・同一のBAC解決
  // （ベースライン優先→WBS積み上げ→予算枠フォールバック。非公開の設計文書）
  fastify.get<{ Params: { id: string } }>(
    '/api/v1/projects/:id/evm',
    { preHandler: [requireApiKey] },
    async (req, reply) => {
      const [
        projectRows,
        scheduleRows,
        progressRows,
        assignmentRows,
        memberRows,
        effortRows,
        wbsSettingsRows,
        baselineRows,
        breakdownRows,
        [settings],
      ] = await Promise.all([
        db.select().from(projects),
        db.select().from(scheduleEntries),
        db.select().from(projectProgressEntries),
        db.select().from(assignments),
        db.select().from(members),
        db.select().from(efforts),
        db.select().from(wbsColumnSettingsEntries),
        db.select().from(projectBaselines),
        db.select().from(budgetBreakdowns),
        db.select().from(appSettings).limit(1),
      ])
      const root = projectRows.find(
        (p) => p.id === req.params.id && p.level === 0,
      )
      if (!root) {
        return reply.code(404).send({
          error:
            '対象が見つかりません（トップレベルプロジェクトのidを指定してください）',
        })
      }
      const node = buildProjectTree(projectRows, root)
      const columns = wbsSettingsRows.find(
        (r) => r.projectId === root.id,
      )?.effortColumns
      const columnIds =
        !columns || columns.length === 0
          ? ['effort-1', 'effort-2', 'effort-3']
          : columns.filter((c) => c.enabled).map((c) => c.id)
      const effortEntries = effortRows.map((e) => ({
        id: e.id,
        projectId: e.projectId,
        columnId: e.columnId,
        value: e.value,
      }))

      // BAC: WBS工数があれば積み上げ、無ければ予算枠（BudgetBreakdown合計）へフォールバック
      const totalEffortDays =
        computeProjectTotalEffort([node], columnIds, effortEntries).get(
          root.id,
        ) ?? 0
      const workdaysPerMonth = settings?.workdaysPerMonth ?? 20
      const budgetTotal =
        totalEffortDays > 0
          ? calcProjectEstimateBudget(
              totalEffortDays / workdaysPerMonth,
              settings?.estimatedUnitPrice ?? 0,
              settings?.projectCoefficients?.[root.id] ??
                settings?.defaultCoefficient ??
                1,
            )
          : breakdownRows
              .filter((b) => b.projectId === root.id)
              .reduce((sum, b) => sum + b.amount, 0)

      const now = new Date()
      const fiscalYear =
        settings?.fiscalYear ??
        (now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1)
      const typedBaselines = baselineRows as unknown as ProjectBaseline[]
      const baseline = getActiveBaseline(typedBaselines, root.id)
      const hasSchedule = scheduleRows.some((e) => e.projectId === root.id)
      if (!hasSchedule && !baseline) {
        return reply.send({
          projectId: root.id,
          code: root.code,
          name: root.name,
          fiscalYear,
          eligible: false,
          reason:
            'スケジュール（工程の予定日）もベースライン（計画の凍結）も無いためPVを算出できません',
          weeks: [],
        })
      }

      const weekKeys = getFiscalYearWeekKeys(fiscalYear)
      const weeklyProgress =
        progressRows.find((e) => e.projectId === root.id)?.weeklyProgress ?? {}
      const weeks = calcEvmSeries({
        weekKeys,
        projectId: root.id,
        scheduleEntries: scheduleRows,
        weeklyProgress,
        assignments: assignmentRows as unknown as AssignmentEntry[],
        members: memberRows as unknown as Member[],
        budgetTotal,
        wbsSource: { node, columnIds, efforts: effortEntries },
        baseline,
        unitPriceMode: (root.evmUnitPriceMode ?? undefined) as
          | 'frozen'
          | 'latest'
          | undefined,
      })
      return reply.send({
        projectId: root.id,
        code: root.code,
        name: root.name,
        eligible: true,
        fiscalYear,
        unitPriceMode: root.evmUnitPriceMode ?? 'frozen',
        // PVとEVの基準（ベースラインがあればそのBAC、無ければ現行の見立て）
        bacAmount: baseline ? baseline.bacAmount : budgetTotal,
        baseline: baseline
          ? {
              version: baseline.version,
              approvedAt: baseline.approvedAt,
              reason: baseline.reason,
              bacAmount: baseline.bacAmount,
            }
          : null,
        weeks,
      })
    },
  )

  // アラート一覧（アラートセンター・日次ダイジェストと同一判定）
  fastify.get(
    '/api/v1/alerts',
    { preHandler: [requireApiKey] },
    async (_req, reply) => {
      const alerts = await collectServerAlerts(new Date())
      return reply.send({ items: alerts })
    },
  )
}
