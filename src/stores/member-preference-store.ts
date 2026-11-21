import { create } from 'zustand'
import { getDataAdapter } from '@/infrastructure/adapters'
import { toast } from '@/shared/hooks/use-toast'
import type { MemberPreference } from '@/shared/types'
import {
  type CreateMemberPreference,
  CreateMemberPreferenceSchema,
} from '@/shared/types/member-preference'
import {
  describeSaveFailure,
  isConflictError,
  isForbiddenError,
  isStorageQuotaError,
} from './persistence-error'

/**
 * 担当者の希望（1on1で本人の了解を得たもののみ・自由記述なし）。1担当者1件。
 *
 * postgresモードではサーバーが閲覧範囲を絞って返す（people:sensitive-read 保持者は全件、
 * それ以外は本人分のみ）。書き込みはサーバー側で people:sensitive-read かつ data:write を要求する。
 */
interface MemberPreferenceState {
  preferences: MemberPreference[]
  loadMemberPreferences: () => void
  getPreference: (memberId: string) => MemberPreference | undefined
  /** 未登録なら作成、登録済みなら更新。入力が不正（了解日なし等）なら保存せず false */
  savePreference: (input: CreateMemberPreference) => boolean
  /** 本人が了解を取り下げたときに消す */
  deletePreference: (memberId: string) => void
}

function notifyFailure(action: string, error: unknown) {
  if (isForbiddenError(error)) return
  toast({
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `希望の${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

export const useMemberPreferenceStore = create<MemberPreferenceState>()(
  (set, get) => {
    const replace = (id: string, next: MemberPreference) =>
      set((s) => ({
        preferences: s.preferences.map((p) => (p.id === id ? next : p)),
      }))

    return {
      preferences: [],

      loadMemberPreferences: () => {
        getDataAdapter()
          .list('memberPreferences')
          .then((preferences) => set({ preferences }))
          .catch((error: unknown) => {
            if (!isForbiddenError(error)) notifyFailure('読み込み', error)
          })
      },

      getPreference: (memberId) =>
        get().preferences.find((p) => p.memberId === memberId),

      savePreference: (input) => {
        const parsed = CreateMemberPreferenceSchema.safeParse(input)
        if (!parsed.success) return false
        const data = parsed.data
        const previous = get().preferences
        const existing = previous.find((p) => p.memberId === data.memberId)
        const now = new Date().toISOString()

        if (existing) {
          const { memberId: _m, ...changes } = data
          replace(existing.id, { ...existing, ...changes, updatedAt: now })
          getDataAdapter()
            .update(
              'memberPreferences',
              existing.id,
              { ...changes, updatedAt: now },
              { expectedUpdatedAt: existing.updatedAt },
            )
            .then((saved) => replace(existing.id, saved))
            .catch((error: unknown) => {
              set({ preferences: previous })
              notifyFailure('更新', error)
            })
          return true
        }

        const id = crypto.randomUUID()
        set((s) => ({
          preferences: [
            ...s.preferences,
            { ...data, id, createdAt: now, updatedAt: now },
          ],
        }))
        getDataAdapter()
          .create(
            'memberPreferences',
            { ...data, createdAt: now, updatedAt: now },
            { id },
          )
          .then((created) => replace(id, created))
          .catch((error: unknown) => {
            set((s) => ({
              preferences: s.preferences.filter((p) => p.id !== id),
            }))
            notifyFailure('登録', error)
          })
        return true
      },

      deletePreference: (memberId) => {
        const previous = get().preferences
        const target = previous.find((p) => p.memberId === memberId)
        if (!target) return
        set((s) => ({
          preferences: s.preferences.filter((p) => p.id !== target.id),
        }))
        getDataAdapter()
          .remove('memberPreferences', target.id)
          .catch((error: unknown) => {
            set({ preferences: previous })
            notifyFailure('削除', error)
          })
      },
    }
  },
)
