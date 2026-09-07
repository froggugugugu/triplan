import { type Database, DatabaseSchema } from '@/shared/types'

const STORAGE_KEY = 'resource-manager-data'
const CURRENT_VERSION = '1.0.0'

/**
 * 空のデータベースを作成
 */
function createEmptyDatabase(fiscalYear: number): Database {
  const now = new Date().toISOString()
  return {
    version: CURRENT_VERSION,
    fiscalYear,
    projects: [],
    members: [],
    metadata: {
      lastModified: now,
      createdBy: 'system',
      version: CURRENT_VERSION,
    },
  }
}

/**
 * 現在の年度を取得（4月始まり固定）
 *
 * load() のエラーフォールバック時にのみ使用される。
 * 正常系では initialize() で正しい年度に上書きされるため、
 * ストアへの依存を排除しても実質的な動作変更なし。
 */
function getCurrentFiscalYear(): number {
  const startMonth = 4
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  return month >= startMonth ? year : year - 1
}

/**
 * JSON Storage - localStorageを使ったデータ永続化
 */
export const jsonStorage = {
  /**
   * データベースを読み込み
   */
  load(): Database {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      if (!data) {
        return createEmptyDatabase(getCurrentFiscalYear())
      }

      const parsed = JSON.parse(data)
      const validated = DatabaseSchema.parse(parsed)
      return validated
    } catch (error) {
      console.error('Failed to load data:', error)
      return createEmptyDatabase(getCurrentFiscalYear())
    }
  },

  /**
   * データベースを保存
   */
  save(database: Database): void {
    const validated = DatabaseSchema.parse({
      ...database,
      metadata: {
        ...database.metadata,
        lastModified: new Date().toISOString(),
      },
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validated))
  },

  /**
   * JSONファイルとしてエクスポート
   */
  export(): string {
    const data = this.load()
    return JSON.stringify(data, null, 2)
  },

  /**
   * JSONファイルからインポート
   */
  import(jsonString: string): Database {
    const parsed = JSON.parse(jsonString) as Record<string, unknown>
    const validated = DatabaseSchema.parse(parsed)
    this.save(validated)
    return validated
  },

  /**
   * データベースをクリア
   */
  clear(): void {
    localStorage.removeItem(STORAGE_KEY)
  },

  /**
   * 年度を変更
   */
  changeFiscalYear(fiscalYear: number): Database {
    const current = this.load()
    const updated: Database = {
      ...current,
      fiscalYear,
    }
    this.save(updated)
    return updated
  },
}
