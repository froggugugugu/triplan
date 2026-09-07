import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import type { SsoProviderConfig, SsoProviderType } from '@/shared/types'

interface SsoProviderCardProps {
  title: string
  description: string
  config: SsoProviderConfig
  showTenantId: boolean
  onSave: (
    provider: SsoProviderType,
    values: {
      enabled: boolean
      clientId: string | null
      clientSecret?: string
      tenantId?: string | null
      redirectUri: string | null
    },
  ) => Promise<void>
}

export function SsoProviderCard({
  title,
  description,
  config,
  showTenantId,
  onSave,
}: SsoProviderCardProps) {
  const [enabled, setEnabled] = useState(config.enabled)
  const [clientId, setClientId] = useState(config.clientId ?? '')
  const [clientSecret, setClientSecret] = useState('')
  const [tenantId, setTenantId] = useState(config.tenantId ?? '')
  const [redirectUri, setRedirectUri] = useState(config.redirectUri ?? '')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setEnabled(config.enabled)
    setClientId(config.clientId ?? '')
    setClientSecret('')
    setTenantId(config.tenantId ?? '')
    setRedirectUri(config.redirectUri ?? '')
  }, [config])

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      await onSave(config.provider, {
        enabled,
        clientId: clientId || null,
        ...(clientSecret ? { clientSecret } : {}),
        ...(showTenantId ? { tenantId: tenantId || null } : {}),
        redirectUri: redirectUri || null,
      })
      setClientSecret('')
    } finally {
      setIsSaving(false)
    }
  }, [
    config.provider,
    enabled,
    clientId,
    clientSecret,
    showTenantId,
    tenantId,
    redirectUri,
    onSave,
  ])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`sso-enabled-${config.provider}`}
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor={`sso-enabled-${config.provider}`}>有効化</Label>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`sso-client-id-${config.provider}`}>
            クライアントID
          </Label>
          <Input
            id={`sso-client-id-${config.provider}`}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`sso-client-secret-${config.provider}`}>
            クライアントシークレット
          </Label>
          <Input
            id={`sso-client-secret-${config.provider}`}
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={
              config.hasSecret ? '設定済み（変更する場合のみ入力）' : '未設定'
            }
          />
        </div>

        {showTenantId && (
          <div className="space-y-2">
            <Label htmlFor={`sso-tenant-id-${config.provider}`}>
              テナントID
            </Label>
            <Input
              id={`sso-tenant-id-${config.provider}`}
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor={`sso-redirect-uri-${config.provider}`}>
            リダイレクトURI
          </Label>
          <Input
            id={`sso-redirect-uri-${config.provider}`}
            value={redirectUri}
            onChange={(e) => setRedirectUri(e.target.value)}
            placeholder="https://your-domain.example.com/api/auth/sso/callback"
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? '保存中...' : '保存する'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
