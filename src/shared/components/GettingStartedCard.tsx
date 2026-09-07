import { Rocket, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent } from '@/shared/components/ui/card'
import {
  useAppStore,
  useMembersStore,
  useProjectsStore,
  useTeamStore,
} from '@/stores'

/**
 * ダッシュボード最上部の「はじめに」カード。
 * - 業務データが空のとき: 初期設定ウィザードへの導線（迷わない最初の一歩）
 * - デモ試用中（demoDataActive）: 試用中バッジと本番切り替えの導線
 * - 「閉じる」で永続的に非表示（setupCardDismissed）。以降はシステム設定ポップオーバーの
 *   「初期設定ウィザード」から同じ動線に入れる
 *
 * 自動でモーダルを開かない設計: 空データ判定での自動モーダルは、シードなしで起動する
 * 既存E2E・「一度閉じたのに毎回出る」問題の温床になるため、カード＋明示起動に限定した
 * （非公開の設計文書の方針を踏襲）。
 */
export function GettingStartedCard() {
  const setupCardDismissed = useAppStore((s) => s.setupCardDismissed)
  const dismissSetupCard = useAppStore((s) => s.dismissSetupCard)
  const demoDataActive = useAppStore((s) => s.demoDataActive)
  const openSetupWizard = useAppStore((s) => s.openSetupWizard)

  const projects = useProjectsStore((s) => s.projects)
  const members = useMembersStore((s) => s.members)
  const divisions = useTeamStore((s) => s.divisions)
  const isEmpty =
    projects.length === 0 && members.length === 0 && divisions.length === 0

  if (setupCardDismissed) return null
  if (!demoDataActive && !isEmpty) return null

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex items-center gap-4 py-4">
        <Rocket className="h-8 w-8 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          {demoDataActive ? (
            <>
              <p className="font-medium">デモデータで試用中です</p>
              <p className="text-sm text-muted-foreground">
                機能を一通り体験したら、デモデータを削除して本番データのセットアップに進めます
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">ようこそ！まずは初期設定から</p>
              <p className="text-sm text-muted-foreground">
                ウィザードに沿って、基本設定 → 組織 → 担当者 →
                プロジェクトの順にセットアップします（デモデータで試すこともできます）
              </p>
            </>
          )}
        </div>
        <Button
          onClick={() => openSetupWizard()}
          className="shrink-0"
          data-tour="setup-wizard-start"
        >
          {demoDataActive
            ? '本番データへ切り替える'
            : '初期設定ウィザードを開始'}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          title="このカードを閉じる（システム設定からいつでもウィザードを再開できます）"
          aria-label="はじめにカードを閉じる"
          onClick={dismissSetupCard}
        >
          <X className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  )
}
