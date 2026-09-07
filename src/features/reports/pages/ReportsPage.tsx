import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { useCanViewFinancials } from '@/shared/hooks/use-financial-visibility'
import {
  useAssignmentStore,
  useBudgetStore,
  useEffortsStore,
  useMembersStore,
  useProjectsStore,
  useTeamStore,
  useWbsSettingsStore,
} from '@/stores'
import { CsvReportExport } from '../components/CsvReportExport'

export function ReportsPage() {
  const canViewFinancials = useCanViewFinancials()
  const loadProjects = useProjectsStore((state) => state.loadProjects)
  const loadMembers = useMembersStore((state) => state.loadMembers)
  const loadAssignments = useAssignmentStore((s) => s.loadAssignments)
  const loadEfforts = useEffortsStore((s) => s.loadEfforts)
  const loadBudgetData = useBudgetStore((s) => s.loadBudgetData)
  const loadTeam = useTeamStore((s) => s.loadTeam)
  const loadWbsSettings = useWbsSettingsStore((s) => s.loadWbsSettings)

  useEffect(() => {
    loadProjects()
    loadMembers()
    // CSVレポート出力（案件別収支・要員別稼働・部門予算予実）が参照するデータを読み込む
    loadAssignments()
    loadEfforts()
    loadBudgetData()
    loadTeam()
    loadWbsSettings()
  }, [
    loadProjects,
    loadMembers,
    loadAssignments,
    loadEfforts,
    loadBudgetData,
    loadTeam,
    loadWbsSettings,
  ])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">レポート</h1>
      </div>

      {/* CSV3帳票（案件別収支・要員別稼働・部門予算予実）はいずれも金額を含むため、
          金額の可視性がない場合はセクションごと非表示 */}
      {canViewFinancials && (
        <Card>
          <CardHeader>
            <CardTitle>レポート出力（CSV）</CardTitle>
          </CardHeader>
          <CardContent>
            <CsvReportExport />
          </CardContent>
        </Card>
      )}

      {/* JSONエクスポート/インポート・スナップショットは管理画面へ移設した。
          全社のデータを丸ごと入れ替える操作であり、日常のレポート出力とは重みが違うため */}
      <Card>
        <CardHeader>
          <CardTitle>データ管理</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            JSONのエクスポート/インポートとスナップショットは
            <Link
              to="/admin/data"
              className="mx-1 font-medium text-primary underline underline-offset-2"
            >
              管理画面のデータ管理
            </Link>
            へ移動しました。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
