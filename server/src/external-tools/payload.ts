import type { TaskCreationTarget } from '@/shared/utils/task-creation-core'
import type { ExternalTool } from './config.js'

/**
 * API起票のリクエスト構築（非公開の設計文書）。
 * すべて純関数。
 *
 * 対象抽出（`buildTaskCreationPlan`）はクライアントのドライランと共用するため
 * `shared/utils/task-creation-core.ts`に置き、ここではリエクスポートする
 * （task-sync-core.tsと同じ整理＝同じ判定を2箇所に書かない）。
 *
 * 件名は連携CSVエクスポート（`buildWbsExportRows`）と同一の`[コード] タスク名`形式。
 * 帰りの完了同期がこのコードを突合キーに使うため、形式を揃えることが要件。
 */
export {
  buildTaskCreationPlan,
  type TaskCreationCandidate,
  type TaskCreationPlan,
  type TaskCreationSkip,
  type TaskCreationTarget,
} from '@/shared/utils/task-creation-core'

export interface CreateRequest {
  path: string
  body: unknown
  /**
   * ボディの送信形式。**Backlogは`application/x-www-form-urlencoded`必須**
   * （公式: Add Issue の "Form parameters Content-Type:application/x-www-form-urlencoded"）。
   * 他3ツールはJSON。省略時はjson
   */
  encoding?: 'json' | 'form'
}

/** Jiraのラベルは空白を含められないため`-`へ寄せる */
function toJiraLabel(group: string): string {
  return group.replace(/\s+/g, '-')
}

/**
 * プレーンテキストをADF（Atlassian Document Format）の最小ドキュメントへ変換する。
 * Jira API v3の`description`はリッチテキストのオブジェクトを要求し、文字列を渡すと400になる。
 * 改行は段落の区切りとして扱う（ADFのtextノードは改行文字を含められない）。
 */
function toAdfDocument(text: string): Record<string, unknown> {
  const paragraphs = text.split(/\r?\n/)
  return {
    type: 'doc',
    version: 1,
    content: paragraphs.map((line) =>
      line
        ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
        : // 空行は空の段落（contentキーを持たせるとADFの検証に落ちる）
          { type: 'paragraph' },
    ),
  }
}

/**
 * ツール別の起票リクエスト（パス・ボディ・送信形式）を組み立てる。
 * `groupId`は事前に解決済みのグループ識別子（Backlog=カテゴリーID／Asana=セクションgid）。
 * Jira・GitHubはラベル（自由文字列）のため解決不要でnullが渡る。
 */
export function buildCreatePayload(
  tool: ExternalTool,
  targetConfig: Record<string, unknown>,
  target: TaskCreationTarget,
  groupId: string | null = null,
): CreateRequest {
  const subject = `[${target.code}] ${target.name}`
  const description = target.completionCriteria ?? ''

  // 期日。所属工程のスケジュール終了日から導出済みの値をそのまま渡す。
  // 未設定（工程未紐づけ・スケジュール未登録）ならキー自体を送らない
  const dueDate = target.dueDate ?? null

  switch (tool) {
    case 'backlog':
      return {
        path: '/api/v2/issues',
        encoding: 'form',
        body: {
          projectId: targetConfig.projectId,
          issueTypeId: targetConfig.issueTypeId,
          priorityId: targetConfig.priorityId,
          summary: subject,
          description,
          ...(dueDate ? { dueDate } : {}),
          // 配列パラメータは`categoryId[]`表記（公式のAdd Issueパラメータ表）
          ...(groupId ? { 'categoryId[]': groupId } : {}),
        },
      }
    case 'jira':
      return {
        path: '/rest/api/3/issue',
        body: {
          fields: {
            project: { key: targetConfig.projectKey },
            issuetype: { id: targetConfig.issueTypeId },
            summary: subject,
            // Jira API v3のdescriptionはADF（Atlassian Document Format）オブジェクト。
            // プレーン文字列を渡すと400になるため段落ノードへ包む。
            // 完了条件が空のときはキーごと省略（空のADFを送らない）
            ...(description ? { description: toAdfDocument(description) } : {}),
            ...(dueDate ? { duedate: dueDate } : {}),
            ...(target.group ? { labels: [toJiraLabel(target.group)] } : {}),
          },
        },
      }
    case 'asana':
      return {
        path: '/tasks',
        body: {
          data: {
            name: subject,
            notes: description,
            projects: [targetConfig.projectGid],
            ...(dueDate ? { due_on: dueDate } : {}),
            // セクションへの所属は作成時に指定できないため、起票後に
            // POST /sections/{gid}/addTask で移す（buildAddToSectionRequest）
          },
        },
      }
    case 'github':
      // 【判断】GitHubのIssueは期日フィールドを持たない（マイルストーンのみ）ため
      // 期日は送らない。マイルストーンは番号指定が必要で工程名からは解決できない
      return {
        path: `/repos/${targetConfig.owner}/${targetConfig.repo}/issues`,
        body: {
          title: subject,
          body: description,
          ...(target.group ? { labels: [target.group] } : {}),
        },
      }
  }
}

/**
 * グループ（直近親の工程名）の解決・作成リクエスト（Backlog=カテゴリー／Asana=セクション）。
 * Jira・GitHubはラベル＝自由文字列のためマスタ解決が要らず、ここには現れない。
 */
export function buildGroupListRequest(
  tool: ExternalTool,
  targetConfig: Record<string, unknown>,
): { path: string } | null {
  switch (tool) {
    case 'backlog':
      return {
        path: `/api/v2/projects/${targetConfig.projectId}/categories`,
      }
    case 'asana':
      return { path: `/projects/${targetConfig.projectGid}/sections` }
    default:
      return null
  }
}

export function buildGroupCreateRequest(
  tool: ExternalTool,
  targetConfig: Record<string, unknown>,
  groupName: string,
): CreateRequest | null {
  switch (tool) {
    case 'backlog':
      return {
        path: `/api/v2/projects/${targetConfig.projectId}/categories`,
        encoding: 'form',
        body: { name: groupName },
      }
    case 'asana':
      return {
        path: `/projects/${targetConfig.projectGid}/sections`,
        body: { data: { name: groupName } },
      }
    default:
      return null
  }
}

/** グループ一覧レスポンスから「名前→識別子」を取り出す（ツール差の吸収） */
export function extractGroupId(
  tool: ExternalTool,
  response: unknown,
  groupName: string,
): string | null {
  if (!response) return null
  const rows =
    tool === 'asana'
      ? ((response as { data?: unknown }).data as unknown[] | undefined)
      : (response as unknown[])
  if (!Array.isArray(rows)) return null

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    if (r.name !== groupName) continue
    // Backlogは数値id、Asanaは文字列gid
    if (tool === 'asana') return typeof r.gid === 'string' ? r.gid : null
    return typeof r.id === 'number' ? String(r.id) : null
  }
  return null
}

/** 作成レスポンス（単体）から識別子を取り出す */
export function extractCreatedGroupId(
  tool: ExternalTool,
  response: unknown,
): string | null {
  if (!response || typeof response !== 'object') return null
  if (tool === 'asana') {
    const data = (response as { data?: Record<string, unknown> }).data
    return typeof data?.gid === 'string' ? data.gid : null
  }
  const id = (response as Record<string, unknown>).id
  return typeof id === 'number' ? String(id) : null
}

/**
 * Asana専用: 起票したタスクをセクションへ移す（作成時に指定できないため後追いで行う）。
 * 他ツールは起票ペイロード自体にグループが載るためnullを返す。
 */
export function buildAddToSectionRequest(
  tool: ExternalTool,
  sectionGid: string,
  taskGid: string,
): CreateRequest | null {
  if (tool !== 'asana') return null
  return {
    path: `/sections/${sectionGid}/addTask`,
    body: { data: { task: taskGid } },
  }
}

/**
 * 起票レスポンスから外部IDを取り出す。**Webhookアダプタが学習する形式と完全一致**させる
 * （不一致だと同じタスクが経路ごとに別IDで学習され、突合が分裂する）。
 * 期待した形でなければnullを返し、誤った外部IDを学習しない。
 */
export function extractExternalId(
  tool: ExternalTool,
  targetConfig: Record<string, unknown>,
  response: unknown,
): string | null {
  if (!response || typeof response !== 'object') return null
  const res = response as Record<string, unknown>

  switch (tool) {
    case 'backlog':
      return typeof res.issueKey === 'string' ? res.issueKey : null
    case 'jira':
      return typeof res.key === 'string' ? res.key : null
    case 'asana': {
      const data = res.data as Record<string, unknown> | undefined
      return typeof data?.gid === 'string' ? data.gid : null
    }
    case 'github':
      return typeof res.number === 'number'
        ? `${targetConfig.owner}/${targetConfig.repo}#${res.number}`
        : null
  }
}
