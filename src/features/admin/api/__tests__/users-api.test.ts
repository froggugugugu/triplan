import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores'
import { createUser, listUsers, updateUser } from '../users-api'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const ADMIN_USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'admin@example.com',
  name: '管理者',
  role: 'admin' as const,
}

describe('users-api', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'admin-token',
      currentUser: ADMIN_USER,
      status: 'authenticated',
      error: null,
    })
    vi.stubGlobal('fetch', vi.fn())
  })

  it('listUsers: /api/usersからユーザー一覧を取得する', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        users: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            email: 'a@x.com',
            name: 'テスト太郎',
            role: 'editor',
          },
        ],
      }),
    )

    const users = await listUsers()

    expect(users).toHaveLength(1)
    expect(users[0]?.email).toBe('a@x.com')
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/users')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer admin-token',
    )
  })

  it('createUser: POST /api/usersでユーザーを作成する', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        user: {
          id: '33333333-3333-4333-8333-333333333333',
          email: 'new@x.com',
          name: '新規太郎',
          role: 'viewer',
        },
      }),
    )

    const created = await createUser({
      email: 'new@x.com',
      name: '新規太郎',
      password: 'password123',
      role: 'viewer',
    })

    expect(created.email).toBe('new@x.com')
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'new@x.com',
      name: '新規太郎',
      password: 'password123',
      role: 'viewer',
    })
  })

  it('updateUser: PATCH /api/users/:idでロールを変更する', async () => {
    const targetId = '22222222-2222-4222-8222-222222222222'
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        user: {
          id: targetId,
          email: 'a@x.com',
          name: 'テスト太郎',
          role: 'admin',
        },
      }),
    )

    const updated = await updateUser(targetId, { role: 'admin' })

    expect(updated.role).toBe('admin')
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/api/users/${targetId}`)
    expect(init.method).toBe('PATCH')
  })

  it('サーバーがエラーを返した場合、ApiErrorとして例外になる', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ error: 'この操作を行う権限がありません' }, 403),
    )

    await expect(listUsers()).rejects.toThrow('この操作を行う権限がありません')
  })
})
