import { useCallback, useEffect, useState } from 'react'
import {
  type ExternalToolConnection,
  type ExternalToolMetadata,
  type ExternalToolTargetConfig,
  fetchExternalToolMetadata,
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

interface ExternalToolTargetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connection: ExternalToolConnection | null
  onSave: (targetConfig: ExternalToolTargetConfig) => void
}

/**
 * 起票先設定ダイアログ（API起票基盤 Phase 2）。
 * 2段階フローの後半: 保存済みトークンでサーバー経由に選択肢（プロジェクト等）を取得し、
 * ツール別の起票先を選ばせる。GitHubのみowner/repoの直接入力（一覧APIが不要なため）。
 */
export function ExternalToolTargetDialog({
  open,
  onOpenChange,
  connection,
  onSave,
}: ExternalToolTargetDialogProps) {
  const [metadata, setMetadata] = useState<ExternalToolMetadata | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Backlog/Jira/Asana
  const [projectId, setProjectId] = useState('')
  const [priorityId, setPriorityId] = useState('')
  const [issueTypeId, setIssueTypeId] = useState('')
  // GitHub
  const [owner, setOwner] = useState('')
  const [repo, setRepo] = useState('')

  const tool = connection?.tool ?? null

  const loadMetadata = useCallback(async () => {
    if (!connection || connection.tool === 'github') return
    setIsLoading(true)
    setLoadError(null)
    try {
      setMetadata(await fetchExternalToolMetadata(connection.id))
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : '選択肢の取得に失敗しました。APIトークンと接続先を確認してください',
      )
    } finally {
      setIsLoading(false)
    }
  }, [connection])

  useEffect(() => {
    if (!open || !connection) return
    const current = connection.targetConfig
    setProjectId(
      current && 'projectId' in current
        ? String(current.projectId)
        : current && 'projectKey' in current
          ? current.projectKey
          : current && 'projectGid' in current
            ? current.projectGid
            : '',
    )
    setPriorityId(
      current && 'priorityId' in current ? String(current.priorityId) : '',
    )
    setIssueTypeId(
      current && 'issueTypeId' in current ? String(current.issueTypeId) : '',
    )
    setOwner(current && 'owner' in current ? current.owner : '')
    setRepo(current && 'repo' in current ? current.repo : '')
    setMetadata(null)
    void loadMetadata()
  }, [open, connection, loadMetadata])

  const canSave = (() => {
    switch (tool) {
      case 'backlog':
        return projectId !== '' && issueTypeId !== '' && priorityId !== ''
      case 'jira':
        return projectId !== '' && issueTypeId !== ''
      case 'asana':
        return projectId !== ''
      case 'github':
        return owner.trim() !== '' && repo.trim() !== ''
      default:
        return false
    }
  })()

  const handleSave = () => {
    if (!canSave || !tool) return
    switch (tool) {
      case 'backlog':
        onSave({
          projectId: Number(projectId),
          issueTypeId: Number(issueTypeId),
          priorityId: Number(priorityId),
        })
        break
      case 'jira':
        onSave({ projectKey: projectId, issueTypeId })
        break
      case 'asana':
        onSave({ projectGid: projectId })
        break
      case 'github':
        onSave({ owner: owner.trim(), repo: repo.trim() })
        break
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>起票先の設定</DialogTitle>
          <DialogDescription>
            {connection
              ? `「${connection.name}」でWBSタスクを起票する先を指定します`
              : ''}
          </DialogDescription>
        </DialogHeader>

        {tool === 'github' ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="gh-owner">
                オーナー（ユーザー/Organization）
              </Label>
              <Input
                id="gh-owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="例: acme"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gh-repo">リポジトリ</Label>
              <Input
                id="gh-repo"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="例: webapp"
              />
            </div>
          </div>
        ) : isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            選択肢を取得しています…
          </p>
        ) : loadError ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => loadMetadata()}>
              再取得
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="target-project">プロジェクト</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger id="target-project" aria-label="プロジェクト">
                  <SelectValue placeholder="選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {(metadata?.projects ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {tool === 'backlog' && (
              <div className="space-y-1.5">
                <Label htmlFor="target-priority">優先度</Label>
                <Select value={priorityId} onValueChange={setPriorityId}>
                  <SelectTrigger id="target-priority" aria-label="優先度">
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {(metadata?.priorities ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(tool === 'backlog' || tool === 'jira') && (
              <div className="space-y-1.5">
                <Label htmlFor="target-issue-type">課題種別</Label>
                {(metadata?.issueTypes ?? []).length > 0 ? (
                  <Select value={issueTypeId} onValueChange={setIssueTypeId}>
                    <SelectTrigger id="target-issue-type" aria-label="課題種別">
                      <SelectValue placeholder="選択してください" />
                    </SelectTrigger>
                    <SelectContent>
                      {(metadata?.issueTypes ?? []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <>
                    <Input
                      id="target-issue-type"
                      value={issueTypeId}
                      onChange={(e) => setIssueTypeId(e.target.value)}
                      placeholder={tool === 'backlog' ? '例: 3' : '例: 10001'}
                    />
                    <p className="text-xs text-muted-foreground">
                      {tool === 'backlog'
                        ? '種別はプロジェクトごとに異なります。プロジェクトを選んで保存すると、次回から一覧で選べます'
                        : '課題タイプの一覧を取得できませんでした。IDを直接入力してください'}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
