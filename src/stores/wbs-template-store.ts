import { create } from 'zustand'
import { getDataAdapter } from '@/infrastructure/adapters'
import { STANDARD_WBS_TEMPLATE } from '@/shared/data/wbs-template-master'
import { toast } from '@/shared/hooks/use-toast'
import type {
  CreateWbsTemplate,
  UpdateWbsTemplate,
  WbsTemplate,
} from '@/shared/types/wbs-template'
import {
  describeSaveFailure,
  isConflictError,
  isForbiddenError,
  isStorageQuotaError,
} from './persistence-error'

interface WbsTemplateState {
  wbsTemplates: WbsTemplate[]

  // Lifecycle
  loadWbsTemplates: () => void
  // 初回のみ標準テンプレートを1件シードする（tech-tags-storeのseedFromMasterと同じパターン）。
  // 既に1件以上ストックされている場合は何もしない
  seedStandardTemplate: () => void

  // CRUD
  addWbsTemplate: (data: CreateWbsTemplate) => WbsTemplate
  updateWbsTemplate: (data: UpdateWbsTemplate) => void
  deleteWbsTemplate: (id: string) => void

  // Selectors
  getWbsTemplateById: (id: string) => WbsTemplate | undefined
}

function notifyPersistenceFailure(action: string, error: unknown) {
  toast({
    // 楽観ロックの競合（412）は障害ではなく並行編集の結果なので、
    // 「失敗」ではなく再読込を促す文言にする
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `WBSテンプレートの${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

// seedStandardTemplate()の重複実行防止用ガード（モジュールスコープ、ページ読み込みごとにリセット）。
// React StrictMode（開発時）はマウント時のuseEffectを意図的に2回発火するため、
// DataAdapter.list()の非同期解決を待つ間に2回目の呼び出しが割り込むと、両方とも
// 「まだ0件」と判定してしまい重複シードが起こる（同期的なlist().length判定だけでは
// 防げないタイミング依存のTOCTOUレース、実ブラウザE2Eで発見）。
// 呼び出しの1回目で即座にこのフラグを立てることで、2回目以降は非同期処理の完了を
// 待たずに即座に弾ける
let seedAttempted = false

/** テスト用: モジュールスコープのシードガードをリセットする */
export function resetWbsTemplateSeedGuardForTesting(): void {
  seedAttempted = false
}

export const useWbsTemplateStore = create<WbsTemplateState>()((set, get) => ({
  wbsTemplates: [],

  loadWbsTemplates: () => {
    getDataAdapter()
      .list('wbsTemplates')
      .then((wbsTemplates) => set({ wbsTemplates }))
      .catch((error: unknown) => notifyPersistenceFailure('読み込み', error))
  },

  // 楽観的更新（docs/project.md「17ストアのDataAdapter配線」参照）。呼び出し元
  // （WbsTemplatesPage.tsxのhandleCreate）が戻り値のidを同期的にselectedId等へ
  // 使うため、create()のoptions.idで確定id同様に固定する（idの安定性が必須）。
  //
  // ⚠️ ローカルstate（get().wbsTemplates）ではなくDataAdapter.list()の結果で0件判定する。
  // WbsPage.tsx/WbsTemplatesPage.tsxはloadWbsTemplates()とseedStandardTemplate()を別々の
  // useEffectで同一マウント時に呼ぶため、loadWbsTemplates()のlist()がまだ解決していない
  // （ローカルstateが初期値の空配列のまま）タイミングでseedStandardTemplate()が実行されると、
  // 既にシード済みでもローカルstateだけを見て「0件」と誤判定し重複シードしてしまう
  // （実ブラウザE2Eで発見した実バグ）。DataAdapter.list()で都度実際の永続化状態を
  // 確認することで、呼び出し順・タイミングに依存せず正しく判定できるようにする
  seedStandardTemplate: () => {
    if (get().wbsTemplates.length > 0 || seedAttempted) return
    seedAttempted = true

    getDataAdapter()
      .list('wbsTemplates')
      .then((existing) => {
        if (existing.length > 0) {
          // ローカルstateがまだ空ならこの結果で同期しておく（loadWbsTemplates()の
          // list()呼び出しと競合しても最終的に正しい状態へ収束する）
          if (get().wbsTemplates.length === 0) set({ wbsTemplates: existing })
          return
        }

        const now = new Date().toISOString()
        const id = crypto.randomUUID()
        const seeded: WbsTemplate = {
          id,
          name: '標準テンプレート（要求整理〜リリース）',
          nodes: STANDARD_WBS_TEMPLATE,
          createdAt: now,
          updatedAt: now,
        }

        set((state) => ({ wbsTemplates: [...state.wbsTemplates, seeded] }))
        getDataAdapter()
          .create(
            'wbsTemplates',
            {
              name: seeded.name,
              nodes: seeded.nodes,
              createdAt: now,
              updatedAt: now,
            },
            { id },
          )
          .then((created) => {
            // upsertで反映する。StrictModeの二重マウントでは「load#1 → seed#1（楽観的set）
            // → load#2」の順にlist()が解決し、load#2の空配列set()がシードの楽観的stateを
            // 上書きして消してしまう（localStorageには永続化済みなのにUIだけ空になる。
            // document-template-storeの実ブラウザE2Eで発見した同型バグの水平展開）
            set((state) => ({
              wbsTemplates: state.wbsTemplates.some((t) => t.id === id)
                ? state.wbsTemplates.map((t) => (t.id === id ? created : t))
                : [...state.wbsTemplates, created],
            }))
          })
          .catch((error: unknown) => {
            set((state) => ({
              wbsTemplates: state.wbsTemplates.filter((t) => t.id !== id),
            }))
            if (isForbiddenError(error)) return
            notifyPersistenceFailure('シード', error)
          })
      })
      .catch((error: unknown) => {
        // 閲覧専用ロールは自動シードの権限が無い（利用者操作ではないため通知しない）
        if (isForbiddenError(error)) return
        notifyPersistenceFailure('シード確認', error)
      })
  },

  addWbsTemplate: (data) => {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const newTemplate: WbsTemplate = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    }

    set((state) => ({ wbsTemplates: [...state.wbsTemplates, newTemplate] }))
    getDataAdapter()
      .create(
        'wbsTemplates',
        { name: data.name, nodes: data.nodes, createdAt: now, updatedAt: now },
        { id },
      )
      .then((created) => {
        set((state) => ({
          wbsTemplates: state.wbsTemplates.map((t) =>
            t.id === id ? created : t,
          ),
        }))
      })
      .catch((error: unknown) => {
        set((state) => ({
          wbsTemplates: state.wbsTemplates.filter((t) => t.id !== id),
        }))
        notifyPersistenceFailure('追加', error)
      })

    return newTemplate
  },

  updateWbsTemplate: (data) => {
    const previous = get().wbsTemplates
    const now = new Date().toISOString()

    set({
      wbsTemplates: previous.map((t) =>
        t.id === data.id ? { ...t, ...data, updatedAt: now } : t,
      ),
    })
    const { id, ...patch } = data
    getDataAdapter()
      .update(
        'wbsTemplates',
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
          wbsTemplates: state.wbsTemplates.map((x) =>
            x.id === id ? saved : x,
          ),
        }))
      })
      .catch((error: unknown) => {
        set({ wbsTemplates: previous })
        notifyPersistenceFailure('更新', error)
      })
  },

  deleteWbsTemplate: (id) => {
    const previous = get().wbsTemplates
    set({ wbsTemplates: previous.filter((t) => t.id !== id) })
    getDataAdapter()
      .remove('wbsTemplates', id)
      .catch((error: unknown) => {
        set({ wbsTemplates: previous })
        notifyPersistenceFailure('削除', error)
      })
  },

  getWbsTemplateById: (id) => {
    return get().wbsTemplates.find((t) => t.id === id)
  },
}))
