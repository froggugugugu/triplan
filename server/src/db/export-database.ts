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
 * DataAdapter.loadDatabase()のpostgres実装本体。全業務エンティティテーブル＋
 * app_settings（単一行のシステム設定）を読み出し、クライアントのDatabaseSchemaと
 * 同じ形に組み立てる。移行スクリプト・管理系バックアップ機能の両方から利用する想定
 * （`routes/database.ts`のGET /api/database/exportはこの関数を呼ぶだけの薄いラッパー）。
 */
export async function exportDatabaseData(): Promise<Database> {
  const [
    settingsRows,
    projectsRows,
    membersRows,
    effortsRows,
    scheduleEntriesRows,
    phaseDependenciesRows,
    assignmentsRows,
    assignmentNotesRows,
    assignmentSnapshotsRows,
    riskEntriesRows,
    estimateSnapshotsRows,
    techTagsRows,
    techTagCategoriesRows,
    techTagSubCategoriesRows,
    divisionsRows,
    sectionsRows,
    companiesRows,
    divisionBudgetsRows,
    budgetAdjustmentsRows,
    budgetBreakdownsRows,
    aiUsageEntriesRows,
    aiUsageMemberAllocationsRows,
    aiUsageProvidersRows,
    saasContractsRows,
    personnelPlansRows,
    skillEvaluationsRows,
    skillRoadmapGoalsRows,
    projectProgressEntriesRows,
    projectBaselinesRows,
    changeRequestsRows,
    billingMilestonesRows,
    wbsTemplatesRows,
    scheduleSettingsEntriesRows,
    wbsColumnSettingsEntriesRows,
    documentTemplatesRows,
    monthlyActualsConfirmationsRows,
    actualsImportLogsRows,
    monthlyCloseEventsRows,
    taskSyncLogsRows,
    csvMappingProfilesRows,
  ] = await Promise.all([
    db.select().from(appSettings),
    db.select().from(projects),
    db.select().from(members),
    db.select().from(efforts),
    db.select().from(scheduleEntries),
    db.select().from(phaseDependencies),
    db.select().from(assignments),
    db.select().from(assignmentNotes),
    db.select().from(assignmentSnapshots),
    db.select().from(riskEntries),
    db.select().from(estimateSnapshots),
    db.select().from(techTags),
    db.select().from(techTagCategories),
    db.select().from(techTagSubCategories),
    db.select().from(divisions),
    db.select().from(sections),
    db.select().from(companies),
    db.select().from(divisionBudgets),
    db.select().from(budgetAdjustments),
    db.select().from(budgetBreakdowns),
    db.select().from(aiUsageEntries),
    db.select().from(aiUsageMemberAllocations),
    db.select().from(aiUsageProviders),
    db.select().from(saasContracts),
    db.select().from(personnelPlans),
    db.select().from(skillEvaluations),
    db.select().from(skillRoadmapGoals),
    db.select().from(projectProgressEntries),
    db.select().from(projectBaselines),
    db.select().from(changeRequests),
    db.select().from(billingMilestones),
    db.select().from(wbsTemplates),
    db.select().from(scheduleSettingsEntries),
    db.select().from(wbsColumnSettingsEntries),
    db.select().from(documentTemplates),
    db.select().from(monthlyActualsConfirmations),
    db.select().from(actualsImportLogs),
    db.select().from(monthlyCloseEvents),
    db.select().from(taskSyncLogs),
    db.select().from(csvMappingProfiles),
  ])

  const settings = settingsRows[0]

  // Postgresの未設定値はNULLで返るが、対応するZodフィールドは`.optional()`のみ
  // （`.nullable()`を伴わない）ため、nullのままだとDatabaseSchema.parse()に弾かれる
  // （Project.description等で実際に反証・発見したバグ）。null→undefinedへ変換して
  // 「キー自体が存在しない」というJSONの表現に合わせる
  const normalizedProjects = projectsRows.map((p) => ({
    ...p,
    description: p.description ?? undefined,
    background: p.background ?? undefined,
    purpose: p.purpose ?? undefined,
    completionCriteria: p.completionCriteria ?? undefined,
    // evmUnitPriceModeも.optional()のみ（enum、nullable非対応）。DBのNULL（未設定=
    // frozen扱い）をundefinedへ変換しないとimport往復のDatabaseSchema.parse()に弾かれる
    // （の統合テスト拡充で顕在化した既存バグ）
    evmUnitPriceMode: p.evmUnitPriceMode ?? undefined,
  }))
  const normalizedBudgetBreakdowns = budgetBreakdownsRows.map((b) => ({
    ...b,
    estimateAmount: b.estimateAmount ?? undefined,
    coefficient: b.coefficient ?? undefined,
  }))
  // levelColorsはnullable jsonb列（未設定時null）だが、対応するZodフィールドは
  // .optional()のみ（.nullable()を伴わない）のため、null→undefined変換が必要
  // （Project.description等と同じ既知のパターン、docs/development-patterns.md参照）
  const normalizedWbsColumnSettingsEntries = wbsColumnSettingsEntriesRows.map(
    (w) => ({
      ...w,
      levelColors: w.levelColors ?? undefined,
    }),
  )
  // note/sourceRefsは.optional()のみのZodフィールドのためnull→undefined変換（同上）
  const normalizedChangeRequests = changeRequestsRows.map((c) => ({
    ...c,
    note: c.note ?? undefined,
  }))
  const normalizedBillingMilestones = billingMilestonesRows.map((b) => ({
    ...b,
    note: b.note ?? undefined,
  }))
  const normalizedDocumentTemplates = documentTemplatesRows.map((d) => ({
    ...d,
    sourceRefs: d.sourceRefs ?? undefined,
  }))

  const assembled = {
    version: settings?.version ?? '1.0.0',
    fiscalYear: settings?.fiscalYear ?? new Date().getFullYear(),
    estimatedUnitPrice: settings?.estimatedUnitPrice ?? undefined,
    defaultCoefficient: settings?.defaultCoefficient ?? undefined,
    projectCoefficients: settings?.projectCoefficients ?? {},
    exchangeRateHistory: settings?.exchangeRateHistory ?? [],
    workdaysPerMonth: settings?.workdaysPerMonth ?? undefined,
    skillReviewCycleMonths: settings?.skillReviewCycleMonths ?? undefined,
    baselineStaleThreshold: settings?.baselineStaleThreshold ?? undefined,
    hoursPerDay: settings?.hoursPerDay ?? undefined,
    hoursPerFunctionPoint: settings?.hoursPerFunctionPoint ?? undefined,
    projects: normalizedProjects,
    members: membersRows,
    efforts: effortsRows,
    wbsSettings: settings?.wbsSettings ?? undefined,
    scheduleEntries: scheduleEntriesRows,
    dependencies: phaseDependenciesRows,
    assignments: assignmentsRows,
    assignmentNotes: assignmentNotesRows,
    assignmentSnapshots: assignmentSnapshotsRows,
    riskEntries: riskEntriesRows,
    estimateSnapshots: estimateSnapshotsRows,
    techTags: techTagsRows,
    techTagCategories: techTagCategoriesRows,
    techTagSubCategories: techTagSubCategoriesRows,
    divisions: divisionsRows,
    sections: sectionsRows,
    companies: companiesRows,
    divisionBudgets: divisionBudgetsRows,
    budgetAdjustments: budgetAdjustmentsRows,
    budgetBreakdowns: normalizedBudgetBreakdowns,
    aiUsageEntries: aiUsageEntriesRows,
    aiUsageMemberAllocations: aiUsageMemberAllocationsRows,
    aiUsageProviders: aiUsageProvidersRows,
    saasContracts: saasContractsRows,
    personnelPlans: personnelPlansRows,
    skillEvaluations: skillEvaluationsRows,
    skillRoadmapGoals: skillRoadmapGoalsRows,
    projectProgressEntries: projectProgressEntriesRows,
    projectBaselines: projectBaselinesRows,
    changeRequests: normalizedChangeRequests,
    billingMilestones: normalizedBillingMilestones,
    wbsTemplates: wbsTemplatesRows,
    scheduleSettingsEntries: scheduleSettingsEntriesRows,
    wbsColumnSettingsEntries: normalizedWbsColumnSettingsEntries,
    documentTemplates: normalizedDocumentTemplates,
    monthlyActualsConfirmations: monthlyActualsConfirmationsRows,
    actualsImportLogs: actualsImportLogsRows,
    monthlyCloseEvents: monthlyCloseEventsRows,
    taskSyncLogs: taskSyncLogsRows,
    csvMappingProfiles: csvMappingProfilesRows.map((row) => ({
      ...row,
      options: row.options ?? undefined,
    })),
    metadata: settings?.metadata ?? {
      lastModified: new Date().toISOString(),
      createdBy: 'system',
      version: settings?.version ?? '1.0.0',
    },
  }

  // Drizzle行はDB上はcamelCaseの平坦なオブジェクトでクライアントのZod型と実質同一だが、
  // createdAt/updatedAtがDate型（DatabaseSchemaはISO文字列）である点、および
  // 行ごとに独立した推論型のため配列全体としての構造的な互換性はTS上表現しづらい点から
  // ここではキャストに留める。DateはFastifyのJSONシリアライズ（Date.toJSON）で
  // ISO文字列化されるため、HTTPレスポンスとしてはDatabaseSchemaと一致する
  // （直接DatabaseSchema.parse()すると文字列化前のDateで弾かれるため、ここでは検証しない）
  // biome-ignore lint/suspicious/noExplicitAny: 上記コメント参照
  return assembled as any as Database
}
