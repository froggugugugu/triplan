import type { FastifyReply, FastifyRequest } from 'fastify'

/**
 * ロールと権限マトリクス（5ロールへ拡張）。
 * クライアント側`src/shared/types/auth.ts`と同一定義（値は一致させる運用）。
 *
 * - `manager`: PM/部門長。統制操作（CR承認・ベースライン凍結）と全社設定が可能
 * - `partner`: 協力会社等の外部関係者。閲覧のみ・金額情報（financials:read）は不可視
 *
 * ガバナンス原則: 最小権限・職務分掌・管理者権限の分離（users:manageはadminのみ）。
 * フロント側のUI出し分けは利便性のためのものであり、認可の実体は常にここ。
 */
export type Role = 'admin' | 'manager' | 'editor' | 'viewer' | 'partner'

export type Permission =
  | 'users:manage'
  | 'settings:manage'
  | 'governance:approve'
  | 'data:write'
  | 'financials:read'
  | 'data:read'

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: [
    'users:manage',
    'settings:manage',
    'governance:approve',
    'data:write',
    'financials:read',
    'data:read',
  ],
  manager: [
    'settings:manage',
    'governance:approve',
    'data:write',
    'financials:read',
    'data:read',
  ],
  editor: ['data:write', 'financials:read', 'data:read'],
  viewer: ['financials:read', 'data:read'],
  partner: ['data:read'],
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

/**
 * 指定権限を全て持つロールのみ許可するpreHandler。
 * 未知のロール値（enum拡張前の古いトークン等）はフェイルクローズで403にする。
 */
export function requirePermission(...permissions: Permission[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) {
      return reply.code(401).send({ error: '認証が必要です' })
    }
    const role = req.user.role as Role
    if (!permissions.every((p) => hasPermission(role, p))) {
      return reply.code(403).send({ error: 'この操作を行う権限がありません' })
    }
  }
}

/** 業務データの書き込み（data:write）が許可される操作向けのショートハンド */
export const requireEditorOrAbove = () => requirePermission('data:write')

/** admin限定操作向けのショートハンド（users.ts・sso-providers.tsが使用） */
export const requireAdmin = () => requirePermission('users:manage')

/** ロール階層（線形）。上位ロールは下位ロールの操作も行える */
export const ROLE_HIERARCHY: Record<Role, Role[]> = {
  admin: ['admin', 'manager', 'editor', 'viewer', 'partner'],
  manager: ['manager', 'editor', 'viewer', 'partner'],
  editor: ['editor', 'viewer', 'partner'],
  viewer: ['viewer', 'partner'],
  partner: ['partner'],
}
