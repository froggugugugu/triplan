import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { NotificationChannelRow } from '../../db/schema.js'
import type { NotificationMessage } from '../message.js'

/**
 * 送信コアの反証テスト。crypto.ts（env.ts経由）がモジュール評価時にSSO_ENCRYPTION_KEYを
 * 要求するため、環境変数を先に設定してから動的importする（統合テストと同じパターン）
 */

const MESSAGE: NotificationMessage = {
  title: 'テスト通知',
  severity: 'warning',
  lines: ['1行目'],
}

function buildChannel(
  overrides: Partial<NotificationChannelRow> = {},
): NotificationChannelRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'テストチャンネル',
    provider: 'slack',
    webhookUrlEncrypted: null, // beforeAllで暗号化した実値を入れる
    apiTokenEncrypted: null,
    roomId: null,
    enabled: true,
    minSeverity: 'warning',
    notifyEvents: true,
    notifyDigest: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

// biome-ignore lint/suspicious/noExplicitAny: 動的importの型を緩める（テスト専用）
let sendToChannel: any
// biome-ignore lint/suspicious/noExplicitAny: 同上
let encryptSecret: any
let encryptedSlackUrl: string

beforeAll(async () => {
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL ??= 'postgresql://dummy:dummy@localhost:5/dummy'
  process.env.JWT_ACCESS_SECRET ??= 'sender-test-access-secret-123456'
  process.env.JWT_REFRESH_PEPPER ??= 'sender-test-refresh-pepper-123456'
  process.env.SSO_ENCRYPTION_KEY ??= 'a'.repeat(64)
  ;({ sendToChannel } = await import('../sender.js'))
  ;({ encryptSecret } = await import('../../auth/crypto.js'))
  encryptedSlackUrl = encryptSecret('https://hooks.slack.com/services/T/B/x')
})

function mockFetchSequence(
  responses: Array<{ status: number; headers?: Record<string, string> }>,
) {
  let call = 0
  const fn = vi.fn(async () => {
    const r = responses[Math.min(call, responses.length - 1)]
    call++
    return {
      status: r.status,
      headers: new Headers(r.headers ?? {}),
    } as Response
  })
  return fn
}

describe('sendToChannel', () => {
  it('成功（200）でok:true・fetchは1回だけ', async () => {
    const fetchImpl = mockFetchSequence([{ status: 200 }])
    const result = await sendToChannel(
      buildChannel({ webhookUrlEncrypted: encryptedSlackUrl }),
      MESSAGE,
      { fetchImpl, retryDelayMs: 0 },
    )
    expect(result).toEqual({ ok: true, detail: null })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    // 暗号化されたURLが復号されて送信先になる
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://hooks.slack.com/services/T/B/x',
    )
  })

  it('反証: 4xx（400）はリトライせず即失敗（設定ミスで外部を叩き続けない）', async () => {
    const fetchImpl = mockFetchSequence([{ status: 400 }])
    const result = await sendToChannel(
      buildChannel({ webhookUrlEncrypted: encryptedSlackUrl }),
      MESSAGE,
      { fetchImpl, retryDelayMs: 0 },
    )
    expect(result.ok).toBe(false)
    expect(result.detail).toBe('HTTP 400')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('429は1回だけリトライし、2回目成功でok:true', async () => {
    const fetchImpl = mockFetchSequence([
      { status: 429, headers: { 'retry-after': '1' } },
      { status: 200 },
    ])
    const result = await sendToChannel(
      buildChannel({ webhookUrlEncrypted: encryptedSlackUrl }),
      MESSAGE,
      { fetchImpl, retryDelayMs: 0 },
    )
    expect(result.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('反証: 5xxはリトライ1回まで（2回失敗でok:false・3回目は呼ばない）', async () => {
    const fetchImpl = mockFetchSequence([{ status: 500 }, { status: 503 }])
    const result = await sendToChannel(
      buildChannel({ webhookUrlEncrypted: encryptedSlackUrl }),
      MESSAGE,
      { fetchImpl, retryDelayMs: 0 },
    )
    expect(result.ok).toBe(false)
    expect(result.detail).toBe('HTTP 503')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('反証: プロバイダ別の成功ステータス（teamsの202=成功、slackの202=失敗）', async () => {
    const teams = await sendToChannel(
      buildChannel({
        provider: 'teams',
        webhookUrlEncrypted: encryptSecret('https://prod.logic.azure.com/wf'),
      }),
      MESSAGE,
      { fetchImpl: mockFetchSequence([{ status: 202 }]), retryDelayMs: 0 },
    )
    expect(teams.ok).toBe(true)

    const slack = await sendToChannel(
      buildChannel({ webhookUrlEncrypted: encryptedSlackUrl }),
      MESSAGE,
      { fetchImpl: mockFetchSequence([{ status: 202 }]), retryDelayMs: 0 },
    )
    expect(slack.ok).toBe(false)
  })

  it('反証: fetch例外（ネットワーク断）でも例外を投げずok:falseで返す', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })
    const result = await sendToChannel(
      buildChannel({ webhookUrlEncrypted: encryptedSlackUrl }),
      MESSAGE,
      { fetchImpl, retryDelayMs: 0 },
    )
    expect(result.ok).toBe(false)
    expect(result.detail).toContain('ECONNREFUSED')
  })

  it('反証: タイムアウトでok:false（AbortErrorをタイムアウトとして報告）', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const err = new Error('aborted')
            err.name = 'AbortError'
            reject(err)
          })
        }),
    )
    const result = await sendToChannel(
      buildChannel({ webhookUrlEncrypted: encryptedSlackUrl }),
      MESSAGE,
      // biome-ignore lint/suspicious/noExplicitAny: fetch互換の最小シグネチャ
      { fetchImpl: fetchImpl as any, timeoutMs: 20, retryDelayMs: 0 },
    )
    expect(result.ok).toBe(false)
    expect(result.detail).toContain('タイムアウト')
  })

  it('反証: 設定不足（URL未設定）はfetchせずok:false', async () => {
    const fetchImpl = vi.fn()
    const result = await sendToChannel(
      buildChannel({ webhookUrlEncrypted: null }),
      MESSAGE,
      // biome-ignore lint/suspicious/noExplicitAny: fetch互換の最小シグネチャ
      { fetchImpl: fetchImpl as any, retryDelayMs: 0 },
    )
    expect(result.ok).toBe(false)
    expect(result.detail).toContain('設定エラー')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
