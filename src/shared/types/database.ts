import { z } from 'zod'
import {
  ActualsImportLogSchema,
  MonthlyActualsConfirmationSchema,
  MonthlyCloseEventSchema,
} from './actuals'
import { AssignmentEntrySchema } from './assignment'
import { AssignmentNoteSchema } from './assignment-note'
import { AssignmentSnapshotSchema } from './assignment-snapshot'
import { BillingMilestoneSchema } from './billing-milestone'
import {
  AiUsageEntrySchema,
  AiUsageMemberAllocationSchema,
  AiUsageProviderSchema,
  BudgetAdjustmentSchema,
  BudgetBreakdownSchema,
  DivisionBudgetSchema,
  ExchangeRateEntrySchema,
  SaasContractSchema,
} from './budget'
import { ChangeRequestSchema } from './change-request'
import { CompanySchema } from './company'
import { CsvMappingProfileSchema } from './csv-mapping'
import { DivisionSchema } from './division'
import { DocumentTemplateSchema } from './document-template'
import { EffortEntrySchema } from './effort'
import { EstimateSnapshotSchema } from './estimate-snapshot'
import { MemberSchema } from './member'
import { PersonnelPlanEntrySchema } from './personnel-plan'
import { ProjectSchema } from './project'
import { ProjectBaselineSchema } from './project-baseline'
import { ProjectProgressEntrySchema } from './project-progress'
import { RiskEntrySchema } from './risk'
import {
  PhaseDependencySchema,
  PhaseSettingsEntrySchema,
  ScheduleEntrySchema,
} from './schedule'
import { SectionSchema } from './section'
import { SkillEvaluationSchema, SkillRoadmapGoalSchema } from './skill'
import { TaskSyncLogSchema } from './task-sync'
import { TechTagSchema } from './tech-tag'
import {
  TechTagCategorySchema,
  TechTagSubCategorySchema,
} from './tech-tag-category'
import { WbsSettingsEntrySchema, WbsSettingsSchema } from './wbs-settings'
import { WbsTemplateSchema } from './wbs-template'

/**
 * メタデータスキーマ
 */
export const MetadataSchema = z.object({
  lastModified: z.string().datetime(),
  createdBy: z.string(),
  version: z.string(),
})
export type Metadata = z.infer<typeof MetadataSchema>

/**
 * データベーススキーマ（JSON永続化用）
 */
export const DatabaseSchema = z.object({
  version: z.string(),
  fiscalYear: z.number().int().min(2000).max(2100),
  // 概算単価（万円、全社共通・単一値）。人員計画・案件タブの概算予算算出に使用する
  estimatedUnitPrice: z.number().min(0).optional(),
  // 案件タブの係数デフォルト値（全社共通・単一値）。案件別係数が未設定の場合に使用する
  defaultCoefficient: z.number().positive().optional(),
  // 案件別の係数（key: projectId、value: 係数）。未設定の案件はdefaultCoefficientを使用する
  projectCoefficients: z.record(z.string(), z.number().positive()).optional(),
  // 為替レート設定の履歴（1ドルあたりの円、全社共通）。AI利用費（＄建て）を他の万円建て集計へ
  // 合算する際、対象月に有効なレートで換算するために使用する（requirements10）
  exchangeRateHistory: z.array(ExchangeRateEntrySchema).optional(),
  // ── 業務定数の設定化（P0-a）。未設定時は従来のハードコード既定値
  // （WORKDAYS_PER_MONTH=20 / SKILL_REVIEW_CYCLE_MONTHS=3 / BASELINE_STALE_THRESHOLD=0.1）に
  // フォールバックする（決定論は「設定値の明示」で維持） ──
  // 人月換算の1人月あたり稼働日数（人日/人月）
  workdaysPerMonth: z.number().positive().optional(),
  // スキル定期評価レビューの周期（月）
  skillReviewCycleMonths: z.number().int().positive().optional(),
  // ベースライン乖離の再凍結警告閾値（比率、0.1=±10%）
  baselineStaleThreshold: z.number().positive().max(1).optional(),
  // CSV取込の時間→人日換算（時間/人日、既定8。P1-a）
  hoursPerDay: z.number().positive().optional(),
  // 簡易FPの人時/FP（既定10=HOURS_PER_FUNCTION_POINT）
  hoursPerFunctionPoint: z.number().positive().optional(),
  // プロジェクトサマリーの判定閾値（既定値=SUMMARY_BUDGET_PROGRESS_GAP_THRESHOLD
  // =0.15 / SUMMARY_SPI_WARNING_THRESHOLD=0.9へフォールバック）
  // R4 予算先行: 予算消化率−進捗率の警告閾値（比率、0.15=15pt）
  summaryBudgetProgressGapThreshold: z.number().positive().max(1).optional(),
  // R5 SPI低下: SPI（EV/PV）の警告閾値（これ未満で警告）
  summarySpiWarningThreshold: z.number().positive().max(2).optional(),
  projects: z.array(ProjectSchema),
  members: z.array(MemberSchema),
  efforts: z.array(EffortEntrySchema).optional(),
  wbsSettings: WbsSettingsSchema.optional(),
  scheduleEntries: z.array(ScheduleEntrySchema).optional(),
  dependencies: z.array(PhaseDependencySchema).optional(),
  // 案件別の工程設定（PhaseSettings、案件×1レコード）。旧schedule-settings-store（Zustand persist、
  // 独立localStorageキー`schedule-settings-storage`）からの移行先。17ストアのDataAdapter配線・第11弾
  scheduleSettingsEntries: z.array(PhaseSettingsEntrySchema).optional(),
  // 案件別のWBS列設定（WbsSettings、案件×1レコード）。旧wbs-settings-store（Zustand persist、
  // 独立localStorageキー`wbs-settings-storage`）からの移行先。上記と同じくDatabase.wbsSettings
  // （全社単一設定、未使用フィールド）とは別物
  wbsColumnSettingsEntries: z.array(WbsSettingsEntrySchema).optional(),
  assignments: z.array(AssignmentEntrySchema).optional(),
  // 体制メモ・アサインスナップショット。後方互換のためoptional
  assignmentNotes: z.array(AssignmentNoteSchema).optional(),
  assignmentSnapshots: z.array(AssignmentSnapshotSchema).optional(),
  techTags: z.array(TechTagSchema).optional(),
  techTagCategories: z.array(TechTagCategorySchema).optional(),
  techTagSubCategories: z.array(TechTagSubCategorySchema).optional(),
  divisions: z.array(DivisionSchema).optional(),
  sections: z.array(SectionSchema).optional(),
  companies: z.array(CompanySchema).optional(),
  divisionBudgets: z.array(DivisionBudgetSchema).optional(),
  budgetAdjustments: z.array(BudgetAdjustmentSchema).optional(),
  budgetBreakdowns: z.array(BudgetBreakdownSchema).optional(),
  aiUsageEntries: z.array(AiUsageEntrySchema).optional(),
  aiUsageMemberAllocations: z.array(AiUsageMemberAllocationSchema).optional(),
  // AI利用費プロバイダマスタ（部門ごとのAnthropic/OpenAI/Microsoft等の契約）
  aiUsageProviders: z.array(AiUsageProviderSchema).optional(),
  saasContracts: z.array(SaasContractSchema).optional(),
  personnelPlans: z.array(PersonnelPlanEntrySchema).optional(),
  // スキル評価履歴（成長記録）・成長ロードマップ目標。いずれも追記専用
  skillEvaluations: z.array(SkillEvaluationSchema).optional(),
  skillRoadmapGoals: z.array(SkillRoadmapGoalSchema).optional(),
  // 案件×週次の出来高（進捗率）スナップショット。EVM（PV/EV/AC）のEV算出に使用する
  projectProgressEntries: z.array(ProjectProgressEntrySchema).optional(),
  projectBaselines: z.array(ProjectBaselineSchema).optional(),
  riskEntries: z.array(RiskEntrySchema).optional(),
  // 見積スナップショット。後方互換のためoptional
  estimateSnapshots: z.array(EstimateSnapshotSchema).optional(),
  changeRequests: z.array(ChangeRequestSchema).optional(),
  billingMilestones: z.array(BillingMilestoneSchema).optional(),
  // WBS標準テンプレートのストック（ユーザーが複数保持・編集できる）。
  // WBS画面の「テンプレートを適用」機能から選択して案件配下に一括生成する
  wbsTemplates: z.array(WbsTemplateSchema).optional(),
  // ドキュメントテンプレートのストック。WBSテンプレートのノードから
  // documentTemplateIdsで紐づけて参照する
  documentTemplates: z.array(DocumentTemplateSchema).optional(),
  // 月次実績の確定マーク・CSV取込履歴（P1-a）
  monthlyActualsConfirmations: z
    .array(MonthlyActualsConfirmationSchema)
    .optional(),
  actualsImportLogs: z.array(ActualsImportLogSchema).optional(),
  monthlyCloseEvents: z.array(MonthlyCloseEventSchema).optional(),
  taskSyncLogs: z.array(TaskSyncLogSchema).optional(),
  // 汎用CSVマッピングプロファイル。未作成なら省略されるためoptional
  csvMappingProfiles: z.array(CsvMappingProfileSchema).optional(),
  metadata: MetadataSchema,
})
export type Database = z.infer<typeof DatabaseSchema>

/**
 * 全社共通の単一設定値（appSettings）の部分更新スキーマ（P0-b）。
 * `DataAdapter.updateAppSettings()`のペイロードと、サーバー側
 * `PATCH /api/appSettings`のバリデーションで共用する（クライアント/サーバーの契約統一）。
 * 各フィールドの意味は`DatabaseSchema`の同名フィールドを参照。
 */
export const AppSettingsPatchSchema = z.object({
  estimatedUnitPrice: z.number().min(0).optional(),
  defaultCoefficient: z.number().positive().optional(),
  projectCoefficients: z.record(z.string(), z.number().positive()).optional(),
  exchangeRateHistory: z.array(ExchangeRateEntrySchema).optional(),
  workdaysPerMonth: z.number().positive().optional(),
  skillReviewCycleMonths: z.number().int().positive().optional(),
  baselineStaleThreshold: z.number().positive().max(1).optional(),
  hoursPerDay: z.number().positive().optional(),
  hoursPerFunctionPoint: z.number().positive().optional(),
  summaryBudgetProgressGapThreshold: z.number().positive().max(1).optional(),
  summarySpiWarningThreshold: z.number().positive().max(2).optional(),
})
export type AppSettingsPatch = z.infer<typeof AppSettingsPatchSchema>

/**
 * 年度月（1-12）を実際の月（4月-翌3月）に変換
 * @param fiscalMonth 年度月（1〜12）
 * @param startMonth 年度開始月（デフォルト: 4 = 4月始まり）
 */
export function fiscalMonthToCalendarMonth(
  fiscalMonth: number,
  startMonth = 4,
): number {
  return ((fiscalMonth + startMonth - 2) % 12) + 1
}

/**
 * 実際の月を年度月に変換
 * @param calendarMonth 実際の月（1〜12）
 * @param startMonth 年度開始月（デフォルト: 4 = 4月始まり）
 */
export function calendarMonthToFiscalMonth(
  calendarMonth: number,
  startMonth = 4,
): number {
  return calendarMonth >= startMonth
    ? calendarMonth - startMonth + 1
    : calendarMonth + 12 - startMonth + 1
}

/**
 * 年度月のラベルを取得（4月, 5月, ...）
 * @param fiscalMonth 年度月（1〜12）
 * @param startMonth 年度開始月（デフォルト: 4 = 4月始まり）
 */
export function getFiscalMonthLabel(
  fiscalMonth: number,
  startMonth = 4,
): string {
  const calendarMonth = fiscalMonthToCalendarMonth(fiscalMonth, startMonth)
  return `${calendarMonth}月`
}
