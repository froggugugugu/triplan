import { decryptSecret } from '../auth/crypto.js'
import type { ExternalToolConnectionRow } from '../db/schema.js'
import {
  buildApiUrl,
  buildAuthHeaders,
  type ExternalTool,
  type TargetConfig,
} from './config.js'

/**
 * 外部ツールAPIへのHTTPアクセス（非公開の設計文書）。
 * 接続テストと起票先設定の名前→ID解決（metadata）を担う。
 * 起票そのもの（Phase 3）もこのモジュールのfetch基盤を再利用する。
 */

const TIMEOUT_MS = 10_000

export interface ToolApiResult<T = unknown> {
  ok: boolean
  status: number
  data?: T
  /** 失敗時のみ。UIへそのまま表示する日本語メッセージ */
  detail?: string
}

/** 接続行から認証ヘッダを復元する（トークン未設定ならnull） */
function resolveHeaders(
  row: ExternalToolConnectionRow,
): Record<string, string> | null {
  if (!row.apiTokenEncrypted) return null
  const token = decryptSecret(row.apiTokenEncrypted)
  return buildAuthHeaders(row.tool as ExternalTool, token, row.authEmail)
}

/**
 * ボディを送信形式へ変換する。**Backlogはform-urlencoded必須**（公式仕様）で、
 * `categoryId[]`のような配列パラメータもこの形式で表現する。
 */
function encodeBody(
  body: unknown,
  encoding: 'json' | 'form',
): { contentType: string; payload: string } {
  if (encoding === 'form') {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(
      body as Record<string, unknown>,
    )) {
      if (value === undefined || value === null) continue
      // 配列は同一キーを繰り返す（`categoryId[]=1&categoryId[]=2`）
      for (const v of Array.isArray(value) ? value : [value]) {
        params.append(key, String(v))
      }
    }
    return {
      contentType: 'application/x-www-form-urlencoded',
      payload: params.toString(),
    }
  }
  return {
    contentType: 'application/json',
    payload: JSON.stringify(body),
  }
}

/** 外部ツールAPIを呼ぶ。例外は投げず結果オブジェクトへ畳む（送信側の都合で業務処理を壊さない） */
export async function callToolApi<T = unknown>(
  row: ExternalToolConnectionRow,
  path: string,
  init?: { method?: string; body?: unknown; encoding?: 'json' | 'form' },
): Promise<ToolApiResult<T>> {
  const headers = resolveHeaders(row)
  if (!headers) {
    return { ok: false, status: 0, detail: 'APIトークンが未設定です' }
  }
  const url = buildApiUrl(row.tool as ExternalTool, row.baseUrl, path)
  const encoded =
    init?.body !== undefined
      ? encodeBody(init.body, init.encoding ?? 'json')
      : null
  try {
    const res = await fetch(url, {
      method: init?.method ?? 'GET',
      headers: {
        ...headers,
        ...(encoded ? { 'Content-Type': encoded.contentType } : {}),
      },
      body: encoded?.payload,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        status: res.status,
        detail: `${res.status} ${text.slice(0, 200)}`.trim(),
      }
    }
    const data = (await res.json().catch(() => null)) as T
    return { ok: true, status: res.status, data }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      detail: error instanceof Error ? error.message : '接続に失敗しました',
    }
  }
}

/** 接続テスト用の軽量GETパス（認証が通るかだけを見る） */
function testPath(row: ExternalToolConnectionRow): string {
  switch (row.tool as ExternalTool) {
    case 'backlog':
      return '/api/v2/users/myself'
    case 'jira':
      return '/rest/api/3/myself'
    case 'asana':
      return '/users/me'
    case 'github': {
      // GitHubは起票先リポジトリまで含めて到達性を確認する（owner/repoの打ち間違い検出）
      const target = row.targetConfig as TargetConfig<'github'> | null
      return target?.owner && target?.repo
        ? `/repos/${target.owner}/${target.repo}`
        : '/user'
    }
  }
}

export async function testConnection(
  row: ExternalToolConnectionRow,
): Promise<ToolApiResult> {
  return callToolApi(row, testPath(row))
}

/** 起票先設定の選択肢（名前→IDの解決に使う。UIのセレクタへそのまま渡す形） */
export interface ToolMetadata {
  projects: Array<{ id: string; name: string }>
  issueTypes?: Array<{ id: string; name: string }>
  priorities?: Array<{ id: string; name: string }>
}

interface NamedIdNumber {
  id: number
  name: string
}
/** Asanaのリソース識別子はidではなくgid */
interface AsanaNamedResource {
  gid: string
  name: string
}

/**
 * 起票先の選択肢を取得する。ツールごとに必要な軸が異なる:
 * Backlog=プロジェクト/種別/優先度（数値ID）、Jira=プロジェクト（キー）、
 * Asana=プロジェクト（gid）、GitHubは不要（owner/repoの直接入力）
 */
export async function fetchToolMetadata(
  row: ExternalToolConnectionRow,
): Promise<ToolApiResult<ToolMetadata>> {
  const tool = row.tool as ExternalTool
  if (tool === 'github') {
    return { ok: true, status: 200, data: { projects: [] } }
  }

  if (tool === 'backlog') {
    const projects = await callToolApi<NamedIdNumber[]>(row, '/api/v2/projects')
    if (!projects.ok) return { ...projects, data: undefined }
    const priorities = await callToolApi<NamedIdNumber[]>(
      row,
      '/api/v2/priorities',
    )
    // 課題種別はプロジェクト単位のため、起票先プロジェクトが決まっている場合のみ引く
    const target = row.targetConfig as { projectId?: number } | null
    const issueTypes = target?.projectId
      ? await callToolApi<NamedIdNumber[]>(
          row,
          `/api/v2/projects/${target.projectId}/issueTypes`,
        )
      : null
    return {
      ok: true,
      status: 200,
      data: {
        projects: (projects.data ?? []).map((p) => ({
          id: String(p.id),
          name: p.name,
        })),
        priorities: (priorities.data ?? []).map((p) => ({
          id: String(p.id),
          name: p.name,
        })),
        ...(issueTypes?.ok
          ? {
              issueTypes: (issueTypes.data ?? []).map((t) => ({
                id: String(t.id),
                name: t.name,
              })),
            }
          : {}),
      },
    }
  }

  if (tool === 'jira') {
    const res = await callToolApi<{
      values?: Array<{ key: string; name: string }>
    }>(row, '/rest/api/3/project/search?maxResults=100')
    if (!res.ok) return { ...res, data: undefined }
    // 課題タイプはサイト全体で共有されるため、プロジェクト選択前でも引ける
    const issueTypes = await callToolApi<
      Array<{ id: string; name: string; subtask?: boolean }>
    >(row, '/rest/api/3/issuetype')
    return {
      ok: true,
      status: 200,
      data: {
        projects: (res.data?.values ?? []).map((p) => ({
          id: p.key,
          name: `${p.key} ${p.name}`,
        })),
        ...(issueTypes.ok
          ? {
              // サブタスク種別は単体で起票できないため候補から外す
              issueTypes: (issueTypes.data ?? [])
                .filter((t) => !t.subtask)
                .map((t) => ({ id: t.id, name: t.name })),
            }
          : {}),
      },
    }
  }

  // asana
  const res = await callToolApi<{ data?: AsanaNamedResource[] }>(
    row,
    '/projects?limit=100&opt_fields=name',
  )
  if (!res.ok) return { ...res, data: undefined }
  return {
    ok: true,
    status: 200,
    data: {
      projects: (res.data?.data ?? []).map((p) => ({
        id: p.gid,
        name: p.name,
      })),
    },
  }
}
