import { useCallback, useEffect, useState } from 'react'
import {
  listSsoProviders,
  updateSsoProvider,
} from '@/features/admin/api/sso-providers-api'
import { SsoProviderCard } from '@/features/admin/components/SsoProviderCard'
import { useToast } from '@/shared/hooks/use-toast'
import type { SsoProviderConfig, SsoProviderType } from '@/shared/types'

const EMPTY_CONFIG = (provider: SsoProviderType): SsoProviderConfig => ({
  provider,
  enabled: false,
  clientId: null,
  tenantId: null,
  redirectUri: null,
  hasSecret: false,
  updatedAt: null,
})

/**
 * admin限定のSSOプロバイダ設定画面（postgresモードのみ）。
 * 実際のOIDC認可コードフローは未実装（のスコープ）。ここでは接続情報の
 * 登録・保存のみを行う。実テナントでの動作確認は認証情報が提供された時点で別途行う。
 */
export function SsoSettingsPage() {
  const { toast } = useToast()
  const [configs, setConfigs] = useState<
    Record<SsoProviderType, SsoProviderConfig>
  >({
    azure_ad: EMPTY_CONFIG('azure_ad'),
    google_workspace: EMPTY_CONFIG('google_workspace'),
  })
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const providers = await listSsoProviders()
      setConfigs((prev) => {
        const next = { ...prev }
        for (const p of providers) {
          next[p.provider] = p
        }
        return next
      })
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'SSO設定の取得に失敗しました',
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const handleSave = useCallback(
    async (
      provider: SsoProviderType,
      values: Parameters<typeof updateSsoProvider>[1],
    ) => {
      try {
        const updated = await updateSsoProvider(provider, values)
        setConfigs((prev) => ({ ...prev, [provider]: updated }))
        toast({ title: '保存しました' })
      } catch (error) {
        toast({
          title: '保存に失敗しました',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      }
    },
    [toast],
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">SSO設定</h1>
        <p className="text-sm text-muted-foreground">
          Azure AD・Google WorkspaceのOIDC接続情報を登録します（admin限定）。
          実際のログイン連携には利用企業側のテナントでのアプリ登録が別途必要です。
        </p>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">
          読み込み中...
        </div>
      ) : loadError ? (
        <div className="py-12 text-center text-destructive">{loadError}</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SsoProviderCard
            title="Azure AD"
            description="Microsoft Entra ID（旧Azure AD）でのSSOログイン"
            config={configs.azure_ad}
            showTenantId
            onSave={handleSave}
          />
          <SsoProviderCard
            title="Google Workspace"
            description="Google WorkspaceアカウントでのSSOログイン"
            config={configs.google_workspace}
            showTenantId={false}
            onSave={handleSave}
          />
        </div>
      )}
    </div>
  )
}
