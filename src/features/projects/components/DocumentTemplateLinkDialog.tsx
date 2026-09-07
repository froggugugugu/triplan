import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { MultiSelectCombobox } from '@/shared/components/ui/multi-select-combobox'
import type { DocumentTemplate } from '@/shared/types/document-template'
import type { EditorNode } from '../utils/wbs-template-editor-utils'

interface DocumentTemplateLinkDialogProps {
  /** 紐づけ対象のノード。nullでダイアログを閉じる */
  node: EditorNode | null
  documentTemplates: DocumentTemplate[]
  onClose: () => void
  onSave: (nodeId: string, documentTemplateIds: string[]) => void
}

/**
 * WBSテンプレートの工程・タスクノードへドキュメントテンプレートを紐づけるダイアログ
 * 。`WbsTemplatesPage`から起動する。
 * 削除済みドキュメントテンプレートへの参照（dangling id）は選択肢に現れず、
 * 保存時に自動的に除去される（弱参照の掃除）。
 */
export function DocumentTemplateLinkDialog({
  node,
  documentTemplates,
  onClose,
  onSave,
}: DocumentTemplateLinkDialogProps) {
  const knownIds = useMemo(
    () => new Set(documentTemplates.map((t) => t.id)),
    [documentTemplates],
  )

  const [values, setValues] = useState<string[]>([])

  useEffect(() => {
    // 存在しないid（削除済みテンプレートへの参照）は編集開始時点で除外する
    setValues(
      node ? node.documentTemplateIds.filter((id) => knownIds.has(id)) : [],
    )
  }, [node, knownIds])

  const options = useMemo(
    () =>
      documentTemplates.map((t) => ({
        value: t.id,
        label: t.phase ? `【${t.phase}】${t.name}` : t.name,
      })),
    [documentTemplates],
  )

  return (
    <Dialog open={!!node} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>ドキュメントテンプレートの紐づけ</DialogTitle>
          <DialogDescription>
            「{node?.name}
            」で作成するドキュメントのテンプレートを選択します。テンプレートの内容は「ドキュメントテンプレート」管理画面（システム設定メニュー）で編集できます。
          </DialogDescription>
        </DialogHeader>
        {documentTemplates.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            ドキュメントテンプレートが登録されていません。先にドキュメントテンプレート管理画面で作成してください。
          </p>
        ) : (
          <MultiSelectCombobox
            values={values}
            onValuesChange={setValues}
            options={options}
            placeholder="ドキュメントテンプレートを選択..."
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            onClick={() => {
              if (node) onSave(node.id, values)
              onClose()
            }}
            disabled={!node}
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
