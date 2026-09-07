import { create } from 'zustand'
import { getDataAdapter } from '@/infrastructure/adapters'
import {
  CATEGORY_DEFAULT_COLORS,
  MASTER_DATA,
} from '@/shared/data/tech-tag-master'
import { toast } from '@/shared/hooks/use-toast'
import type {
  CreateTechTag,
  CreateTechTagCategory,
  CreateTechTagSubCategory,
  TechTag,
  TechTagCategory,
  TechTagSubCategory,
  UpdateTechTag,
  UpdateTechTagCategory,
  UpdateTechTagSubCategory,
} from '@/shared/types'
import {
  describeSaveFailure,
  isConflictError,
  isStorageQuotaError,
} from './persistence-error'

interface TechTagsState {
  techTags: TechTag[]
  techTagCategories: TechTagCategory[]
  techTagSubCategories: TechTagSubCategory[]

  // Lifecycle
  loadTechTags: () => void
  resetAll: () => void
  seedFromMaster: () => void

  // Tag CRUD
  addTechTag: (data: CreateTechTag) => TechTag
  updateTechTag: (data: UpdateTechTag) => void
  deleteTechTag: (id: string) => void
  getTechTagById: (id: string) => TechTag | undefined

  // Category CRUD
  addCategory: (data: CreateTechTagCategory) => TechTagCategory
  updateCategory: (data: UpdateTechTagCategory) => void
  deleteCategory: (id: string) => void

  // SubCategory CRUD
  addSubCategory: (data: CreateTechTagSubCategory) => TechTagSubCategory
  updateSubCategory: (data: UpdateTechTagSubCategory) => void
  deleteSubCategory: (id: string) => void
}

function notifyPersistenceFailure(action: string, error: unknown) {
  toast({
    // 楽観ロックの競合（412）は障害ではなく並行編集の結果なので、
    // 「失敗」ではなく再読込を促す文言にする
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `技術タグの${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

export const useTechTagsStore = create<TechTagsState>()((set, get) => ({
  techTags: [],
  techTagCategories: [],
  techTagSubCategories: [],

  loadTechTags: () => {
    getDataAdapter()
      .list('techTags')
      .then((rows) => {
        const techTags = rows.map((t) => ({
          ...t,
          categoryId: t.categoryId ?? '',
          subCategoryId: t.subCategoryId ?? null,
          note: t.note ?? null,
        }))
        set({ techTags })
      })
      .catch((error: unknown) => notifyPersistenceFailure('読み込み', error))
    getDataAdapter()
      .list('techTagCategories')
      .then((techTagCategories) => set({ techTagCategories }))
      .catch((error: unknown) => notifyPersistenceFailure('読み込み', error))
    getDataAdapter()
      .list('techTagSubCategories')
      .then((techTagSubCategories) => set({ techTagSubCategories }))
      .catch((error: unknown) => notifyPersistenceFailure('読み込み', error))
  },

  resetAll: () => {
    set({
      techTags: [],
      techTagCategories: [],
      techTagSubCategories: [],
    })
  },

  // 楽観的更新: ローカルstateの同期チェック→即時set()という既存の同期契約は維持する
  // （呼び出し元の再描画・既存テストとの互換性のため、seedFromMaster()呼び出し直後に
  // 199件が揃って見える）。ただし実際のDataAdapter.create()発火の前に、DataAdapter.list()で
  // 「本当に0件か」をサーバー側の実データで再確認してから行う。
  //
  // ⚠️ ローカルstateのみを信頼する簡易版（personnel-plan-storeのgetOrCreateAllCategoriesと
  // 同じ設計）を最初に採用したところ、実ブラウザE2Eで**リロード時**にタグが398件（199×2）に
  // 重複する実バグが発生した。原因はTechTagsPage.tsxのseedFromMaster()がloadTechTags()と
  // 同一マウント時に独立したuseEffectで発火し、loadTechTags()のlist()が解決する前は
  // ローカルstateが常に空のため、ページを開き直すたびに「0件」と誤判定してしまうため
  // （personnel-plan-storeのケースはタブクリックという実際のユーザー操作を挟むため
  // list()解決後に発火し问題が顕在化しなかった。同じ「マウント時に0件なら生成」パターンでも
  // 呼び出し元が実ユーザー操作を挟むかどうかでリスクが変わる、というの判断基準を
  // 実運用で裏付ける形になった）
  seedFromMaster: () => {
    const state = get()
    if (state.techTagCategories.length > 0 || state.techTags.length > 0) {
      return
    }

    const now = new Date().toISOString()
    const categories: TechTagCategory[] = []
    const subCategories: TechTagSubCategory[] = []
    const tags: TechTag[] = []

    for (const [ci, masterCat] of MASTER_DATA.entries()) {
      const catId = crypto.randomUUID()
      categories.push({
        id: catId,
        name: masterCat.name,
        sortOrder: ci,
        createdAt: now,
        updatedAt: now,
      })

      const defaultColor = CATEGORY_DEFAULT_COLORS[masterCat.name] ?? '#6b7280'

      for (const [si, masterSub] of masterCat.subCategories.entries()) {
        const subId = crypto.randomUUID()
        subCategories.push({
          id: subId,
          categoryId: catId,
          name: masterSub.name,
          sortOrder: si,
          createdAt: now,
          updatedAt: now,
        })

        for (const masterTag of masterSub.tags) {
          tags.push({
            id: crypto.randomUUID(),
            name: masterTag.name,
            color: defaultColor,
            categoryId: catId,
            subCategoryId: subId,
            note: masterTag.note ?? null,
            createdAt: now,
            updatedAt: now,
          })
        }
      }
    }

    // 楽観的にローカルへ即時反映（UIの初期表示・既存の同期呼び出し契約を維持）
    set({
      techTags: tags,
      techTagCategories: categories,
      techTagSubCategories: subCategories,
    })

    getDataAdapter()
      .list('techTagCategories')
      .then((existingCategories) => {
        if (existingCategories.length > 0) {
          // 既に永続化済み（このページ表示より前にシード済みだった）→ 新規create()はせず、
          // DataAdapter上の実データへローカルstateを同期する
          Promise.all([
            getDataAdapter().list('techTagCategories'),
            getDataAdapter().list('techTagSubCategories'),
            getDataAdapter().list('techTags'),
          ])
            .then(([cats, subs, tgs]) => {
              set({
                techTagCategories: cats,
                techTagSubCategories: subs,
                techTags: tgs.map((t) => ({
                  ...t,
                  categoryId: t.categoryId ?? '',
                  subCategoryId: t.subCategoryId ?? null,
                  note: t.note ?? null,
                })),
              })
            })
            .catch((error: unknown) =>
              notifyPersistenceFailure('マスタ同期', error),
            )
          return
        }

        Promise.all([
          ...categories.map((c) => {
            const { id, ...data } = c
            return getDataAdapter().create('techTagCategories', data, { id })
          }),
          ...subCategories.map((s) => {
            const { id, ...data } = s
            return getDataAdapter().create('techTagSubCategories', data, {
              id,
            })
          }),
          ...tags.map((t) => {
            const { id, ...data } = t
            return getDataAdapter().create('techTags', data, { id })
          }),
        ]).catch((error: unknown) => {
          set({
            techTags: [],
            techTagCategories: [],
            techTagSubCategories: [],
          })
          notifyPersistenceFailure('マスタ登録', error)
        })
      })
      .catch((error: unknown) => notifyPersistenceFailure('マスタ確認', error))
  },

  // ── Tag CRUD ──

  addTechTag: (data) => {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const newTag: TechTag = {
      ...data,
      id,
      subCategoryId: data.subCategoryId ?? null,
      note: data.note ?? null,
      createdAt: now,
      updatedAt: now,
    }

    set((state) => ({ techTags: [...state.techTags, newTag] }))
    const { id: _id, ...createPayload } = newTag
    getDataAdapter()
      .create('techTags', createPayload, { id })
      .then((created) => {
        set((state) => ({
          techTags: state.techTags.map((t) => (t.id === id ? created : t)),
        }))
      })
      .catch((error: unknown) => {
        set((state) => ({
          techTags: state.techTags.filter((t) => t.id !== id),
        }))
        notifyPersistenceFailure('追加', error)
      })

    return newTag
  },

  updateTechTag: (data) => {
    const previous = get().techTags
    const now = new Date().toISOString()
    set({
      techTags: previous.map((t) =>
        t.id === data.id ? { ...t, ...data, updatedAt: now } : t,
      ),
    })
    const { id, ...patch } = data
    getDataAdapter()
      .update(
        'techTags',
        id,
        { ...patch, updatedAt: now },
        // 楽観ロック
        { expectedUpdatedAt: previous.find((t) => t.id === id)?.updatedAt },
      )
      .then((saved) => {
        // サーバーが確定した行（特にサーバー時計のupdatedAt）をローカルへ反映する。
        // 反映しないと次回の楽観ロック期待値がクライアント時計のまま残り、
        // 単独ユーザーでも2回目の更新が必ず412になる
        set((state) => ({
          techTags: state.techTags.map((x) => (x.id === id ? saved : x)),
        }))
      })
      .catch((error: unknown) => {
        set({ techTags: previous })
        notifyPersistenceFailure('更新', error)
      })
  },

  deleteTechTag: (id) => {
    const previous = get().techTags
    set({ techTags: previous.filter((t) => t.id !== id) })
    getDataAdapter()
      .remove('techTags', id)
      .catch((error: unknown) => {
        set({ techTags: previous })
        notifyPersistenceFailure('削除', error)
      })
  },

  getTechTagById: (id) => {
    return get().techTags.find((t) => t.id === id)
  },

  // ── Category CRUD ──

  addCategory: (data) => {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const newCat: TechTagCategory = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    }

    set((state) => ({
      techTagCategories: [...state.techTagCategories, newCat],
    }))
    getDataAdapter()
      .create(
        'techTagCategories',
        { ...data, createdAt: now, updatedAt: now },
        { id },
      )
      .then((created) => {
        set((state) => ({
          techTagCategories: state.techTagCategories.map((c) =>
            c.id === id ? created : c,
          ),
        }))
      })
      .catch((error: unknown) => {
        set((state) => ({
          techTagCategories: state.techTagCategories.filter((c) => c.id !== id),
        }))
        notifyPersistenceFailure('カテゴリ追加', error)
      })

    return newCat
  },

  updateCategory: (data) => {
    const previous = get().techTagCategories
    const now = new Date().toISOString()
    set({
      techTagCategories: previous.map((c) =>
        c.id === data.id ? { ...c, ...data, updatedAt: now } : c,
      ),
    })
    const { id, ...patch } = data
    getDataAdapter()
      .update(
        'techTagCategories',
        id,
        { ...patch, updatedAt: now },
        // 楽観ロック
        { expectedUpdatedAt: previous.find((c) => c.id === id)?.updatedAt },
      )
      .then((saved) => {
        // サーバーが確定した行（特にサーバー時計のupdatedAt）をローカルへ反映する。
        // 反映しないと次回の楽観ロック期待値がクライアント時計のまま残り、
        // 単独ユーザーでも2回目の更新が必ず412になる
        set((state) => ({
          techTagCategories: state.techTagCategories.map((x) =>
            x.id === id ? saved : x,
          ),
        }))
      })
      .catch((error: unknown) => {
        set({ techTagCategories: previous })
        notifyPersistenceFailure('カテゴリ更新', error)
      })
  },

  deleteCategory: (id) => {
    const previousCategories = get().techTagCategories
    const previousSubCategories = get().techTagSubCategories
    const previousTags = get().techTags
    const targetSubCategoryIds = previousSubCategories
      .filter((s) => s.categoryId === id)
      .map((s) => s.id)
    const targetTagIds = previousTags
      .filter((t) => t.categoryId === id)
      .map((t) => t.id)

    set({
      techTagCategories: previousCategories.filter((c) => c.id !== id),
      techTagSubCategories: previousSubCategories.filter(
        (s) => s.categoryId !== id,
      ),
      techTags: previousTags.filter((t) => t.categoryId !== id),
    })
    Promise.all([
      getDataAdapter().remove('techTagCategories', id),
      ...targetSubCategoryIds.map((subId) =>
        getDataAdapter().remove('techTagSubCategories', subId),
      ),
      ...targetTagIds.map((tagId) =>
        getDataAdapter().remove('techTags', tagId),
      ),
    ]).catch((error: unknown) => {
      set({
        techTagCategories: previousCategories,
        techTagSubCategories: previousSubCategories,
        techTags: previousTags,
      })
      notifyPersistenceFailure('カテゴリ削除', error)
    })
  },

  // ── SubCategory CRUD ──

  addSubCategory: (data) => {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const newSub: TechTagSubCategory = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    }

    set((state) => ({
      techTagSubCategories: [...state.techTagSubCategories, newSub],
    }))
    getDataAdapter()
      .create(
        'techTagSubCategories',
        { ...data, createdAt: now, updatedAt: now },
        { id },
      )
      .then((created) => {
        set((state) => ({
          techTagSubCategories: state.techTagSubCategories.map((s) =>
            s.id === id ? created : s,
          ),
        }))
      })
      .catch((error: unknown) => {
        set((state) => ({
          techTagSubCategories: state.techTagSubCategories.filter(
            (s) => s.id !== id,
          ),
        }))
        notifyPersistenceFailure('サブカテゴリ追加', error)
      })

    return newSub
  },

  updateSubCategory: (data) => {
    const previous = get().techTagSubCategories
    const now = new Date().toISOString()
    set({
      techTagSubCategories: previous.map((s) =>
        s.id === data.id ? { ...s, ...data, updatedAt: now } : s,
      ),
    })
    const { id, ...patch } = data
    getDataAdapter()
      .update(
        'techTagSubCategories',
        id,
        { ...patch, updatedAt: now },
        // 楽観ロック
        { expectedUpdatedAt: previous.find((s) => s.id === id)?.updatedAt },
      )
      .then((saved) => {
        // サーバーが確定した行（特にサーバー時計のupdatedAt）をローカルへ反映する。
        // 反映しないと次回の楽観ロック期待値がクライアント時計のまま残り、
        // 単独ユーザーでも2回目の更新が必ず412になる
        set((state) => ({
          techTagSubCategories: state.techTagSubCategories.map((x) =>
            x.id === id ? saved : x,
          ),
        }))
      })
      .catch((error: unknown) => {
        set({ techTagSubCategories: previous })
        notifyPersistenceFailure('サブカテゴリ更新', error)
      })
  },

  deleteSubCategory: (id) => {
    const previousSubCategories = get().techTagSubCategories
    const previousTags = get().techTags
    const affectedTagIds = previousTags
      .filter((t) => t.subCategoryId === id)
      .map((t) => t.id)

    set({
      techTagSubCategories: previousSubCategories.filter((s) => s.id !== id),
      techTags: previousTags.map((t) =>
        t.subCategoryId === id ? { ...t, subCategoryId: null } : t,
      ),
    })
    Promise.all([
      getDataAdapter().remove('techTagSubCategories', id),
      ...affectedTagIds.map((tagId) =>
        getDataAdapter().update('techTags', tagId, { subCategoryId: null }),
      ),
    ]).catch((error: unknown) => {
      set({
        techTagSubCategories: previousSubCategories,
        techTags: previousTags,
      })
      notifyPersistenceFailure('サブカテゴリ削除', error)
    })
  },
}))
