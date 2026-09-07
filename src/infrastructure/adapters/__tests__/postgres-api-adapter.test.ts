import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, PostgresApiAdapter } from '../postgres-api-adapter'
import { runAdapterContractTests } from './adapter-contract'

interface FakeRecord {
  id: string
  [key: string]: unknown
}

/**
 * server/のAPIルート（フェーズ6で実装予定）を模した、インメモリのfetchフェイク。
 * PostgresApiAdapterがHTTPリクエストを正しい形（URL・メソッド・ボディ）で
 * 組み立てていることを、実サーバーなしで検証するためのテスト用ダブル。
 */
function createFakeServer() {
  const store = new Map<string, FakeRecord[]>()
  // appSettings（単一設定オブジェクト、/api/appSettingsルート）の保存先
  let appSettings: Record<string, unknown> = {}
  let requireAuthUntilRefresh = false

  const jsonRes = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })

  const fakeFetch = vi.fn(
    async (url: string | URL, init?: RequestInit): Promise<Response> => {
      const u = new URL(String(url))
      const path = u.pathname
      const method = init?.method ?? 'GET'
      const authHeader = (init?.headers as Record<string, string> | undefined)
        ?.Authorization

      if (requireAuthUntilRefresh && authHeader !== 'Bearer refreshed-token') {
        return jsonRes({ error: 'unauthorized' }, 401)
      }

      // appSettings（単一設定）は実サーバー（routes/app-settings.ts）と同様、
      // レコード単位CRUDとは別の専用ルートとして先に処理する
      if (path === '/api/appSettings') {
        if (method === 'GET') return jsonRes(appSettings)
        if (method === 'PATCH') {
          const patch = JSON.parse(init?.body as string) as Record<
            string,
            unknown
          >
          appSettings = { ...appSettings, ...patch }
          return jsonRes(appSettings)
        }
      }

      const batchMatch = /^\/api\/([a-zA-Z]+)\/batch$/.exec(path)
      const idMatch = /^\/api\/([a-zA-Z]+)\/([^/]+)$/.exec(path)
      const listMatch = /^\/api\/([a-zA-Z]+)$/.exec(path)

      if (batchMatch && method === 'PATCH') {
        const entity = batchMatch[1] as string
        const list = store.get(entity) ?? []
        const { patches } = JSON.parse(init?.body as string) as {
          patches: Array<{ id: string; patch: Record<string, unknown> }>
        }
        const updated = list.map((item) => {
          const p = patches.find((x) => x.id === item.id)
          return p ? { ...item, ...p.patch } : item
        })
        store.set(entity, updated)
        const ids = new Set(patches.map((p) => p.id))
        return jsonRes(updated.filter((i) => ids.has(i.id)))
      }

      if (idMatch && method === 'PATCH') {
        const entity = idMatch[1] as string
        const id = idMatch[2] as string
        const list = store.get(entity) ?? []
        const idx = list.findIndex((i) => i.id === id)
        if (idx === -1) return jsonRes({ error: 'not found' }, 404)
        const patch = JSON.parse(init?.body as string)
        const updated = { ...list[idx], ...patch }
        list[idx] = updated
        return jsonRes(updated)
      }

      if (idMatch && method === 'DELETE') {
        const entity = idMatch[1] as string
        const id = idMatch[2] as string
        store.set(
          entity,
          (store.get(entity) ?? []).filter((i) => i.id !== id),
        )
        return new Response(null, { status: 204 })
      }

      if (listMatch && method === 'GET') {
        const entity = listMatch[1] as string
        return jsonRes(store.get(entity) ?? [])
      }

      if (listMatch && method === 'POST') {
        const entity = listMatch[1] as string
        const data = JSON.parse(init?.body as string) as { id?: string }
        // 実サーバー（crud-factory.ts）と同様、クライアント指定idがあればそれを使う
        const record: FakeRecord = {
          ...data,
          id: data.id ?? crypto.randomUUID(),
        }
        store.set(entity, [...(store.get(entity) ?? []), record])
        return jsonRes(record)
      }

      return jsonRes({ error: `unhandled: ${method} ${path}` }, 500)
    },
  )

  return {
    fakeFetch,
    triggerUnauthorizedOnce: () => {
      requireAuthUntilRefresh = true
    },
  }
}

describe('PostgresApiAdapter', () => {
  let server: ReturnType<typeof createFakeServer>

  beforeEach(() => {
    server = createFakeServer()
    vi.stubGlobal('fetch', server.fakeFetch)
  })

  runAdapterContractTests(
    'PostgresApiAdapter',
    () =>
      new PostgresApiAdapter({
        baseUrl: 'http://localhost:3001',
        getAccessToken: () => 'valid-token',
        onUnauthorized: async () => false,
      }),
  )

  it('リクエストにAuthorizationヘッダーが付与される', async () => {
    const adapter = new PostgresApiAdapter({
      baseUrl: 'http://localhost:3001',
      getAccessToken: () => 'my-token',
      onUnauthorized: async () => false,
    })
    await adapter.list('divisions')

    const [, init] = server.fakeFetch.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer my-token',
    )
  })

  describe('楽観ロック', () => {
    function makeAdapter() {
      return new PostgresApiAdapter({
        baseUrl: 'http://localhost:3001',
        getAccessToken: () => 'my-token',
        onUnauthorized: async () => false,
      })
    }

    async function patchHeadersOf(
      run: (adapter: PostgresApiAdapter) => Promise<unknown>,
    ): Promise<Record<string, string>> {
      const adapter = makeAdapter()
      await run(adapter)
      const patchCall = server.fakeFetch.mock.calls.find(
        ([, init]) => (init as RequestInit)?.method === 'PATCH',
      ) as [string, RequestInit]
      return (patchCall[1].headers ?? {}) as Record<string, string>
    }

    it('expectedUpdatedAtを指定するとX-Expected-Updated-Atヘッダーで送る', async () => {
      const headers = await patchHeadersOf(async (adapter) => {
        const created = await adapter.create('divisions', {
          name: '開発部',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        })
        await adapter.update(
          'divisions',
          created.id,
          { name: '開発部（改称）' },
          { expectedUpdatedAt: '2026-01-01T00:00:00.000Z' },
        )
      })
      expect(headers['X-Expected-Updated-At']).toBe('2026-01-01T00:00:00.000Z')
    })

    it('反証: 指定しなければヘッダーを送らない（後方互換＝従来どおり後勝ちで更新）', async () => {
      const headers = await patchHeadersOf(async (adapter) => {
        const created = await adapter.create('divisions', {
          name: '営業部',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        })
        await adapter.update('divisions', created.id, {
          name: '営業部（改称）',
        })
      })
      expect(headers).not.toHaveProperty('X-Expected-Updated-At')
    })
  })

  it('401検出時、onUnauthorizedがtrueを返せば新トークンで1回だけ自動リトライする', async () => {
    server.triggerUnauthorizedOnce()
    let currentToken = 'expired-token'

    const adapter = new PostgresApiAdapter({
      baseUrl: 'http://localhost:3001',
      getAccessToken: () => currentToken,
      onUnauthorized: async () => {
        currentToken = 'refreshed-token'
        return true
      },
    })

    const result = await adapter.list('divisions')
    expect(result).toEqual([])
    // 1回目（401）+ リトライ（成功）= 2回呼ばれる
    expect(server.fakeFetch).toHaveBeenCalledTimes(2)
  })

  it('401検出時、onUnauthorizedがfalseを返す場合はApiErrorを投げる', async () => {
    server.triggerUnauthorizedOnce()

    const adapter = new PostgresApiAdapter({
      baseUrl: 'http://localhost:3001',
      getAccessToken: () => 'expired-token',
      onUnauthorized: async () => false,
    })

    await expect(adapter.list('divisions')).rejects.toThrow(ApiError)
  })

  it('サーバーエラー時、レスポンスのerrorメッセージを含むApiErrorを投げる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'サーバー内部エラー' }), {
            status: 500,
          }),
      ),
    )
    const adapter = new PostgresApiAdapter({
      baseUrl: 'http://localhost:3001',
      getAccessToken: () => 'token',
      onUnauthorized: async () => false,
    })

    await expect(adapter.list('divisions')).rejects.toThrow(
      'サーバー内部エラー',
    )
  })

  it('capabilities.modeはpostgres、supportsAuth/supportsServerSideCascadeはtrue', () => {
    const adapter = new PostgresApiAdapter({
      baseUrl: 'http://localhost:3001',
      getAccessToken: () => null,
      onUnauthorized: async () => false,
    })
    expect(adapter.capabilities).toEqual({
      mode: 'postgres',
      supportsAuth: true,
      supportsServerSideCascade: true,
    })
  })
})
