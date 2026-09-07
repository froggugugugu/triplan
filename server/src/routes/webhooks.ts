import { timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  extractCodeFromSubject,
  resolveDateOnly,
} from '@/shared/utils/task-sync-core'
import { db } from '../db/client.js'
import { projects, taskSyncLogs } from '../db/schema.js'
import { env } from '../env.js'

/**
 * 外部実行管理ツールのWebhook受信エンドポイント（Phase 2。
 * 非公開の設計文書）。
 *
 * - 認証はJWTではなく**URLシークレット**（`?secret=...`。外部ツールはBearerを付けられない
 *   のが普通）。`TASK_WEBHOOK_SECRET`未設定時はエンドポイント自体が無効（全401）
 * - 突合の優先順位はCSV経路と同一セマンティクス: ①学習済み外部ID ②件名の`[コード]`／
 *   コード直値 ③タスク名完全一致（リーフのみ）。複数一致・非リーフはskip
 * - **冪等**: 同一イベントの再送は変化なし（unchanged）に収束し、ログも増えない
 * - 突合不能・解釈不能は**202**で受理してskipログへ記録する（4xxを返すと外部ツールの
 *   リトライ嵐やWebhook自動無効化を招くため）
 */

/** アダプタが正規化したタスクイベント */
interface NormalizedTaskEvent {
  /** 外部ツール側のタスクID/キー（学習保存の対象）。null=不明 */
  externalId: string | null
  subject: string
  completed: boolean
  /** "YYYY-MM-DD"。null=イベントに完了日が無い（受信日を使う） */
  completedAt: string | null
}

/** アダプタの結果: イベント配列 or 「完了状態と無関係なので無視」 */
type AdapterResult =
  | { events: NormalizedTaskEvent[] }
  | { ignored: true; reason: string }

const WEBHOOK_SOURCES = [
  'generic',
  'backlog',
  'jira',
  'asana',
  'github',
] as const
type WebhookSource = (typeof WEBHOOK_SOURCES)[number]

// ============================================================================
// アダプタ（source別のペイロード正規化）
// ============================================================================

/** generic: 本ツール定義のJSON（外部ツールを自作スクリプト等で中継する場合の形式） */
const GenericPayloadSchema = z.object({
  taskKey: z.string().optional(),
  subject: z.string().min(1),
  completed: z.boolean(),
  completedAt: z.string().optional(),
})

function normalizeGeneric(body: unknown): AdapterResult {
  const parsed = GenericPayloadSchema.safeParse(body)
  if (!parsed.success) {
    return { ignored: true, reason: 'genericペイロードの形式が不正です' }
  }
  return {
    events: [
      {
        externalId: parsed.data.taskKey ?? null,
        subject: parsed.data.subject,
        completed: parsed.data.completed,
        completedAt: parsed.data.completedAt
          ? resolveDateOnly(parsed.data.completedAt)
          : null,
      },
    ],
  }
}

/**
 * Backlog: 課題の追加(type=1)・更新(type=2)・一括更新(type=14)イベント。
 * 課題キーは`project.projectKey`と`content.key_id`から組み立てる。
 *
 * 完了判定は`content.changes[]`の`field === 'status'`要素の`new_value`を一次情報とする
 * （公式確認済みのペイロード構造。の仕様調査）。`content.status.name`は
 * ペイロードによっては存在するためフォールバックとして併用する。どちらも無い
 * イベント（状態変更を含まない課題更新）は無視する。
 * 完了の状態名は`TASK_WEBHOOK_BACKLOG_DONE_STATUSES`環境変数（カンマ区切り）で設定でき、
 * 未設定時は日本語既定の「完了」のみ（Backlogの状態名は言語・カスタム設定に依存し、
 * Jiraのような言語非依存カテゴリが無いため。の負債解消）
 */

/** Backlogで「完了」とみなす状態名の集合（env未設定時は日本語既定の「完了」のみ） */
function getBacklogDoneStatuses(): string[] {
  const raw = env.TASK_WEBHOOK_BACKLOG_DONE_STATUSES ?? '完了'
  return raw
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
}
const BacklogPayloadSchema = z.object({
  type: z.number(),
  created: z.string().optional(),
  project: z.object({ projectKey: z.string() }),
  content: z.object({
    key_id: z.number(),
    summary: z.string(),
    status: z.object({ name: z.string() }).nullish(),
    changes: z
      .array(
        z.object({
          field: z.string(),
          new_value: z.string().nullish(),
        }),
      )
      .optional(),
  }),
})

function normalizeBacklog(body: unknown): AdapterResult {
  const parsed = BacklogPayloadSchema.safeParse(body)
  if (!parsed.success) {
    return { ignored: true, reason: 'backlogペイロードの形式が不正です' }
  }
  const p = parsed.data
  // 1=課題の追加、2=課題の更新、14=課題をまとめて更新のみ対象
  if (p.type !== 1 && p.type !== 2 && p.type !== 14) {
    return { ignored: true, reason: `対象外のイベントtype: ${p.type}` }
  }
  // 状態の解決: changes配列のstatus変更（一次）→ content.status（フォールバック）
  const statusChange = p.content.changes?.find((c) => c.field === 'status')
  const statusName = statusChange?.new_value ?? p.content.status?.name
  if (!statusName) {
    return { ignored: true, reason: '状態変更を含まない課題イベントです' }
  }
  return {
    events: [
      {
        externalId: `${p.project.projectKey}-${p.content.key_id}`,
        subject: p.content.summary,
        completed: getBacklogDoneStatuses().includes(statusName),
        completedAt: p.created ? resolveDateOnly(p.created) : null,
      },
    ],
  }
}

/**
 * Jira Cloud: `jira:issue_updated`/`jira:issue_created`イベント。
 * 完了判定は`fields.status.statusCategory.key === 'done'`（ステータス名は
 * プロジェクトごとに自由なため、言語・設定に依存しないカテゴリで判定する）。
 * 完了日は`fields.resolutiondate`
 */
const JiraPayloadSchema = z.object({
  webhookEvent: z.string(),
  issue: z.object({
    key: z.string(),
    fields: z.object({
      summary: z.string(),
      status: z.object({
        statusCategory: z.object({ key: z.string() }).nullish(),
      }),
      resolutiondate: z.string().nullish(),
    }),
  }),
})

function normalizeJira(body: unknown): AdapterResult {
  const parsed = JiraPayloadSchema.safeParse(body)
  if (!parsed.success) {
    return { ignored: true, reason: 'jiraペイロードの形式が不正です' }
  }
  const p = parsed.data
  if (
    p.webhookEvent !== 'jira:issue_updated' &&
    p.webhookEvent !== 'jira:issue_created'
  ) {
    return { ignored: true, reason: `対象外のイベント: ${p.webhookEvent}` }
  }
  return {
    events: [
      {
        externalId: p.issue.key,
        subject: p.issue.fields.summary,
        completed: p.issue.fields.status.statusCategory?.key === 'done',
        completedAt: p.issue.fields.resolutiondate
          ? resolveDateOnly(p.issue.fields.resolutiondate)
          : null,
      },
    ],
  }
}

/**
 * GitHub Issues: `issues`イベントのclose/reopenを完了状態へ写す
 * （非公開の設計文書）。
 * イベント種別は`X-GitHub-Event`ヘッダで判定し、`ping`（Webhook登録時の疎通確認）は
 * 202で受理して登録を成功させる。外部IDは`owner/repo#番号`（リポジトリ横断で一意・
 * 人間可読。node_idは不透明なため採用しない）で、API起票経路の学習形式と一致させる。
 */
const GithubPayloadSchema = z.object({
  action: z.string(),
  repository: z.object({ full_name: z.string() }),
  issue: z.object({
    number: z.number(),
    title: z.string(),
    closed_at: z.string().nullish(),
  }),
})

function normalizeGithub(
  headers: Record<string, unknown>,
  body: unknown,
): AdapterResult {
  const eventHeader = headers['x-github-event']
  const event = typeof eventHeader === 'string' ? eventHeader : ''
  if (event === 'ping') {
    return { ignored: true, reason: 'pingイベント（疎通確認）を受理しました' }
  }
  if (event !== 'issues') {
    return { ignored: true, reason: `対象外のイベント: ${event || '(不明)'}` }
  }
  const parsed = GithubPayloadSchema.safeParse(body)
  if (!parsed.success) {
    return { ignored: true, reason: 'githubペイロードの形式が不正です' }
  }
  const p = parsed.data
  if (p.action !== 'closed' && p.action !== 'reopened') {
    // opened/edited/labeled等は完了状態と無関係
    return { ignored: true, reason: `対象外のaction: ${p.action}` }
  }
  return {
    events: [
      {
        externalId: `${p.repository.full_name}#${p.issue.number}`,
        subject: p.issue.title,
        completed: p.action === 'closed',
        completedAt: p.issue.closed_at
          ? resolveDateOnly(p.issue.closed_at)
          : null,
      },
    ],
  }
}

/**
 * Asana: イベント通知にはタスク詳細が載らない（resource.gidのみ）ため、
 * 受信後にAsana APIへタスク詳細（name/completed/completed_at）を取りに行く。
 * `ASANA_ACCESS_TOKEN`未設定時はこのアダプタ自体が無効
 */
const AsanaPayloadSchema = z.object({
  events: z.array(
    z.object({
      action: z.string(),
      resource: z.object({
        gid: z.string(),
        resource_type: z.string(),
      }),
    }),
  ),
})

const AsanaTaskResponseSchema = z.object({
  data: z.object({
    gid: z.string(),
    name: z.string(),
    completed: z.boolean(),
    completed_at: z.string().nullish(),
  }),
})

async function normalizeAsana(body: unknown): Promise<AdapterResult> {
  if (!env.ASANA_ACCESS_TOKEN) {
    return {
      ignored: true,
      reason: 'ASANA_ACCESS_TOKENが未設定のためasanaソースは無効です',
    }
  }
  const parsed = AsanaPayloadSchema.safeParse(body)
  if (!parsed.success) {
    return { ignored: true, reason: 'asanaペイロードの形式が不正です' }
  }
  // 同一タスクの複数イベント（changed連発）は1回のフェッチへ集約する
  const taskGids = [
    ...new Set(
      parsed.data.events
        .filter(
          (e) => e.resource.resource_type === 'task' && e.action !== 'deleted',
        )
        .map((e) => e.resource.gid),
    ),
  ]
  if (taskGids.length === 0) {
    return { ignored: true, reason: 'タスクイベントが含まれていません' }
  }

  const events: NormalizedTaskEvent[] = []
  for (const gid of taskGids) {
    const res = await fetch(
      `https://app.asana.com/api/1.0/tasks/${gid}?opt_fields=name,completed,completed_at`,
      { headers: { authorization: `Bearer ${env.ASANA_ACCESS_TOKEN}` } },
    )
    if (!res.ok) continue // 削除済み・権限なし等は個別スキップ（他タスクは処理継続）
    const task = AsanaTaskResponseSchema.safeParse(await res.json())
    if (!task.success) continue
    events.push({
      externalId: task.data.data.gid,
      subject: task.data.data.name,
      completed: task.data.data.completed,
      completedAt: task.data.data.completed_at
        ? resolveDateOnly(task.data.data.completed_at)
        : null,
    })
  }
  if (events.length === 0) {
    return {
      ignored: true,
      reason: 'Asana APIからタスク詳細を取得できませんでした',
    }
  }
  return { events }
}

// ============================================================================
// 突合・適用
// ============================================================================

type ProjectRow = typeof projects.$inferSelect

interface ResolveOk {
  task: ProjectRow
}
interface ResolveSkip {
  reason: string
}

/** CSV経路（task-sync-utils.ts）と同一セマンティクスの3段突合 */
function resolveTask(
  all: ProjectRow[],
  leafIds: Set<string>,
  source: WebhookSource,
  ev: NormalizedTaskEvent,
): ResolveOk | ResolveSkip {
  let task: ProjectRow | undefined

  if (ev.externalId) {
    const byExternal = all.filter(
      (p) => p.externalSource === source && p.externalTaskId === ev.externalId,
    )
    if (byExternal.length === 1) task = byExternal[0]
  }

  if (!task) {
    const code = extractCodeFromSubject(ev.subject) ?? ev.subject.trim()
    if (code !== '') {
      const byCode = all.filter((p) => p.code === code)
      if (byCode.length > 1) {
        return { reason: `コードが重複しているため特定できません: ${code}` }
      }
      if (byCode.length === 1) task = byCode[0]
    }
    if (!task && ev.subject.trim() !== '') {
      const byName = all.filter(
        (p) => leafIds.has(p.id) && p.name === ev.subject.trim(),
      )
      if (byName.length > 1) {
        return { reason: `同名のタスクが複数あります: ${ev.subject}` }
      }
      if (byName.length === 1) task = byName[0]
    }
  }

  if (!task) {
    return { reason: `タスクを特定できません: ${ev.subject}` }
  }
  if (!leafIds.has(task.id)) {
    return {
      reason: `リーフタスクではありません（完了はリーフのみ対象）: ${task.code}`,
    }
  }
  return { task }
}

function verifySecret(provided: unknown): boolean {
  if (!env.TASK_WEBHOOK_SECRET || typeof provided !== 'string') return false
  const expected = Buffer.from(env.TASK_WEBHOOK_SECRET)
  const actual = Buffer.from(provided)
  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}

export default async function webhooksRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Params: { source: string }
    Querystring: { secret?: string }
  }>(
    '/api/webhooks/tasks/:source',
    async (
      req: FastifyRequest<{
        Params: { source: string }
        Querystring: { secret?: string }
      }>,
      reply: FastifyReply,
    ) => {
      if (!verifySecret(req.query.secret)) {
        return reply.code(401).send({ error: '認証に失敗しました' })
      }
      const source = req.params.source as WebhookSource
      if (!WEBHOOK_SOURCES.includes(source)) {
        return reply.code(404).send({ error: '未知のsourceです' })
      }

      // AsanaのWebhook作成ハンドシェイク: X-Hook-Secretヘッダをエコー応答する
      const hookSecret = req.headers['x-hook-secret']
      if (source === 'asana' && typeof hookSecret === 'string') {
        return reply.header('X-Hook-Secret', hookSecret).code(200).send()
      }

      let result: AdapterResult
      switch (source) {
        case 'generic':
          result = normalizeGeneric(req.body)
          break
        case 'backlog':
          result = normalizeBacklog(req.body)
          break
        case 'jira':
          result = normalizeJira(req.body)
          break
        case 'asana':
          result = await normalizeAsana(req.body)
          break
        case 'github':
          result = normalizeGithub(req.headers, req.body)
          break
      }

      if ('ignored' in result) {
        // 解釈不能・対象外は202で受理する（外部ツールのリトライを誘発しない）
        return reply.code(202).send({ ignored: true, reason: result.reason })
      }

      const all = await db.select().from(projects)
      const parentIds = new Set(
        all.map((p) => p.parentId).filter((id): id is string => id !== null),
      )
      const leafIds = new Set(
        all.filter((p) => !parentIds.has(p.id)).map((p) => p.id),
      )
      const today = new Date().toISOString().slice(0, 10)

      let applied = 0
      let reopened = 0
      let unchanged = 0
      const skippedReasons: Array<{ row: number; reason: string }> = []

      for (const ev of result.events) {
        const resolved = resolveTask(all, leafIds, source, ev)
        if ('reason' in resolved) {
          skippedReasons.push({ row: 0, reason: resolved.reason })
          continue
        }
        const task = resolved.task
        const before = task.completed ?? false
        const learnExternal =
          ev.externalId !== null &&
          (task.externalTaskId !== ev.externalId ||
            task.externalSource !== source)

        if (before === ev.completed && !learnExternal) {
          unchanged++
          continue
        }

        await db
          .update(projects)
          .set({
            completed: ev.completed,
            completedAt: ev.completed ? (ev.completedAt ?? today) : null,
            ...(learnExternal
              ? { externalSource: source, externalTaskId: ev.externalId }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(projects.id, task.id))

        if (before !== ev.completed) {
          if (ev.completed) applied++
          else reopened++
        } else {
          // 外部IDの学習のみ（完了状態は不変）
          unchanged++
        }
      }

      // 冪等性: 変化もskipも無いPOST（再送等）はログを追記しない
      if (applied > 0 || reopened > 0 || skippedReasons.length > 0) {
        await db.insert(taskSyncLogs).values({
          syncedAt: new Date().toISOString(),
          channel: 'webhook',
          source,
          fileName: null,
          completedCount: applied,
          reopenedCount: reopened,
          unchangedCount: unchanged,
          skippedCount: skippedReasons.length,
          skippedReasons: skippedReasons.slice(0, 100),
          note: null,
        })
      }

      const statusCode = applied + reopened > 0 || unchanged > 0 ? 200 : 202
      return reply.code(statusCode).send({
        applied,
        reopened,
        unchanged,
        skipped: skippedReasons.length,
      })
    },
  )
}
