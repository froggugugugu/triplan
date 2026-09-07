import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requirePermission } from '../auth/rbac.js'
import { db } from '../db/client.js'
import {
  type ExternalToolConnectionRow,
  externalToolConnections,
  projects,
  scheduleEntries,
  taskSyncLogs,
} from '../db/schema.js'
import { callToolApi } from '../external-tools/client.js'
import type { ExternalTool } from '../external-tools/config.js'
import {
  buildAddToSectionRequest,
  buildCreatePayload,
  buildGroupCreateRequest,
  buildGroupListRequest,
  buildTaskCreationPlan,
  extractCreatedGroupId,
  extractExternalId,
  extractGroupId,
  type TaskCreationSkip,
} from '../external-tools/payload.js'

/**
 * WBSタスクのAPI起票（API起票基盤 Phase 3、非公開の設計文書・
 *）。postgresモード専用。
 *
 * - **サーバー側で対象を再検証する**: クライアント申告のtaskIdsをそのまま起票せず、
 *   指定ルート配下・リーフ・未起票のみを`buildTaskCreationPlan`（クライアントの
 *   ドライランと同一の純関数）で絞る
 * - **逐次POST＋スロットル**: 全ツール一律で約1件/秒。GitHubの二次制限（80件/分・
 *   500件/時）が4ツール中の最小公表値のため、これに合わせれば全ツールの制限内に収まる
 * - **1件成功ごとに外部IDを即時UPDATE**する（バッチ書込みしない）。起票成功→学習前の
 *   クラッシュ窓を最小化する。外部APIに冪等キーが無いため完全なexactly-onceは不可能で、
 *   残存リスク（窓中のクラッシュで再実行時に二重起票）は利用ガイドに明記する
 * - 学習済みタスクは常にskipされるため、部分失敗後の再実行は未起票分だけが対象になる
 */

/** 1リクエストあたりの上限（スロットル約1件/秒のため、50件で約1分） */
const MAX_TASKS_PER_REQUEST = 50
const THROTTLE_MS = 1000

const executeBodySchema = z.object({
  connectionId: z.string().uuid(),
  rootProjectId: z.string().uuid(),
  taskIds: z.array(z.string().uuid()).min(1),
})

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * グループ（直近親の工程名）を外部ツール側の識別子へ解決する。
 * Backlog=カテゴリー／Asana=セクションで、**未存在なら作成する**（CSVインポート時に
 * 外部ツールが取込側で作るのと等価の挙動。ユーザー承認済みの設計判断）。
 * 同一実行内はキャッシュして、同じ工程のタスクごとに問い合わせない。
 * 解決に失敗してもnullを返すだけ（グループが付かないだけで起票自体は続行する）。
 */
async function resolveGroupId(
  connection: ExternalToolConnectionRow,
  tool: ExternalTool,
  targetConfig: Record<string, unknown>,
  groupName: string,
  cache: Map<string, string | null>,
): Promise<string | null> {
  const cached = cache.get(groupName)
  if (cached !== undefined) return cached

  const listReq = buildGroupListRequest(tool, targetConfig)
  if (!listReq) {
    cache.set(groupName, null)
    return null
  }

  let resolved: string | null = null
  const list = await callToolApi(connection, listReq.path)
  if (list.ok) {
    resolved = extractGroupId(tool, list.data, groupName)
    if (!resolved) {
      const createReq = buildGroupCreateRequest(tool, targetConfig, groupName)
      if (createReq) {
        const created = await callToolApi(connection, createReq.path, {
          method: 'POST',
          body: createReq.body,
          encoding: createReq.encoding,
        })
        if (created.ok) resolved = extractCreatedGroupId(tool, created.data)
      }
    }
  }
  cache.set(groupName, resolved)
  return resolved
}

export default async function taskCreationRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/api/taskCreation/execute',
    { preHandler: [fastify.authenticate, requirePermission('data:write')] },
    async (req, reply) => {
      const parsed = executeBodySchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues })
      }
      const { connectionId, rootProjectId, taskIds } = parsed.data
      if (taskIds.length > MAX_TASKS_PER_REQUEST) {
        return reply.code(400).send({
          error: `一度に起票できるのは${MAX_TASKS_PER_REQUEST}件までです`,
        })
      }

      const [connection] = await db
        .select()
        .from(externalToolConnections)
        .where(eq(externalToolConnections.id, connectionId))
      if (!connection) {
        return reply.code(404).send({ error: '接続が見つかりません' })
      }
      if (!connection.enabled || !connection.apiTokenEncrypted) {
        return reply.code(400).send({
          error:
            '接続が有効化されていません（起票先とトークンを設定してください）',
        })
      }
      const targetConfig = connection.targetConfig as Record<
        string,
        unknown
      > | null
      if (!targetConfig) {
        return reply.code(400).send({ error: '起票先が未設定です' })
      }

      const all = await db.select().from(projects)
      // 期日は所属工程のスケジュール終了日から導出する。
      // 対象ルートの分だけ引けばよい（工程の期間は案件単位で持つ）
      const entries = await db
        .select()
        .from(scheduleEntries)
        .where(eq(scheduleEntries.projectId, rootProjectId))
      const plan = buildTaskCreationPlan(all, rootProjectId, taskIds, entries)

      const tool = connection.tool as ExternalTool
      const created: Array<{ id: string; code: string; externalId: string }> =
        []
      const failed: Array<{ id: string; code: string; reason: string }> = []
      const skips: TaskCreationSkip[] = [...plan.skips]

      // 工程名→外部側グループ識別子のキャッシュ（同じ工程で問い合わせを繰り返さない）
      const groupCache = new Map<string, string | null>()

      for (const [index, target] of plan.targets.entries()) {
        // 外部APIのレート制限（GitHub二次制限=80件/分が最小）に合わせて平準化する
        if (index > 0) await sleep(THROTTLE_MS)

        const groupId = target.group
          ? await resolveGroupId(
              connection,
              tool,
              targetConfig,
              target.group,
              groupCache,
            )
          : null

        const payload = buildCreatePayload(tool, targetConfig, target, groupId)
        const result = await callToolApi(connection, payload.path, {
          method: 'POST',
          body: payload.body,
          encoding: payload.encoding,
        })
        if (!result.ok) {
          failed.push({
            id: target.id,
            code: target.code,
            reason: result.detail ?? '起票に失敗しました',
          })
          continue
        }
        const externalId = extractExternalId(tool, targetConfig, result.data)
        if (!externalId) {
          // 起票自体は成功しているが外部IDが読めない=学習しない（誤ったIDを覚えない）
          failed.push({
            id: target.id,
            code: target.code,
            reason:
              '起票しましたが外部IDを取得できませんでした（重複起票を避けるため、外部ツール側を確認してください）',
          })
          continue
        }

        // 1件ごとに即時学習（バッチ書込みにしない＝クラッシュ窓の最小化）
        await db
          .update(projects)
          .set({
            externalSource: tool,
            externalTaskId: externalId,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, target.id))
        created.push({ id: target.id, code: target.code, externalId })

        // Asanaはセクションを作成時に指定できないため、起票後に移す。
        // 失敗しても起票自体は成立しているので失敗扱いにしない（グループが付かないだけ）
        if (groupId) {
          const addReq = buildAddToSectionRequest(tool, groupId, externalId)
          if (addReq) {
            await callToolApi(connection, addReq.path, {
              method: 'POST',
              body: addReq.body,
              encoding: addReq.encoding,
            })
          }
        }
      }

      await db.insert(taskSyncLogs).values({
        syncedAt: new Date().toISOString(),
        channel: 'api',
        source: tool,
        fileName: null,
        createdCount: created.length,
        completedCount: 0,
        reopenedCount: 0,
        unchangedCount: 0,
        skippedCount: skips.length + failed.length,
        skippedReasons: [
          ...skips.map((s) => ({
            row: 0,
            reason: `${s.code ?? '-'}: ${s.reason}`,
          })),
          ...failed.map((f) => ({ row: 0, reason: `${f.code}: ${f.reason}` })),
        ].slice(0, 100),
        note: `API起票（${connection.name}）`,
      })

      return reply.send({ created, skipped: skips, failed })
    },
  )
}
