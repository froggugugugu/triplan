import { hasPermission } from '@/shared/types'
import { useAppStore } from '@/stores/app-store'
import { useAuthStore } from '@/stores/auth-store'

/**
 * 金額情報（予算・単価・受注額・EVM金額等）を現在のユーザーに表示してよいかを返す
 * （非公開の設計文書）。
 *
 * - postgresモード: ログインユーザーのロールが`financials:read`権限を持つか
 *   （partnerロール=協力会社等はfalse）。未ログインはフェイルクローズでfalse
 * - localモード: `app-store.showFinancials`（画面共有・協力会社同席レビュー等を想定した
 *   表示トグル、既定true）【仮定】。認証が存在しないため権限ではなく利便機能として
 *   同一のマスキング機構を制御する
 *
 * 注意: これはUI表示の制御であり、認可の実体はサーバー側
 * （`server/src/auth/rbac.ts`のreadGuard/redactRow）が担う（多層防御）。
 */
export function useCanViewFinancials(): boolean {
  const showFinancials = useAppStore((s) => s.showFinancials)
  const currentUser = useAuthStore((s) => s.currentUser)
  const mode = import.meta.env.VITE_STORAGE_MODE ?? 'local'

  if (mode === 'postgres') {
    return currentUser
      ? hasPermission(currentUser.role, 'financials:read')
      : false
  }
  return showFinancials
}
