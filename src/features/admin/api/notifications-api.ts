import { createAuthenticatedFetcher } from '@/infrastructure/adapters'
import { useAuthStore } from '@/stores'

function apiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'
}

/**
 * admin限定の通知チャンネル管理API（server/src/routes/notifications.ts）向けクライアント
 * （Phase 3 Phase B）。users-api.tsと同じ整理で、DataAdapterの汎用CRUDには
 * 含めない（通知チャンネルはサーバー専用エンティティ。localモードには存在しない）。
 *
 * シークレット（Webhook URL・APIトークン）は書き込み専用: サーバーは「設定済みか」の
 * booleanしか返さないため、レスポンス型にも平文・暗号文のフィールドは存在しない。
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

export type NotificationProvider =
  | 'slack'
  | 'teams'
  | 'google_chat'
  | 'discord'
  | 'chatwork'
  | 'generic'

export type NotificationSeverity = 'critical' | 'warning' | 'info'

export interface NotificationChannel {
  id: string
  name: string
  provider: NotificationProvider
  roomId: string | null
  enabled: boolean
  minSeverity: NotificationSeverity
  notifyEvents: boolean
  notifyDigest: boolean
  webhookUrlConfigured: boolean
  apiTokenConfigured: boolean
  createdAt: string
  updatedAt: string
}

export interface NotificationLogEntry {
  id: string
  sentAt: string
  channelId: string
  channelName: string | null
  kind: 'event' | 'digest' | 'test'
  subject: string
  ok: boolean
  detail: string | null
}

export interface CreateNotificationChannelInput {
  name: string
  provider: NotificationProvider
  webhookUrl?: string | null
  apiToken?: string | null
  roomId?: string | null
  enabled?: boolean
  minSeverity?: NotificationSeverity
  notifyEvents?: boolean
  notifyDigest?: boolean
}

/** undefined=変更なし／null=クリア／文字列=再設定（webhookUrl・apiToken） */
export type UpdateNotificationChannelInput =
  Partial<CreateNotificationChannelInput>

export async function listNotificationChannels(): Promise<
  NotificationChannel[]
> {
  const { channels } = await getFetcher().request<{
    channels: NotificationChannel[]
  }>('/api/notificationChannels')
  return channels
}

export async function createNotificationChannel(
  input: CreateNotificationChannelInput,
): Promise<NotificationChannel> {
  const { channel } = await getFetcher().request<{
    channel: NotificationChannel
  }>('/api/notificationChannels', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return channel
}

export async function updateNotificationChannel(
  id: string,
  patch: UpdateNotificationChannelInput,
): Promise<NotificationChannel> {
  const { channel } = await getFetcher().request<{
    channel: NotificationChannel
  }>(`/api/notificationChannels/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return channel
}

export async function deleteNotificationChannel(id: string): Promise<void> {
  await getFetcher().request<undefined>(`/api/notificationChannels/${id}`, {
    method: 'DELETE',
  })
}

export async function testNotificationChannel(
  id: string,
): Promise<{ ok: boolean; detail: string | null }> {
  return getFetcher().request<{ ok: boolean; detail: string | null }>(
    `/api/notificationChannels/${id}/test`,
    { method: 'POST' },
  )
}

export async function listNotificationLogs(
  limit = 50,
): Promise<NotificationLogEntry[]> {
  const { logs } = await getFetcher().request<{
    logs: NotificationLogEntry[]
  }>(`/api/notificationLogs?limit=${limit}`)
  return logs
}
