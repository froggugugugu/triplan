import { create } from 'zustand'
import { getDataAdapter } from '@/infrastructure/adapters'
import { toast } from '@/shared/hooks/use-toast'
import type { CreateMember, Member, UpdateMember } from '@/shared/types'
import { extractRoles } from '@/shared/types'
import {
  describeSaveFailure,
  isConflictError,
  isStorageQuotaError,
} from './persistence-error'

interface MembersState {
  members: Member[]
  // Actions
  loadMembers: () => void
  addMember: (data: CreateMember) => Member
  updateMember: (data: UpdateMember) => void
  deleteMember: (id: string) => void
  // Selectors
  getMemberById: (id: string) => Member | undefined
  getActiveMembers: () => Member[]
  getRoles: () => string[]
  getMembersBySection: (sectionId: string) => Member[]
  getUnaffiliatedMembers: () => Member[]
  getMembersActiveInFiscalYear: (
    fiscalYear: number,
    startMonth: number,
  ) => Member[]
}

function notifyPersistenceFailure(action: string, error: unknown) {
  toast({
    // 楽観ロックの競合（412）は障害ではなく並行編集の結果なので、
    // 「失敗」ではなく再読込を促す文言にする
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `担当者の${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

export const useMembersStore = create<MembersState>()((set, get) => ({
  members: [],

  loadMembers: () => {
    getDataAdapter()
      .list('members')
      .then((members) => set({ members }))
      .catch((error: unknown) => notifyPersistenceFailure('読み込み', error))
  },

  addMember: (data) => {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const newMember: Member = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    }

    set((state) => ({ members: [...state.members, newMember] }))
    const { id: _id, ...createPayload } = newMember
    getDataAdapter()
      .create('members', createPayload, { id })
      .then((created) => {
        set((state) => ({
          members: state.members.map((m) => (m.id === id ? created : m)),
        }))
      })
      .catch((error: unknown) => {
        set((state) => ({
          members: state.members.filter((m) => m.id !== id),
        }))
        notifyPersistenceFailure('追加', error)
      })

    return newMember
  },

  updateMember: (data) => {
    const previous = get().members
    const now = new Date().toISOString()

    set({
      members: previous.map((m) =>
        m.id === data.id ? { ...m, ...data, updatedAt: now } : m,
      ),
    })
    const { id, ...patch } = data
    getDataAdapter()
      .update(
        'members',
        id,
        { ...patch, updatedAt: now },
        // 楽観ロック: 画面が見ていた版と食い違えばサーバーが412で拒否する
        { expectedUpdatedAt: previous.find((m) => m.id === id)?.updatedAt },
      )
      .then((saved) => {
        // サーバーが確定した行（特にサーバー時計のupdatedAt）をローカルへ反映する。
        // 反映しないと次回の楽観ロック期待値がクライアント時計のまま残り、
        // 単独ユーザーでも2回目の更新が必ず412になる
        set((state) => ({
          members: state.members.map((x) => (x.id === id ? saved : x)),
        }))
      })
      .catch((error: unknown) => {
        set({ members: previous })
        notifyPersistenceFailure('更新', error)
      })
  },

  deleteMember: (id) => {
    const previous = get().members
    set({ members: previous.filter((m) => m.id !== id) })
    getDataAdapter()
      .remove('members', id)
      .catch((error: unknown) => {
        set({ members: previous })
        notifyPersistenceFailure('削除', error)
      })
  },

  getMemberById: (id) => {
    return get().members.find((m) => m.id === id)
  },

  getActiveMembers: () => {
    return get().members.filter((m) => m.isActive)
  },

  getRoles: () => {
    return extractRoles(get().members)
  },

  getMembersBySection: (sectionId) => {
    return get().members.filter((m) => m.sectionId === sectionId)
  },

  getUnaffiliatedMembers: () => {
    return get().members.filter((m) => m.sectionId === null)
  },

  getMembersActiveInFiscalYear: (fiscalYear, startMonth) => {
    // 年度の開始月・終了月を算出
    const fyStartYear = fiscalYear
    const fyStartMonth = startMonth
    const fyEndYear = fyStartMonth === 1 ? fiscalYear : fiscalYear + 1
    const fyEndMonth =
      fyStartMonth === 1 ? 12 : ((fyStartMonth - 2 + 12) % 12) + 1
    const fyStart = `${fyStartYear}-${String(fyStartMonth).padStart(2, '0')}`
    const fyEnd = `${fyEndYear}-${String(fyEndMonth).padStart(2, '0')}`

    return get().members.filter((m) => {
      // startDateがnullの場合は非表示
      if (!m.startDate) return false

      const memberStart = m.startDate.substring(0, 7) // "YYYY-MM"
      const memberEnd = m.endDate ? m.endDate.substring(0, 7) : '9999-12'

      // 期間の重なり判定: memberStart <= fyEnd && memberEnd >= fyStart
      return memberStart <= fyEnd && memberEnd >= fyStart
    })
  },
}))
