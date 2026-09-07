import { jsonStorage } from '@/infrastructure/storage'
import type { Database } from '@/shared/types'
import type { AppSettingsData, DataAdapter } from './data-adapter'
import {
  ENTITY_TO_DB_FIELD,
  type EntityCreateInput,
  type EntityMap,
  type EntityName,
  type EntityUpdateInput,
} from './entity-registry'

interface WithId {
  id: string
}

function getArray<E extends EntityName>(
  db: Database,
  entity: E,
): (EntityMap[E] & WithId)[] {
  const field = ENTITY_TO_DB_FIELD[entity]
  const value = db[field] as unknown
  return Array.isArray(value) ? (value as (EntityMap[E] & WithId)[]) : []
}

/**
 * localStorageモード用のDataAdapter実装。既存のjsonStorage.load()/save()を
 * レコード単位CRUDのインターフェースでラップする（挙動変更なし、ARCH §5.1）。
 */
export class LocalJsonAdapter implements DataAdapter {
  readonly capabilities = {
    mode: 'local' as const,
    supportsAuth: false,
    supportsServerSideCascade: false,
  }

  async list<E extends EntityName>(entity: E): Promise<EntityMap[E][]> {
    const db = jsonStorage.load()
    return getArray(db, entity)
  }

  async create<E extends EntityName>(
    entity: E,
    data: EntityCreateInput<E>,
    options?: { id?: string },
  ): Promise<EntityMap[E]> {
    const db = jsonStorage.load()
    const field = ENTITY_TO_DB_FIELD[entity]
    const list = getArray(db, entity)
    const record = {
      ...data,
      id: options?.id ?? crypto.randomUUID(),
    } as EntityMap[E] & WithId
    const updated = [...list, record]
    jsonStorage.save({ ...db, [field]: updated } as Database)
    return record
  }

  async update<E extends EntityName>(
    entity: E,
    id: string,
    patch: EntityUpdateInput<E>,
    // 楽観ロックの期待値は受け取るが検証しない。
    // localモードは単一ユーザー・認証なしの前提で、同時編集そのものが起きない
    _options?: { expectedUpdatedAt?: string },
  ): Promise<EntityMap[E]> {
    const db = jsonStorage.load()
    const field = ENTITY_TO_DB_FIELD[entity]
    const list = getArray(db, entity)
    const idx = list.findIndex((item) => item.id === id)
    if (idx === -1) {
      throw new Error(`${String(entity)} (id=${id}) が見つかりません`)
    }
    const current = list[idx] as EntityMap[E] & WithId
    const updatedRecord = { ...current, ...patch, id } as EntityMap[E] & WithId
    const updated = [...list]
    updated[idx] = updatedRecord
    jsonStorage.save({ ...db, [field]: updated } as Database)
    return updatedRecord
  }

  async remove<E extends EntityName>(entity: E, id: string): Promise<void> {
    const db = jsonStorage.load()
    const field = ENTITY_TO_DB_FIELD[entity]
    const list = getArray(db, entity)
    const updated = list.filter((item) => item.id !== id)
    jsonStorage.save({ ...db, [field]: updated } as Database)
  }

  async bulkUpdate<E extends EntityName>(
    entity: E,
    patches: Array<{ id: string; patch: EntityUpdateInput<E> }>,
  ): Promise<EntityMap[E][]> {
    const db = jsonStorage.load()
    const field = ENTITY_TO_DB_FIELD[entity]
    const list = getArray(db, entity)
    const patchMap = new Map(patches.map((p) => [p.id, p.patch]))
    const updated = list.map((item) => {
      const patch = patchMap.get(item.id)
      return patch
        ? ({ ...item, ...patch, id: item.id } as EntityMap[E] & WithId)
        : item
    })
    jsonStorage.save({ ...db, [field]: updated } as Database)
    const updatedIds = new Set(patches.map((p) => p.id))
    return updated.filter((item) => updatedIds.has(item.id))
  }

  async loadAppSettings(): Promise<AppSettingsData> {
    const db = jsonStorage.load()
    return {
      estimatedUnitPrice: db.estimatedUnitPrice,
      defaultCoefficient: db.defaultCoefficient,
      projectCoefficients: db.projectCoefficients,
      exchangeRateHistory: db.exchangeRateHistory,
      workdaysPerMonth: db.workdaysPerMonth,
      skillReviewCycleMonths: db.skillReviewCycleMonths,
      baselineStaleThreshold: db.baselineStaleThreshold,
      // hoursPerDayは導入時（P1-a）からこの返却リストに漏れており、localモードで
      // 時間換算の設定がリロード後に既定値8へ戻る実バグだった（// updateAppSettings側は汎用ループのため保存自体はされていた=読み出しだけが欠落）
      hoursPerDay: db.hoursPerDay,
      hoursPerFunctionPoint: db.hoursPerFunctionPoint,
      summaryBudgetProgressGapThreshold: db.summaryBudgetProgressGapThreshold,
      summarySpiWarningThreshold: db.summarySpiWarningThreshold,
    }
  }

  async updateAppSettings(patch: AppSettingsData): Promise<AppSettingsData> {
    const db = jsonStorage.load()
    // 指定されたキーのみ上書きする（undefined値のキーで既存値を消さない）
    const next: Database = { ...db }
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) {
        ;(next as Record<string, unknown>)[key] = value
      }
    }
    jsonStorage.save(next)
    return this.loadAppSettings()
  }

  async loadDatabase(): Promise<Database> {
    return jsonStorage.load()
  }

  async importDatabase(db: Database): Promise<void> {
    jsonStorage.save(db)
  }
}
