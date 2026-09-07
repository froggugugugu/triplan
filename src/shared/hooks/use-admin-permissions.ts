import { hasPermission, type Permission } from '@/shared/types/auth'
import { useAuthStore } from '@/stores'

/**
 * 管理画面の各機能を触れるかの判定。
 *
 * localモードは認証が無い単一ユーザー前提のため常に許可する
 * （`useCanViewFinancials`・`AdminLayout`と同じ整理）。
 * postgresモードは権限マトリクスに従い、**未ログインはフェイルクローズ**。
 */
export function useAdminPermission(permission: Permission): boolean {
  const currentUser = useAuthStore((s) => s.currentUser)
  const isPostgres =
    (import.meta.env.VITE_STORAGE_MODE ?? 'local') === 'postgres'

  // 判定は文字列比較だけなのでメモ化しない
  if (!isPostgres) return true
  if (!currentUser) return false
  return hasPermission(currentUser.role, permission)
}
