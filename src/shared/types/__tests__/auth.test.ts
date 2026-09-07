import { describe, expect, it } from 'vitest'
import {
  hasPermission,
  type Permission,
  ROLE_HIERARCHY,
  ROLE_PERMISSIONS,
  roleSatisfies,
  type UserRole,
  UserRoleSchema,
} from '../auth'

describe('UserRoleSchema（5ロール）', () => {
  it.each(['admin', 'manager', 'editor', 'viewer', 'partner'] as const)(
    '%sを受け付ける',
    (role) => {
      expect(UserRoleSchema.safeParse(role).success).toBe(true)
    },
  )

  it('反証: 定義外のロールは拒否される', () => {
    expect(UserRoleSchema.safeParse('superuser').success).toBe(false)
  })
})

describe('権限マトリクス（ROLE_PERMISSIONS / hasPermission）', () => {
  const expected: Record<UserRole, Record<Permission, boolean>> = {
    admin: {
      'users:manage': true,
      'settings:manage': true,
      'governance:approve': true,
      'data:write': true,
      'financials:read': true,
      'data:read': true,
    },
    manager: {
      'users:manage': false,
      'settings:manage': true,
      'governance:approve': true,
      'data:write': true,
      'financials:read': true,
      'data:read': true,
    },
    editor: {
      'users:manage': false,
      'settings:manage': false,
      'governance:approve': false,
      'data:write': true,
      'financials:read': true,
      'data:read': true,
    },
    viewer: {
      'users:manage': false,
      'settings:manage': false,
      'governance:approve': false,
      'data:write': false,
      'financials:read': true,
      'data:read': true,
    },
    partner: {
      'users:manage': false,
      'settings:manage': false,
      'governance:approve': false,
      'data:write': false,
      'financials:read': false,
      'data:read': true,
    },
  }

  it('全ロール×全権限がマトリクス通りに判定される', () => {
    for (const role of Object.keys(expected) as UserRole[]) {
      for (const [permission, allowed] of Object.entries(expected[role])) {
        expect(
          hasPermission(role, permission as Permission),
          `${role} × ${permission}`,
        ).toBe(allowed)
      }
    }
  })

  // 反証: 協力会社（partner）は金額情報を閲覧できない（要求#2の核心）
  it('反証: partnerはfinancials:readを持たない', () => {
    expect(hasPermission('partner', 'financials:read')).toBe(false)
  })

  // 反証: 職務分掌。編集者（editor）は承認（governance:approve）を持たない
  it('反証: editorはgovernance:approveを持たない（職務分掌）', () => {
    expect(hasPermission('editor', 'governance:approve')).toBe(false)
  })

  // 反証: 管理者権限の分離。managerはユーザー管理を持たない
  it('反証: managerはusers:manageを持たない（管理者権限の分離）', () => {
    expect(hasPermission('manager', 'users:manage')).toBe(false)
  })
})

describe('ROLE_HIERARCHY / roleSatisfies（線形階層の一貫性）', () => {
  it('admin ⊇ manager ⊇ editor ⊇ viewer ⊇ partnerの線形階層が成立する', () => {
    const order: UserRole[] = [
      'admin',
      'manager',
      'editor',
      'viewer',
      'partner',
    ]
    for (let i = 0; i < order.length; i++) {
      for (let j = 0; j < order.length; j++) {
        const upper = order[i] as UserRole
        const lower = order[j] as UserRole
        // i <= j（upperが同格以上）なら満たす、それ以外は満たさない
        expect(roleSatisfies(upper, lower), `${upper} ⊇ ${lower}`).toBe(i <= j)
      }
    }
  })

  // 反証: 上位ロールの権限集合は下位ロールの権限集合を必ず包含する
  // （マトリクスと階層の定義が食い違うと、roleSatisfiesベースの既存ガードと
  // hasPermissionベースの新ガードで判定が矛盾する）
  it('反証: 階層で上位のロールは下位ロールの全権限を包含する', () => {
    const order: UserRole[] = [
      'admin',
      'manager',
      'editor',
      'viewer',
      'partner',
    ]
    for (let i = 0; i + 1 < order.length; i++) {
      const upper = order[i] as UserRole
      const lower = order[i + 1] as UserRole
      for (const permission of ROLE_PERMISSIONS[lower]) {
        expect(
          hasPermission(upper, permission),
          `${upper}は${lower}の${permission}を包含するはず`,
        ).toBe(true)
      }
    }
  })

  it('ROLE_HIERARCHYが全ロールを定義している', () => {
    expect(Object.keys(ROLE_HIERARCHY).sort()).toEqual(
      ['admin', 'editor', 'manager', 'partner', 'viewer'].sort(),
    )
  })
})
