import type { Database } from '@/shared/types'
import {
  type AuthenticatedFetchOptions,
  createAuthenticatedFetcher,
} from './authenticated-fetch'
import type { AppSettingsData, DataAdapter } from './data-adapter'
import type {
  EntityCreateInput,
  EntityMap,
  EntityName,
  EntityUpdateInput,
} from './entity-registry'

export { ApiError } from './authenticated-fetch'

/**
 * postgresモード用のDataAdapter実装。APIサーバー（server/）へfetchする。
 *
 * アクセストークンの取得元・401時の再認証処理は、依存方向ルール（infrastructureは
 * storesに依存しない）を守るため、コンストラクタ経由の注入（DI）にする。
 * 実際の配線（useAuthStoreへの接続）はApp.tsx等の composition root で行う
 * （ARCH §3.1「main.tsxから1回だけ呼ばれる」の精神を踏襲）。
 */
export type PostgresApiAdapterOptions = AuthenticatedFetchOptions

export class PostgresApiAdapter implements DataAdapter {
  readonly capabilities = {
    mode: 'postgres' as const,
    supportsAuth: true,
    supportsServerSideCascade: true,
  }

  private readonly fetcher: ReturnType<typeof createAuthenticatedFetcher>

  constructor(options: PostgresApiAdapterOptions) {
    this.fetcher = createAuthenticatedFetcher(options)
  }

  async list<E extends EntityName>(entity: E): Promise<EntityMap[E][]> {
    return this.fetcher.request<EntityMap[E][]>(`/api/${entity}`)
  }

  async create<E extends EntityName>(
    entity: E,
    data: EntityCreateInput<E>,
    options?: { id?: string },
  ): Promise<EntityMap[E]> {
    const body = options?.id ? { ...data, id: options.id } : data
    return this.fetcher.request<EntityMap[E]>(`/api/${entity}`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  async update<E extends EntityName>(
    entity: E,
    id: string,
    patch: EntityUpdateInput<E>,
    options?: { expectedUpdatedAt?: string },
  ): Promise<EntityMap[E]> {
    return this.fetcher.request<EntityMap[E]>(`/api/${entity}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
      // 楽観ロック。期待値を申告した場合のみサーバーが検証し、
      // 食い違えば412を返す（未指定なら従来どおり後勝ちで更新される）
      headers: options?.expectedUpdatedAt
        ? { 'X-Expected-Updated-At': options.expectedUpdatedAt }
        : undefined,
    })
  }

  async remove<E extends EntityName>(entity: E, id: string): Promise<void> {
    await this.fetcher.request<void>(`/api/${entity}/${id}`, {
      method: 'DELETE',
    })
  }

  async bulkUpdate<E extends EntityName>(
    entity: E,
    patches: Array<{ id: string; patch: EntityUpdateInput<E> }>,
  ): Promise<EntityMap[E][]> {
    return this.fetcher.request<EntityMap[E][]>(`/api/${entity}/batch`, {
      method: 'PATCH',
      body: JSON.stringify({ patches }),
    })
  }

  async loadAppSettings(): Promise<AppSettingsData> {
    return this.fetcher.request<AppSettingsData>('/api/appSettings')
  }

  async updateAppSettings(patch: AppSettingsData): Promise<AppSettingsData> {
    return this.fetcher.request<AppSettingsData>('/api/appSettings', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  }

  async loadDatabase(): Promise<Database> {
    return this.fetcher.request<Database>('/api/database/export')
  }

  async importDatabase(db: Database): Promise<void> {
    await this.fetcher.request<void>('/api/database/import', {
      method: 'POST',
      body: JSON.stringify(db),
    })
  }
}
