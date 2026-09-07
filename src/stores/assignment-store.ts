import { create } from 'zustand'
import { getDataAdapter } from '@/infrastructure/adapters'
import { toast } from '@/shared/hooks/use-toast'
import type {
  AssignmentEntry,
  CreateAssignmentEntry,
} from '@/shared/types/assignment'
import { useActualsStore } from '@/stores/actuals-store'
import {
  describeSaveFailure,
  isConflictError,
  isStorageQuotaError,
} from './persistence-error'

interface AssignmentState {
  assignments: AssignmentEntry[]

  // Actions
  loadAssignments: () => void
  upsertAssignment: (data: CreateAssignmentEntry) => void
  updateMonthlyValue: (id: string, monthKey: string, value: number) => void
  // 実績の例外入力。計画値と同値なら該当月のキーを削除して「計画どおり」に戻す。
  // nullは明示的なクリア（計画どおりへ戻す）
  updateActualMonthlyValue: (
    id: string,
    monthKey: string,
    value: number | null,
  ) => void
  // 計画外の実績を追加する（P1-a月次実績画面）。該当のアサインレコードが無ければ
  // monthlyValues空で新規作成し、actualMonthlyValuesのみに値を積む
  addActualEntry: (
    projectId: string,
    taskId: string,
    memberId: string,
    monthKey: string,
    value: number,
  ) => void
  deleteAssignment: (id: string) => void
  deleteByTask: (taskId: string) => void

  // Selectors
  getByProject: (projectId: string) => AssignmentEntry[]
  getByTask: (taskId: string) => AssignmentEntry[]
  getByMember: (memberId: string) => AssignmentEntry[]
  getMemberMonthlyTotal: (memberId: string, monthKey: string) => number
  getMemberMonthlyBreakdown: (
    memberId: string,
    monthKey: string,
  ) => { projectId: string; taskId: string; value: number }[]
}

function notifyPersistenceFailure(action: string, error: unknown) {
  toast({
    // 楽観ロックの競合（412）は障害ではなく並行編集の結果なので、
    // 「失敗」ではなく再読込を促す文言にする
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `アサインの${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

/**
 * 締め済み月の一覧（P1-b月次締めハードロック、非公開の設計文書）。
 * actuals-storeの締めイベントから導出する（stores間はgetState()参照、
 * development-patterns.md §1.2）
 */
function getClosedMonths(): Set<string> {
  const state = useActualsStore.getState()
  const closed = new Set<string>()
  for (const month of new Set(state.monthlyCloseEvents.map((e) => e.month))) {
    if (state.isMonthClosed(month)) closed.add(month)
  }
  return closed
}

function notifyClosedMonth(month: string) {
  toast({
    title: `${month}は締め済みのため変更できません`,
    description: '修正が必要な場合は月次実績画面で締めを解除してください',
    variant: 'destructive',
  })
}

/**
 * 締め済み月に値（計画>0 または 実績の明示キー）を持つか。
 * 該当レコードの削除は「事実の消去」として拒否する（DESIGN 決定事項3）
 */
function findClosedMonthWithValue(
  entry: AssignmentEntry,
  closedMonths: Set<string>,
): string | null {
  for (const m of closedMonths) {
    if (
      (entry.monthlyValues[m] ?? 0) > 0 ||
      entry.actualMonthlyValues?.[m] !== undefined
    ) {
      return m
    }
  }
  return null
}

export const useAssignmentStore = create<AssignmentState>()((set, get) => ({
  assignments: [],

  loadAssignments: () => {
    getDataAdapter()
      .list('assignments')
      .then((assignments) => set({ assignments }))
      .catch((error: unknown) => notifyPersistenceFailure('読み込み', error))
  },

  // 楽観的更新（docs/project.md「17ストアのDataAdapter配線」参照）。upsertパターンは
  // schedule-store.tsのupsertEntryと同じ設計（projectId×taskId×memberIdの複合キーでupsert）。
  // 1.0人月上限バリデーションはAssignmentTreeGrid.tsx側の入力時ブロック（保存前拒否）が一次防御、
  // サーバー側beforeCreate/beforeUpdate（assignments.ts）が二重防御。ここでの失敗時ロールバックは
  // 主にサーバー側の二重防御が発動した場合（多人数運用での競合等）の受け皿
  upsertAssignment: (data) => {
    const previous = get().assignments
    const existing = previous.find(
      (a) =>
        a.projectId === data.projectId &&
        a.taskId === data.taskId &&
        a.memberId === data.memberId,
    )

    // 締め済み月の値が変わる書込みを拒否する（変更されない月キーは通す＝差分判定。
    // 更新パスはmonthlyValuesのみ書き込むため計画の差分だけを見る。
    // 新規パスは計画・実績の両方が書き込まれるため両方を見る）
    const closedMonths = getClosedMonths()
    for (const m of closedMonths) {
      if (existing) {
        if ((existing.monthlyValues[m] ?? 0) !== (data.monthlyValues[m] ?? 0)) {
          notifyClosedMonth(m)
          return
        }
      } else if (
        (data.monthlyValues[m] ?? 0) !== 0 ||
        data.actualMonthlyValues?.[m] !== undefined
      ) {
        notifyClosedMonth(m)
        return
      }
    }
    const now = new Date().toISOString()

    if (existing) {
      set({
        assignments: previous.map((a) =>
          a.id === existing.id
            ? { ...a, monthlyValues: data.monthlyValues, updatedAt: now }
            : a,
        ),
      })
      getDataAdapter()
        .update(
          'assignments',
          existing.id,
          { monthlyValues: data.monthlyValues, updatedAt: now },
          // 楽観ロック。アサイン表は複数人が同時に触る前提のため
          // 後勝ちの静かな上書きが最も実害を生む
          { expectedUpdatedAt: existing.updatedAt },
        )
        .then((saved) => {
          // サーバーが確定した行（特にサーバー時計のupdatedAt）をローカルへ反映する。
          // 反映しないと次回の楽観ロック期待値がクライアント時計のまま残り、
          // 単独ユーザーでも2回目の更新が必ず412になる
          set((state) => ({
            assignments: state.assignments.map((x) =>
              x.id === existing.id ? saved : x,
            ),
          }))
        })
        .catch((error: unknown) => {
          set({ assignments: previous })
          notifyPersistenceFailure('更新', error)
        })
    } else {
      const id = crypto.randomUUID()
      const newEntry: AssignmentEntry = {
        ...data,
        id,
        createdAt: now,
        updatedAt: now,
      }
      set({ assignments: [...previous, newEntry] })
      getDataAdapter()
        .create(
          'assignments',
          { ...data, createdAt: now, updatedAt: now },
          { id },
        )
        .then((created) => {
          set((state) => ({
            assignments: state.assignments.map((a) =>
              a.id === id ? created : a,
            ),
          }))
        })
        .catch((error: unknown) => {
          set((state) => ({
            assignments: state.assignments.filter((a) => a.id !== id),
          }))
          notifyPersistenceFailure('追加', error)
        })
    }
  },

  updateMonthlyValue: (id, monthKey, value) => {
    // 締め済み月は計画も凍結する（AC解決がactual ?? plannedのため、計画を動かすと
    // 明示実績の無い行の事実が動いてしまう。DESIGN §3.1の核心）
    if (useActualsStore.getState().isMonthClosed(monthKey)) {
      notifyClosedMonth(monthKey)
      return
    }
    const previous = get().assignments
    const existing = previous.find((a) => a.id === id)
    if (!existing) return

    const now = new Date().toISOString()
    const newMonthlyValues = { ...existing.monthlyValues }
    if (value === 0) {
      delete newMonthlyValues[monthKey]
    } else {
      newMonthlyValues[monthKey] = value
    }

    set({
      assignments: previous.map((a) =>
        a.id === id
          ? { ...a, monthlyValues: newMonthlyValues, updatedAt: now }
          : a,
      ),
    })
    getDataAdapter()
      .update(
        'assignments',
        id,
        { monthlyValues: newMonthlyValues, updatedAt: now },
        // 楽観ロック
        { expectedUpdatedAt: previous.find((a) => a.id === id)?.updatedAt },
      )
      .then((saved) => {
        // サーバーが確定した行（特にサーバー時計のupdatedAt）をローカルへ反映する。
        // 反映しないと次回の楽観ロック期待値がクライアント時計のまま残り、
        // 単独ユーザーでも2回目の更新が必ず412になる
        set((state) => ({
          assignments: state.assignments.map((x) => (x.id === id ? saved : x)),
        }))
      })
      .catch((error: unknown) => {
        set({ assignments: previous })
        notifyPersistenceFailure('更新', error)
      })
  },

  // 実績の例外入力（非公開の設計文書）。計画値と同じ値を入力した場合は
  // キー自体を削除し、「無操作＝計画どおり」の状態へ戻す
  // （未入力を欠測ではなく「変更なし」として扱う設計原則を、データ側でも保つ）。
  // value=nullは明示的なクリア（計画どおりへ戻す）操作（P1-a月次実績画面）
  updateActualMonthlyValue: (id, monthKey, value) => {
    if (useActualsStore.getState().isMonthClosed(monthKey)) {
      notifyClosedMonth(monthKey)
      return
    }
    const previous = get().assignments
    const existing = previous.find((a) => a.id === id)
    if (!existing) return

    const now = new Date().toISOString()
    const newActuals = { ...(existing.actualMonthlyValues ?? {}) }
    const planned = existing.monthlyValues[monthKey] ?? 0
    if (value === null || value === planned) {
      delete newActuals[monthKey]
    } else {
      newActuals[monthKey] = value
    }

    set({
      assignments: previous.map((a) =>
        a.id === id
          ? { ...a, actualMonthlyValues: newActuals, updatedAt: now }
          : a,
      ),
    })
    getDataAdapter()
      .update(
        'assignments',
        id,
        { actualMonthlyValues: newActuals, updatedAt: now },
        // 楽観ロック
        { expectedUpdatedAt: previous.find((a) => a.id === id)?.updatedAt },
      )
      .then((saved) => {
        // サーバーが確定した行（特にサーバー時計のupdatedAt）をローカルへ反映する。
        // 反映しないと次回の楽観ロック期待値がクライアント時計のまま残り、
        // 単独ユーザーでも2回目の更新が必ず412になる
        set((state) => ({
          assignments: state.assignments.map((x) => (x.id === id ? saved : x)),
        }))
      })
      .catch((error: unknown) => {
        set({ assignments: previous })
        notifyPersistenceFailure('実績の更新', error)
      })
  },

  addActualEntry: (projectId, taskId, memberId, monthKey, value) => {
    if (useActualsStore.getState().isMonthClosed(monthKey)) {
      notifyClosedMonth(monthKey)
      return
    }
    const previous = get().assignments
    const existing = previous.find(
      (a) =>
        a.projectId === projectId &&
        a.taskId === taskId &&
        a.memberId === memberId,
    )
    if (existing) {
      // 既存レコードがあれば実績の例外入力として積む（同値正規化も同じ規則に従う）
      get().updateActualMonthlyValue(existing.id, monthKey, value)
      return
    }

    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const newEntry: AssignmentEntry = {
      id,
      projectId,
      taskId,
      memberId,
      monthlyValues: {},
      actualMonthlyValues: { [monthKey]: value },
      createdAt: now,
      updatedAt: now,
    }
    set({ assignments: [...previous, newEntry] })
    getDataAdapter()
      .create(
        'assignments',
        {
          projectId,
          taskId,
          memberId,
          monthlyValues: {},
          actualMonthlyValues: { [monthKey]: value },
          createdAt: now,
          updatedAt: now,
        },
        { id },
      )
      .then((created) => {
        set((state) => ({
          assignments: state.assignments.map((a) =>
            a.id === id ? created : a,
          ),
        }))
      })
      .catch((error: unknown) => {
        set((state) => ({
          assignments: state.assignments.filter((a) => a.id !== id),
        }))
        notifyPersistenceFailure('計画外実績の追加', error)
      })
  },

  deleteAssignment: (id) => {
    const previous = get().assignments
    const target = previous.find((a) => a.id === id)
    if (target) {
      const violation = findClosedMonthWithValue(target, getClosedMonths())
      if (violation) {
        toast({
          title: `締め済みの月（${violation}）の実績を含むため削除できません`,
          variant: 'destructive',
        })
        return
      }
    }
    set({ assignments: previous.filter((a) => a.id !== id) })
    getDataAdapter()
      .remove('assignments', id)
      .catch((error: unknown) => {
        set({ assignments: previous })
        notifyPersistenceFailure('削除', error)
      })
  },

  deleteByTask: (taskId) => {
    const previous = get().assignments
    const targets = previous.filter((a) => a.taskId === taskId)
    const targetIds = targets.map((a) => a.id)
    if (targetIds.length === 0) return

    // 1件でも締め済み月の値を含めば一括削除全体を拒否する（部分削除は混乱のもと）
    const closedMonths = getClosedMonths()
    for (const target of targets) {
      const violation = findClosedMonthWithValue(target, closedMonths)
      if (violation) {
        toast({
          title: `締め済みの月（${violation}）の実績を含むため削除できません`,
          variant: 'destructive',
        })
        return
      }
    }

    set({ assignments: previous.filter((a) => a.taskId !== taskId) })
    Promise.all(
      targetIds.map((id) => getDataAdapter().remove('assignments', id)),
    ).catch((error: unknown) => {
      set({ assignments: previous })
      notifyPersistenceFailure('削除', error)
    })
  },

  getByProject: (projectId) => {
    return get().assignments.filter((a) => a.projectId === projectId)
  },

  getByTask: (taskId) => {
    return get().assignments.filter((a) => a.taskId === taskId)
  },

  getByMember: (memberId) => {
    return get().assignments.filter((a) => a.memberId === memberId)
  },

  getMemberMonthlyTotal: (memberId, monthKey) => {
    return get()
      .assignments.filter((a) => a.memberId === memberId)
      .reduce((sum, a) => sum + (a.monthlyValues[monthKey] ?? 0), 0)
  },

  getMemberMonthlyBreakdown: (memberId, monthKey) => {
    return get()
      .assignments.filter(
        (a) => a.memberId === memberId && a.monthlyValues[monthKey] != null,
      )
      .map((a) => ({
        projectId: a.projectId,
        taskId: a.taskId,
        value: a.monthlyValues[monthKey] ?? 0,
      }))
  },
}))
