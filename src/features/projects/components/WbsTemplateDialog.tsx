import { LayoutTemplate } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import type { WbsTemplate } from '@/shared/types/wbs-template'
import { useWbsTemplateStore } from '@/stores'
import { countTemplateNodes } from '../utils/wbs-template-editor-utils'

interface WbsTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply: (template: WbsTemplate) => void
}

/**
 * ストックしたWBSテンプレートから選択して適用する専用ダイアログ（選択・適用のみ）。
 * テンプレートの新規作成・編集は「システム設定 → WBSテンプレート」（`WbsTemplatesPage`、
 * `/wbs-templates`）へ集約したため、本ダイアログにはツリー編集UIを持たせない
 * （2026-08-13の依頼により、ダイアログ内蔵の簡易エディタから画面遷移方式へ変更）。
 */
export function WbsTemplateDialog({
  open,
  onOpenChange,
  onApply,
}: WbsTemplateDialogProps) {
  const navigate = useNavigate()
  const wbsTemplates = useWbsTemplateStore((s) => s.wbsTemplates)

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  )

  useEffect(() => {
    if (open) setSelectedTemplateId(null)
  }, [open])

  const handleApplyClick = () => {
    const template = wbsTemplates.find((t) => t.id === selectedTemplateId)
    if (!template) return
    onApply(template)
  }

  const handleManageClick = () => {
    onOpenChange(false)
    navigate('/wbs-templates')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>WBSテンプレートを適用</DialogTitle>
          <DialogDescription>
            テンプレートを選択して適用します。テンプレートの作成・編集は「システム設定
            → WBSテンプレート」から行えます。
          </DialogDescription>
        </DialogHeader>

        {wbsTemplates.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            ストックされたテンプレートがありません。「システム設定 →
            WBSテンプレート」から作成してください。
          </p>
        ) : (
          <div className="space-y-1">
            {wbsTemplates.map((template) => (
              // biome-ignore lint/a11y/useSemanticElements: 内部には持たないが、一覧の統一感のため他ダイアログと同じ選択行パターンを踏襲
              <div
                key={template.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedTemplateId(template.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedTemplateId(template.id)
                  }
                }}
                className={`flex w-full cursor-pointer items-center justify-between rounded-md border p-3 text-left transition-colors ${
                  selectedTemplateId === template.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-accent'
                }`}
              >
                <div>
                  <p className="text-sm font-medium">{template.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {countTemplateNodes(template.nodes)}タスク
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="ghost" onClick={handleManageClick}>
            <LayoutTemplate className="h-4 w-4" />
            テンプレートを管理
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button disabled={!selectedTemplateId} onClick={handleApplyClick}>
              適用
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
