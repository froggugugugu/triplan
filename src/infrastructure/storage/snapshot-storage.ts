import type { Database } from '@/shared/types'
import {
  type SnapshotEntry,
  type SnapshotHistory,
  SnapshotHistorySchema,
  type SnapshotMeta,
  SnapshotTagSchema,
} from '@/shared/types/snapshot'

const STORAGE_KEY = 'resource-manager-snapshots'
const MAX_SNAPSHOTS = 20

/**
 * スナップショット履歴管理（localStorage永続化）
 */
export const snapshotStorage = {
  /**
   * 履歴読み込み（Zodバリデーション付き）
   */
  loadHistory(): SnapshotHistory {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      if (!data) {
        return { snapshots: [] }
      }
      const parsed = JSON.parse(data) as Record<string, unknown>
      return SnapshotHistorySchema.parse(parsed)
    } catch (error) {
      console.error('Failed to load snapshot history:', error)
      return { snapshots: [] }
    }
  },

  /**
   * メタデータ一覧取得（新しい順）
   */
  getMetaList(): SnapshotMeta[] {
    const history = this.loadHistory()
    return history.snapshots
      .map((entry) => entry.meta)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
  },

  /**
   * スナップショット保存
   * - タグバリデーション
   * - タグ重複チェック
   * - 上限20件管理（超過時は古いものから削除）
   * - QuotaExceeded対応
   */
  saveSnapshot(
    tag: string,
    db: Database,
    version: string,
  ): { success: true; meta: SnapshotMeta } | { success: false; error: string } {
    // タグバリデーション
    const tagResult = SnapshotTagSchema.safeParse(tag)
    if (!tagResult.success) {
      return {
        success: false,
        error: tagResult.error.errors[0]?.message ?? 'タグが不正です',
      }
    }

    const history = this.loadHistory()

    // タグ重複チェック
    if (history.snapshots.some((entry) => entry.meta.tag === tag)) {
      return {
        success: false,
        error: `タグ「${tag}」は既に使用されています`,
      }
    }

    const dataJson = JSON.stringify(db)
    const meta: SnapshotMeta = {
      id: crypto.randomUUID(),
      tag,
      version,
      createdAt: new Date().toISOString(),
      fiscalYear: db.fiscalYear,
      dataSize: new Blob([dataJson]).size,
    }

    const entry: SnapshotEntry = { meta, data: db }

    // 上限管理: 新しいエントリを先頭に追加し、超過分（古いもの）を末尾から削除
    const snapshots = [entry, ...history.snapshots].slice(0, MAX_SNAPSHOTS)

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ snapshots } satisfies SnapshotHistory),
      )
      return { success: true, meta }
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === 'QuotaExceededError'
      ) {
        return {
          success: false,
          error:
            'ストレージの容量が不足しています。古いスナップショットを削除してください。',
        }
      }
      return {
        success: false,
        error: '保存に失敗しました',
      }
    }
  },

  /**
   * ID指定でエントリ取得（ダウンロード用）
   */
  getSnapshotById(id: string): SnapshotEntry | undefined {
    const history = this.loadHistory()
    return history.snapshots.find((entry) => entry.meta.id === id)
  },

  /**
   * スナップショット削除
   */
  deleteSnapshot(id: string): boolean {
    const history = this.loadHistory()
    const filtered = history.snapshots.filter((entry) => entry.meta.id !== id)
    if (filtered.length === history.snapshots.length) {
      return false
    }
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ snapshots: filtered } satisfies SnapshotHistory),
    )
    return true
  },

  /**
   * 全履歴クリア
   */
  clearAll(): void {
    localStorage.removeItem(STORAGE_KEY)
  },
}
