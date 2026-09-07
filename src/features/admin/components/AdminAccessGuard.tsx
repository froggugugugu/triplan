import { ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { useAdminPermission } from '@/shared/hooks/use-admin-permissions'
import type { Permission } from '@/shared/types/auth'

/**
 * 管理画面の権限ガード（`FinancialAccessGuard`と同型）。
 *
 * 左ペインのメニューを隠すだけでは**URL直打ちで開けてしまう**ため、
 * ページ側でも同じ権限を確認する。権限が無ければ中身を一切描画しない
 * （フェイルクローズ）。認可の実体はサーバー側にあり、これは誤操作と
 * 「触れると思わせる画面」を防ぐための多層防御。
 */
export function AdminAccessGuard({
  permission,
  children,
}: {
  permission: Permission
  children: ReactNode
}) {
  const allowed = useAdminPermission(permission)
  if (allowed) return <>{children}</>

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          この機能を利用する権限がありません
        </CardTitle>
        <CardDescription>
          必要な権限が付与されていません。管理者にお問い合わせください。
        </CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  )
}
