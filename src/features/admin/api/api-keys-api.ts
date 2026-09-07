import { createAuthenticatedFetcher } from '@/infrastructure/adapters'
import { useAuthStore } from '@/stores'

function apiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'
}

/**
 * admin限定のAPIキー管理API（server/src/routes/api-keys.ts）向けクライアント
 * （公開API v1）。users-api.tsと同じ整理。
 * キー平文は発行レスポンスで一度だけ得られ、以降のGETには含まれない。
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

export interface ApiKeySummary {
  id: string
  name: string
  enabled: boolean
  createdAt: string
  lastUsedAt: string | null
}

export async function listApiKeys(): Promise<ApiKeySummary[]> {
  const { apiKeys } = await getFetcher().request<{ apiKeys: ApiKeySummary[] }>(
    '/api/apiKeys',
  )
  return apiKeys
}

/** 発行。`key`（平文）はこの戻り値でのみ得られる */
export async function createApiKey(
  name: string,
): Promise<{ apiKey: ApiKeySummary; key: string }> {
  return getFetcher().request<{ apiKey: ApiKeySummary; key: string }>(
    '/api/apiKeys',
    { method: 'POST', body: JSON.stringify({ name }) },
  )
}

export async function updateApiKey(
  id: string,
  patch: { enabled?: boolean; name?: string },
): Promise<ApiKeySummary> {
  const { apiKey } = await getFetcher().request<{ apiKey: ApiKeySummary }>(
    `/api/apiKeys/${id}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  )
  return apiKey
}

export async function deleteApiKey(id: string): Promise<void> {
  await getFetcher().request<undefined>(`/api/apiKeys/${id}`, {
    method: 'DELETE',
  })
}

/** OAS仕様書のURL（利用者へ案内する提供物） */
export function openApiSpecUrl(): string {
  return `${apiBaseUrl()}/api/v1/openapi.yaml`
}
