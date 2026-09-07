import { useEffect } from 'react'
import { DataExport } from '@/shared/components/DataExport'
import { SnapshotHistory } from '@/shared/components/SnapshotHistory'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import {
  useActualsStore,
  useAssignmentStore,
  useCompaniesStore,
  useMembersStore,
  useProjectsStore,
  useTeamStore,
} from '@/stores'
import { MasterCsvImportCard } from '../components/MasterCsvImportCard'

/**
 * データ管理（CSV一括登録は）。
 *
 * 従来は`/reports`でCSV帳票と並んでいたが、**全データの上書き・バックアップ**は
 * 帳票の出力とは性格が違う（誤操作の影響範囲が桁違いに大きい）。管理画面へ集約する。
 * 現行CSVからの移行（一括登録）も、初期セットアップの作業なのでここに置く。
 */
export function DataManagementPage() {
  const loadMembers = useMembersStore((s) => s.loadMembers)
  const loadProjects = useProjectsStore((s) => s.loadProjects)
  const loadAssignments = useAssignmentStore((s) => s.loadAssignments)
  const loadTeam = useTeamStore((s) => s.loadTeam)
  const loadCompanies = useCompaniesStore((s) => s.loadCompanies)
  const loadActualsData = useActualsStore((s) => s.loadActualsData)

  useEffect(() => {
    // CSV一括登録が既存との突合に使うデータを読み込む
    // （未ロードのまま突合すると「既存なし」と誤判定して重複を作る）
    loadMembers()
    loadProjects()
    loadAssignments()
    loadTeam()
    loadCompanies()
    loadActualsData()
  }, [
    loadMembers,
    loadProjects,
    loadAssignments,
    loadTeam,
    loadCompanies,
    loadActualsData,
  ])

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="font-bold text-2xl">データ管理</h1>
        <p className="text-muted-foreground text-sm">
          現行データの取り込みと、全データのバックアップ・復元です
        </p>
      </div>

      <MasterCsvImportCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">エクスポート / インポート</CardTitle>
          <CardDescription>
            全データをJSONで書き出し・読み込みします。インポートは既存データを
            置き換えるため、実行前にエクスポートで退避してください
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataExport />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">スナップショット</CardTitle>
          <CardDescription>
            任意の時点のデータを名前を付けて保存し、あとから戻せます（最大20件）
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SnapshotHistory />
        </CardContent>
      </Card>
    </div>
  )
}
