import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores'
import { LoginPage } from '../LoginPage'

describe('LoginPage', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: null,
      currentUser: null,
      status: 'idle',
      error: null,
    })
    vi.stubGlobal('fetch', vi.fn())
  })

  it('メールアドレス未入力で送信するとバリデーションエラーが表示される', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'ログイン' }))

    expect(
      await screen.findByText('メールアドレスを入力してください'),
    ).toBeInTheDocument()
  })

  it('正しい認証情報を入力するとlogin()が呼ばれる', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          accessToken: 'tok',
          user: {
            id: '11111111-1111-4111-8111-111111111111',
            email: 'a@x.com',
            name: 'テスト',
            role: 'viewer',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('メールアドレス'), 'a@x.com')
    await user.type(screen.getByLabelText('パスワード'), 'password123')
    await user.click(screen.getByRole('button', { name: 'ログイン' }))

    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe('authenticated')
    })
  })

  it('ログイン失敗時、エラーメッセージが画面に表示される', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'メールアドレスまたはパスワードが正しくありません',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('メールアドレス'), 'a@x.com')
    await user.type(screen.getByLabelText('パスワード'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'ログイン' }))

    expect(
      await screen.findByText(
        'メールアドレスまたはパスワードが正しくありません',
      ),
    ).toBeInTheDocument()
  })
})
