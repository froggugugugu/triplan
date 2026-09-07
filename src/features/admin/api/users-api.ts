import { createAuthenticatedFetcher } from '@/infrastructure/adapters'
import type { AuthUser, UserRole } from '@/shared/types'
import { useAuthStore } from '@/stores'

function apiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'
}

/**
 * admin限定のユーザー管理API（server/src/routes/users.ts）向けクライアント。
 * DataAdapterの汎用エンティティCRUDには含めない（usersは業務エンティティではなく
 * 認証・認可の専用概念のため、entity-registry.tsのEntityMapには登場しない）。
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

export interface CreateUserInput {
  email: string
  name: string
  password: string
  role: UserRole
}

export interface UpdateUserInput {
  name?: string
  role?: UserRole
  isActive?: boolean
  /**
   * 業務データ上の担当者との紐づけ。
   * undefined=変更なし／null=解除／uuid=紐づけ の3値
   */
  memberId?: string | null
}

export async function listUsers(): Promise<AuthUser[]> {
  const { users } = await getFetcher().request<{ users: AuthUser[] }>(
    '/api/users',
  )
  return users
}

export async function createUser(input: CreateUserInput): Promise<AuthUser> {
  const { user } = await getFetcher().request<{ user: AuthUser }>(
    '/api/users',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
  return user
}

export async function updateUser(
  id: string,
  patch: UpdateUserInput,
): Promise<AuthUser> {
  const { user } = await getFetcher().request<{ user: AuthUser }>(
    `/api/users/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
  )
  return user
}
