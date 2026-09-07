import { z } from 'zod'

/**
 * 外部ツール接続設定のコア（非公開の設計文書・§4.1）。
 * すべて純関数（HTTP呼び出しはclient.tsの責務）。
 *
 * - baseUrlは**https必須＋ツール別のホスト許可リスト**で検証する。サーバーが外部fetchする
 *   宛先になるためSSRF面を狭める意図で、Cloud専用（Jira Server/DC・GitHub Enterprise
 *   Serverは非対応）という設計判断とも一致する
 * - APIトークンはURLクエリではなくヘッダで送る（Backlogは`apiKey`クエリも受け付けるが、
 *   URLはログ・プロキシに残りやすいためヘッダ方式を採る）
 */

export const EXTERNAL_TOOLS = ['backlog', 'asana', 'jira', 'github'] as const
export type ExternalTool = (typeof EXTERNAL_TOOLS)[number]

/** ホスト許可リスト（末尾一致で判定。空配列=baseUrl自体を受け付けない固定ホストのツール） */
const ALLOWED_HOST_SUFFIXES: Record<ExternalTool, string[]> = {
  backlog: ['.backlog.jp', '.backlog.com', '.backlogtool.com'],
  jira: ['.atlassian.net'],
  asana: [],
  github: [],
}

/** 固定ホストのAPIベース（baseUrlを持たないツール） */
const FIXED_API_BASE: Record<ExternalTool, string | null> = {
  backlog: null,
  jira: null,
  asana: 'https://app.asana.com/api/1.0',
  github: 'https://api.github.com',
}

/** ツール別の起票先設定（targetConfig）。認証情報を先に保存する2段階フローのためnull許容 */
const targetConfigSchemas = {
  backlog: z.object({
    projectId: z.number().int().positive(),
    issueTypeId: z.number().int().positive(),
    priorityId: z.number().int().positive(),
  }),
  asana: z.object({ projectGid: z.string().min(1).max(50) }),
  jira: z.object({
    projectKey: z.string().min(1).max(50),
    issueTypeId: z.string().min(1).max(50),
  }),
  github: z.object({
    owner: z.string().min(1).max(100),
    repo: z.string().min(1).max(100),
  }),
} as const satisfies Record<ExternalTool, z.ZodTypeAny>

export type TargetConfig<T extends ExternalTool = ExternalTool> = z.infer<
  (typeof targetConfigSchemas)[T]
>

/**
 * 接続の入力値（baseUrl・authEmail）を検証する。
 * 問題があれば日本語のエラーメッセージ、問題なければnullを返す。
 */
export function validateConnectionInput(
  tool: ExternalTool,
  input: { baseUrl?: string | null; authEmail?: string | null },
): string | null {
  const allowed = ALLOWED_HOST_SUFFIXES[tool]
  const baseUrl = input.baseUrl?.trim() || null

  if (allowed.length === 0) {
    if (baseUrl) {
      return `${tool}はURLの指定に対応していません（クラウド版のみ対応）`
    }
  } else {
    if (!baseUrl) {
      return `${tool}はスペース/サイトのURLが必要です`
    }
    let parsed: URL
    try {
      parsed = new URL(baseUrl)
    } catch {
      return 'URLの形式が不正です'
    }
    if (parsed.protocol !== 'https:') {
      return 'URLはhttpsで指定してください'
    }
    // パスやクエリに許可ドメインを含む偽装URLを弾くため、必ずhostnameで判定する
    if (!allowed.some((suffix) => parsed.hostname.endsWith(suffix))) {
      return `対応していないホストです（${allowed.join(' / ')} のみ）`
    }
  }

  if (tool === 'jira' && !input.authEmail?.trim()) {
    return 'JiraはAPIトークンと対になるメールアドレスが必要です'
  }
  return null
}

/** 起票先設定を検証する（不正な形はthrow、未設定はnull） */
export function parseTargetConfig(
  tool: ExternalTool,
  raw: unknown,
): TargetConfig | null {
  if (raw === null || raw === undefined) return null
  return targetConfigSchemas[tool].strict().parse(raw) as TargetConfig
}

/** ツール別の認証ヘッダ。トークンはURLではなく必ずヘッダに載せる */
export function buildAuthHeaders(
  tool: ExternalTool,
  apiToken: string,
  authEmail: string | null,
): Record<string, string> {
  switch (tool) {
    case 'backlog':
      return { 'Backlog-API-Key': apiToken }
    case 'jira':
      return {
        Authorization: `Basic ${Buffer.from(`${authEmail ?? ''}:${apiToken}`).toString('base64')}`,
        Accept: 'application/json',
      }
    case 'asana':
      return { Authorization: `Bearer ${apiToken}` }
    case 'github':
      return {
        Authorization: `Bearer ${apiToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      }
  }
}

/** APIのURLを組み立てる（固定ホストのツールはbaseUrl不要） */
export function buildApiUrl(
  tool: ExternalTool,
  baseUrl: string | null,
  path: string,
): string {
  const fixed = FIXED_API_BASE[tool]
  const base = (fixed ?? baseUrl ?? '').replace(/\/+$/, '')
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}
