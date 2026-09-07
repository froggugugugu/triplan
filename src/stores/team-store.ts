import { create } from 'zustand'
import { ApiError, getDataAdapter } from '@/infrastructure/adapters'
import { toast } from '@/shared/hooks/use-toast'
import type { Division } from '@/shared/types/division'
import type { Section } from '@/shared/types/section'
import { useMembersStore } from './members-store'
import {
  describeSaveFailure,
  isConflictError,
  isStorageQuotaError,
} from './persistence-error'

interface TeamState {
  divisions: Division[]
  sections: Section[]

  // Actions
  loadTeam: () => void
  addDivision: (name: string) => Division
  updateDivision: (id: string, name: string) => void
  deleteDivision: (id: string) => void

  addSection: (divisionId: string, name: string) => Section
  updateSection: (id: string, name: string) => void
  deleteSection: (id: string) => void

  // Selectors
  getSectionsByDivision: (divisionId: string) => Section[]
  getDivisionById: (id: string) => Division | undefined
  getSectionById: (id: string) => Section | undefined
}

function notifyPersistenceFailure(action: string, error: unknown) {
  toast({
    // 楽観ロックの競合（412）は障害ではなく並行編集の結果なので、
    // 「失敗」ではなく再読込を促す文言にする
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `チーム情報の${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

export const useTeamStore = create<TeamState>()((set, get) => ({
  divisions: [],
  sections: [],

  loadTeam: () => {
    getDataAdapter()
      .list('divisions')
      .then((divisions) => set({ divisions }))
      .catch((error: unknown) => notifyPersistenceFailure('読み込み', error))
    getDataAdapter()
      .list('sections')
      .then((sections) => set({ sections }))
      .catch((error: unknown) => notifyPersistenceFailure('読み込み', error))
  },

  // 楽観的更新。addDivision()の戻り値idはTeamPage.tsxのhandleAddSection等が
  // 同期的にaddSection(divisionId, ...)へ渡すため、idの安定性が必須
  addDivision: (name) => {
    const now = new Date().toISOString()
    const maxSortOrder = get().divisions.reduce(
      (max, d) => Math.max(max, d.sortOrder),
      -1,
    )
    const id = crypto.randomUUID()
    const newDivision: Division = {
      id,
      name,
      sortOrder: maxSortOrder + 1,
      createdAt: now,
      updatedAt: now,
    }

    set((state) => ({ divisions: [...state.divisions, newDivision] }))
    getDataAdapter()
      .create(
        'divisions',
        {
          name,
          sortOrder: newDivision.sortOrder,
          createdAt: now,
          updatedAt: now,
        },
        { id },
      )
      .then((created) => {
        set((state) => ({
          divisions: state.divisions.map((d) => (d.id === id ? created : d)),
        }))
      })
      .catch((error: unknown) => {
        set((state) => ({
          divisions: state.divisions.filter((d) => d.id !== id),
        }))
        notifyPersistenceFailure('部門追加', error)
      })

    return newDivision
  },

  updateDivision: (id, name) => {
    const previous = get().divisions
    const now = new Date().toISOString()
    set({
      divisions: previous.map((d) =>
        d.id === id ? { ...d, name, updatedAt: now } : d,
      ),
    })
    getDataAdapter()
      .update(
        'divisions',
        id,
        { name, updatedAt: now },
        // 楽観ロック
        { expectedUpdatedAt: previous.find((d) => d.id === id)?.updatedAt },
      )
      .then((saved) => {
        // サーバーが確定した行（特にサーバー時計のupdatedAt）をローカルへ反映する。
        // 反映しないと次回の楽観ロック期待値がクライアント時計のまま残り、
        // 単独ユーザーでも2回目の更新が必ず412になる
        set((state) => ({
          divisions: state.divisions.map((x) => (x.id === id ? saved : x)),
        }))
      })
      .catch((error: unknown) => {
        set({ divisions: previous })
        notifyPersistenceFailure('部門更新', error)
      })
  },

  deleteDivision: (id) => {
    const previousDivisions = get().divisions
    const previousSections = get().sections
    const childSectionIds = previousSections
      .filter((s) => s.divisionId === id)
      .map((s) => s.id)

    set({
      divisions: previousDivisions.filter((d) => d.id !== id),
      sections: previousSections.filter((s) => s.divisionId !== id),
    })
    // postgresモードではsections.divisionIdが自己参照ではないが親FK（ON DELETE CASCADE）のため、
    // divisionsの削除が先に処理されるとsectionsの個別remove()が404になりうる（並行実行の
    // Promise.allでは処理順序が保証されない。projects-store.tsのdeleteProjectと同じ実Postgresでの
    // 反証で発見・修正した既知のパターン）。対象が既に存在しないことは「削除する」という目的を
    // 既に満たしているため404はエラー扱いしない
    const tolerate404 = (error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return
      throw error
    }
    Promise.all([
      getDataAdapter().remove('divisions', id).catch(tolerate404),
      ...childSectionIds.map((sectionId) =>
        getDataAdapter().remove('sections', sectionId).catch(tolerate404),
      ),
    ]).catch((error: unknown) => {
      set({ divisions: previousDivisions, sections: previousSections })
      notifyPersistenceFailure('部門削除', error)
    })

    // メンバーのsectionIdをnullに更新
    if (childSectionIds.length > 0) {
      const membersStore = useMembersStore.getState()
      const affectedMembers = membersStore.members.filter(
        (m) => m.sectionId && childSectionIds.includes(m.sectionId),
      )
      for (const member of affectedMembers) {
        membersStore.updateMember({ id: member.id, sectionId: null })
      }
    }
  },

  addSection: (divisionId, name) => {
    const now = new Date().toISOString()
    const siblingSections = get().sections.filter(
      (s) => s.divisionId === divisionId,
    )
    const maxSortOrder = siblingSections.reduce(
      (max, s) => Math.max(max, s.sortOrder),
      -1,
    )
    const id = crypto.randomUUID()
    const newSection: Section = {
      id,
      divisionId,
      name,
      sortOrder: maxSortOrder + 1,
      createdAt: now,
      updatedAt: now,
    }

    set((state) => ({ sections: [...state.sections, newSection] }))
    getDataAdapter()
      .create(
        'sections',
        {
          divisionId,
          name,
          sortOrder: newSection.sortOrder,
          createdAt: now,
          updatedAt: now,
        },
        { id },
      )
      .then((created) => {
        set((state) => ({
          sections: state.sections.map((s) => (s.id === id ? created : s)),
        }))
      })
      .catch((error: unknown) => {
        set((state) => ({
          sections: state.sections.filter((s) => s.id !== id),
        }))
        notifyPersistenceFailure('課追加', error)
      })

    return newSection
  },

  updateSection: (id, name) => {
    const previous = get().sections
    const now = new Date().toISOString()
    set({
      sections: previous.map((s) =>
        s.id === id ? { ...s, name, updatedAt: now } : s,
      ),
    })
    getDataAdapter()
      .update(
        'sections',
        id,
        { name, updatedAt: now },
        // 楽観ロック
        { expectedUpdatedAt: previous.find((s) => s.id === id)?.updatedAt },
      )
      .then((saved) => {
        // サーバーが確定した行（特にサーバー時計のupdatedAt）をローカルへ反映する。
        // 反映しないと次回の楽観ロック期待値がクライアント時計のまま残り、
        // 単独ユーザーでも2回目の更新が必ず412になる
        set((state) => ({
          sections: state.sections.map((x) => (x.id === id ? saved : x)),
        }))
      })
      .catch((error: unknown) => {
        set({ sections: previous })
        notifyPersistenceFailure('課更新', error)
      })
  },

  deleteSection: (id) => {
    const previous = get().sections
    set({ sections: previous.filter((s) => s.id !== id) })
    getDataAdapter()
      .remove('sections', id)
      .catch((error: unknown) => {
        set({ sections: previous })
        notifyPersistenceFailure('課削除', error)
      })

    // メンバーのsectionIdをnullに更新
    const membersStore = useMembersStore.getState()
    const affectedMembers = membersStore.members.filter(
      (m) => m.sectionId === id,
    )
    for (const member of affectedMembers) {
      membersStore.updateMember({ id: member.id, sectionId: null })
    }
  },

  getSectionsByDivision: (divisionId) => {
    return get().sections.filter((s) => s.divisionId === divisionId)
  },

  getDivisionById: (id) => {
    return get().divisions.find((d) => d.id === id)
  },

  getSectionById: (id) => {
    return get().sections.find((s) => s.id === id)
  },
}))
