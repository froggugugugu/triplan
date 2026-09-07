import { z } from 'zod'

/**
 * postgresモードのみで使用する認証関連の型。localStorage版には存在しない
 * （非公開の設計文書。サーバー側のロール定義と一致させること）。
 *
 * 2026-08-16: 一般的なガバナンス（最小権限・職務分掌・管理者権限の分離）が
 * 効くよう5ロール＋権限マトリクスへ拡張した。旧3ロール（admin/editor/viewer）の値は
 * 温存し追加のみ。設計は非公開の設計文書。
 *
 * - `manager`: PM/部門長。統制操作（CR承認・ベースライン凍結）と全社設定が可能
 * - `partner`: 協力会社等の外部関係者。閲覧のみ・金額情報（financials:read）は不可視
 */
export const UserRoleSchema = z.enum([
  'admin',
  'manager',
  'editor',
  'viewer',
  'partner',
])
export type UserRole = z.infer<typeof UserRoleSchema>

/**
 * 権限（permission）。ロールから`ROLE_PERMISSIONS`で導出する。
 * 画面・APIのガードはロール名の直接比較ではなく、原則この権限単位で行う
 * （ロール構成を変えても権限名を参照する側の修正が不要になる）。
 */
export const PERMISSIONS = [
  // ユーザー管理・SSO設定（管理者権限の分離: adminのみ）
  'users:manage',
  // 全社設定（概算単価・係数・為替レート等）
  'settings:manage',
  // 統制操作（変更要求の承認・ベースライン凍結）
  'governance:approve',
  // 業務データの編集
  'data:write',
  // 金額情報の閲覧（単価・予算・受注額・EVM金額等）
  'financials:read',
  // 業務データの閲覧
  'data:read',
] as const
export type Permission = (typeof PERMISSIONS)[number]

/** ロール→権限のマトリクス（サーバー側rbac.tsと同一定義、値は一致させる運用） */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
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

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}

export const AuthProviderSchema = z.enum([
  'local',
  'azure_ad',
  'google_workspace',
])
export type AuthProvider = z.infer<typeof AuthProviderSchema>

export const AuthUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: UserRoleSchema,
  authProvider: AuthProviderSchema.optional(),
  isActive: z.boolean().optional(),
  /**
   * 業務データ上の担当者（Member）との紐づけ。
   * 「自分の担当タスク」（/my-tasks）を出すための接続点で、未紐づけならnull。
   * ログインレスポンスにも含めるため、認証直後から自分の担当を引ける
   */
  memberId: z.string().uuid().nullable().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
})
export type AuthUser = z.infer<typeof AuthUserSchema>

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  user: AuthUserSchema,
})
export type LoginResponse = z.infer<typeof LoginResponseSchema>

/** ロール階層。上位ロールは下位ロールの操作も行える（サーバー側rbac.tsと同一定義） */
export const ROLE_HIERARCHY: Record<UserRole, UserRole[]> = {
  admin: ['admin', 'manager', 'editor', 'viewer', 'partner'],
  manager: ['manager', 'editor', 'viewer', 'partner'],
  editor: ['editor', 'viewer', 'partner'],
  viewer: ['viewer', 'partner'],
  partner: ['partner'],
}

export function roleSatisfies(userRole: UserRole, required: UserRole): boolean {
  return ROLE_HIERARCHY[userRole].includes(required)
}

/**
 * SSOプロバイダ接続設定（フェーズ5）。server/src/db/schema.tsのssoProviderConfigsに対応する
 * クライアント側の型。clientSecret自体はAPIレスポンスに含まれない（書き込み専用、hasSecretで
 * 設定有無のみ判別する）
 */
export const SsoProviderTypeSchema = z.enum(['azure_ad', 'google_workspace'])
export type SsoProviderType = z.infer<typeof SsoProviderTypeSchema>

export const SsoProviderConfigSchema = z.object({
  provider: SsoProviderTypeSchema,
  enabled: z.boolean(),
  clientId: z.string().nullable(),
  tenantId: z.string().nullable(),
  redirectUri: z.string().nullable(),
  hasSecret: z.boolean(),
  updatedAt: z.string().datetime().nullable(),
})
export type SsoProviderConfig = z.infer<typeof SsoProviderConfigSchema>
