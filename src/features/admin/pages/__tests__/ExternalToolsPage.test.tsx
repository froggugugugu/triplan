import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as externalToolsApi from '@/shared/api/external-tools-api'
import { ExternalToolsPage } from '../ExternalToolsPage'

vi.mock('@/shared/api/external-tools-api', async () => {
  const actual = await vi.importActual<typeof externalToolsApi>(
    '@/shared/api/external-tools-api',
  )
  return {
    ...actual,
    listExternalToolConnections: vi.fn(),
    createExternalToolConnection: vi.fn(),
    updateExternalToolConnection: vi.fn(),
    deleteExternalToolConnection: vi.fn(),
    testExternalToolConnection: vi.fn(),
    fetchExternalToolMetadata: vi.fn(),
  }
})

const toastMock = vi.fn()
vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}))

const CONNECTION: externalToolsApi.ExternalToolConnection = {
  id: '88888888-8888-4888-8888-888888888888',
  tool: 'github',
  name: 'webapp用GitHub',
  baseUrl: null,
  authEmail: null,
  targetConfig: { owner: 'acme', repo: 'webapp' },
  enabled: true,
  apiTokenConfigured: true,
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
}

describe('ExternalToolsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(externalToolsApi.listExternalToolConnections).mockResolvedValue([
      CONNECTION,
    ])
  })

  afterEach(() => cleanup())

  it('接続一覧と起票先サマリを表示する', async () => {
    render(<ExternalToolsPage />)
    expect(await screen.findByText('webapp用GitHub')).toBeInTheDocument()
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    expect(screen.getByText(/acme\/webapp/)).toBeInTheDocument()
    expect(screen.getByText('起票に使用可')).toBeInTheDocument()
  })

  it('反証: 接続が0件のときは空状態の案内のみを表示する', async () => {
    vi.mocked(externalToolsApi.listExternalToolConnections).mockResolvedValue(
      [],
    )
    render(<ExternalToolsPage />)
    expect(await screen.findByText(/接続がまだありません/)).toBeInTheDocument()
    expect(screen.queryByText('接続テスト')).not.toBeInTheDocument()
  })

  it('新規追加はツール・接続名・APIトークンを送信する', async () => {
    const user = userEvent.setup()
    vi.mocked(externalToolsApi.createExternalToolConnection).mockResolvedValue(
      CONNECTION,
    )
    render(<ExternalToolsPage />)
    await screen.findByText('webapp用GitHub')

    await user.click(screen.getByRole('button', { name: /接続を追加/ }))
    await user.type(screen.getByLabelText('接続名'), '新しい接続')
    await user.type(screen.getByLabelText('APIトークン'), 'ghp_secret')
    await user.click(screen.getByRole('button', { name: '追加' }))

    await waitFor(() => {
      expect(
        externalToolsApi.createExternalToolConnection,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: 'github',
          name: '新しい接続',
          apiToken: 'ghp_secret',
        }),
      )
    })
  })

  it('反証: 新規追加でAPIトークン未入力なら送信できない（認証情報なしの接続を作らない）', async () => {
    const user = userEvent.setup()
    render(<ExternalToolsPage />)
    await screen.findByText('webapp用GitHub')

    await user.click(screen.getByRole('button', { name: /接続を追加/ }))
    await user.type(screen.getByLabelText('接続名'), 'トークンなし')
    expect(screen.getByRole('button', { name: '追加' })).toBeDisabled()
    expect(externalToolsApi.createExternalToolConnection).not.toHaveBeenCalled()
  })

  it('反証: 編集でトークン空欄のまま保存するとapiTokenを送らない（=変更なし）', async () => {
    const user = userEvent.setup()
    vi.mocked(externalToolsApi.updateExternalToolConnection).mockResolvedValue(
      CONNECTION,
    )
    render(<ExternalToolsPage />)
    await screen.findByText('webapp用GitHub')

    await user.click(screen.getByRole('button', { name: '編集' }))
    const nameInput = screen.getByLabelText('接続名')
    await user.clear(nameInput)
    await user.type(nameInput, '名前だけ変更')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(externalToolsApi.updateExternalToolConnection).toHaveBeenCalled()
    })
    const patch = vi.mocked(externalToolsApi.updateExternalToolConnection).mock
      .calls[0]?.[1]
    expect(patch?.name).toBe('名前だけ変更')
    expect(patch && 'apiToken' in patch).toBe(false)
  })

  it('接続テストの失敗はdestructiveトーストで通知する', async () => {
    const user = userEvent.setup()
    vi.mocked(externalToolsApi.testExternalToolConnection).mockResolvedValue({
      ok: false,
      detail: '401 Bad credentials',
    })
    render(<ExternalToolsPage />)
    await screen.findByText('webapp用GitHub')

    await user.click(screen.getByRole('button', { name: /接続テスト/ }))
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '接続できませんでした',
          variant: 'destructive',
        }),
      )
    })
  })

  it('削除は確認ダイアログを経てから実行される', async () => {
    const user = userEvent.setup()
    vi.mocked(externalToolsApi.deleteExternalToolConnection).mockResolvedValue()
    render(<ExternalToolsPage />)
    await screen.findByText('webapp用GitHub')

    await user.click(screen.getByRole('button', { name: '削除' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('接続を削除しますか？')).toBeInTheDocument()
    expect(externalToolsApi.deleteExternalToolConnection).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: '削除' }))
    await waitFor(() => {
      expect(
        externalToolsApi.deleteExternalToolConnection,
      ).toHaveBeenCalledWith(CONNECTION.id)
    })
  })
})
