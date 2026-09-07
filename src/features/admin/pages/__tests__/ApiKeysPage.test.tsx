import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as apiKeysApi from '../../api/api-keys-api'
import { ApiKeysPage } from '../ApiKeysPage'

vi.mock('../../api/api-keys-api', async () => {
  const actual = await vi.importActual<typeof apiKeysApi>(
    '../../api/api-keys-api',
  )
  return {
    ...actual,
    listApiKeys: vi.fn(),
    createApiKey: vi.fn(),
    updateApiKey: vi.fn(),
    deleteApiKey: vi.fn(),
  }
})

const toastMock = vi.fn()
vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}))

const KEY: apiKeysApi.ApiKeySummary = {
  id: '77777777-7777-4777-8777-777777777777',
  name: 'BI連携用',
  enabled: true,
  createdAt: '2026-08-19T00:00:00.000Z',
  lastUsedAt: null,
}

describe('ApiKeysPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiKeysApi.listApiKeys).mockResolvedValue([KEY])
  })

  afterEach(() => cleanup())

  it('キー一覧とOAS仕様書へのリンクを表示する', async () => {
    render(<ApiKeysPage />)
    expect(await screen.findByText('BI連携用')).toBeInTheDocument()
    const specLink = screen.getByRole('link', { name: /OpenAPI仕様書/ })
    expect(specLink).toHaveAttribute(
      'href',
      expect.stringContaining('/api/v1/openapi.yaml'),
    )
    expect(screen.getByText(/未使用/)).toBeInTheDocument()
  })

  it('発行すると平文キーが一度だけ表示され、コピー・使い方の案内が出る', async () => {
    const plainKey = `rpk_${'a'.repeat(64)}`
    vi.mocked(apiKeysApi.createApiKey).mockResolvedValue({
      apiKey: { ...KEY, id: crypto.randomUUID(), name: '新キー' },
      key: plainKey,
    })
    const user = userEvent.setup()
    render(<ApiKeysPage />)
    await screen.findByText('BI連携用')

    await user.type(
      screen.getByRole('textbox', { name: 'APIキーの名前' }),
      '新キー',
    )
    await user.click(screen.getByRole('button', { name: /キーを発行/ }))

    expect(await screen.findByText(plainKey)).toBeInTheDocument()
    expect(screen.getByText(/この画面でのみ表示されます/)).toBeInTheDocument()
  })

  it('反証: 名前が空のまま発行するとAPIを呼ばずエラートーストを出す', async () => {
    const user = userEvent.setup()
    render(<ApiKeysPage />)
    await screen.findByText('BI連携用')
    await user.click(screen.getByRole('button', { name: /キーを発行/ }))
    expect(apiKeysApi.createApiKey).not.toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' }),
    )
  })

  it('無効化でupdateApiKeyが呼ばれる', async () => {
    vi.mocked(apiKeysApi.updateApiKey).mockResolvedValue({
      ...KEY,
      enabled: false,
    })
    const user = userEvent.setup()
    render(<ApiKeysPage />)
    await screen.findByText('BI連携用')
    await user.click(screen.getByRole('button', { name: '無効化' }))
    await waitFor(() => {
      expect(apiKeysApi.updateApiKey).toHaveBeenCalledWith(KEY.id, {
        enabled: false,
      })
    })
  })

  it('削除は確認ダイアログを経由してdeleteApiKeyが呼ばれる', async () => {
    vi.mocked(apiKeysApi.deleteApiKey).mockResolvedValue()
    const user = userEvent.setup()
    render(<ApiKeysPage />)
    await screen.findByText('BI連携用')
    await user.click(screen.getByRole('button', { name: '削除' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('APIキーを削除')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '削除する' }))
    await waitFor(() => {
      expect(apiKeysApi.deleteApiKey).toHaveBeenCalledWith(KEY.id)
    })
  })
})
