import { Copy, ExternalLink, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  type ApiKeySummary,
  createApiKey,
  deleteApiKey,
  listApiKeys,
  openApiSpecUrl,
  updateApiKey,
} from '@/features/admin/api/api-keys-api'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { useToast } from '@/shared/hooks/use-toast'

/**
 * admin限定のAPIキー管理画面（公開API v1、postgresモードのみ）。
 * キーの発行（平文は発行直後に一度だけ表示）・無効化/有効化・削除と、
 * OAS仕様書（/api/v1/openapi.yaml）への案内を行う。
 */
export function ApiKeysPage() {
  const { toast } = useToast()
  const [apiKeys, setApiKeys] = useState<ApiKeySummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [newKeyName, setNewKeyName] = useState('')
  const [issuedKey, setIssuedKey] = useState<{
    name: string
    key: string
  } | null>(null)
  const [deletingKey, setDeletingKey] = useState<ApiKeySummary | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      setApiKeys(await listApiKeys())
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'APIキーの取得に失敗しました',
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const handleCreate = useCallback(async () => {
    const name = newKeyName.trim()
    if (!name) {
      toast({ title: 'キーの名前を入力してください', variant: 'destructive' })
      return
    }
    try {
      const result = await createApiKey(name)
      setIssuedKey({ name, key: result.key })
      setNewKeyName('')
      toast({ title: `APIキー「${name}」を発行しました` })
      await reload()
    } catch (error) {
      toast({
        title: 'APIキーの発行に失敗しました',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    }
  }, [newKeyName, toast, reload])

  const handleToggle = useCallback(
    async (apiKey: ApiKeySummary) => {
      setPendingId(apiKey.id)
      try {
        await updateApiKey(apiKey.id, { enabled: !apiKey.enabled })
        toast({
          title: apiKey.enabled
            ? `「${apiKey.name}」を無効化しました（このキーでのアクセスは即座に401になります）`
            : `「${apiKey.name}」を有効化しました`,
        })
        await reload()
      } catch (error) {
        toast({
          title: '状態の変更に失敗しました',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      } finally {
        setPendingId(null)
      }
    },
    [toast, reload],
  )

  const handleDelete = useCallback(async () => {
    if (!deletingKey) return
    try {
      await deleteApiKey(deletingKey.id)
      toast({ title: `「${deletingKey.name}」を削除しました` })
      setDeletingKey(null)
      await reload()
    } catch (error) {
      toast({
        title: '削除に失敗しました',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    }
  }, [deletingKey, toast, reload])

  const handleCopyKey = useCallback(async () => {
    if (!issuedKey) return
    await navigator.clipboard.writeText(issuedKey.key)
    toast({ title: 'APIキーをコピーしました' })
  }, [issuedKey, toast])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">APIキー（公開API v1）</h1>
        <p className="text-sm text-muted-foreground">
          外部システム（BI・会計・スクリプト）向けの読み取り専用APIのキーを管理します（admin限定）。
          API仕様は{' '}
          <a
            href={openApiSpecUrl()}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary underline"
          >
            OpenAPI仕様書（openapi.yaml）
            <ExternalLink className="h-3 w-3" />
          </a>{' '}
          を利用者へ共有してください
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-64"
          placeholder="キーの名前（例: 経営ダッシュボード用）"
          aria-label="APIキーの名前"
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
        />
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4" />
          キーを発行
        </Button>
      </div>

      {issuedKey && (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
          <p className="text-sm font-medium">
            「{issuedKey.name}
            」のAPIキー（この画面でのみ表示されます。閉じると再表示できません）
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-muted px-2 py-1 font-mono text-xs">
              {issuedKey.key}
            </code>
            <Button variant="outline" size="sm" onClick={handleCopyKey}>
              <Copy className="h-4 w-4" />
              コピー
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIssuedKey(null)}
            >
              閉じる
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            使い方: リクエストヘッダに <code>X-Api-Key: {'{キー}'}</code>{' '}
            を付けて
            <code> /api/v1/... </code>へGETします
          </p>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">
            読み込み中...
          </div>
        ) : loadError ? (
          <div className="py-12 text-center text-destructive">{loadError}</div>
        ) : apiKeys.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            APIキーがまだありません。「キーを発行」から作成してください。
          </div>
        ) : (
          <div className="divide-y divide-border">
            {apiKeys.map((apiKey) => (
              <div
                key={apiKey.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{apiKey.name}</span>
                    {!apiKey.enabled && (
                      <Badge variant="destructive" className="text-xs">
                        無効
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    発行: {new Date(apiKey.createdAt).toLocaleString('ja-JP')}
                    {' ・ 最終利用: '}
                    {apiKey.lastUsedAt
                      ? new Date(apiKey.lastUsedAt).toLocaleString('ja-JP')
                      : '未使用'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pendingId === apiKey.id}
                  onClick={() => handleToggle(apiKey)}
                >
                  {apiKey.enabled ? '無効化' : '有効化'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  title="削除"
                  onClick={() => setDeletingKey(apiKey)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={deletingKey !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingKey(null)
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>APIキーを削除</DialogTitle>
            <DialogDescription>
              「{deletingKey?.name}
              」を削除します。このキーを使っている外部連携は即座に401になります。よろしいですか？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingKey(null)}>
              キャンセル
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
