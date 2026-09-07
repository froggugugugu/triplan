import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import {
  type AiUsageProviderFormValues,
  aiUsageProviderFormSchema,
} from '@/infrastructure/validation/schemas'
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
import { useToast } from '@/shared/hooks/use-toast'
import type { AiUsageProvider } from '@/shared/types/budget'
import { useBudgetStore } from '@/stores'

interface AiUsageProviderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  divisionId: string
  provider?: AiUsageProvider | null
}

/**
 * AI利用費プロバイダ（Anthropic/OpenAI/Microsoft等）の追加・編集ダイアログ。
 * 金額項目を持たないため、SaasContractDialogより簡素な名前・プランのみの2項目フォーム。
 */
export function AiUsageProviderDialog({
  open,
  onOpenChange,
  divisionId,
  provider,
}: AiUsageProviderDialogProps) {
  const { toast } = useToast()
  const addAiUsageProvider = useBudgetStore((s) => s.addAiUsageProvider)
  const updateAiUsageProvider = useBudgetStore((s) => s.updateAiUsageProvider)

  const isEditing = !!provider

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AiUsageProviderFormValues>({
    resolver: zodResolver(aiUsageProviderFormSchema),
    defaultValues: { name: '', plan: null },
  })

  useEffect(() => {
    if (open) {
      reset({ name: provider?.name ?? '', plan: provider?.plan ?? null })
    }
  }, [open, provider, reset])

  const onSubmit = (data: AiUsageProviderFormValues) => {
    if (isEditing && provider) {
      updateAiUsageProvider(provider.id, data.name, data.plan ?? null)
      toast({ title: 'プロバイダを更新しました' })
    } else {
      addAiUsageProvider(divisionId, data.name, data.plan ?? null)
      toast({ title: 'プロバイダを追加しました' })
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'プロバイダを編集' : 'AIプロバイダを追加'}
          </DialogTitle>
          <DialogDescription>
            契約しているAIプロバイダ（Anthropic・OpenAI・Microsoft等）とグレード・プランを登録します。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ai-usage-provider-name">プロバイダ名</Label>
            <Input
              id="ai-usage-provider-name"
              {...register('name')}
              placeholder="例: Anthropic"
              autoFocus
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-usage-provider-plan">
              グレード・プラン（任意）
            </Label>
            <Input
              id="ai-usage-provider-plan"
              {...register('plan')}
              placeholder="例: Team, Enterprise"
            />
            {errors.plan && (
              <p className="text-sm text-destructive">{errors.plan.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button type="submit">{isEditing ? '更新' : '追加'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
