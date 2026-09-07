import { create } from 'zustand'
import { getDataAdapter } from '@/infrastructure/adapters'
import { toast } from '@/shared/hooks/use-toast'
import type { Member } from '@/shared/types/member'
import {
  PERSONNEL_PLAN_CATEGORIES,
  type PersonnelPlanCategory,
  type PersonnelPlanEntry,
  type UpdatePersonnelPlanEntry,
} from '@/shared/types/personnel-plan'
import {
  calcActiveHeadcountByMonth,
  calcMembersRevenueBudgetMonthly,
  isProperMember,
} from '@/shared/utils/budget-utils'
import { useCompaniesStore } from './companies-store'
import { useMembersStore } from './members-store'
import {
  describeSaveFailure,
  isConflictError,
  isForbiddenError,
  isStorageQuotaError,
} from './persistence-error'
import { useTeamStore } from './team-store'

/**
 * 「人件費（プロパー/プロパー以外）」区分か（在籍メンバーから自動集計する区分）
 */
function isPersonnelCategory(category: PersonnelPlanCategory): boolean {
  return category === 'personnel_internal' || category === 'personnel_external'
}

/**
 * プロパー区分か（人件費・追加予定どちらの軸でも共通）
 */
function isInternalCategory(category: PersonnelPlanCategory): boolean {
  return category === 'personnel_internal' || category === 'planned_internal'
}

/**
 * 部門（課経由）に所属する全メンバーを取得する
 */
function getDivisionMembers(divisionId: string): Member[] {
  const sectionIds = new Set(
    useTeamStore
      .getState()
      .sections.filter((s) => s.divisionId === divisionId)
      .map((s) => s.id),
  )
  return useMembersStore
    .getState()
    .members.filter((m) => m.sectionId !== null && sectionIds.has(m.sectionId))
}

interface PersonnelPlanState {
  personnelPlans: PersonnelPlanEntry[]

  // Actions
  loadPersonnelPlans: () => void
  // 部門×年度の4固定区分（人件費プロパー/プロパー以外、追加予定プロパー/プロパー以外）の
  // レコード存在を保証し、その4件を返す。既存レコードは上書きしない
  getOrCreateAllCategories: (
    divisionId: string,
    fiscalYear: number,
  ) => PersonnelPlanEntry[]
  // monthlyHeadcount（予定人数）・monthlyRealizedHeadcount（追加予定区分の実現人数）の更新
  updatePersonnelPlanEntry: (data: UpdatePersonnelPlanEntry) => void

  // Selectors
  getPersonnelPlansByDivision: (
    divisionId: string,
    fiscalYear: number,
  ) => PersonnelPlanEntry[]
  getPersonnelPlanByCategory: (
    divisionId: string,
    fiscalYear: number,
    category: PersonnelPlanCategory,
  ) => PersonnelPlanEntry | undefined
  // 実績人数（月別）。人件費区分はメンバー在籍実績から自動算出、
  // 追加予定区分はmonthlyRealizedHeadcount（手入力値）をそのまま返す
  getActiveHeadcountForCategory: (
    divisionId: string,
    fiscalYear: number,
    category: PersonnelPlanCategory,
    startMonth: number,
  ) => Record<string, number>
  // 実績金額（月別）。人件費区分のみ算出（在籍メンバーの単価全額計上）。
  // 追加予定区分は未在籍のため常に空オブジェクト
  getRevenueBudgetForCategory: (
    divisionId: string,
    fiscalYear: number,
    category: PersonnelPlanCategory,
    startMonth: number,
  ) => Record<string, number>
}

function notifyPersistenceFailure(action: string, error: unknown) {
  toast({
    // 楽観ロックの競合（412）は障害ではなく並行編集の結果なので、
    // 「失敗」ではなく再読込を促す文言にする
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `人員計画の${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

export const usePersonnelPlanStore = create<PersonnelPlanState>()(
  (set, get) => ({
    personnelPlans: [],

    loadPersonnelPlans: () => {
      getDataAdapter()
        .list('personnelPlans')
        .then((personnelPlans) => set({ personnelPlans }))
        .catch((error: unknown) => {
          // 権限が無いだけの読み込み失敗は通知しない
          if (isForbiddenError(error)) return
          notifyPersistenceFailure('読み込み', error)
        })
    },

    // 楽観的更新。ローカルstateの4区分存在チェック→不足分の同期set()という順序を維持することで、
    // 呼び出し元（PersonnelPlanPanel.tsx）が期待する「即座に4件が返る」同期契約を保つ
    // （wbs-template-storeのseedStandardTemplateと異なり、この関数の戻り値は実際に消費されうる
    // ため、非同期化はしない）。DataAdapter.create()にはoptions.idで確定id同様の安定idを渡す
    getOrCreateAllCategories: (divisionId, fiscalYear) => {
      const existing = get().getPersonnelPlansByDivision(divisionId, fiscalYear)
      const existingCategories = new Set(existing.map((p) => p.category))
      const missingCategories = PERSONNEL_PLAN_CATEGORIES.filter(
        (category) => !existingCategories.has(category),
      )

      if (missingCategories.length === 0) return existing

      const now = new Date().toISOString()
      const newEntries: PersonnelPlanEntry[] = missingCategories.map(
        (category) => ({
          id: crypto.randomUUID(),
          divisionId,
          fiscalYear,
          category,
          monthlyHeadcount: {},
          monthlyRealizedHeadcount: {},
          createdAt: now,
          updatedAt: now,
        }),
      )

      set((state) => ({
        personnelPlans: [...state.personnelPlans, ...newEntries],
      }))
      Promise.all(
        newEntries.map((entry) => {
          const { id, ...data } = entry
          return getDataAdapter()
            .create('personnelPlans', data, { id })
            .then((created) => ({ id, created }))
        }),
      )
        .then((results) => {
          set((state) => ({
            personnelPlans: state.personnelPlans.map((p) => {
              const match = results.find((r) => r.id === p.id)
              return match ? match.created : p
            }),
          }))
        })
        .catch((error: unknown) => {
          const newIds = new Set(newEntries.map((e) => e.id))
          set((state) => ({
            personnelPlans: state.personnelPlans.filter(
              (p) => !newIds.has(p.id),
            ),
          }))
          notifyPersistenceFailure('区分初期化', error)
        })

      return get().getPersonnelPlansByDivision(divisionId, fiscalYear)
    },

    updatePersonnelPlanEntry: (data) => {
      const previous = get().personnelPlans
      const now = new Date().toISOString()
      set({
        personnelPlans: previous.map((p) =>
          p.id === data.id ? { ...p, ...data, updatedAt: now } : p,
        ),
      })
      const { id, ...patch } = data
      getDataAdapter()
        .update(
          'personnelPlans',
          id,
          { ...patch, updatedAt: now },
          // 楽観ロック
          { expectedUpdatedAt: previous.find((p) => p.id === id)?.updatedAt },
        )
        .then((saved) => {
          // サーバーが確定した行（特にサーバー時計のupdatedAt）をローカルへ反映する。
          // 反映しないと次回の楽観ロック期待値がクライアント時計のまま残り、
          // 単独ユーザーでも2回目の更新が必ず412になる
          set((state) => ({
            personnelPlans: state.personnelPlans.map((x) =>
              x.id === id ? saved : x,
            ),
          }))
        })
        .catch((error: unknown) => {
          set({ personnelPlans: previous })
          notifyPersistenceFailure('更新', error)
        })
    },

    getPersonnelPlansByDivision: (divisionId, fiscalYear) => {
      return get().personnelPlans.filter(
        (p) => p.divisionId === divisionId && p.fiscalYear === fiscalYear,
      )
    },

    getPersonnelPlanByCategory: (divisionId, fiscalYear, category) => {
      return get()
        .getPersonnelPlansByDivision(divisionId, fiscalYear)
        .find((p) => p.category === category)
    },

    getActiveHeadcountForCategory: (
      divisionId,
      fiscalYear,
      category,
      startMonth,
    ) => {
      if (isPersonnelCategory(category)) {
        const members = getDivisionMembers(divisionId)
        const companies = useCompaniesStore.getState().companies
        return calcActiveHeadcountByMonth(
          members,
          companies,
          isInternalCategory(category),
          fiscalYear,
          startMonth,
        )
      }

      const entry = get().getPersonnelPlanByCategory(
        divisionId,
        fiscalYear,
        category,
      )
      return entry?.monthlyRealizedHeadcount ?? {}
    },

    getRevenueBudgetForCategory: (
      divisionId,
      fiscalYear,
      category,
      startMonth,
    ) => {
      if (!isPersonnelCategory(category)) return {}

      const companies = useCompaniesStore.getState().companies
      const members = getDivisionMembers(divisionId).filter(
        (m) => isProperMember(m, companies) === isInternalCategory(category),
      )
      return calcMembersRevenueBudgetMonthly(members, fiscalYear, startMonth)
    },
  }),
)
