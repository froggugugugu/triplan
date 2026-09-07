import { Download, Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { Combobox } from '@/shared/components/ui/combobox'
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
import { Textarea } from '@/shared/components/ui/textarea'
import { createEmptyOkfContent } from '@/shared/data/document-template-master'
import { useToast } from '@/shared/hooks/use-toast'
import type { DocumentTemplate } from '@/shared/types/document-template'
import { useDocumentTemplateStore } from '@/stores'

/** マークダウンファイルとしてダウンロードする（CSVレポートと同じBlob方式） */
function downloadMarkdown(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * ドキュメントテンプレート管理画面。
 * IPA公開情報準拠の標準ドキュメントテンプレート（初回シード）と、ユーザー独自の
 * テンプレートを一覧・作成・編集・削除・ダウンロードできる。
 * 本文はOKF v0.2準拠のマークダウン（YAML frontmatter付き、
 * 非公開の設計文書）。
 * WBSテンプレート管理画面（`/wbs-templates`）から各工程ノードへ紐づけて使う。
 * 導線はシステム設定メニュー（`Layout.tsx`）。
 */
export function DocumentTemplatesPage() {
  const { toast } = useToast()
  const documentTemplates = useDocumentTemplateStore((s) => s.documentTemplates)
  const loadDocumentTemplates = useDocumentTemplateStore(
    (s) => s.loadDocumentTemplates,
  )
  const seedStandardDocumentTemplates = useDocumentTemplateStore(
    (s) => s.seedStandardDocumentTemplates,
  )
  const addDocumentTemplate = useDocumentTemplateStore(
    (s) => s.addDocumentTemplate,
  )
  const updateDocumentTemplate = useDocumentTemplateStore(
    (s) => s.updateDocumentTemplate,
  )
  const deleteDocumentTemplate = useDocumentTemplateStore(
    (s) => s.deleteDocumentTemplate,
  )

  useEffect(() => {
    loadDocumentTemplates()
  }, [loadDocumentTemplates])

  useEffect(() => {
    seedStandardDocumentTemplates()
  }, [seedStandardDocumentTemplates])

  const [selectedId, setSelectedId] = useState('')

  useEffect(() => {
    if (!selectedId && documentTemplates.length > 0) {
      setSelectedId(documentTemplates[0]?.id ?? '')
    }
  }, [selectedId, documentTemplates])

  const selectedTemplate =
    documentTemplates.find((t) => t.id === selectedId) ?? null

  // 編集用ローカルstate（テンプレート切替時に再構築、blurで保存）
  const [name, setName] = useState('')
  const [phase, setPhase] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')

  useEffect(() => {
    setName(selectedTemplate?.name ?? '')
    setPhase(selectedTemplate?.phase ?? '')
    setDescription(selectedTemplate?.description ?? '')
    setContent(selectedTemplate?.content ?? '')
  }, [selectedTemplate])

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const handleCreate = useCallback(() => {
    const created = addDocumentTemplate({
      name: '新規ドキュメントテンプレート',
      phase: null,
      description: null,
      content: createEmptyOkfContent('新規ドキュメント'),
    })
    setSelectedId(created.id)
    toast({ title: 'ドキュメントテンプレートを作成しました' })
  }, [addDocumentTemplate, toast])

  const handleNameBlur = useCallback(() => {
    if (!selectedTemplate) return
    const trimmed = name.trim()
    if (!trimmed || trimmed === selectedTemplate.name) {
      setName(selectedTemplate.name)
      return
    }
    updateDocumentTemplate({ id: selectedTemplate.id, name: trimmed })
  }, [selectedTemplate, name, updateDocumentTemplate])

  const handlePhaseBlur = useCallback(() => {
    if (!selectedTemplate) return
    const trimmed = phase.trim()
    const next = trimmed === '' ? null : trimmed
    if (next === selectedTemplate.phase) return
    updateDocumentTemplate({ id: selectedTemplate.id, phase: next })
  }, [selectedTemplate, phase, updateDocumentTemplate])

  const handleDescriptionBlur = useCallback(() => {
    if (!selectedTemplate) return
    const trimmed = description.trim()
    const next = trimmed === '' ? null : trimmed
    if (next === selectedTemplate.description) return
    updateDocumentTemplate({ id: selectedTemplate.id, description: next })
  }, [selectedTemplate, description, updateDocumentTemplate])

  const handleContentBlur = useCallback(() => {
    if (!selectedTemplate) return
    if (content === selectedTemplate.content) return
    updateDocumentTemplate({ id: selectedTemplate.id, content })
  }, [selectedTemplate, content, updateDocumentTemplate])

  const handleDownload = useCallback(() => {
    if (!selectedTemplate) return
    downloadMarkdown(`${selectedTemplate.name}.md`, selectedTemplate.content)
  }, [selectedTemplate])

  const handleDeleteConfirm = useCallback(() => {
    if (!selectedTemplate) return
    deleteDocumentTemplate(selectedTemplate.id)
    setSelectedId('')
    setDeleteDialogOpen(false)
    toast({ title: 'ドキュメントテンプレートを削除しました' })
  }, [selectedTemplate, deleteDocumentTemplate, toast])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">ドキュメントテンプレート</h1>
        <p className="text-sm text-muted-foreground">
          各工程で作成するドキュメントのマークダウン雛形（OKF準拠・IPA公開情報ベース）を管理します。WBSテンプレートの工程・タスクに紐づけて使います
        </p>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">対象テンプレート</span>
        <Combobox
          value={selectedId}
          onValueChange={setSelectedId}
          options={documentTemplates.map((t: DocumentTemplate) => ({
            value: t.id,
            label: t.phase ? `【${t.phase}】${t.name}` : t.name,
          }))}
          placeholder="テンプレートを選択してください"
          searchPlaceholder="テンプレートを検索..."
          className="w-[420px]"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCreate}
        >
          <Plus className="h-4 w-4" />
          新規テンプレート作成
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!selectedTemplate}
          onClick={() => setDeleteDialogOpen(true)}
          className="text-destructive hover:text-destructive"
        >
          削除
        </Button>
      </div>

      {!selectedTemplate ? (
        <Card>
          <CardContent>
            <p className="py-8 text-center text-muted-foreground">
              {documentTemplates.length === 0
                ? 'テンプレートがありません。「新規テンプレート作成」から作成してください。'
                : 'テンプレートを選択してください。'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="document-template-name">テンプレート名</Label>
                <Input
                  id="document-template-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={handleNameBlur}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="document-template-phase">
                  対象工程（任意）
                </Label>
                <Input
                  id="document-template-phase"
                  value={phase}
                  onChange={(e) => setPhase(e.target.value)}
                  onBlur={handlePhaseBlur}
                  placeholder="例: 要件定義"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="document-template-description">
                  説明（任意）
                </Label>
                <Input
                  id="document-template-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={handleDescriptionBlur}
                />
              </div>
            </div>
            <CardTitle className="sr-only">{selectedTemplate.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="document-template-content">
                本文（マークダウン・OKF準拠）
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownload}
              >
                <Download className="h-3.5 w-3.5" />
                .mdダウンロード
              </Button>
            </div>
            <Textarea
              id="document-template-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={handleContentBlur}
              spellCheck={false}
              className="min-h-[480px] font-mono text-xs leading-5"
            />
            {selectedTemplate.sourceRefs &&
              selectedTemplate.sourceRefs.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  出典: {selectedTemplate.sourceRefs.join(' / ')}
                </p>
              )}
          </CardContent>
        </Card>
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ドキュメントテンプレートの削除</DialogTitle>
            <DialogDescription>
              「{selectedTemplate?.name}
              」を削除しますか？WBSテンプレートからの紐づけは解除されます（表示されなくなります）。この操作は元に戻せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
