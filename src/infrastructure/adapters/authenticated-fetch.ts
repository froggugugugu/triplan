export interface AuthenticatedFetchOptions {
  baseUrl: string
  getAccessToken: () => string | null
  /** 401検出時に1回だけ呼ばれる。trueを返せば新しいアクセストークンでリトライする（§12.4） */
  onUnauthorized: () => Promise<boolean>
}

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * postgresモードのAPIサーバー向け、認証付きfetchの共通実装。
 * `PostgresApiAdapter`と管理系API（ユーザー管理等）の両方から再利用する。
 */
export function createAuthenticatedFetcher(options: AuthenticatedFetchOptions) {
  async function request<T>(
    path: string,
    init?: RequestInit,
    isRetry = false,
  ): Promise<T> {
    const token = options.getAccessToken()
    const res = await fetch(`${options.baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    })

    if (res.status === 401 && !isRetry) {
      const refreshed = await options.onUnauthorized()
      if (refreshed) {
        return request<T>(path, init, true)
      }
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new ApiError(body.error ?? `APIエラー（${res.status}）`, res.status)
    }

    if (res.status === 204) {
      return undefined as T
    }
    return (await res.json()) as T
  }

  return { request }
}
