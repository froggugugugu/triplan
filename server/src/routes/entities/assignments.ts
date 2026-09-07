import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { CreateAssignmentEntrySchema } from '@/shared/types'
import { db } from '../../db/client.js'
import { assignments, members, monthlyCloseEvents } from '../../db/schema.js'
import { CrudValidationError, registerCrudRoutes } from '../crud-factory.js'

type MonthlyValues = Record<string, number>

/**
 * 締め済み月の集合をmonthly_close_eventsから導出する（P1-b月次締めハードロック）。
 * 月ごとにoccurredAt昇順の末尾イベントがcloseなら締め済み（クライアント側
 * actuals-storeの導出と同一セマンティクス）
 */
export async function getClosedMonths(): Promise<Set<string>> {
  const events = await db
    .select()
    .from(monthlyCloseEvents)
    .orderBy(monthlyCloseEvents.occurredAt)
  const latestAction = new Map<string, string>()
  for (const e of events) {
    latestAction.set(e.month, e.action)
  }
  const closed = new Set<string>()
  for (const [month, action] of latestAction) {
    if (action === 'close') closed.add(month)
  }
  return closed
}

/**
 * 締め済み月の値が変わる書込みを検出する。beforeUpdateはmonthlyValues/
 * actualMonthlyValuesが**パッチに含まれる場合のみ**現行値と差分比較する
 * （含まれないフィールドは変更されないため対象外）
 */
function findClosedMonthChange(
  closed: Set<string>,
  patch: {
    monthlyValues?: MonthlyValues
    actualMonthlyValues?: MonthlyValues
  },
  current: {
    monthlyValues: MonthlyValues
    actualMonthlyValues: MonthlyValues | null
  } | null,
): string | null {
  for (const m of closed) {
    if (patch.monthlyValues !== undefined) {
      const before = current?.monthlyValues?.[m] ?? 0
      const after = patch.monthlyValues[m] ?? 0
      if (before !== after) return m
    }
    if (patch.actualMonthlyValues !== undefined) {
      const before = current?.actualMonthlyValues?.[m]
      const after = patch.actualMonthlyValues[m]
      if (before !== after) return m
    }
  }
  return null
}

function closedMonthError(month: string): CrudValidationError {
  return new CrudValidationError(
    `${month}は締め済みのため変更できません（締めの解除にはgovernance:approve権限が必要です）`,
  )
}

/** 浮動小数点の丸め誤差で誤検知しないための許容値 */
const CAPACITY_EPSILON = 0.001

/**
 * 担当者ごとの月次アサイン合計が、そのメンバーの稼働率上限（`members.capacityRatio`、
 * 既定1.0）を超えないことを検証する（data-model.md「重要なバリデーションルール」、
 * AssignmentTreeGrid.tsxのクライアント側チェックと同じ判定。サーバー側でも二重に担保する
 * ＝多人数運用での競合を防ぐ防御的検証）。
 */
async function validateMonthlyCap(
  memberId: string,
  monthlyValues: MonthlyValues,
  excludeAssignmentId?: string,
): Promise<void> {
  const others = (
    await db
      .select()
      .from(assignments)
      .where(eq(assignments.memberId, memberId))
  ).filter((a) => a.id !== excludeAssignmentId)

  const [member] = await db
    .select({ capacityRatio: members.capacityRatio })
    .from(members)
    .where(eq(members.id, memberId))
  const capacity = member?.capacityRatio ?? 1

  for (const [month, value] of Object.entries(monthlyValues)) {
    const otherTotal = others.reduce(
      (sum, a) => sum + ((a.monthlyValues as MonthlyValues)[month] ?? 0),
      0,
    )
    const total = otherTotal + value
    if (total > capacity + CAPACITY_EPSILON) {
      throw new CrudValidationError(
        `${month}の担当者アサイン合計が上限${capacity.toFixed(2)}を超えています（${total.toFixed(2)}）`,
      )
    }
  }
}

export default async function assignmentsRoutes(fastify: FastifyInstance) {
  registerCrudRoutes(fastify, {
    path: '/api/assignments',
    table: assignments,
    createSchema: CreateAssignmentEntrySchema,
    updateSchema: CreateAssignmentEntrySchema.partial(),
    beforeCreate: async (data) => {
      const memberId = data.memberId as string
      const monthlyValues = data.monthlyValues as MonthlyValues
      await validateMonthlyCap(memberId, monthlyValues)

      // 締め済み月に値（計画>0または実績の明示キー）を持つ新規レコードを拒否
      const closed = await getClosedMonths()
      const violation = findClosedMonthChange(
        closed,
        {
          monthlyValues,
          actualMonthlyValues: data.actualMonthlyValues as
            | MonthlyValues
            | undefined,
        },
        null,
      )
      if (violation) throw closedMonthError(violation)
      return data
    },
    beforeUpdate: async (id, data) => {
      const [current] = await db
        .select()
        .from(assignments)
        .where(eq(assignments.id, id))

      // 締め済み月の値が変わるパッチを拒否（変更されない月キーは通す＝差分判定）
      if (
        data.monthlyValues !== undefined ||
        data.actualMonthlyValues !== undefined
      ) {
        const closed = await getClosedMonths()
        const violation = findClosedMonthChange(
          closed,
          {
            monthlyValues: data.monthlyValues as MonthlyValues | undefined,
            actualMonthlyValues: data.actualMonthlyValues as
              | MonthlyValues
              | undefined,
          },
          current
            ? {
                monthlyValues: current.monthlyValues as MonthlyValues,
                actualMonthlyValues:
                  current.actualMonthlyValues as MonthlyValues | null,
              }
            : null,
        )
        if (violation) throw closedMonthError(violation)
      }

      // monthlyValuesを含まない部分更新（他フィールドのみの変更）は上限チェック対象外
      if (data.monthlyValues === undefined) return data
      const memberId =
        (data.memberId as string | undefined) ?? current?.memberId
      if (!memberId) return data
      await validateMonthlyCap(
        memberId,
        data.monthlyValues as MonthlyValues,
        id,
      )
      return data
    },
    beforeDelete: async (row) => {
      // 締め済み月に値を持つレコードの削除は「事実の消去」として拒否
      const closed = await getClosedMonths()
      const monthlyValues = row.monthlyValues as MonthlyValues
      const actualMonthlyValues = row.actualMonthlyValues as
        | MonthlyValues
        | null
        | undefined
      for (const m of closed) {
        if (
          (monthlyValues?.[m] ?? 0) > 0 ||
          actualMonthlyValues?.[m] !== undefined
        ) {
          throw new CrudValidationError(
            `締め済みの月（${m}）の実績を含むため削除できません`,
          )
        }
      }
    },
  })
}
