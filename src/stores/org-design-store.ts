import { create } from 'zustand'
import { getDataAdapter } from '@/infrastructure/adapters'
import { toast } from '@/shared/hooks/use-toast'
import type { Member, OrgDesignDraft, Section } from '@/shared/types'
import { OrgDesignDraftSchema } from '@/shared/types/org-design'
import {
  createDesignFromCurrentOrg,
  type OrgDesign,
} from '@/shared/utils/org-design-utils'
import {
  describeSaveFailure,
  isConflictError,
  isForbiddenError,
  isStorageQuotaError,
} from './persistence-error'

/**
 * 組織設計の試算（/org-design）の案。
 *
 * 本番の課（team-store）・所属（members-store）は**読むだけ**で、案の作成時に複製する。
 * 案の中の操作（移動・チームの追加/削除・受け持ち編集）は saveDesign で案だけを更新する。
 * 楽観的更新＋クライアント生成id＋失敗ロールバックの既存パターン（risk-store と同じ）。
 */
interface OrgDesignState {
  drafts: OrgDesignDraft[]
  loadOrgDesignDrafts: () => void
  /** 現在の課・所属を複製して案を作り、案IDを返す */
  createDraft: (input: {
    name: string
    fiscalYear: number
    sections: Section[]
    members: Member[]
  }) => string
  duplicateDraft: (id: string, name: string) => string | null
  /** 前後空白を除いて1〜100文字でなければ何もしない（false） */
  renameDraft: (id: string, name: string) => boolean
  saveDesign: (id: string, design: OrgDesign) => void
  deleteDraft: (id: string) => void
}

function notifyFailure(action: string, error: unknown) {
  if (isForbiddenError(error)) return
  toast({
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `組織設計の案の${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

const DraftNameSchema = OrgDesignDraftSchema.shape.name

export const useOrgDesignStore = create<OrgDesignState>()((set, get) => {
  const replace = (id: string, next: OrgDesignDraft) =>
    set((s) => ({ drafts: s.drafts.map((d) => (d.id === id ? next : d)) }))

  const insert = (draft: OrgDesignDraft) => {
    set((s) => ({ drafts: [...s.drafts, draft] }))
    const { id, ...data } = draft
    getDataAdapter()
      .create('orgDesignDrafts', data, { id })
      .then((created) => replace(id, created))
      .catch((error: unknown) => {
        set((s) => ({ drafts: s.drafts.filter((d) => d.id !== id) }))
        notifyFailure('作成', error)
      })
  }

  const patch = (
    id: string,
    changes: Partial<Omit<OrgDesignDraft, 'id' | 'createdAt'>>,
    action: string,
  ) => {
    const previous = get().drafts
    const target = previous.find((d) => d.id === id)
    if (!target) return
    const now = new Date().toISOString()
    replace(id, { ...target, ...changes, updatedAt: now })
    getDataAdapter()
      .update(
        'orgDesignDrafts',
        id,
        { ...changes, updatedAt: now },
        { expectedUpdatedAt: target.updatedAt },
      )
      .then((saved) => replace(id, saved))
      .catch((error: unknown) => {
        set({ drafts: previous })
        notifyFailure(action, error)
      })
  }

  return {
    drafts: [],

    loadOrgDesignDrafts: () => {
      getDataAdapter()
        .list('orgDesignDrafts')
        .then((drafts) => set({ drafts }))
        .catch((error: unknown) => {
          if (!isForbiddenError(error)) notifyFailure('読み込み', error)
        })
    },

    createDraft: ({ name, fiscalYear, sections, members }) => {
      const now = new Date().toISOString()
      const id = crypto.randomUUID()
      const design = createDesignFromCurrentOrg(sections, members)
      insert({
        id,
        name: name.trim(),
        fiscalYear,
        ...design,
        createdAt: now,
        updatedAt: now,
      })
      return id
    },

    duplicateDraft: (id, name) => {
      const source = get().drafts.find((d) => d.id === id)
      const parsedName = DraftNameSchema.safeParse(name)
      if (!source || !parsedName.success) return null
      const now = new Date().toISOString()
      const copyId = crypto.randomUUID()
      insert({
        ...structuredClone(source),
        id: copyId,
        name: parsedName.data,
        createdAt: now,
        updatedAt: now,
      })
      return copyId
    },

    renameDraft: (id, name) => {
      const parsed = DraftNameSchema.safeParse(name)
      if (!parsed.success) return false
      patch(id, { name: parsed.data }, '名前の変更')
      return true
    },

    saveDesign: (id, design) => {
      patch(id, { teams: design.teams, placements: design.placements }, '保存')
    },

    deleteDraft: (id) => {
      const previous = get().drafts
      set((s) => ({ drafts: s.drafts.filter((d) => d.id !== id) }))
      getDataAdapter()
        .remove('orgDesignDrafts', id)
        .catch((error: unknown) => {
          set({ drafts: previous })
          notifyFailure('削除', error)
        })
    },
  }
})
