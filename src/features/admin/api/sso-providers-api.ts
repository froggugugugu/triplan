import { createAuthenticatedFetcher } from '@/infrastructure/adapters'
import type { SsoProviderConfig, SsoProviderType } from '@/shared/types'
import { useAuthStore } from '@/stores'

function apiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'
}

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

export interface UpdateSsoProviderInput {
  enabled: boolean
  clientId: string | null
  /** 省略時は既存のclientSecretを保持する（毎回入力必須にしない） */
  clientSecret?: string
  tenantId?: string | null
  redirectUri: string | null
}

export async function listSsoProviders(): Promise<SsoProviderConfig[]> {
  const { providers } = await getFetcher().request<{
    providers: SsoProviderConfig[]
  }>('/api/sso-providers')
  return providers
}

export async function updateSsoProvider(
  provider: SsoProviderType,
  input: UpdateSsoProviderInput,
): Promise<SsoProviderConfig> {
  const { provider: updated } = await getFetcher().request<{
    provider: SsoProviderConfig
  }>(`/api/sso-providers/${provider}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
  return updated
}
