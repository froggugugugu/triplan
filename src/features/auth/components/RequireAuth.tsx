import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import {
  hasPermission,
  type Permission,
  roleSatisfies,
  type UserRole,
} from '@/shared/types'
import { useAuthStore } from '@/stores'

interface RequireAuthProps {
  children: ReactNode
  /** 指定した場合、そのロール以上（roleSatisfies基準）でなければアクセスできない */
  requiredRole?: UserRole
  /**
   * 指定した場合、その権限（ROLE_PERMISSIONS基準）を持たなければアクセスできない
   * （ロール名の直接比較よりこちらを優先して使う）
   */
  requiredPermission?: Permission
}

/**
 * postgresモードのみ認証（任意でロール）を要求するルートガード。
 *
 * 重要: localStorageモード（既定、VITE_STORAGE_MODE未設定を含む）では
 * requiredRoleの指定に関わらず何もせずchildrenをそのまま描画する（システムの基本機能を
 * 崩さない、という明示的な制約。認証UIの存在自体がlocalモードの挙動に一切影響してはならない）。
 */
export function RequireAuth({
  children,
  requiredRole,
  requiredPermission,
}: RequireAuthProps) {
  const mode = import.meta.env.VITE_STORAGE_MODE ?? 'local'
  const status = useAuthStore((s) => s.status)
  const currentUser = useAuthStore((s) => s.currentUser)
  const restoreSession = useAuthStore((s) => s.restoreSession)

  useEffect(() => {
    if (mode === 'postgres' && status === 'idle') {
      restoreSession()
    }
  }, [mode, status, restoreSession])

  if (mode !== 'postgres') {
    return <>{children}</>
  }

  if (status === 'idle' || status === 'authenticating') {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        読み込み中...
      </div>
    )
  }

  if (status !== 'authenticated' || !currentUser) {
    return <Navigate to="/login" replace />
  }

  if (requiredRole && !roleSatisfies(currentUser.role, requiredRole)) {
    return <Navigate to="/dashboard" replace />
  }

  if (
    requiredPermission &&
    !hasPermission(currentUser.role, requiredPermission)
  ) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
