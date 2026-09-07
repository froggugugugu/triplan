import { useEffect, useState } from 'react'
import {
  EXTERNAL_TOOL_LABELS,
  type ExternalTool,
  type ExternalToolConnection,
} from '@/shared/api/external-tools-api'
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
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'

/** ツール別に必要な接続情報（非公開の設計文書） */
const TOOL_HINTS: Record<
  ExternalTool,
  { baseUrl: string | null; authEmail: boolean; tokenHint: string }
> = {
  backlog: {
    baseUrl: 'https://＜スペース＞.backlog.jp',
    authEmail: false,
    tokenHint: '個人設定 → API から発行したAPIキー',
  },
  jira: {
    baseUrl: 'https://＜サイト＞.atlassian.net',
    authEmail: true,
    tokenHint: 'Atlassianアカウントで発行したAPIトークン',
  },
  asana: {
    baseUrl: null,
    authEmail: false,
    tokenHint: 'Personal Access Token（開発者コンソールで発行）',
  },
  github: {
    baseUrl: null,
    authEmail: false,
    tokenHint:
      'Fine-grained PAT（対象リポジトリの Issues: Read and write 権限が必要）',
  },
}

export interface ExternalToolConnectionFormValues {
  tool: ExternalTool
  name: string
  baseUrl: string
  authEmail: string
  /** 空文字=変更なし（編集時）。新規作成時は必須 */
  apiToken: string
}

interface ExternalToolConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null=新規追加 */
  connection: ExternalToolConnection | null
  onSubmit: (values: ExternalToolConnectionFormValues) => void
}

/**
 * 外部ツール接続の追加・編集ダイアログ（API起票基盤 Phase 2）。
 * NotificationChannelDialogと同型: ツール別にフィールドを出し分け、編集時の
 * APIトークン空欄は「変更なし」を意味する（サーバー側の3値セマンティクスに対応）。
 * 起票先（プロジェクト・リポジトリ等）は接続保存後に一覧画面から設定する2段階フロー。
 */
export function ExternalToolConnectionDialog({
  open,
  onOpenChange,
  connection,
  onSubmit,
}: ExternalToolConnectionDialogProps) {
  const [tool, setTool] = useState<ExternalTool>('github')
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [apiToken, setApiToken] = useState('')

  useEffect(() => {
    if (!open) return
    setTool(connection?.tool ?? 'github')
    setName(connection?.name ?? '')
    setBaseUrl(connection?.baseUrl ?? '')
    setAuthEmail(connection?.authEmail ?? '')
    setApiToken('')
  }, [open, connection])

  const hint = TOOL_HINTS[tool]
  const isEdit = connection !== null
  const canSubmit =
    name.trim() !== '' &&
    (isEdit || apiToken.trim() !== '') &&
    (hint.baseUrl === null || baseUrl.trim() !== '') &&
    (!hint.authEmail || authEmail.trim() !== '')

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit({
      tool,
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      authEmail: authEmail.trim(),
      apiToken: apiToken.trim(),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? '接続を編集' : '外部ツール接続を追加'}
          </DialogTitle>
          <DialogDescription>
            WBSのタスクを起票する先のツールと認証情報を設定します。起票先（プロジェクト・リポジトリ）は保存後に設定します
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tool">ツール</Label>
            <Select
              value={tool}
              onValueChange={(v) => setTool(v as ExternalTool)}
              disabled={isEdit}
            >
              <SelectTrigger id="tool" aria-label="ツール">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.entries(EXTERNAL_TOOL_LABELS) as Array<
                    [ExternalTool, string]
                  >
                ).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isEdit && (
              <p className="text-xs text-muted-foreground">
                ツールは変更できません（別の接続として追加してください）
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="connection-name">接続名</Label>
            <Input
              id="connection-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 顧客ポータル案件用"
            />
          </div>

          {hint.baseUrl !== null && (
            <div className="space-y-1.5">
              <Label htmlFor="base-url">URL</Label>
              <Input
                id="base-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={hint.baseUrl}
              />
            </div>
          )}

          {hint.authEmail && (
            <div className="space-y-1.5">
              <Label htmlFor="auth-email">メールアドレス</Label>
              <Input
                id="auth-email"
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="APIトークンと対になるアカウントのメールアドレス"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="api-token">APIトークン</Label>
            <Input
              id="api-token"
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder={isEdit ? '変更する場合のみ入力' : hint.tokenHint}
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              {isEdit
                ? '空欄のまま保存すると現在のトークンを維持します'
                : hint.tokenHint}
              。保存時に暗号化され、以降は画面に表示されません
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isEdit ? '保存' : '追加'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
