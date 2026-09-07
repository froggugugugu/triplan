import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores'
import * as usersApi from '../../api/users-api'
import { UserManagementPage } from '../UserManagementPage'

vi.mock('../../api/users-api')

vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

const ADMIN = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'admin@example.com',
  name: '管理者',
  role: 'admin' as const,
}

const OTHER_USER = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'b@x.com',
  name: 'テスト太郎',
  role: 'editor' as const,
  authProvider: 'local' as const,
  isActive: true,
}

describe('UserManagementPage', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'token',
      currentUser: ADMIN,
      status: 'authenticated',
      error: null,
    })
    vi.mocked(usersApi.listUsers).mockResolvedValue([ADMIN, OTHER_USER])
  })

  it('ユーザー一覧を表示する', async () => {
    render(<UserManagementPage />)

    expect(await screen.findByText('テスト太郎')).toBeInTheDocument()
    expect(screen.getByText('管理者')).toBeInTheDocument()
  })

  it('自分自身の行にはロール変更・無効化操作が無効化されている', async () => {
    render(<UserManagementPage />)

    await screen.findByText('管理者')
    // 行の並び順やcombobox数の変化に影響されないようaria-labelで特定する
    expect(
      screen.getByRole('combobox', { name: '管理者さんのロール' }),
    ).toBeDisabled()
  })

  it('反証: 自分自身でも担当者の紐づけは変更できる（ロール変更の制限とは別の話）', async () => {
    // 自分のadmin権限剥奪・自己無効化は「誰も管理できなくなる」ため禁止だが、
    // 担当者の紐づけはその危険が無く、むしろadminが自分に紐づける運用が自然
    render(<UserManagementPage />)

    await screen.findByText('管理者')
    expect(
      screen.getByRole('combobox', { name: '管理者さんの担当者' }),
    ).not.toBeDisabled()
  })

  it('「ユーザーを追加」ボタンでダイアログが開く', async () => {
    const user = userEvent.setup()
    render(<UserManagementPage />)
    await screen.findByText('管理者')

    await user.click(screen.getByRole('button', { name: /ユーザーを追加/ }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('メールアドレス')).toBeInTheDocument()
  })

  it('一覧取得に失敗した場合はエラーメッセージを表示する', async () => {
    vi.mocked(usersApi.listUsers).mockRejectedValue(
      new Error('ユーザー一覧の取得に失敗しました'),
    )

    render(<UserManagementPage />)

    expect(
      await screen.findByText('ユーザー一覧の取得に失敗しました'),
    ).toBeInTheDocument()
  })

  it('ロールを変更するとupdateUserが呼ばれる', async () => {
    vi.mocked(usersApi.updateUser).mockResolvedValue({
      ...OTHER_USER,
      role: 'viewer',
    })
    const user = userEvent.setup()
    render(<UserManagementPage />)
    await screen.findByText('テスト太郎')

    await user.click(
      screen.getByRole('combobox', { name: 'テスト太郎さんのロール' }),
    )
    await user.click(
      await screen.findByRole('option', { name: 'viewer（閲覧）' }),
    )

    await waitFor(() => {
      expect(usersApi.updateUser).toHaveBeenCalledWith(OTHER_USER.id, {
        role: 'viewer',
      })
    })
  })
})
