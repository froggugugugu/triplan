import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  CreateMemberPreferenceSchema,
  CreateOrgDesignDraftSchema,
  UpdateMemberPreferenceSchema,
} from '@/shared/types'
import { hasPermission, type Role, requirePermission } from '../../auth/rbac.js'
import { db } from '../../db/client.js'
import { memberPreferences, orgDesignDrafts, users } from '../../db/schema.js'
import { registerCrudRoutes } from '../crud-factory.js'

/**
 * 担当者の希望の閲覧範囲（行レベル）。`people:sensitive-read`保持者は全件、
 * それ以外は自分に紐づく担当者（users.member_id）の1件のみ。紐づけがなければ0件。
 */
export function filterPreferencesForViewer<T extends { memberId?: unknown }>(
  rows: T[],
  role: Role,
  viewerMemberId: string | null | undefined,
): T[] {
  if (hasPermission(role, 'people:sensitive-read')) return rows
  if (!viewerMemberId) return []
  return rows.filter((row) => row.memberId === viewerMemberId)
}

/**
 * 組織設計の試算（/org-design）。
 *
 * - 案（orgDesignDrafts）: 金額を持たない（コストは画面で都度計算し financials:read でマスク）ため
 *   既定の data:read / data:write。本番の組織テーブルには一切書き込まない
 * - 希望（memberPreferences）: 書き込みは people:sensitive-read かつ data:write（admin / manager）。
 *   読み取りは filterRows で権限保持者=全件・その他=本人分のみ
 */
export default async function orgDesignRoutes(fastify: FastifyInstance) {
  registerCrudRoutes(fastify, {
    path: '/api/orgDesignDrafts',
    table: orgDesignDrafts,
    createSchema: CreateOrgDesignDraftSchema,
    updateSchema: CreateOrgDesignDraftSchema.partial(),
  })

  registerCrudRoutes(fastify, {
    path: '/api/memberPreferences',
    table: memberPreferences,
    createSchema: CreateMemberPreferenceSchema,
    updateSchema: UpdateMemberPreferenceSchema.omit({ id: true }),
    writeGuard: requirePermission('people:sensitive-read', 'data:write'),
    filterRows: async (rows, user) => {
      const role = user.role as Role
      if (hasPermission(role, 'people:sensitive-read')) return rows
      const [viewer] = await db
        .select({ memberId: users.memberId })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1)
      return filterPreferencesForViewer(rows, role, viewer?.memberId)
    },
  })
}
