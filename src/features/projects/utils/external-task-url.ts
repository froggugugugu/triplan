import type { ExternalTool } from '@/shared/api/external-tools-api'

/**
 * 起票済みタスクから外部ツール上の課題URLを解決する。
 *
 * 外部IDの形式は起票（`server/src/external-tools/payload.ts` の`extractExternalId`）と
 * Webhook受信（`server/src/routes/webhooks.ts`）で統一されている:
 * backlog=`PROJ-123` / jira=`PROJ-123` / asana=gid / github=`owner/repo#123`。
 * ここでは**その形式に合致するものだけ**をリンク化し、読めない値は握り潰す
 * （誤ったURLへ飛ばすくらいならリンクを出さない）。
 */

/** backlog/jiraの課題キー（プロジェクトキー-連番） */
const ISSUE_KEY_PATTERN = /^[A-Za-z0-9_]+-\d+$/
/** asanaのgid（数字のみ） */
const ASANA_GID_PATTERN = /^\d+$/
/** githubの外部ID（owner/repo#番号）。owner・repoにスラッシュ・空白・記号を許さない */
const GITHUB_REF_PATTERN = /^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)#(\d+)$/

/** baseUrlを必要とするツール（オンプレ／スペース固有ホストのため推測できない） */
const BASE_URL_REQUIRED_TOOLS: ReadonlySet<string> = new Set([
  'backlog',
  'jira',
])

/**
 * baseUrlを正規化する。httpsでないもの・URLとして解釈できないものはnull
 * （`javascript:`等のスキームをhrefへ流し込まないための防御。サーバー側の
 * `validateConnectionInput`はhttps必須だが、クライアントは受け取った値を信用しない）。
 */
function normalizeBaseUrl(baseUrl: string | null | undefined): string | null {
  if (!baseUrl) return null
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  return baseUrl.replace(/\/+$/, '')
}

/**
 * 外部タスクのURLを組み立てる。解決できない場合はnullを返す。
 *
 * @param source `Project.externalSource`（起票元ツールのスラッグ）
 * @param externalTaskId `Project.externalTaskId`（外部ツール側のID）
 * @param baseUrl 接続設定のbaseUrl（backlog/jiraのみ必須。asana/githubはnullでよい）
 */
export function buildExternalTaskUrl(
  source: string | null | undefined,
  externalTaskId: string | null | undefined,
  baseUrl: string | null | undefined,
): string | null {
  if (!source || !externalTaskId) return null
  const id = externalTaskId.trim()
  if (!id) return null

  const base = normalizeBaseUrl(baseUrl)
  if (BASE_URL_REQUIRED_TOOLS.has(source) && !base) return null

  switch (source) {
    case 'backlog':
      return ISSUE_KEY_PATTERN.test(id) ? `${base}/view/${id}` : null
    case 'jira':
      return ISSUE_KEY_PATTERN.test(id) ? `${base}/browse/${id}` : null
    case 'asana':
      return ASANA_GID_PATTERN.test(id)
        ? `https://app.asana.com/0/0/${id}`
        : null
    case 'github': {
      const matched = GITHUB_REF_PATTERN.exec(id)
      if (!matched) return null
      const [, owner, repo, issueNumber] = matched
      return `https://github.com/${owner}/${repo}/issues/${issueNumber}`
    }
    default:
      // 未知のスラッグ（将来ツール・Webhook専用の'generic'等）はリンクを作らない
      return null
  }
}

/** `resolveToolBaseUrls`が受け取る接続の最小形（テスト容易性のため全体型に依存しない） */
export interface ToolBaseUrlSource {
  /** 案件の既定接続（`Project.externalConnectionId`）と突き合わせるためのid */
  id?: string
  tool: ExternalTool
  baseUrl: string | null
}

/**
 * ツール→baseUrlのマップを作る。
 *
 * `Project.externalSource`はツールのスラッグしか持たず「どの接続から起票したか」を
 * 記録していないため、**同一ツールに異なるbaseUrlの接続が複数ある場合は判別できない**。
 * その場合は`null`を入れてリンクを抑止する（別スペースの同名課題へ飛ばす事故の防止）。
 */
export function resolveToolBaseUrls(
  connections: readonly ToolBaseUrlSource[],
  /**
   * 案件の既定接続id（`Project.externalConnectionId`）。
   * 指定するとそのツールのbaseUrlを接続単位で確定でき、
   * **同一ツールに複数接続がある場合でもリンクを出せる**
   */
  preferredConnectionId?: string | null,
): Partial<Record<ExternalTool, string | null>> {
  const map: Partial<Record<ExternalTool, string | null>> = {}
  for (const connection of connections) {
    const normalized = normalizeBaseUrl(connection.baseUrl)
    if (!normalized) continue
    if (!(connection.tool in map)) {
      map[connection.tool] = normalized
      continue
    }
    // 既出のbaseUrlと食い違う場合のみ解決不能にする（同一値の重複は許容）
    if (map[connection.tool] !== normalized) {
      map[connection.tool] = null
    }
  }

  // 案件がどの接続を使うか分かっているなら、そのツールは曖昧さが無くなる。
  // 上のループでnullにした（＝複数接続で食い違う）ツールもここで確定する
  if (preferredConnectionId) {
    const preferred = connections.find((c) => c.id === preferredConnectionId)
    if (preferred) {
      map[preferred.tool] = normalizeBaseUrl(preferred.baseUrl)
    }
  }
  return map
}
