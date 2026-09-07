import { create } from 'zustand'
import { getDataAdapter } from '@/infrastructure/adapters'
import { toast } from '@/shared/hooks/use-toast'
import type {
  CreateSkillEvaluation,
  CreateSkillRoadmapGoal,
  SkillEvaluation,
  SkillEvaluatorType,
  SkillLevel,
  SkillRoadmapGoal,
} from '@/shared/types'
import { getCurrentSkillLevel } from '@/shared/utils/skill-utils'
import {
  describeSaveFailure,
  isConflictError,
  isStorageQuotaError,
} from './persistence-error'

interface SkillState {
  skillEvaluations: SkillEvaluation[]
  skillRoadmapGoals: SkillRoadmapGoal[]

  // Lifecycle
  loadSkillData: () => void

  // Actions（いずれも追記専用。更新・削除APIは設けない。BudgetAdjustmentと同じパターン）
  addSkillEvaluation: (data: CreateSkillEvaluation) => SkillEvaluation
  addSkillRoadmapGoal: (data: CreateSkillRoadmapGoal) => SkillRoadmapGoal

  // Selectors
  getSkillEvaluationHistory: (
    memberId: string,
    techTagId: string,
  ) => SkillEvaluation[]
  getCurrentLevel: (
    memberId: string,
    techTagId: string,
    evaluatorType: SkillEvaluatorType,
  ) => SkillLevel | null
  getSkillRoadmapGoalHistory: (
    memberId: string,
    techTagId: string,
  ) => SkillRoadmapGoal[]
  getCurrentRoadmapGoal: (
    memberId: string,
    techTagId: string,
  ) => SkillRoadmapGoal | undefined
}

function notifyPersistenceFailure(action: string, error: unknown) {
  toast({
    // 楽観ロックの競合（412）は障害ではなく並行編集の結果なので、
    // 「失敗」ではなく再読込を促す文言にする
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `スキル情報の${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

export const useSkillStore = create<SkillState>()((set, get) => ({
  skillEvaluations: [],
  skillRoadmapGoals: [],

  loadSkillData: () => {
    getDataAdapter()
      .list('skillEvaluations')
      .then((skillEvaluations) => set({ skillEvaluations }))
      .catch((error: unknown) => notifyPersistenceFailure('読み込み', error))
    getDataAdapter()
      .list('skillRoadmapGoals')
      .then((skillRoadmapGoals) => set({ skillRoadmapGoals }))
      .catch((error: unknown) => notifyPersistenceFailure('読み込み', error))
  },

  // 追記専用（更新・削除APIなし）のため、楽観的更新は「失敗時に取り除く」ロールバックのみで済む
  addSkillEvaluation: (data) => {
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const newEvaluation: SkillEvaluation = { ...data, id, createdAt }

    set((state) => ({
      skillEvaluations: [...state.skillEvaluations, newEvaluation],
    }))
    getDataAdapter()
      .create('skillEvaluations', { ...data, createdAt }, { id })
      .then((created) => {
        set((state) => ({
          skillEvaluations: state.skillEvaluations.map((e) =>
            e.id === id ? created : e,
          ),
        }))
      })
      .catch((error: unknown) => {
        set((state) => ({
          skillEvaluations: state.skillEvaluations.filter((e) => e.id !== id),
        }))
        notifyPersistenceFailure('記録', error)
      })

    return newEvaluation
  },

  addSkillRoadmapGoal: (data) => {
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const newGoal: SkillRoadmapGoal = { ...data, id, createdAt }

    set((state) => ({
      skillRoadmapGoals: [...state.skillRoadmapGoals, newGoal],
    }))
    getDataAdapter()
      .create('skillRoadmapGoals', { ...data, createdAt }, { id })
      .then((created) => {
        set((state) => ({
          skillRoadmapGoals: state.skillRoadmapGoals.map((g) =>
            g.id === id ? created : g,
          ),
        }))
      })
      .catch((error: unknown) => {
        set((state) => ({
          skillRoadmapGoals: state.skillRoadmapGoals.filter((g) => g.id !== id),
        }))
        notifyPersistenceFailure('目標設定', error)
      })

    return newGoal
  },

  getSkillEvaluationHistory: (memberId, techTagId) => {
    return get()
      .skillEvaluations.filter(
        (e) => e.memberId === memberId && e.techTagId === techTagId,
      )
      .sort((a, b) => {
        const dateCompare = a.evaluatedAt.localeCompare(b.evaluatedAt)
        if (dateCompare !== 0) return dateCompare
        return a.createdAt.localeCompare(b.createdAt)
      })
  },

  getCurrentLevel: (memberId, techTagId, evaluatorType) => {
    return getCurrentSkillLevel(
      get().skillEvaluations,
      memberId,
      techTagId,
      evaluatorType,
    )
  },

  getSkillRoadmapGoalHistory: (memberId, techTagId) => {
    return get()
      .skillRoadmapGoals.filter(
        (g) => g.memberId === memberId && g.techTagId === techTagId,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  getCurrentRoadmapGoal: (memberId, techTagId) => {
    return get().getSkillRoadmapGoalHistory(memberId, techTagId)[0]
  },
}))
