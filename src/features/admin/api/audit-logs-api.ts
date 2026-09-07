import { createAuthenticatedFetcher } from '@/infrastructure/adapters'
import { useAuthStore } from '@/stores'

function apiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'
}

/**
 * admin限定の監査証跡参照API（server/src/routes/audit-logs.ts）向けクライアント
 * 。api-keys-api.tsと同じ整理。
 *
 * 読み取りのみ。追記はサーバーがcrud-factory内で業務操作と同一トランザクションで
 * 行うため、書き込み関数は存在しない（改ざん・抹消の経路を作らない）。
 */
function getFetcher() {
  return createAuthenticatedFetcher({
    baseUrl: apiBaseUrl(),
    getAccessToken: () => useAuthStore.getState().accessToken,
    onUnauthorized: async () => {
      await useAuthStore.getState().restoreSession()
      return useAuthStore.getState().status === 'authenticated'
    },
  })
}

export type AuditAction = 'create' | 'update' | 'delete'

export interface AuditFieldChange {
  before: unknown
  after: unknown
}

export interface AuditLogEntry {
  id: string
  entity: string
  entityId: string
  action: AuditAction
  actorId: string | null
  actorEmail: string | null
  /** usersから解決した表示名。退職・削除済みユーザーはnull（actorEmailへフォールバック） */
  actorName: string | null
  /** create=null／update={field:{before,after}}／delete=削除直前の行全体 */
  changes: Record<string, AuditFieldChange> | Record<string, unknown> | null
  occurredAt: string
}

export interface AuditLogFilter {
  entity?: string
  entityId?: string
  action?: AuditAction
  limit?: number
}

export async function listAuditLogs(
  filter: AuditLogFilter = {},
): Promise<AuditLogEntry[]> {
  const params = new URLSearchParams()
  if (filter.entity) params.set('entity', filter.entity)
  if (filter.entityId) params.set('entityId', filter.entityId)
  if (filter.action) params.set('action', filter.action)
  if (filter.limit) params.set('limit', String(filter.limit))
  const query = params.toString()
  const { logs } = await getFetcher().request<{ logs: AuditLogEntry[] }>(
    `/api/auditLogs${query ? `?${query}` : ''}`,
  )
  return logs
}

/** 絞り込みUI用。実際にログが存在するエンティティ名だけが返る */
export async function listAuditLogEntities(): Promise<string[]> {
  const { entities } = await getFetcher().request<{ entities: string[] }>(
    '/api/auditLogs/entities',
  )
  return entities
}

export interface AuditLogStats {
  total: number
  /** 最古の記録日時。1件も無ければnull */
  oldestAt: string | null
}

/** 保持状況（パージ判断の材料として総件数と最古の記録日時を返す） */
export async function getAuditLogStats(): Promise<AuditLogStats> {
  return getFetcher().request<AuditLogStats>('/api/auditLogs/stats')
}

/**
 * 保持期間を過ぎたログの一括削除。
 *
 * **保持日数でしか消せない**（任意の基準日時もid指定の個別削除も受け付けない）。
 * 「都合の悪い記録だけを抜く」経路を作らないための制約で、
 * パージ操作自体も監査ログへ記録される。
 *
 * 基準日時はサーバー時計で算出する（端末の時計ずれで想定外の範囲を消さない）。
 * 指定できる日数はサーバー側の許可リストと一致させること。
 */
export async function purgeAuditLogs(
  retentionDays: string,
): Promise<{ deletedCount: number }> {
  return getFetcher().request<{ deletedCount: number }>(
    `/api/auditLogs?days=${encodeURIComponent(retentionDays)}`,
    { method: 'DELETE' },
  )
}
