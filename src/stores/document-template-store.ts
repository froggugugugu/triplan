import { create } from 'zustand'
import { getDataAdapter } from '@/infrastructure/adapters'
import { DOCUMENT_TEMPLATE_MASTER } from '@/shared/data/document-template-master'
import { toast } from '@/shared/hooks/use-toast'
import type {
  CreateDocumentTemplate,
  DocumentTemplate,
  UpdateDocumentTemplate,
} from '@/shared/types/document-template'
import {
  describeSaveFailure,
  isConflictError,
  isForbiddenError,
  isStorageQuotaError,
} from './persistence-error'

interface DocumentTemplateState {
  documentTemplates: DocumentTemplate[]

  // Lifecycle
  loadDocumentTemplates: () => void
  // 初回のみIPA準拠の標準ドキュメントテンプレート一式をシードする
  // （wbs-template-storeのseedStandardTemplateと同じパターン）。
  // 既に1件以上ストックされている場合は何もしない
  seedStandardDocumentTemplates: () => void

  // CRUD
  addDocumentTemplate: (data: CreateDocumentTemplate) => DocumentTemplate
  updateDocumentTemplate: (data: UpdateDocumentTemplate) => void
  deleteDocumentTemplate: (id: string) => void

  // Selectors
  getDocumentTemplateById: (id: string) => DocumentTemplate | undefined
}

function notifyPersistenceFailure(action: string, error: unknown) {
  toast({
    // 楽観ロックの競合（412）は障害ではなく並行編集の結果なので、
    // 「失敗」ではなく再読込を促す文言にする
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `ドキュメントテンプレートの${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

// seedStandardDocumentTemplates()の重複実行防止用ガード（モジュールスコープ）。
// React StrictModeのuseEffect二重発火でDataAdapter.list()の非同期解決前に2回目が
// 割り込むTOCTOUレース対策（wbs-template-store・と同一の設計判断）。
// トリガーのuseEffectは実ユーザー操作を挟まず即座に発火するため、list()による
// 実データ確認も必ずcreate()の前段に置く（docs/development-patterns.md §10）
let seedAttempted = false

/** テスト用: モジュールスコープのシードガードをリセットする */
export function resetDocumentTemplateSeedGuardForTesting(): void {
  seedAttempted = false
}

export const useDocumentTemplateStore = create<DocumentTemplateState>()(
  (set, get) => ({
    documentTemplates: [],

    loadDocumentTemplates: () => {
      getDataAdapter()
        .list('documentTemplates')
        .then((documentTemplates) => set({ documentTemplates }))
        .catch((error: unknown) => notifyPersistenceFailure('読み込み', error))
    },

    // マスタの固定UUIDのままシードする（STANDARD_WBS_TEMPLATEのノードが
    // documentTemplateIdsでこのidを参照するため、idが変わると紐づけが切れる）
    seedStandardDocumentTemplates: () => {
      if (get().documentTemplates.length > 0 || seedAttempted) return
      seedAttempted = true

      getDataAdapter()
        .list('documentTemplates')
        .then((existing) => {
          if (existing.length > 0) {
            if (get().documentTemplates.length === 0) {
              set({ documentTemplates: existing })
            }
            return
          }

          const now = new Date().toISOString()
          const seeded: DocumentTemplate[] = DOCUMENT_TEMPLATE_MASTER.map(
            (entry) => ({
              ...entry,
              createdAt: now,
              updatedAt: now,
            }),
          )

          set((state) => ({
            documentTemplates: [...state.documentTemplates, ...seeded],
          }))

          const adapter = getDataAdapter()
          for (const template of seeded) {
            const { id, ...data } = template
            adapter
              .create('documentTemplates', data, { id })
              .then((created) => {
                // 単純なid一致のmap置換ではなくupsertにする。StrictModeの二重マウントでは
                // 「load#1 → seed#1（楽観的set） → load#2」の順にlist()が解決し、
                // load#2の空配列set()がシードの楽観的stateを上書きして消してしまう
                // （localStorageには永続化済みなのにUIだけ空になる。実ブラウザE2Eで発見）。
                // 確定レコードを「無ければ追加」で反映することで、どの解決順でも
                // 最終状態がシード結果へ収束する
                set((state) => ({
                  documentTemplates: state.documentTemplates.some(
                    (t) => t.id === id,
                  )
                    ? state.documentTemplates.map((t) =>
                        t.id === id ? created : t,
                      )
                    : [...state.documentTemplates, created],
                }))
              })
              .catch((error: unknown) => {
                set((state) => ({
                  documentTemplates: state.documentTemplates.filter(
                    (t) => t.id !== id,
                  ),
                }))
                if (isForbiddenError(error)) return
                notifyPersistenceFailure('シード', error)
              })
          }
        })
        .catch((error: unknown) =>
          isForbiddenError(error)
            ? undefined
            : notifyPersistenceFailure('シード確認', error),
        )
    },

    addDocumentTemplate: (data) => {
      const now = new Date().toISOString()
      const id = crypto.randomUUID()
      const newTemplate: DocumentTemplate = {
        ...data,
        id,
        createdAt: now,
        updatedAt: now,
      }

      set((state) => ({
        documentTemplates: [...state.documentTemplates, newTemplate],
      }))
      getDataAdapter()
        .create(
          'documentTemplates',
          { ...data, createdAt: now, updatedAt: now },
          { id },
        )
        .then((created) => {
          set((state) => ({
            documentTemplates: state.documentTemplates.map((t) =>
              t.id === id ? created : t,
            ),
          }))
        })
        .catch((error: unknown) => {
          set((state) => ({
            documentTemplates: state.documentTemplates.filter(
              (t) => t.id !== id,
            ),
          }))
          notifyPersistenceFailure('追加', error)
        })

      return newTemplate
    },

    updateDocumentTemplate: (data) => {
      const previous = get().documentTemplates
      const now = new Date().toISOString()

      set({
        documentTemplates: previous.map((t) =>
          t.id === data.id ? { ...t, ...data, updatedAt: now } : t,
        ),
      })
      const { id, ...patch } = data
      getDataAdapter()
        .update(
          'documentTemplates',
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
            documentTemplates: state.documentTemplates.map((x) =>
              x.id === id ? saved : x,
            ),
          }))
        })
        .catch((error: unknown) => {
          set({ documentTemplates: previous })
          notifyPersistenceFailure('更新', error)
        })
    },

    // 削除してもWbsTemplateNode.documentTemplateIds側の参照は自動掃除しない
    // （紐づけはテンプレート側の弱参照であり、UI側が存在しないidを表示から除外する。
    // resolveDocumentTemplates参照）
    deleteDocumentTemplate: (id) => {
      const previous = get().documentTemplates
      set({ documentTemplates: previous.filter((t) => t.id !== id) })
      getDataAdapter()
        .remove('documentTemplates', id)
        .catch((error: unknown) => {
          set({ documentTemplates: previous })
          notifyPersistenceFailure('削除', error)
        })
    },

    getDocumentTemplateById: (id) => {
      return get().documentTemplates.find((t) => t.id === id)
    },
  }),
)
