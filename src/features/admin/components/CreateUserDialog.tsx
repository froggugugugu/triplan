import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback } from 'react'
import { useForm } from 'react-hook-form'
import {
  type CreateUserFormValues,
  createUserFormSchema,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'

const ROLE_OPTIONS: {
  value: 'admin' | 'manager' | 'editor' | 'viewer' | 'partner'
  label: string
}[] = [
  { value: 'admin', label: 'admin（全権限・ユーザー管理）' },
  { value: 'manager', label: 'manager（承認・全社設定・読み書き）' },
  { value: 'editor', label: 'editor（業務データの読み書き）' },
  { value: 'viewer', label: 'viewer（読み取り専用）' },
  { value: 'partner', label: 'partner（読み取り専用・金額非表示）' },
]

interface CreateUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: CreateUserFormValues) => Promise<void>
}

export function CreateUserDialog({
  open,
  onOpenChange,
  onSubmit,
}: CreateUserDialogProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserFormSchema),
    defaultValues: { role: 'viewer' },
  })
  const role = watch('role')

  const handleFormSubmit = useCallback(
    async (values: CreateUserFormValues) => {
      await onSubmit(values)
      reset({ email: '', name: '', password: '', role: 'viewer' })
      onOpenChange(false)
    },
    [onSubmit, onOpenChange, reset],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ユーザーを追加</DialogTitle>
          <DialogDescription>
            メールアドレスと初期パスワードを設定します。招待メールは送信されないため、
            発行した認証情報は別途本人へ共有してください。
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="new-user-email">メールアドレス</Label>
            <Input id="new-user-email" type="email" {...register('email')} />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-user-name">氏名</Label>
            <Input id="new-user-name" {...register('name')} />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-user-password">初期パスワード</Label>
            <Input
              id="new-user-password"
              type="password"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-sm text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>ロール</Label>
            <Select
              value={role}
              onValueChange={(v) =>
                setValue('role', v as CreateUserFormValues['role'])
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="ロールを選択" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.role && (
              <p className="text-sm text-destructive">{errors.role.message}</p>
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? '作成中...' : '作成する'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
