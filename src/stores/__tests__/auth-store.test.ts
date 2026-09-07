import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAuthRestoreGuardForTesting, useAuthStore } from '../auth-store'

function jsonResponse(body: unknown, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const VALID_USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'taro@example.com',
  name: '山田太郎',
  role: 'editor' as const,
}

describe('auth-store', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: null,
      currentUser: null,
      status: 'idle',
      error: null,
    })
    resetAuthRestoreGuardForTesting()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('ログイン成功時、accessTokenとcurrentUserがメモリ上に設定される', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ accessToken: 'token-abc', user: VALID_USER }),
    )

    await useAuthStore.getState().login('taro@example.com', 'password123')

    const state = useAuthStore.getState()
    expect(state.accessToken).toBe('token-abc')
    expect(state.currentUser).toEqual(VALID_USER)
    expect(state.status).toBe('authenticated')
  })

  it('ログイン時、fetchにcredentials: includeが渡される（httpOnly Cookie受信のため）', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ accessToken: 'token-abc', user: VALID_USER }),
    )

    await useAuthStore.getState().login('taro@example.com', 'password123')

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(options.credentials).toBe('include')
  })

  it('ログイン失敗時（401）、エラーメッセージが設定されaccessTokenは設定されない', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        { error: 'メールアドレスまたはパスワードが正しくありません' },
        { status: 401 },
      ),
    )

    await useAuthStore.getState().login('taro@example.com', 'wrong-password')

    const state = useAuthStore.getState()
    expect(state.accessToken).toBeNull()
    expect(state.status).toBe('unauthenticated')
    expect(state.error).toBe('メールアドレスまたはパスワードが正しくありません')
  })

  it('サーバーに接続できない場合もエラーとして扱われる（例外を投げない）', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'))

    await expect(
      useAuthStore.getState().login('taro@example.com', 'password123'),
    ).resolves.not.toThrow()

    expect(useAuthStore.getState().status).toBe('unauthenticated')
  })

  it('ログアウトするとaccessToken/currentUserがクリアされる', async () => {
    useAuthStore.setState({
      accessToken: 'token-abc',
      currentUser: VALID_USER,
      status: 'authenticated',
      error: null,
    })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }))

    await useAuthStore.getState().logout()

    const state = useAuthStore.getState()
    expect(state.accessToken).toBeNull()
    expect(state.currentUser).toBeNull()
    expect(state.status).toBe('unauthenticated')
  })

  it('ログアウトAPIが失敗しても、ローカルの認証状態は必ずクリアされる', async () => {
    useAuthStore.setState({
      accessToken: 'token-abc',
      currentUser: VALID_USER,
      status: 'authenticated',
      error: null,
    })
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'))

    await useAuthStore.getState().logout()

    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('restoreSession成功時、リロード後でもaccessTokenが復元される', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ accessToken: 'restored-token', user: VALID_USER }),
    )

    await useAuthStore.getState().restoreSession()

    expect(useAuthStore.getState().accessToken).toBe('restored-token')
    expect(useAuthStore.getState().status).toBe('authenticated')
  })

  it('restoreSession失敗時（未ログイン等）はunauthenticatedになる', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ error: 'no session' }, { status: 401 }),
    )

    await useAuthStore.getState().restoreSession()

    expect(useAuthStore.getState().status).toBe('unauthenticated')
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  // 反証: リフレッシュトークンはローテーション方式のため、並行リフレッシュは
  // 後着が401になりセッション全体を殺す。restoreSessionはsingle-flightで
  // 並行呼び出しを1本のHTTPリクエストへ相乗りさせる（postgresモードのフルリロード
  // 実機検証で発見した既存バグの回帰テスト）
  it('反証: restoreSessionを同一tick内に2回呼んでもfetchは1回だけ実行される', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ accessToken: 'restored-token', user: VALID_USER }),
    )

    const p1 = useAuthStore.getState().restoreSession()
    const p2 = useAuthStore.getState().restoreSession()
    await Promise.all([p1, p2])

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().status).toBe('authenticated')
    expect(useAuthStore.getState().accessToken).toBe('restored-token')
  })

  it('反証: StrictMode相当の二重呼び出しでも敗者の401がauthenticatedを上書きしない', async () => {
    // single-flightにより2回目の呼び出しはHTTPを発行しないため、
    // 「1回目=200・2回目=401」という競合シナリオ自体が発生しない
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: 'restored-token', user: VALID_USER }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: 'token reused' }, { status: 401 }),
      )

    await Promise.all([
      useAuthStore.getState().restoreSession(),
      useAuthStore.getState().restoreSession(),
    ])

    expect(useAuthStore.getState().status).toBe('authenticated')
    expect(useAuthStore.getState().accessToken).toBe('restored-token')
  })

  it('single-flight完了後の再呼び出しは新しいリフレッシュを実行する（永続的な抑止ではない）', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ accessToken: 'restored-token', user: VALID_USER }),
    )

    await useAuthStore.getState().restoreSession()
    await useAuthStore.getState().restoreSession()

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
  })
})
