import { jsonStorage } from '@/infrastructure/storage'
import { generateDemoData } from '@/shared/data/demo-data'
import { useActualsStore } from './actuals-store'
import { useAppStore } from './app-store'
import { useAssignmentNoteStore } from './assignment-note-store'
import { useAssignmentStore } from './assignment-store'
import { useBillingMilestoneStore } from './billing-milestone-store'
import { useBudgetStore } from './budget-store'
import { useChangeRequestStore } from './change-request-store'
import { useCompaniesStore } from './companies-store'
import { useCsvMappingStore } from './csv-mapping-store'
import { useDocumentTemplateStore } from './document-template-store'
import { useEffortsStore } from './efforts-store'
import { useEstimateStore } from './estimate-store'
import { useMembersStore } from './members-store'
import { usePersonnelPlanStore } from './personnel-plan-store'
import { useProjectBaselineStore } from './project-baseline-store'
import { useProjectProgressStore } from './project-progress-store'
import { useProjectsStore } from './projects-store'
import { useRiskStore } from './risk-store'
import { useScheduleSettingsStore } from './schedule-settings-store'
import { useScheduleStore } from './schedule-store'
import { useSkillStore } from './skill-store'
import { useTaskSyncStore } from './task-sync-store'
import { useTeamStore } from './team-store'
import { useTechTagsStore } from './tech-tags-store'
import { useWbsSettingsStore } from './wbs-settings-store'
import { useWbsTemplateStore } from './wbs-template-store'

/**
 * 永続化層（localStorage/API）から全業務ストアを再読込する。
 * デモデータ投入・一括クリア・JSONインポート・初期設定ウィザードのデモ切り替え等、
 * 「永続化データを一括で差し替えた後」に呼ぶ。
 *
 * 元は`DataExport.tsx`のローカル関数（14ストア）だったが、初期設定ウィザードからも
 * 使うためstores層へ移設した。移設時の反証で、後発ストア7つ
 * （actuals/taskSync/wbsTemplate/documentTemplate/projectBaseline/changeRequest/
 * billingMilestone）が再読込対象から漏れており、クリア・デモ投入後もメモリ上に
 * 古いデータが残る潜在バグを発見・修正済み（全22ストアを網羅する）。
 * auth-store（認証状態）・tour-store（永続化なし）は対象外。
 */
export function reloadAllStores(): void {
  useProjectsStore.getState().loadProjects()
  useMembersStore.getState().loadMembers()
  useTeamStore.getState().loadTeam()
  useAssignmentStore.getState().loadAssignments()
  useAssignmentNoteStore.getState().loadAssignmentNotes()
  useEffortsStore.getState().loadEfforts()
  useScheduleStore.getState().loadSchedule()
  useTechTagsStore.getState().loadTechTags()
  useCompaniesStore.getState().loadCompanies()
  useBudgetStore.getState().loadBudgetData()
  usePersonnelPlanStore.getState().loadPersonnelPlans()
  useSkillStore.getState().loadSkillData()
  useProjectProgressStore.getState().loadProjectProgress()
  useScheduleSettingsStore.getState().loadScheduleSettings()
  useWbsSettingsStore.getState().loadWbsSettings()
  useActualsStore.getState().loadActualsData()
  useTaskSyncStore.getState().loadTaskSyncLogs()
  useWbsTemplateStore.getState().loadWbsTemplates()
  useDocumentTemplateStore.getState().loadDocumentTemplates()
  useProjectBaselineStore.getState().loadProjectBaselines()
  useRiskStore.getState().loadRiskEntries()
  useEstimateStore.getState().loadEstimateSnapshots()
  useChangeRequestStore.getState().loadChangeRequests()
  useBillingMilestoneStore.getState().loadBillingMilestones()
  useCsvMappingStore.getState().loadCsvMappingProfiles()
}

/**
 * デモデータを投入し全ストアを再読込する（既存データは上書き）。
 * `demoDataActive`フラグを立て、ダッシュボードの「はじめに」カードが試用中表示に変わる
 * （初期設定ウィザード・DataExportの両方から使う共通経路）
 */
export function loadDemoData(fiscalYear: number): void {
  const { database } = generateDemoData(fiscalYear)
  jsonStorage.save(database)
  reloadAllStores()
  useAppStore.getState().setDemoDataActive(true)
}

/**
 * 全業務データを削除し全ストアを再読込する。
 * レガシーpersistキー（schedule-settings-store/wbs-settings-storeが旧Zustand persist時代に
 * 使っていた独立localStorageキー）も明示的に削除する。「全データクリア」は利用者が確定的な
 * データ破棄を意図した操作のため、通常のロード時とは異なりレガシーキーも対象に含める。
 * デモ試用中フラグも解除する
 */
export function clearAllBusinessData(): void {
  jsonStorage.clear()
  localStorage.removeItem('wbs-settings-storage')
  localStorage.removeItem('schedule-settings-storage')
  reloadAllStores()
  useAppStore.getState().setDemoDataActive(false)
}
