import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores'
import {
  createNotificationChannel,
  listNotificationChannels,
  listNotificationLogs,
  testNotificationChannel,
  updateNotificationChannel,
} from '../notifications-api'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const CHANNEL = {
  id: '44444444-4444-4444-8444-444444444444',
  name: '開発部Slack',
  provider: 'slack' as const,
  roomId: null,
  enabled: true,
  minSeverity: 'warning' as const,
  notifyEvents: true,
  notifyDigest: true,
  webhookUrlConfigured: true,
  apiTokenConfigured: false,
  createdAt: '2026-08-17T00:00:00.000Z',
  updatedAt: '2026-08-17T00:00:00.000Z',
}

describe('notifications-api', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'admin-token',
      currentUser: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'admin@example.com',
        name: '管理者',
        role: 'admin',
      },
      status: 'authenticated',
      error: null,
    })
    vi.stubGlobal('fetch', vi.fn())
  })

  it('listNotificationChannels: Authorizationヘッダー付きで一覧を取得する', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ channels: [CHANNEL] }),
    )

    const channels = await listNotificationChannels()

    expect(channels).toHaveLength(1)
    expect(channels[0]?.name).toBe('開発部Slack')
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/notificationChannels')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer admin-token',
    )
  })

  it('createNotificationChannel: webhookUrlをPOSTボディに含めて送る', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ channel: CHANNEL }, 201),
    )

    await createNotificationChannel({
      name: '開発部Slack',
      provider: 'slack',
      webhookUrl: 'https://hooks.slack.com/services/X/Y/Z',
    })

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toMatchObject({
      name: '開発部Slack',
      webhookUrl: 'https://hooks.slack.com/services/X/Y/Z',
    })
  })

  it('反証: updateNotificationChannelでwebhookUrl未指定（undefined）はボディにキー自体を含めない（=変更なし）', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ channel: CHANNEL }))

    await updateNotificationChannel(CHANNEL.id, {
      name: '改名',
      webhookUrl: undefined,
    })

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/api/notificationChannels/${CHANNEL.id}`)
    expect(init.method).toBe('PATCH')
    const body = JSON.parse(String(init.body))
    expect(body).toEqual({ name: '改名' })
    expect('webhookUrl' in body).toBe(false)
  })

  it('testNotificationChannel: POSTで結果オブジェクトを受け取る', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ ok: false, detail: 'HTTP 404' }),
    )

    const result = await testNotificationChannel(CHANNEL.id)

    expect(result).toEqual({ ok: false, detail: 'HTTP 404' })
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/api/notificationChannels/${CHANNEL.id}/test`)
    expect(init.method).toBe('POST')
  })

  it('listNotificationLogs: limitクエリを付けて取得する', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ logs: [] }))

    await listNotificationLogs(20)

    const [url] = vi.mocked(fetch).mock.calls[0] as [string]
    expect(url).toContain('/api/notificationLogs?limit=20')
  })

  it('APIエラー時はエラーメッセージ付きで例外になる', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ error: '対象が見つかりません' }, 404),
    )

    await expect(testNotificationChannel(CHANNEL.id)).rejects.toThrow()
  })
})
