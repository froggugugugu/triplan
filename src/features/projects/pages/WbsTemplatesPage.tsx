import { Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { useToast } from '@/shared/hooks/use-toast'
import type { WbsTemplate } from '@/shared/types/wbs-template'
import { useDocumentTemplateStore, useWbsTemplateStore } from '@/stores'
import { DocumentTemplateLinkDialog } from '../components/DocumentTemplateLinkDialog'
import { WbsTemplateTreeGrid } from '../components/WbsTemplateTreeGrid'
import {
  type EditorNode,
  fromEditorNodes,
  toEditorNodes,
  updateEditorNode,
} from '../utils/wbs-template-editor-utils'

/**
 * WBSテンプレート管理画面。既存のWBS画面（`WbsPage`）と同等のUI構成
 * （テンプレート選択セレクタ＋編集用ツリーグリッド）で、テンプレートの新規作成・
 * 名称編集・工程/タスクの編集を行う。編集内容は`WbsTemplateTreeGrid`の操作のたびに
 * 即座に`updateWbsTemplate`で永続化する（WBS画面のセル編集と同じ即時保存方式）。
 * 導線はシステム設定メニュー（`Layout.tsx`）から遷移する。
 */
export function WbsTemplatesPage() {
  const { toast } = useToast()
  const wbsTemplates = useWbsTemplateStore((s) => s.wbsTemplates)
  const loadWbsTemplates = useWbsTemplateStore((s) => s.loadWbsTemplates)
  const seedStandardTemplate = useWbsTemplateStore(
    (s) => s.seedStandardTemplate,
  )
  const addWbsTemplate = useWbsTemplateStore((s) => s.addWbsTemplate)
  const updateWbsTemplate = useWbsTemplateStore((s) => s.updateWbsTemplate)
  const deleteWbsTemplate = useWbsTemplateStore((s) => s.deleteWbsTemplate)

  const documentTemplates = useDocumentTemplateStore((s) => s.documentTemplates)
  const loadDocumentTemplates = useDocumentTemplateStore(
    (s) => s.loadDocumentTemplates,
  )
  const seedStandardDocumentTemplates = useDocumentTemplateStore(
    (s) => s.seedStandardDocumentTemplates,
  )

  useEffect(() => {
    loadWbsTemplates()
  }, [loadWbsTemplates])

  useEffect(() => {
    seedStandardTemplate()
  }, [seedStandardTemplate])

  // 紐づけ先候補（ドキュメントテンプレート）も読み込む。標準WBSテンプレートの
  // documentTemplateIdsが標準ドキュメントテンプレート（固定UUID）を参照するため、
  // 未シード環境ではここでシードして参照切れを防ぐ
  useEffect(() => {
    loadDocumentTemplates()
  }, [loadDocumentTemplates])

  useEffect(() => {
    seedStandardDocumentTemplates()
  }, [seedStandardDocumentTemplates])

  const [selectedId, setSelectedId] = useState('')

  useEffect(() => {
    if (!selectedId && wbsTemplates.length > 0) {
      setSelectedId(wbsTemplates[0]?.id ?? '')
    }
  }, [selectedId, wbsTemplates])

  const selectedTemplate = wbsTemplates.find((t) => t.id === selectedId) ?? null

  // 選択中テンプレートのnodesを編集用ツリー（安定id付き）へ変換したもの。
  // 「テンプレートを切り替えたとき」のみtoEditorNodesで作り直し、以降のグリッド操作
  // （追加・削除・編集・移動）はローカルstateを直接更新する。selectedTemplate.nodes
  // （store由来）をuseMemoの依存にすると、updateWbsTemplateのたびにstoreの配列参照が
  // 変わり、そのたびに全ノードのidが再採番されてしまう。WbsTemplateTreeGrid内部の
  // 展開状態（expanded、id紐付けのSet）が毎回無効化され、アコーディオンが強制的に
  // 全て閉じる不具合の原因だったため、id切替のみをトリガーにする方式へ変更した
  const [editorNodes, setEditorNodes] = useState<EditorNode[]>([])
  // biome-ignore lint/correctness/useExhaustiveDependencies: テンプレート切替（id変化）のみを再構築のトリガーにする意図的な設計
  useEffect(() => {
    setEditorNodes(
      selectedTemplate ? toEditorNodes(selectedTemplate.nodes) : [],
    )
  }, [selectedTemplate?.id])

  const [name, setName] = useState('')
  useEffect(() => {
    setName(selectedTemplate?.name ?? '')
  }, [selectedTemplate])

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const handleCreate = useCallback(() => {
    const created = addWbsTemplate({ name: '新規テンプレート', nodes: [] })
    setSelectedId(created.id)
    toast({ title: 'テンプレートを作成しました' })
  }, [addWbsTemplate, toast])

  const handleNameBlur = useCallback(() => {
    if (!selectedTemplate) return
    const trimmed = name.trim()
    if (!trimmed || trimmed === selectedTemplate.name) {
      setName(selectedTemplate.name)
      return
    }
    updateWbsTemplate({ id: selectedTemplate.id, name: trimmed })
  }, [selectedTemplate, name, updateWbsTemplate])

  const handleGridChange = useCallback(
    (nextEditorNodes: EditorNode[]) => {
      setEditorNodes(nextEditorNodes)
      if (!selectedTemplate) return
      updateWbsTemplate({
        id: selectedTemplate.id,
        nodes: fromEditorNodes(nextEditorNodes),
      })
    },
    [selectedTemplate, updateWbsTemplate],
  )

  const [nodeDeleteTarget, setNodeDeleteTarget] = useState<EditorNode | null>(
    null,
  )

  // ドキュメントテンプレート紐づけダイアログ
  const [docLinkTarget, setDocLinkTarget] = useState<EditorNode | null>(null)

  const knownDocumentTemplateIds = useMemo(
    () => new Set(documentTemplates.map((t) => t.id)),
    [documentTemplates],
  )

  const handleDocumentLinkSave = useCallback(
    (nodeId: string, documentTemplateIds: string[]) => {
      handleGridChange(
        updateEditorNode(editorNodes, nodeId, { documentTemplateIds }),
      )
      toast({ title: 'ドキュメントテンプレートの紐づけを保存しました' })
    },
    [editorNodes, handleGridChange, toast],
  )

  const handleDeleteNodeConfirm = useCallback(() => {
    if (!selectedTemplate || !nodeDeleteTarget) return
    // 削除対象を含む最新のeditorNodesから、対象idを除去して保存する
    function removeById(items: EditorNode[], id: string): EditorNode[] {
      return items
        .filter((n) => n.id !== id)
        .map((n) => ({ ...n, children: removeById(n.children, id) }))
    }
    const next = removeById(editorNodes, nodeDeleteTarget.id)
    setEditorNodes(next)
    updateWbsTemplate({
      id: selectedTemplate.id,
      nodes: fromEditorNodes(next),
    })
    setNodeDeleteTarget(null)
  }, [selectedTemplate, nodeDeleteTarget, editorNodes, updateWbsTemplate])

  const handleDeleteTemplateConfirm = useCallback(() => {
    if (!selectedTemplate) return
    deleteWbsTemplate(selectedTemplate.id)
    setSelectedId('')
    setDeleteDialogOpen(false)
    toast({ title: 'テンプレートを削除しました' })
  }, [selectedTemplate, deleteWbsTemplate, toast])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">WBSテンプレート</h1>
        <p className="text-sm text-muted-foreground">
          プロジェクトのWBSに一括適用できるテンプレートを作成・編集します
        </p>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">対象テンプレート</span>
        <Combobox
          value={selectedId}
          onValueChange={setSelectedId}
          options={wbsTemplates.map((t: WbsTemplate) => ({
            value: t.id,
            label: t.name,
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
              {wbsTemplates.length === 0
                ? 'テンプレートがありません。「新規テンプレート作成」から作成してください。'
                : 'テンプレートを選択してください。'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="space-y-2">
              <Label htmlFor="wbs-template-name">テンプレート名</Label>
              <Input
                id="wbs-template-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleNameBlur}
                className="max-w-md"
              />
            </div>
            <CardTitle className="sr-only">{selectedTemplate.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <WbsTemplateTreeGrid
              nodes={editorNodes}
              onChange={handleGridChange}
              onDeleteRequest={setNodeDeleteTarget}
              onDocumentLinkRequest={setDocLinkTarget}
              knownDocumentTemplateIds={knownDocumentTemplateIds}
            />
          </CardContent>
        </Card>
      )}

      <DocumentTemplateLinkDialog
        node={docLinkTarget}
        documentTemplates={documentTemplates}
        onClose={() => setDocLinkTarget(null)}
        onSave={handleDocumentLinkSave}
      />

      <Dialog
        open={!!nodeDeleteTarget}
        onOpenChange={(open) => !open && setNodeDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>工程・タスクの削除</DialogTitle>
            <DialogDescription>
              「{nodeDeleteTarget?.name}
              」を削除しますか？配下の子タスクもすべて削除されます。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNodeDeleteTarget(null)}>
              キャンセル
            </Button>
            <Button variant="destructive" onClick={handleDeleteNodeConfirm}>
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>テンプレートの削除</DialogTitle>
            <DialogDescription>
              「{selectedTemplate?.name}
              」を削除しますか？この操作は元に戻せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button variant="destructive" onClick={handleDeleteTemplateConfirm}>
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
