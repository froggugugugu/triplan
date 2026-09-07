import compress from '@fastify/compress'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import Fastify, { type FastifyInstance } from 'fastify'
import authPlugin from './auth/plugin.js'
import { env } from './env.js'
import apiKeysRoutes from './routes/api-keys.js'
import appSettingsRoutes from './routes/app-settings.js'
import auditLogRoutes from './routes/audit-logs.js'
import authRoutes from './routes/auth.js'
import databaseRoutes from './routes/database.js'
import actualsRoutes from './routes/entities/actuals.js'
import assignmentNotesRoutes from './routes/entities/assignment-notes.js'
import assignmentsRoutes from './routes/entities/assignments.js'
import budgetRoutes from './routes/entities/budget.js'
import commerceRoutes from './routes/entities/commerce.js'
import csvMappingRoutes from './routes/entities/csv-mapping.js'
import documentTemplatesRoutes from './routes/entities/document-templates.js'
import estimateSnapshotsRoutes from './routes/entities/estimate-snapshots.js'
import membersRoutes from './routes/entities/members.js'
import organizationRoutes from './routes/entities/organization.js'
import personnelPlanRoutes from './routes/entities/personnel-plan.js'
import projectBaselineRoutes from './routes/entities/project-baselines.js'
import projectProgressRoutes from './routes/entities/project-progress.js'
import projectsRoutes from './routes/entities/projects.js'
import risksRoutes from './routes/entities/risks.js'
import scheduleRoutes from './routes/entities/schedule.js'
import skillsRoutes from './routes/entities/skills.js'
import techTagsRoutes from './routes/entities/tech-tags.js'
import wbsTemplatesRoutes from './routes/entities/wbs-templates.js'
import externalToolsRoutes from './routes/external-tools.js'
import healthRoutes from './routes/health.js'
import notificationsRoutes from './routes/notifications.js'
import ssoProvidersRoutes from './routes/sso-providers.js'
import taskCreationRoutes from './routes/task-creation.js'
import usersRoutes from './routes/users.js'
import v1Routes from './routes/v1.js'
import webhooksRoutes from './routes/webhooks.js'

/**
 * Fastifyアプリの組み立て本体。index.ts（実プロセス起動用）と統合テスト
 * （`fastify.inject()`でポートを開かずにHTTPリクエストを検証する）の両方から
 * 再利用できるよう、`listen()`を呼ばないファクトリ関数として切り出す
 * （Fastify公式が推奨する"app factory"パターン）。
 */
export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      // パスワード・トークンをログへ出力しない（§12.3）
      redact: [
        'req.body.password',
        'req.body.apiToken',
        'req.headers.authorization',
        'req.headers.cookie',
      ],
    },
  })

  /**
   * レスポンス圧縮。
   *
   * `crud-factory`のGETは全行を返す設計（クライアントが全件をstateに保持して
   * 横断検索・ツリー構築を行うため）で、応答サイズが件数に比例する。
   * UUIDと繰り返しキーが多いJSONは圧縮が非常によく効き、実測で
   * **50案件×200タスクのprojects一覧が6.28MB→0.32MB（5.1%）**になる。
   * ページネーションは全件保持を前提とした既存設計を壊すため採らず、圧縮で対処する。
   */
  // CORSは**必ず最初に**登録する。@fastify/compressより後に登録すると、
  // corsがonRequestで返すプリフライト応答にcompressのonSendが噛み、
  // ブラウザ側で`net::ERR_FAILED`（＝プリフライト失敗）になる。
  // カスタムヘッダーを伴うPATCH（楽観ロックの`X-Expected-Updated-At`）だけが
  // プリフライトを必要とするため、GET/POSTは通るのにPATCHだけ全滅する、という
  // 分かりにくい壊れ方をする（postgresブラウザE2Eで発見）
  await fastify.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
    // **@fastify/corsの既定は`GET,HEAD,POST`**。明示しないとプリフライトが
    // PATCH/DELETEを許可せず、別オリジン構成（Vite:5173 ⇄ API:3001）では
    // 更新・削除が`net::ERR_FAILED`で全滅する。作成・参照だけは通るため
    // 「保存しても反映されない」という形でしか症状が出ない（で
    // postgresブラウザE2Eにより発見。fastify.injectはプリフライトを経ないため
    // 統合テストでは検出できなかった）
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  })

  await fastify.register(compress, {
    global: true,
    // 小さな応答は圧縮のCPUコストが利得を上回るため素通しする
    threshold: 1024,
    encodings: ['br', 'gzip', 'deflate'],
  })
  await fastify.register(cookie)
  await fastify.register(authPlugin)

  // クライアント（authenticated-fetch.ts）はDELETE等ボディなしのリクエストでも
  // 常にContent-Type: application/jsonを送るため、Fastify既定の
  // JSONパーサーが空ボディを不正リクエストとして拒否してしまう
  // （FST_ERR_CTP_EMPTY_JSON_BODY）。空ボディはundefinedとして許容する。
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      if (typeof body !== 'string' || body.length === 0) {
        done(null, undefined)
        return
      }
      try {
        done(null, JSON.parse(body))
      } catch (error) {
        done(error as Error, undefined)
      }
    },
  )

  await fastify.register(healthRoutes)
  await fastify.register(authRoutes)
  await fastify.register(usersRoutes)
  await fastify.register(ssoProvidersRoutes)
  await fastify.register(organizationRoutes)
  await fastify.register(techTagsRoutes)
  await fastify.register(membersRoutes)
  await fastify.register(assignmentsRoutes)
  await fastify.register(assignmentNotesRoutes)
  await fastify.register(risksRoutes)
  await fastify.register(actualsRoutes)
  await fastify.register(projectsRoutes)
  await fastify.register(scheduleRoutes)
  await fastify.register(wbsTemplatesRoutes)
  await fastify.register(documentTemplatesRoutes)
  await fastify.register(appSettingsRoutes)
  await fastify.register(personnelPlanRoutes)
  await fastify.register(skillsRoutes)
  await fastify.register(projectProgressRoutes)
  await fastify.register(projectBaselineRoutes)
  await fastify.register(estimateSnapshotsRoutes)
  await fastify.register(commerceRoutes)
  await fastify.register(csvMappingRoutes)
  await fastify.register(budgetRoutes)
  await fastify.register(databaseRoutes)
  await fastify.register(webhooksRoutes)
  await fastify.register(notificationsRoutes)
  await fastify.register(externalToolsRoutes)
  await fastify.register(taskCreationRoutes)
  await fastify.register(apiKeysRoutes)
  await fastify.register(auditLogRoutes)
  await fastify.register(v1Routes)

  return fastify
}
