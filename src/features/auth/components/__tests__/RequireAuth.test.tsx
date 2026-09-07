import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores'
import { RequireAuth } from '../RequireAuth'

describe('RequireAuth', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: null,
      currentUser: null,
      status: 'idle',
      error: null,
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('localモード（既定）では認証チェックを一切行わずchildrenをそのまま描画する', () => {
    // VITE_STORAGE_MODE未設定（デフォルトのlocalモード）
    vi.stubEnv('VITE_STORAGE_MODE', '')

    render(
      <MemoryRouter>
        <RequireAuth>
          <div>保護対象の中身</div>
        </RequireAuth>
      </MemoryRouter>,
    )

    expect(screen.getByText('保護対象の中身')).toBeInTheDocument()
    // restoreSessionが呼ばれていない（localモードでは認証機構に一切触れない）
    expect(useAuthStore.getState().status).toBe('idle')
  })

  it('localモードを明示指定した場合も同様にそのまま描画する', () => {
    vi.stubEnv('VITE_STORAGE_MODE', 'local')

    render(
      <MemoryRouter>
        <RequireAuth>
          <div>保護対象の中身</div>
        </RequireAuth>
      </MemoryRouter>,
    )

    expect(screen.getByText('保護対象の中身')).toBeInTheDocument()
  })

  it('postgresモードで未認証の場合は読み込み中を経てログイン画面へリダイレクトされる（子は描画されない）', async () => {
    vi.stubEnv('VITE_STORAGE_MODE', 'postgres')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'no session' }), {
          status: 401,
        }),
      ),
    )

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <RequireAuth>
          <div>保護対象の中身</div>
        </RequireAuth>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe('unauthenticated')
    })
    expect(screen.queryByText('保護対象の中身')).not.toBeInTheDocument()
  })

  it('postgresモードで認証済みの場合はchildrenを描画する', () => {
    vi.stubEnv('VITE_STORAGE_MODE', 'postgres')
    useAuthStore.setState({
      accessToken: 'token',
      currentUser: {
        id: '1',
        email: 'a@x.com',
        name: 'テスト',
        role: 'viewer',
      },
      status: 'authenticated',
      error: null,
    })

    render(
      <MemoryRouter>
        <RequireAuth>
          <div>保護対象の中身</div>
        </RequireAuth>
      </MemoryRouter>,
    )

    expect(screen.getByText('保護対象の中身')).toBeInTheDocument()
  })

  it('localモードではrequiredRoleが指定されていても無視してそのまま描画する', () => {
    vi.stubEnv('VITE_STORAGE_MODE', 'local')

    render(
      <MemoryRouter>
        <RequireAuth requiredRole="admin">
          <div>保護対象の中身</div>
        </RequireAuth>
      </MemoryRouter>,
    )

    expect(screen.getByText('保護対象の中身')).toBeInTheDocument()
  })

  it('requiredRole="admin"指定時、viewerロールのユーザーはchildrenを描画されない', () => {
    vi.stubEnv('VITE_STORAGE_MODE', 'postgres')
    useAuthStore.setState({
      accessToken: 'token',
      currentUser: {
        id: '1',
        email: 'a@x.com',
        name: 'テスト',
        role: 'viewer',
      },
      status: 'authenticated',
      error: null,
    })

    render(
      <MemoryRouter>
        <RequireAuth requiredRole="admin">
          <div>保護対象の中身</div>
        </RequireAuth>
      </MemoryRouter>,
    )

    expect(screen.queryByText('保護対象の中身')).not.toBeInTheDocument()
  })

  it('requiredRole="admin"指定時、adminロールのユーザーはchildrenを描画される', () => {
    vi.stubEnv('VITE_STORAGE_MODE', 'postgres')
    useAuthStore.setState({
      accessToken: 'token',
      currentUser: {
        id: '1',
        email: 'a@x.com',
        name: '管理者',
        role: 'admin',
      },
      status: 'authenticated',
      error: null,
    })

    render(
      <MemoryRouter>
        <RequireAuth requiredRole="admin">
          <div>保護対象の中身</div>
        </RequireAuth>
      </MemoryRouter>,
    )

    expect(screen.getByText('保護対象の中身')).toBeInTheDocument()
  })
})
