import { EyeOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card, CardContent } from '@/shared/components/ui/card'
import { useCanViewFinancials } from '@/shared/hooks/use-financial-visibility'

/**
 * 金額専用ページ（/budget・/statements等）のページ単位ガード。
 * 金額情報の閲覧可否（`useCanViewFinancials`）がfalseの場合、ページ本体を
 * 描画せず案内カードへ差し替える（フェイルクローズ）。
 * リダイレクトではなく差し替えにするのは、localモードの表示トグルでは
 * 「隠している」状態が明示的に見えるほうが誤解を生まないため。
 */
export function FinancialAccessGuard({ children }: { children: ReactNode }) {
  const canViewFinancials = useCanViewFinancials()

  if (canViewFinancials) {
    return <>{children}</>
  }

  return (
    <Card>
      <CardContent>
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <EyeOff className="h-8 w-8" />
          <p className="text-sm font-medium">
            金額情報は非表示に設定されています
          </p>
          <p className="text-xs">
            このページは予算・単価などの金額情報を含むため表示できません。閲覧には金額情報の表示権限（financials:read）が必要です。
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
