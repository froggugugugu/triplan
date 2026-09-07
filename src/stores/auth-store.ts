import { create } from 'zustand'
import type { AuthUser } from '@/shared/types'
import { LoginResponseSchema } from '@/shared/types'

/**
 * postgresモードのみで使用する認証状態。ARCH §12.1に従い、アクセストークンは
 * メモリ上のみに保持する（localStorage/sessionStorageへは一切保存しない）。
 * リフレッシュトークンはサーバーがhttpOnly Cookieとして管理するためJSからは触れない。
 *
 * ページリロードでこのストアの状態は消えるため、起動時に`restoreSession()`を
 * 呼んでリフレッシュCookieから再認証を試みる（§3.1のPostgresApiAdapter初期化フローの一部）。
 */
interface AuthState {
  accessToken: string | null
  currentUser: AuthUser | null
  status: 'idle' | 'authenticating' | 'authenticated' | 'unauthenticated'
  error: string | null

  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  restoreSession: () => Promise<void>
}

function apiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'
}

// restoreSession()のsingle-flightガード（モジュールスコープ）。
// リフレッシュトークンはローテーション方式（1回使うと無効化され新トークンに置き換わる）のため、
// /api/auth/refreshを並行して2回呼ぶと後着が401になり、その401ハンドリングが先着の
// authenticated状態を上書きしてセッション全体が死ぬ。並行呼び出しの発生源は
// ①React StrictModeのuseEffect二重発火（RequireAuthのガードはレンダー時点のstatus='idle'を
// 両方のクロージャが見るため防げない）②DataAdapterの401リトライ（onUnauthorized）との競合。
// postgresモードのフルリロード実機検証で発見した既存バグの修正。
// schedule-settings-storeのload single-flight（docs/development-patterns.md §10）と同じパターン
let inFlightRestore: Promise<void> | null = null

/** テスト用: single-flightガードをリセットする */
export function resetAuthRestoreGuardForTesting(): void {
  inFlightRestore = null
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  currentUser: null,
  status: 'idle',
  error: null,

  login: async (email, password) => {
    set({ status: 'authenticating', error: null })
    try {
      const res = await fetch(`${apiBaseUrl()}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string
        }
        set({
          status: 'unauthenticated',
          error: body.error ?? 'ログインに失敗しました',
        })
        return
      }
      const data = LoginResponseSchema.parse(await res.json())
      set({
        accessToken: data.accessToken,
        currentUser: data.user,
        status: 'authenticated',
        error: null,
      })
    } catch {
      set({
        status: 'unauthenticated',
        error: 'サーバーに接続できませんでした',
      })
    }
  },

  logout: async () => {
    try {
      await fetch(`${apiBaseUrl()}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      // ネットワーク障害等でログアウトAPIが失敗しても、ローカルの認証状態は
      // 必ずクリアする（ユーザーがログアウトできなくなる事態を避ける）
    } finally {
      set({
        accessToken: null,
        currentUser: null,
        status: 'unauthenticated',
        error: null,
      })
    }
  },

  restoreSession: () => {
    // 実行中のリフレッシュがあればそれに相乗りする（並行リフレッシュによる
    // ローテーション競合＝セッション無効化の防止。上記inFlightRestoreのコメント参照）
    if (inFlightRestore) return inFlightRestore

    inFlightRestore = (async () => {
      set({ status: 'authenticating' })
      try {
        const res = await fetch(`${apiBaseUrl()}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        })
        if (!res.ok) {
          set({
            status: 'unauthenticated',
            accessToken: null,
            currentUser: null,
          })
          return
        }
        const data = LoginResponseSchema.parse(await res.json())
        set({
          accessToken: data.accessToken,
          currentUser: data.user,
          status: 'authenticated',
          error: null,
        })
      } catch {
        set({ status: 'unauthenticated', accessToken: null, currentUser: null })
      }
    })().finally(() => {
      inFlightRestore = null
    })
    return inFlightRestore
  },
}))
