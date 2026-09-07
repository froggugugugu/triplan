import { decryptSecret } from '../auth/crypto.js'
import type { NotificationChannelRow } from '../db/schema.js'
import {
  buildProviderRequest,
  isSuccessStatus,
  type NotificationMessage,
  type ProviderRequest,
} from './message.js'

/**
 * 通知の送信コア（非公開の設計文書）。
 * - タイムアウト10秒（AbortController）
 * - リトライは**429/5xxのみ1回**（4xxは設定ミスでありリトライしない）。
 *   429は`Retry-After`ヘッダを尊重（上限60秒）、5xxは1秒
 * - 例外を外へ投げない（結果オブジェクトで返す）＝通知失敗が業務処理を失敗させない
 */

export interface SendResult {
  ok: boolean
  /** 失敗時のステータス・エラー概要（成功時はnull） */
  detail: string | null
}

export interface SendOptions {
  /** テスト用のfetch注入 */
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** テスト用: リトライ前の待機msを固定（省略時はRetry-After/1秒） */
  retryDelayMs?: number
}

const DEFAULT_TIMEOUT_MS = 10_000
const RETRY_AFTER_CAP_MS = 60_000

function resolveRetryDelayMs(status: number, retryAfterHeader: string | null) {
  if (status === 429 && retryAfterHeader) {
    const seconds = Number(retryAfterHeader)
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, RETRY_AFTER_CAP_MS)
    }
  }
  return 1000
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchOnce(
  request: ProviderRequest,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 1チャンネルへメッセージを送信する。webhookUrl/apiTokenの復号もここで行う。
 * どんな失敗でも例外を投げず`{ok:false, detail}`で返す。
 */
export async function sendToChannel(
  channel: NotificationChannelRow,
  message: NotificationMessage,
  options: SendOptions = {},
): Promise<SendResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  let request: ProviderRequest
  try {
    request = buildProviderRequest(
      channel.provider,
      {
        webhookUrl: channel.webhookUrlEncrypted
          ? decryptSecret(channel.webhookUrlEncrypted)
          : null,
        apiToken: channel.apiTokenEncrypted
          ? decryptSecret(channel.apiTokenEncrypted)
          : null,
        roomId: channel.roomId,
      },
      message,
    )
  } catch (error) {
    return {
      ok: false,
      detail: `設定エラー: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  try {
    let res = await fetchOnce(request, fetchImpl, timeoutMs)
    if (!isSuccessStatus(request, res.status)) {
      const retryable = res.status === 429 || res.status >= 500
      if (retryable) {
        await sleep(
          options.retryDelayMs ??
            resolveRetryDelayMs(res.status, res.headers.get('retry-after')),
        )
        res = await fetchOnce(request, fetchImpl, timeoutMs)
      }
    }
    if (isSuccessStatus(request, res.status)) {
      return { ok: true, detail: null }
    }
    return { ok: false, detail: `HTTP ${res.status}` }
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError'
    return {
      ok: false,
      detail: isAbort
        ? `タイムアウト（${timeoutMs}ms）`
        : `送信エラー: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
