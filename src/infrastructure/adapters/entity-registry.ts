import type {
  ActualsImportLog,
  AiUsageEntry,
  AiUsageMemberAllocation,
  AiUsageProvider,
  AssignmentEntry,
  AssignmentNote,
  AssignmentSnapshot,
  BillingMilestone,
  BudgetAdjustment,
  BudgetBreakdown,
  ChangeRequest,
  Company,
  CsvMappingProfile,
  Database,
  Division,
  DivisionBudget,
  DocumentTemplate,
  EffortEntry,
  EstimateSnapshot,
  Member,
  MonthlyActualsConfirmation,
  MonthlyCloseEvent,
  PersonnelPlanEntry,
  PhaseDependency,
  PhaseSettingsEntry,
  Project,
  ProjectBaseline,
  ProjectProgressEntry,
  RiskEntry,
  SaasContract,
  ScheduleEntry,
  Section,
  SkillEvaluation,
  SkillRoadmapGoal,
  TaskSyncLog,
  TechTag,
  TechTagCategory,
  TechTagSubCategory,
  WbsSettingsEntry,
  WbsTemplate,
} from '@/shared/types'

/**
 * DataAdapterが扱うエンティティの一覧と型。
 * 非公開の設計文書/§5.2に基づく。
 *
 * 対象外（意図的に除外）: wbsSettings・estimatedUnitPrice・defaultCoefficient・
 * projectCoefficients・exchangeRateHistory・metadata は単一設定値/構造化オブジェクトであり
 * list/create/update/removeというレコード単位CRUDの形に馴染まない。これらは各ストアが
 * 個別に扱う（app-store・tour-storeがAPI化対象外なのと同じ整理、§1.1方針6）。
 */
export interface EntityMap {
  projects: Project
  members: Member
  divisions: Division
  sections: Section
  companies: Company
  assignments: AssignmentEntry
  assignmentNotes: AssignmentNote
  assignmentSnapshots: AssignmentSnapshot
  efforts: EffortEntry
  scheduleEntries: ScheduleEntry
  dependencies: PhaseDependency
  techTags: TechTag
  techTagCategories: TechTagCategory
  techTagSubCategories: TechTagSubCategory
  divisionBudgets: DivisionBudget
  budgetAdjustments: BudgetAdjustment
  budgetBreakdowns: BudgetBreakdown
  aiUsageEntries: AiUsageEntry
  aiUsageMemberAllocations: AiUsageMemberAllocation
  aiUsageProviders: AiUsageProvider
  saasContracts: SaasContract
  personnelPlans: PersonnelPlanEntry
  skillEvaluations: SkillEvaluation
  skillRoadmapGoals: SkillRoadmapGoal
  projectProgressEntries: ProjectProgressEntry
  projectBaselines: ProjectBaseline
  riskEntries: RiskEntry
  estimateSnapshots: EstimateSnapshot
  changeRequests: ChangeRequest
  billingMilestones: BillingMilestone
  wbsTemplates: WbsTemplate
  documentTemplates: DocumentTemplate
  scheduleSettingsEntries: PhaseSettingsEntry
  wbsColumnSettingsEntries: WbsSettingsEntry
  monthlyActualsConfirmations: MonthlyActualsConfirmation
  actualsImportLogs: ActualsImportLog
  monthlyCloseEvents: MonthlyCloseEvent
  taskSyncLogs: TaskSyncLog
  csvMappingProfiles: CsvMappingProfile
}

export type EntityName = keyof EntityMap

// エンティティごとの正確なCreate/Update型（CreateProject等）は命名・省略フィールドが個体差あるため、
// 汎用アダプタでは意図的にOmit<T,'id'>/Partial<T>へ簡略化する
export type EntityCreateInput<E extends EntityName> = Omit<EntityMap[E], 'id'>
export type EntityUpdateInput<E extends EntityName> = Partial<
  Omit<EntityMap[E], 'id'>
>

/**
 * EntityName → Database（永続化スキーマ）の配列フィールド名の対応。
 * LocalJsonAdapterが`jsonStorage.load()`の返り値から該当配列を読み書きする際に使用する。
 */
export const ENTITY_TO_DB_FIELD: Record<EntityName, keyof Database> = {
  projects: 'projects',
  members: 'members',
  divisions: 'divisions',
  sections: 'sections',
  companies: 'companies',
  assignments: 'assignments',
  assignmentNotes: 'assignmentNotes',
  assignmentSnapshots: 'assignmentSnapshots',
  efforts: 'efforts',
  scheduleEntries: 'scheduleEntries',
  dependencies: 'dependencies',
  techTags: 'techTags',
  techTagCategories: 'techTagCategories',
  techTagSubCategories: 'techTagSubCategories',
  divisionBudgets: 'divisionBudgets',
  budgetAdjustments: 'budgetAdjustments',
  budgetBreakdowns: 'budgetBreakdowns',
  aiUsageEntries: 'aiUsageEntries',
  aiUsageMemberAllocations: 'aiUsageMemberAllocations',
  aiUsageProviders: 'aiUsageProviders',
  saasContracts: 'saasContracts',
  personnelPlans: 'personnelPlans',
  skillEvaluations: 'skillEvaluations',
  skillRoadmapGoals: 'skillRoadmapGoals',
  projectProgressEntries: 'projectProgressEntries',
  projectBaselines: 'projectBaselines',
  riskEntries: 'riskEntries',
  estimateSnapshots: 'estimateSnapshots',
  changeRequests: 'changeRequests',
  billingMilestones: 'billingMilestones',
  wbsTemplates: 'wbsTemplates',
  documentTemplates: 'documentTemplates',
  scheduleSettingsEntries: 'scheduleSettingsEntries',
  wbsColumnSettingsEntries: 'wbsColumnSettingsEntries',
  monthlyActualsConfirmations: 'monthlyActualsConfirmations',
  actualsImportLogs: 'actualsImportLogs',
  monthlyCloseEvents: 'monthlyCloseEvents',
  taskSyncLogs: 'taskSyncLogs',
  csvMappingProfiles: 'csvMappingProfiles',
}
