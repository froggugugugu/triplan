import type { FastifyReply, FastifyRequest } from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import {
  hasPermission,
  type Permission,
  ROLE_PERMISSIONS,
  type Role,
  requirePermission,
} from '../rbac.js'

function makeReq(user?: { id: string; email: string; role: string }) {
  return { user } as unknown as FastifyRequest
}

function makeReply() {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  }
  return reply as unknown as FastifyReply & {
    code: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
  }
}

describe('権限マトリクス（の5ロール）', () => {
  // ロール×権限の期待値を全網羅で検証する（マトリクスの改変ミスを検出する回帰テスト）
  const expected: Record<Role, Record<Permission, boolean>> = {
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
    for (const role of Object.keys(expected) as Role[]) {
      for (const [permission, allowed] of Object.entries(expected[role])) {
        expect(
          hasPermission(role, permission as Permission),
          `${role} × ${permission}`,
        ).toBe(allowed)
      }
    }
  })

  // 反証: 未知のロール値（enum拡張前の古いトークン等）はフェイルクローズ
  it('反証: 未知のロールはいかなる権限も持たない', () => {
    expect(hasPermission('unknown' as Role, 'data:read')).toBe(false)
  })

  it('全ロールがROLE_PERMISSIONSに定義されている', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(
      ['admin', 'editor', 'manager', 'partner', 'viewer'].sort(),
    )
  })
})

describe('requirePermission', () => {
  it('financials:readを持つviewerは通過する', async () => {
    const reply = makeReply()
    await requirePermission('financials:read')(
      makeReq({ id: '1', email: 'a@x.com', role: 'viewer' }),
      reply,
    )
    expect(reply.code).not.toHaveBeenCalled()
  })

  // 反証: 協力会社ロール（partner）は金額情報のGETを403で遮断される
  it('反証: partnerはfinancials:readで403になる', async () => {
    const reply = makeReply()
    await requirePermission('financials:read')(
      makeReq({ id: '1', email: 'a@x.com', role: 'partner' }),
      reply,
    )
    expect(reply.code).toHaveBeenCalledWith(403)
  })

  it('partnerでもdata:readは通過する（金額を含まない業務データの閲覧）', async () => {
    const reply = makeReply()
    await requirePermission('data:read')(
      makeReq({ id: '1', email: 'a@x.com', role: 'partner' }),
      reply,
    )
    expect(reply.code).not.toHaveBeenCalled()
  })

  it('managerはdata:writeを通過する', async () => {
    const reply = makeReply()
    await requirePermission('data:write')(
      makeReq({ id: '1', email: 'a@x.com', role: 'manager' }),
      reply,
    )
    expect(reply.code).not.toHaveBeenCalled()
  })

  it('未認証は401', async () => {
    const reply = makeReply()
    await requirePermission('data:read')(makeReq(undefined), reply)
    expect(reply.code).toHaveBeenCalledWith(401)
  })
})
