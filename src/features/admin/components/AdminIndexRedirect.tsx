import { Navigate } from 'react-router-dom'
import { useAdminPermission } from '@/shared/hooks/use-admin-permissions'

/**
 * `/admin` の着地先。
 *
 * 常に全社設定へ送ると、`settings:manage`を持たない利用者（editor等）は
 * 開いた瞬間に「権限がありません」を見ることになる。触れる項目のうち
 * 先頭へ送る。
 */
export function AdminIndexRedirect() {
  const canManageSettings = useAdminPermission('settings:manage')
  return (
    <Navigate
      to={canManageSettings ? '/admin/settings' : '/admin/companies'}
      replace
    />
  )
}
