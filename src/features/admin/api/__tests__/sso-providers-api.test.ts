import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores'
import { listSsoProviders, updateSsoProvider } from '../sso-providers-api'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('sso-providers-api', () => {
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

  it('listSsoProviders: プロバイダ設定一覧を取得する', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        providers: [
          {
            provider: 'azure_ad',
            enabled: false,
            clientId: null,
            tenantId: null,
            redirectUri: null,
            hasSecret: false,
            updatedAt: null,
          },
          {
            provider: 'google_workspace',
            enabled: false,
            clientId: null,
            tenantId: null,
            redirectUri: null,
            hasSecret: false,
            updatedAt: null,
          },
        ],
      }),
    )

    const providers = await listSsoProviders()

    expect(providers).toHaveLength(2)
    expect(providers[0]?.provider).toBe('azure_ad')
  })

  it('updateSsoProvider: PUT /api/sso-providers/:providerで設定を保存する', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        provider: {
          provider: 'azure_ad',
          enabled: true,
          clientId: 'my-client-id',
          tenantId: 'my-tenant-id',
          redirectUri: 'https://app.example.com/callback',
          hasSecret: true,
          updatedAt: '2026-08-14T00:00:00.000Z',
        },
      }),
    )

    const result = await updateSsoProvider('azure_ad', {
      enabled: true,
      clientId: 'my-client-id',
      clientSecret: 'super-secret',
      tenantId: 'my-tenant-id',
      redirectUri: 'https://app.example.com/callback',
    })

    expect(result.hasSecret).toBe(true)
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/sso-providers/azure_ad')
    expect(init.method).toBe('PUT')
    // clientSecretが送信ボディに含まれる（保存時のみ、レスポンスには含まれない）
    expect(JSON.parse(init.body as string).clientSecret).toBe('super-secret')
  })

  it('clientSecretを省略した場合、リクエストボディにそのフィールドを含めない', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        provider: {
          provider: 'azure_ad',
          enabled: true,
          clientId: 'my-client-id',
          tenantId: null,
          redirectUri: null,
          hasSecret: true,
          updatedAt: '2026-08-14T00:00:00.000Z',
        },
      }),
    )

    await updateSsoProvider('azure_ad', {
      enabled: true,
      clientId: 'my-client-id',
      redirectUri: null,
    })

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).not.toHaveProperty('clientSecret')
  })
})
