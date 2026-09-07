import { eq, sql } from 'drizzle-orm'
import type { Database } from '@/shared/types'
import { db } from './client.js'
import {
  actualsImportLogs,
  aiUsageEntries,
  aiUsageMemberAllocations,
  aiUsageProviders,
  appSettings,
  assignmentNotes,
  assignmentSnapshots,
  assignments,
  billingMilestones,
  budgetAdjustments,
  budgetBreakdowns,
  changeRequests,
  companies,
  csvMappingProfiles,
  divisionBudgets,
  divisions,
  documentTemplates,
  efforts,
  estimateSnapshots,
  members,
  monthlyActualsConfirmations,
  monthlyCloseEvents,
  personnelPlans,
  phaseDependencies,
  projectBaselines,
  projectProgressEntries,
  projects,
  riskEntries,
  saasContracts,
  scheduleEntries,
  scheduleSettingsEntries,
  sections,
  skillEvaluations,
  skillRoadmapGoals,
  taskSyncLogs,
  techTagCategories,
  techTagSubCategories,
  techTags,
  wbsColumnSettingsEntries,
  wbsTemplates,
} from './schema.js'

/**
 * クライアントのZodスキーマはcreatedAt/updatedAtをISO文字列で保持するが、
 * Drizzleのtimestamp列（既定のdateモード）はJS Dateを要求する。指定フィールドのみ
 * string→Dateへ変換する（他フィールドはそのまま）。
 *
 * 戻り値はあえてDrizzleの厳密なInsert型と結合しない（`any[]`）。Zod検証済みの
 * Database全体を丸ごと投入する一括移行処理の性質上、テーブルごとの挿入型と1:1で
 * 対応させる型定義は保守コストに見合わない。実行時の整合性はTestcontainers統合テストで担保する。
 */
function withDates<T extends Record<string, unknown>>(
  rows: T[],
  dateFields: ReadonlyArray<keyof T>,
  // biome-ignore lint/suspicious/noExplicitAny: 上記コメント参照（挿入型との厳密結合を避ける）
): any[] {
  return rows.map((row) => {
    const converted: Record<string, unknown> = { ...row }
    for (const field of dateFields) {
      const value = row[field]
      if (typeof value === 'string') {
        converted[field as string] = new Date(value)
      }
    }
    return converted
  })
}

// TRUNCATE ... CASCADEはFKの参照順序に関わらず安全に全行削除できるため、
// business-dataの全テーブルを対象にする（users/refreshTokens/ssoProviderConfigsは
// 認証基盤であり、データ移行の対象外として明示的に除外する）
const BUSINESS_TABLE_NAMES = [
  'ai_usage_member_allocations',
  'ai_usage_entries',
  'ai_usage_providers',
  'budget_breakdowns',
  'budget_adjustments',
  'division_budgets',
  'saas_contracts',
  'personnel_plans',
  'skill_evaluations',
  'skill_roadmap_goals',
  'project_progress_entries',
  'project_baselines',
  'change_requests',
  'billing_milestones',
  'phase_dependencies',
  'schedule_entries',
  'assignments',
  'assignment_notes',
  'assignment_snapshots',
  'risk_entries',
  'estimate_snapshots',
  'efforts',
  'projects',
  'tech_tags',
  'tech_tag_sub_categories',
  'tech_tag_categories',
  'members',
  'sections',
  'divisions',
  'companies',
  'wbs_templates',
  'document_templates',
  'monthly_actuals_confirmations',
  'actuals_import_logs',
  'monthly_close_events',
  'task_sync_logs',
  'csv_mapping_profiles',
  'schedule_settings_entries',
  'wbs_column_settings_entries',
  'app_settings',
] as const

/**
 * DataAdapter.importDatabase()のpostgres実装本体。全business-dataを一括置換する
 * 破壊的操作（非公開の設計文書「one-shot cutover」方針、
 * 移行スクリプトからの一度限りの投入を主用途とする）。
 * 24テーブル＋app_settingsをトランザクション内でTRUNCATE→再投入する。
 *
 * projectsは自己参照FK（parentId）を持つため、投入順序に関わらず整合性を保てるよう
 * 1段階目はparentId=nullで全件挿入し、2段階目でparentIdを更新する2パス方式にする。
 */
export async function importDatabaseData(data: Database): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql.raw(
        `TRUNCATE TABLE ${BUSINESS_TABLE_NAMES.map((t) => `"${t}"`).join(', ')} CASCADE`,
      ),
    )

    if (data.divisions?.length) {
      await tx
        .insert(divisions)
        .values(withDates(data.divisions, ['createdAt', 'updatedAt']))
    }
    if (data.sections?.length) {
      await tx
        .insert(sections)
        .values(withDates(data.sections, ['createdAt', 'updatedAt']))
    }
    if (data.companies?.length) {
      await tx
        .insert(companies)
        .values(withDates(data.companies, ['createdAt', 'updatedAt']))
    }
    if (data.techTagCategories?.length) {
      await tx
        .insert(techTagCategories)
        .values(withDates(data.techTagCategories, ['createdAt', 'updatedAt']))
    }
    if (data.techTagSubCategories?.length) {
      await tx
        .insert(techTagSubCategories)
        .values(
          withDates(data.techTagSubCategories, ['createdAt', 'updatedAt']),
        )
    }
    if (data.techTags?.length) {
      await tx
        .insert(techTags)
        .values(withDates(data.techTags, ['createdAt', 'updatedAt']))
    }
    if (data.members?.length) {
      await tx
        .insert(members)
        .values(withDates(data.members, ['createdAt', 'updatedAt']))
    }
    if (data.projects?.length) {
      const withDatesApplied = withDates(data.projects, [
        'createdAt',
        'updatedAt',
      ])
      // 1段階目: parentIdを一旦nullにして全件挿入（親の存在有無を気にせず投入できる）
      await tx
        .insert(projects)
        .values(withDatesApplied.map((p) => ({ ...p, parentId: null })))
      // 2段階目: 実際のparentIdへ更新
      for (const p of data.projects) {
        if (p.parentId) {
          await tx
            .update(projects)
            .set({ parentId: p.parentId })
            .where(eq(projects.id, p.id))
        }
      }
    }
    if (data.efforts?.length) {
      await tx.insert(efforts).values(data.efforts)
    }
    if (data.assignments?.length) {
      await tx
        .insert(assignments)
        .values(withDates(data.assignments, ['createdAt', 'updatedAt']))
    }
    if (data.assignmentNotes?.length) {
      await tx
        .insert(assignmentNotes)
        .values(withDates(data.assignmentNotes, ['createdAt', 'updatedAt']))
    }
    if (data.assignmentSnapshots?.length) {
      // takenAtはtext列（ISO文字列を無変換往復）のため日付変換の対象にしない
      await tx
        .insert(assignmentSnapshots)
        .values(withDates(data.assignmentSnapshots, ['createdAt']))
    }
    if (data.riskEntries?.length) {
      await tx
        .insert(riskEntries)
        .values(withDates(data.riskEntries, ['createdAt', 'updatedAt']))
    }
    if (data.estimateSnapshots?.length) {
      // takenAtはtext列（ISO文字列を無変換往復）のため日付変換の対象にしない
      await tx
        .insert(estimateSnapshots)
        .values(withDates(data.estimateSnapshots, ['createdAt']))
    }
    if (data.scheduleEntries?.length) {
      await tx.insert(scheduleEntries).values(data.scheduleEntries)
    }
    if (data.dependencies?.length) {
      await tx.insert(phaseDependencies).values(data.dependencies)
    }
    if (data.wbsTemplates?.length) {
      await tx
        .insert(wbsTemplates)
        .values(withDates(data.wbsTemplates, ['createdAt', 'updatedAt']))
    }
    if (data.scheduleSettingsEntries?.length) {
      await tx
        .insert(scheduleSettingsEntries)
        .values(withDates(data.scheduleSettingsEntries, ['lastModified']))
    }
    if (data.wbsColumnSettingsEntries?.length) {
      await tx
        .insert(wbsColumnSettingsEntries)
        .values(withDates(data.wbsColumnSettingsEntries, ['lastModified']))
    }
    if (data.divisionBudgets?.length) {
      await tx
        .insert(divisionBudgets)
        .values(withDates(data.divisionBudgets, ['createdAt', 'updatedAt']))
    }
    if (data.budgetAdjustments?.length) {
      await tx
        .insert(budgetAdjustments)
        .values(withDates(data.budgetAdjustments, ['createdAt']))
    }
    if (data.budgetBreakdowns?.length) {
      await tx
        .insert(budgetBreakdowns)
        .values(withDates(data.budgetBreakdowns, ['createdAt']))
    }
    if (data.aiUsageProviders?.length) {
      await tx
        .insert(aiUsageProviders)
        .values(withDates(data.aiUsageProviders, ['createdAt', 'updatedAt']))
    }
    if (data.aiUsageEntries?.length) {
      await tx.insert(aiUsageEntries).values(data.aiUsageEntries)
    }
    if (data.aiUsageMemberAllocations?.length) {
      await tx
        .insert(aiUsageMemberAllocations)
        .values(data.aiUsageMemberAllocations)
    }
    if (data.saasContracts?.length) {
      await tx
        .insert(saasContracts)
        .values(withDates(data.saasContracts, ['createdAt', 'updatedAt']))
    }
    if (data.personnelPlans?.length) {
      await tx
        .insert(personnelPlans)
        .values(withDates(data.personnelPlans, ['createdAt', 'updatedAt']))
    }
    if (data.skillEvaluations?.length) {
      await tx
        .insert(skillEvaluations)
        .values(withDates(data.skillEvaluations, ['createdAt']))
    }
    if (data.skillRoadmapGoals?.length) {
      await tx
        .insert(skillRoadmapGoals)
        .values(withDates(data.skillRoadmapGoals, ['createdAt']))
    }
    if (data.projectProgressEntries?.length) {
      await tx
        .insert(projectProgressEntries)
        .values(
          withDates(data.projectProgressEntries, ['createdAt', 'updatedAt']),
        )
    }
    if (data.projectBaselines?.length) {
      await tx
        .insert(projectBaselines)
        .values(withDates(data.projectBaselines, ['createdAt']))
    }
    if (data.changeRequests?.length) {
      await tx
        .insert(changeRequests)
        .values(withDates(data.changeRequests, ['createdAt', 'updatedAt']))
    }
    if (data.billingMilestones?.length) {
      await tx
        .insert(billingMilestones)
        .values(withDates(data.billingMilestones, ['createdAt', 'updatedAt']))
    }
    if (data.documentTemplates?.length) {
      await tx
        .insert(documentTemplates)
        .values(withDates(data.documentTemplates, ['createdAt', 'updatedAt']))
    }
    // confirmedAt/importedAtはtext列（ISO文字列を無変換往復）のためwithDates不要
    if (data.monthlyActualsConfirmations?.length) {
      await tx
        .insert(monthlyActualsConfirmations)
        .values(data.monthlyActualsConfirmations)
    }
    if (data.actualsImportLogs?.length) {
      await tx.insert(actualsImportLogs).values(data.actualsImportLogs)
    }
    if (data.monthlyCloseEvents?.length) {
      await tx.insert(monthlyCloseEvents).values(data.monthlyCloseEvents)
    }
    if (data.taskSyncLogs?.length) {
      await tx.insert(taskSyncLogs).values(data.taskSyncLogs)
    }
    if (data.csvMappingProfiles?.length) {
      await tx
        .insert(csvMappingProfiles)
        .values(withDates(data.csvMappingProfiles, ['createdAt', 'updatedAt']))
    }

    await tx.insert(appSettings).values({
      id: 1,
      version: data.version,
      fiscalYear: data.fiscalYear,
      estimatedUnitPrice: data.estimatedUnitPrice ?? null,
      defaultCoefficient: data.defaultCoefficient ?? null,
      projectCoefficients: data.projectCoefficients ?? {},
      exchangeRateHistory: data.exchangeRateHistory ?? [],
      workdaysPerMonth: data.workdaysPerMonth ?? null,
      skillReviewCycleMonths: data.skillReviewCycleMonths ?? null,
      baselineStaleThreshold: data.baselineStaleThreshold ?? null,
      hoursPerDay: data.hoursPerDay ?? null,
      hoursPerFunctionPoint: data.hoursPerFunctionPoint ?? null,
      wbsSettings: data.wbsSettings ?? null,
      metadata: data.metadata,
    })
  })
}
