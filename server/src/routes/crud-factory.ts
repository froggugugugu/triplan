import { and, eq, inArray, sql } from 'drizzle-orm'
import type { PgTableWithColumns } from 'drizzle-orm/pg-core'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { diffChangedFields } from '../audit/diff.js'
import {
  type AuditEntry,
  entityNameFromPath,
  recordAudit,
} from '../audit/record.js'
import type { AuthenticatedUser } from '../auth/plugin.js'
import { type Role, requireEditorOrAbove } from '../auth/rbac.js'
import { db } from '../db/client.js'

// biome-ignore lint/suspicious/noExplicitAny: Drizzleの列構成はテーブルごとに異なるため、ジェネリックファクトリでは列集合をanyで受け、実行時にid/updatedAtの有無だけ検査する
type AnyTable = PgTableWithColumns<any>

/**
 * DataAdapter（`src/infrastructure/adapters/data-adapter.ts`）のlist/create/update/remove/
 * bulkUpdate契約に対応する汎用CRUDルートを1エンティティ分登録する。
 *
 * クライアント側`PostgresApiAdapter`は素の配列・オブジェクトをレスポンスに期待する
 * （`{ projects: [...] }`のようなラップはしない。admin系の手書きルートとは異なる契約）。
 *
 * 全24エンティティで同じ形のCRUDを24回手書きすると保守不能になるため、
 * テーブル・Zodスキーマ・オプションを渡すだけで登録できるようにする。
 * 個別のビジネスルール（アサインの1.0人月上限、予算再計算カスケード等）は
 * このファクトリでは扱わず、呼び出し側で`beforeCreate`/`afterCreate`等のフック、
 * または専用ルートで対応する（`routes/entities/`配下）。
 */
export interface CrudRouteOptions {
  /** 例: '/api/projects' */
  path: string
  table: AnyTable
  createSchema: z.ZodType
  /** idを含まない部分更新用スキーマ（`.partial()`済みのものを渡す） */
  updateSchema: z.ZodType
  /**
   * 追記専用エンティティ（skillEvaluations等）はtrueにする。
   * PATCH/DELETE/batchエンドポイントを登録しない。
   */
  readOnly?: boolean
  /** POST/PATCH/DELETEに要求するロール。省略時はeditor以上 */
  writeGuard?: ReturnType<typeof requireEditorOrAbove>
  /**
   * GET（一覧）に追加で要求するガード。省略時は認証のみ（data:readは全ロールが持つ）。
   * 金額専用エンティティ（divisionBudgets等）には`requirePermission('financials:read')`を
   * 渡し、partnerロールから金額データ自体を遮断する（多層防御のサーバー側）
   */
  readGuard?: ReturnType<typeof requireEditorOrAbove>
  /**
   * create検証後・INSERT前に呼ばれる。値の補正や追加検証に使う。
   * 第2引数に認証済みユーザーを受け取れる（省略可。actorスタンプ等、
   * クライアント申告を採用してはいけないフィールドをサーバー側で上書きするために使う。
   * P1-b）
   */
  beforeCreate?: (
    data: Record<string, unknown>,
    user?: AuthenticatedUser,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>
  /** INSERT成功後に呼ばれる（カスケード再計算等の副作用用） */
  afterCreate?: (row: Record<string, unknown>) => Promise<void>
  /** update検証後・UPDATE前に呼ばれる */
  beforeUpdate?: (
    id: string,
    data: Record<string, unknown>,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>
  /**
   * UPDATE成功後に呼ばれる。第2引数で更新前row・適用patchを受け取れる（省略可。
   * statusの変化検知＝CR承認通知等に使う。beforeCreateへのuser追加と同型の拡張、
   * Phase 3）。batch経路では`previous`は渡されない（`patch`のみ）
   */
  afterUpdate?: (
    row: Record<string, unknown>,
    context?: {
      previous?: Record<string, unknown>
      patch: Record<string, unknown>
    },
  ) => Promise<void>
  /**
   * DELETE実行前に呼ばれる（削除対象の行を渡す）。`CrudValidationError`を投げると
   * 400で拒否できる（締め済み月の実績を含むアサインの削除拒否等。P1-b）
   */
  beforeDelete?: (row: Record<string, unknown>) => Promise<void> | void
  /** DELETE成功後に呼ばれる（budgetId等の親IDが必要な場合のため、削除前の行を渡す） */
  afterDelete?: (deletedRow: Record<string, unknown>) => Promise<void>
  /**
   * レスポンス送信直前に返却行へ適用する変換（GET一覧・POST・PATCH・batch全経路で適用）。
   * `.optional()`のみ（`.nullable()`を伴わない）なクライアントZodフィールドに対応する
   * DB列がnullable（Project.description等）な場合、DBのNULLをそのままJSON化すると
   * `null`になり、クライアント側の`z.string().optional()`が`null`を拒否して
   * `DatabaseSchema.parse()`等の検証に失敗する（実際にexport/importで反証・発見したバグ）。
   * 該当フィールドをnull→undefinedへ変換するために使う
   */
  normalizeRow?: (row: Record<string, unknown>) => Record<string, unknown>
  /**
   * GET（一覧）のレスポンス行へ、リクエスト元ロールに応じたフィールドマスクを適用する
   * 。金額フィールドを内包する混在エンティティ（members.unitPriceHistory、
   * projects.contractAmount等）で、`financials:read`を持たないロールへ金額を返さないために
   * 使う。書き込み系レスポンス（POST/PATCH/batch）は`data:write`保持者（＝全員が
   * `financials:read`も持つ）にしか返らないため適用しない
   */
  redactRow?: (
    row: Record<string, unknown>,
    role: Role,
  ) => Record<string, unknown>
}

/** ヘッダーの値が日時として解釈できなかったことを表す番兵 */
const INVALID_EXPECTED_UPDATED_AT = Symbol('invalid-expected-updated-at')

/**
 * 楽観ロックの期待値（`X-Expected-Updated-At`）を取り出す。
 * 未指定はundefined（＝ロックしない、後方互換）、解釈できない値は番兵を返して400にする
 * （不正値を黙って無視すると、ロックしたつもりで素通りする事故になる）。
 */
function parseExpectedUpdatedAt(
  headers: Record<string, unknown>,
): Date | undefined | typeof INVALID_EXPECTED_UPDATED_AT {
  const raw = headers['x-expected-updated-at']
  if (raw === undefined) return undefined
  if (typeof raw !== 'string' || raw.trim() === '') {
    return INVALID_EXPECTED_UPDATED_AT
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return INVALID_EXPECTED_UPDATED_AT
  return parsed
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: error.issues })
}

/**
 * `beforeCreate`/`beforeUpdate`フック内で業務ルール違反（アサインの1.0人月上限等）を
 * 検出した際に投げる。フック側の例外はそのまま500になってしまうため、ファクトリが
 * これだけを捕捉して400として返す。
 */
export class CrudValidationError extends Error {}

/**
 * pgのエラーコードを取得する。drizzle-orm（node-postgresドライバ）は実際のpgエラーを
 * `DrizzleQueryError`でラップし、元のエラーは`.cause`に格納する（トップレベルの
 * `error.code`ではない）。両方をフォールバックで確認する。
 */
function getPgErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const direct = (error as { code?: unknown }).code
  if (typeof direct === 'string') return direct
  const cause = (error as { cause?: unknown }).cause
  if (typeof cause === 'object' && cause !== null) {
    const causeCode = (cause as { code?: unknown }).code
    if (typeof causeCode === 'string') return causeCode
  }
  return undefined
}

function isUniqueViolation(error: unknown): boolean {
  return getPgErrorCode(error) === '23505'
}

function isForeignKeyViolation(error: unknown): boolean {
  return getPgErrorCode(error) === '23503'
}

async function withDbErrorHandling<T>(
  reply: FastifyReply,
  run: () => Promise<T>,
  // deleteはRESTRICT制約で「他から参照されているため削除できない」FK違反になる。
  // insert/updateは「参照先が存在しない」FK違反になる。原因が逆なのでメッセージを分ける
  operation: 'write' | 'delete' = 'write',
): Promise<T | undefined> {
  try {
    return await run()
  } catch (error) {
    if (isUniqueViolation(error)) {
      reply.code(409).send({ error: '既存のデータと重複しています' })
      return undefined
    }
    if (isForeignKeyViolation(error)) {
      const message =
        operation === 'delete'
          ? '他のデータから参照されているため削除できません'
          : '参照先のデータが存在しません'
      reply.code(400).send({ error: message })
      return undefined
    }
    throw error
  }
}

export function registerCrudRoutes(
  fastify: FastifyInstance,
  options: CrudRouteOptions,
) {
  const {
    path,
    table,
    createSchema,
    updateSchema,
    readOnly = false,
    writeGuard = requireEditorOrAbove(),
  } = options
  const idColumn = table.id as AnyTable['id']
  const normalize =
    options.normalizeRow ?? ((row: Record<string, unknown>) => row)
  /** 監査証跡へ記録するエンティティ名 */
  const entityName = entityNameFromPath(path)

  fastify.get(
    path,
    {
      preHandler: options.readGuard
        ? [fastify.authenticate, options.readGuard]
        : [fastify.authenticate],
    },
    async (req, reply) => {
      const rows = await db.select().from(table)
      const normalized = rows.map(normalize)
      const redact = options.redactRow
      if (redact && req.user) {
        const role = req.user.role as Role
        return reply.send(normalized.map((row) => redact(row, role)))
      }
      return reply.send(normalized)
    },
  )

  fastify.post(
    path,
    { preHandler: [fastify.authenticate, writeGuard] },
    async (req, reply) => {
      const parsed = createSchema.safeParse(req.body)
      if (!parsed.success) return sendValidationError(reply, parsed.error)

      // クライアント側の楽観的更新（仮id→確定idの差し替え）が、戻り値idを他レコードの
      // parentId等へ同期的に連鎖利用する呼び出し元（applyWbsTemplate等）でも安全に成立する
      // よう、クライアント生成idを任意で受け付ける（createSchemaはid列を含まないため、
      // ここで別途プラック・検証する）。省略時は従来どおりDB既定値（defaultRandom）が使われる
      const rawId = (req.body as Record<string, unknown> | null)?.id
      let clientId: string | undefined
      if (rawId !== undefined) {
        const idResult = z.string().uuid().safeParse(rawId)
        if (!idResult.success) {
          return reply.code(400).send({ error: 'idの形式が不正です' })
        }
        clientId = idResult.data
      }

      let values: Record<string, unknown>
      try {
        values = options.beforeCreate
          ? await options.beforeCreate(
              parsed.data as Record<string, unknown>,
              req.user,
            )
          : (parsed.data as Record<string, unknown>)
      } catch (error) {
        if (error instanceof CrudValidationError) {
          return reply.code(400).send({ error: error.message })
        }
        throw error
      }
      if (clientId) {
        values = { ...values, id: clientId }
      }

      // 業務INSERTと監査記録を同一トランザクションで行う。
      // 記録漏れを許容すると証跡として使えないため、通知のようなfire-and-forgetにしない
      const rows = await withDbErrorHandling(reply, () =>
        db.transaction(async (tx) => {
          const inserted = await tx.insert(table).values(values).returning()
          const [row] = inserted
          if (row) {
            await recordAudit(tx, req.user, [
              {
                entity: entityName,
                entityId: String((row as Record<string, unknown>).id),
                action: 'create',
              },
            ])
          }
          return inserted
        }),
      )
      if (rows === undefined) return // withDbErrorHandlingが既に409送信済み
      const [created] = rows
      if (!created) {
        return reply.code(500).send({ error: '作成に失敗しました' })
      }
      if (options.afterCreate) await options.afterCreate(created)
      return reply.code(201).send(normalize(created))
    },
  )

  if (readOnly) return

  fastify.patch<{ Params: { id: string } }>(
    `${path}/:id`,
    { preHandler: [fastify.authenticate, writeGuard] },
    async (req, reply) => {
      const parsed = updateSchema.safeParse(req.body)
      if (!parsed.success) return sendValidationError(reply, parsed.error)

      const { id } = req.params
      let patch: Record<string, unknown>
      try {
        patch = options.beforeUpdate
          ? await options.beforeUpdate(
              id,
              parsed.data as Record<string, unknown>,
            )
          : (parsed.data as Record<string, unknown>)
      } catch (error) {
        if (error instanceof CrudValidationError) {
          return reply.code(400).send({ error: error.message })
        }
        throw error
      }

      const setValues: Record<string, unknown> = { ...patch }
      if ('updatedAt' in table) {
        setValues.updatedAt = new Date()
      }

      /**
       * 楽観ロック。クライアントが「読んだ時点のupdatedAt」を
       * `X-Expected-Updated-At`で申告した場合のみ検証する（未送出なら従来動作＝後方互換）。
       *
       * SELECTしてから比較するのではなくUPDATEのWHEREへ畳み込むことで、
       * 「読んで比較する間に他者が更新する」レースを構造的に無くす。
       */
      const expectedUpdatedAt = parseExpectedUpdatedAt(req.headers)
      if (expectedUpdatedAt === INVALID_EXPECTED_UPDATED_AT) {
        return reply
          .code(400)
          .send({ error: 'X-Expected-Updated-Atの形式が不正です' })
      }
      const canLock = expectedUpdatedAt !== undefined && 'updatedAt' in table
      const whereClause = canLock
        ? and(
            eq(idColumn, id),
            // timestamptzはマイクロ秒精度だが、クライアントが受け取るISO文字列は
            // ミリ秒精度。DB既定値（now()）で作られた行と突き合わせるため丸めて比較する
            sql`date_trunc('milliseconds', ${table.updatedAt}) = ${expectedUpdatedAt}`,
          )
        : eq(idColumn, id)

      // 更新前rowはafterUpdateの変化検知（status遷移等）と監査証跡の差分抽出に使う。
      // 監査が全エンティティで必要になったため常に読む
      let previous: Record<string, unknown> | undefined
      let conflicted = false

      const rows = await withDbErrorHandling(reply, () =>
        db.transaction(async (tx) => {
          const [existing] = await tx
            .select()
            .from(table)
            .where(eq(idColumn, id))
            .limit(1)
          previous = existing

          const updatedRows = await tx
            .update(table)
            .set(setValues)
            .where(whereClause)
            .returning()

          // レコードは在るのに0件更新＝期待したupdatedAtと食い違った（＝他者が先に更新した）
          if (updatedRows.length === 0 && existing && canLock) {
            conflicted = true
            return updatedRows
          }

          const [row] = updatedRows
          if (row && existing) {
            // 実際に値が変わったフィールドが無ければログを増やさない
            const changes = diffChangedFields(existing, patch)
            if (changes) {
              await recordAudit(tx, req.user, [
                {
                  entity: entityName,
                  entityId: id,
                  action: 'update',
                  changes,
                },
              ])
            }
          }
          return updatedRows
        }),
      )
      if (rows === undefined) return
      const [updated] = rows

      if (conflicted) {
        // 409（unique制約違反）と区別できるよう412を使う。
        // クライアントは楽観的更新をロールバックし再読込を促す
        return reply.code(412).send({
          error:
            '他のユーザーが先に更新しました。最新の内容を読み込み直してください',
        })
      }
      if (!updated) {
        return reply.code(404).send({ error: '対象が見つかりません' })
      }
      if (options.afterUpdate) {
        await options.afterUpdate(updated, { previous, patch })
      }
      return reply.send(normalize(updated))
    },
  )

  fastify.delete<{ Params: { id: string } }>(
    `${path}/:id`,
    { preHandler: [fastify.authenticate, writeGuard] },
    async (req, reply) => {
      const { id } = req.params

      if (options.beforeDelete) {
        const [existing] = await db
          .select()
          .from(table)
          .where(eq(idColumn, id))
          .limit(1)
        if (existing) {
          try {
            await options.beforeDelete(existing)
          } catch (error) {
            if (error instanceof CrudValidationError) {
              return reply.code(400).send({ error: error.message })
            }
            throw error
          }
        }
      }

      const rows = await withDbErrorHandling(
        reply,
        () =>
          db.transaction(async (tx) => {
            // 削除は元の値が失われるため、行全体をスナップショットとして残す
            const [existing] = await tx
              .select()
              .from(table)
              .where(eq(idColumn, id))
              .limit(1)

            const deletedRows = await tx
              .delete(table)
              .where(eq(idColumn, id))
              .returning()

            if (deletedRows[0] && existing) {
              await recordAudit(tx, req.user, [
                {
                  entity: entityName,
                  entityId: id,
                  action: 'delete',
                  changes: existing,
                },
              ])
            }
            return deletedRows
          }),
        'delete',
      )
      if (rows === undefined) return
      const [deleted] = rows
      if (!deleted) {
        return reply.code(404).send({ error: '対象が見つかりません' })
      }
      if (options.afterDelete) await options.afterDelete(deleted)
      return reply.code(204).send()
    },
  )

  fastify.patch<{
    Body: { patches: Array<{ id: string; patch: Record<string, unknown> }> }
  }>(
    `${path}/batch`,
    { preHandler: [fastify.authenticate, writeGuard] },
    async (req, reply) => {
      const { patches } = req.body
      if (!Array.isArray(patches)) {
        return reply
          .code(400)
          .send({ error: 'patchesは配列である必要があります' })
      }

      // 全件検証を先に済ませてからDB更新に入る（バリデーション不備の後半要素で
      // 前半分だけコミット済みになる事態を避ける）
      const resolvedPatches: Array<{
        id: string
        patch: Record<string, unknown>
      }> = []
      for (const { id, patch } of patches) {
        const parsed = updateSchema.safeParse(patch)
        if (!parsed.success) return sendValidationError(reply, parsed.error)
        try {
          const resolvedPatch = options.beforeUpdate
            ? await options.beforeUpdate(
                id,
                parsed.data as Record<string, unknown>,
              )
            : (parsed.data as Record<string, unknown>)
          resolvedPatches.push({ id, patch: resolvedPatch })
        } catch (error) {
          if (error instanceof CrudValidationError) {
            return reply.code(400).send({ error: error.message })
          }
          throw error
        }
      }

      // 1件でも対象なし（404相当）ならロールバックする＝トランザクションで原子性を担保
      try {
        const results = await db.transaction(async (tx) => {
          const updated: Record<string, unknown>[] = []
          const auditEntries: AuditEntry[] = []
          // 監査証跡の差分用に更新前を読む。一括更新こそ
          // 「誰がいつまとめて変えたか」を残す価値が高い（完了同期の一括書込み等）。
          // 1件ずつSELECTすると往復がN倍になるため、対象をまとめて1回で引く
          // （完了CSV取込は数百件のpatchesを1リクエストで送る）
          const previousById = new Map<string, Record<string, unknown>>()
          if (resolvedPatches.length > 0) {
            const rows = await tx
              .select()
              .from(table)
              .where(
                inArray(
                  idColumn,
                  resolvedPatches.map((p) => p.id),
                ),
              )
            for (const row of rows as Record<string, unknown>[]) {
              const rowId = row[idColumn.name]
              if (typeof rowId === 'string') previousById.set(rowId, row)
            }
          }
          for (const { id, patch } of resolvedPatches) {
            const setValues: Record<string, unknown> = { ...patch }
            if ('updatedAt' in table) {
              setValues.updatedAt = new Date()
            }
            const existing = previousById.get(id)
            const [row] = await tx
              .update(table)
              .set(setValues)
              .where(eq(idColumn, id))
              .returning()
            if (!row) {
              throw new Error(`__NOT_FOUND__:${id}`)
            }
            if (existing) {
              const changes = diffChangedFields(existing, patch)
              if (changes) {
                auditEntries.push({
                  entity: entityName,
                  entityId: id,
                  action: 'update',
                  changes,
                })
              }
            }
            updated.push(row)
          }
          await recordAudit(tx, req.user, auditEntries)
          return updated
        })
        for (const [i, row] of results.entries()) {
          if (options.afterUpdate) {
            await options.afterUpdate(row, {
              patch: resolvedPatches[i]?.patch ?? {},
            })
          }
        }
        return reply.send(results.map(normalize))
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith('__NOT_FOUND__:')
        ) {
          const id = error.message.split(':')[1]
          return reply
            .code(404)
            .send({ error: `対象が見つかりません（id: ${id}）` })
        }
        if (isUniqueViolation(error)) {
          return reply.code(409).send({ error: '既存のデータと重複しています' })
        }
        if (isForeignKeyViolation(error)) {
          return reply.code(400).send({ error: '参照先のデータが存在しません' })
        }
        throw error
      }
    },
  )
}
