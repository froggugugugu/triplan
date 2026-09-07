import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as ssoApi from '../../api/sso-providers-api'
import { SsoSettingsPage } from '../SsoSettingsPage'

vi.mock('../../api/sso-providers-api')

vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

const AZURE_CONFIG = {
  provider: 'azure_ad' as const,
  enabled: false,
  clientId: null,
  tenantId: null,
  redirectUri: null,
  hasSecret: false,
  updatedAt: null,
}

const GOOGLE_CONFIG = {
  provider: 'google_workspace' as const,
  enabled: false,
  clientId: null,
  tenantId: null,
  redirectUri: null,
  hasSecret: false,
  updatedAt: null,
}

describe('SsoSettingsPage', () => {
  beforeEach(() => {
    vi.mocked(ssoApi.listSsoProviders).mockResolvedValue([
      AZURE_CONFIG,
      GOOGLE_CONFIG,
    ])
  })

  it('AzureADとGoogle Workspaceの両カードを表示する', async () => {
    render(<SsoSettingsPage />)

    expect(await screen.findByText('Azure AD')).toBeInTheDocument()
    expect(screen.getByText('Google Workspace')).toBeInTheDocument()
  })

  it('Azure ADカードにはテナントID欄がある、Google Workspaceにはない', async () => {
    render(<SsoSettingsPage />)
    await screen.findByText('Azure AD')

    const tenantIdLabels = screen.getAllByText('テナントID')
    expect(tenantIdLabels).toHaveLength(1)
  })

  it('取得に失敗した場合はエラーメッセージを表示する', async () => {
    vi.mocked(ssoApi.listSsoProviders).mockRejectedValue(
      new Error('SSO設定の取得に失敗しました'),
    )

    render(<SsoSettingsPage />)

    expect(
      await screen.findByText('SSO設定の取得に失敗しました'),
    ).toBeInTheDocument()
  })

  it('クライアントIDを入力して保存すると、updateSsoProviderが正しい値で呼ばれる', async () => {
    vi.mocked(ssoApi.updateSsoProvider).mockResolvedValue({
      ...AZURE_CONFIG,
      enabled: true,
      clientId: 'new-client-id',
    })
    const user = userEvent.setup()
    render(<SsoSettingsPage />)
    await screen.findByText('Azure AD')

    const clientIdInputs = screen.getAllByLabelText('クライアントID')
    await user.type(clientIdInputs[0] as HTMLElement, 'new-client-id')
    const saveButtons = screen.getAllByRole('button', { name: '保存する' })
    await user.click(saveButtons[0] as HTMLElement)

    await waitFor(() => {
      expect(ssoApi.updateSsoProvider).toHaveBeenCalledWith(
        'azure_ad',
        expect.objectContaining({ clientId: 'new-client-id' }),
      )
    })
  })

  it('クライアントシークレットを入力しなかった場合、保存ペイロードにclientSecretを含めない', async () => {
    vi.mocked(ssoApi.updateSsoProvider).mockResolvedValue(AZURE_CONFIG)
    const user = userEvent.setup()
    render(<SsoSettingsPage />)
    await screen.findByText('Azure AD')

    const saveButtons = screen.getAllByRole('button', { name: '保存する' })
    await user.click(saveButtons[0] as HTMLElement)

    await waitFor(() => {
      expect(ssoApi.updateSsoProvider).toHaveBeenCalled()
    })
    const call = vi.mocked(ssoApi.updateSsoProvider).mock.calls[0]
    expect(call?.[1]).not.toHaveProperty('clientSecret')
  })
})
