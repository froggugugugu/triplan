import { Database, Download, Trash2, Upload } from 'lucide-react'
import { useCallback, useState } from 'react'
import { jsonStorage } from '@/infrastructure/storage'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { useToast } from '@/shared/hooks/use-toast'
import {
  /**
   * DataExportは`features/reports`から`shared/components`へ移設した。
   * 管理画面（features/admin）の「データ管理」から使うため。
   * features間の直接importは依存方向ルールで禁止されており、
   * 本コンポーネントはshared/infrastructureにしか依存していないので共有層へ置ける。
   */
  clearAllBusinessData,
  loadDemoData,
  useAppStore,
  useMembersStore,
  useProjectsStore,
  useTeamStore,
} from '@/stores'

export function DataExport() {
  const { toast } = useToast()
  const fiscalYear = useAppStore((state) => state.fiscalYear)

  const loadProjects = useProjectsStore((state) => state.loadProjects)
  const loadMembers = useMembersStore((state) => state.loadMembers)
  const loadTeam = useTeamStore((state) => state.loadTeam)

  const [demoDialogOpen, setDemoDialogOpen] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)

  const handleJSONExport = useCallback(() => {
    const json = jsonStorage.export()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `resource-manager-${fiscalYear}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast({ title: 'JSONをエクスポートしました' })
  }, [fiscalYear, toast])

  const handleJSONImport = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string
          jsonStorage.import(content)
          loadProjects()
          loadMembers()
          loadTeam()
          toast({ title: 'データをインポートしました' })
        } catch {
          toast({
            title: 'インポートエラー',
            description: '無効なファイル形式です',
            variant: 'destructive',
          })
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }, [loadProjects, loadMembers, loadTeam, toast])

  const handleLoadDemoData = useCallback(() => {
    try {
      loadDemoData(fiscalYear)
      toast({ title: 'デモデータを投入しました' })
    } catch (error) {
      toast({
        title: 'デモデータ投入エラー',
        description:
          error instanceof Error ? error.message : '不明なエラーが発生しました',
        variant: 'destructive',
      })
    }
    setDemoDialogOpen(false)
  }, [fiscalYear, toast])

  const handleClearAllData = useCallback(() => {
    try {
      clearAllBusinessData()
      toast({ title: '全データをクリアしました' })
    } catch (error) {
      toast({
        title: 'データクリアエラー',
        description:
          error instanceof Error ? error.message : '不明なエラーが発生しました',
        variant: 'destructive',
      })
    }
    setClearDialogOpen(false)
  }, [toast])

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Button onClick={handleJSONExport} variant="outline">
          <Download className="h-4 w-4" />
          JSONエクスポート
        </Button>
        <Button onClick={handleJSONImport} variant="outline">
          <Upload className="h-4 w-4" />
          JSONインポート
        </Button>
        <Button onClick={() => setDemoDialogOpen(true)} variant="outline">
          <Database className="h-4 w-4" />
          デモデータ投入
        </Button>
        <Button onClick={() => setClearDialogOpen(true)} variant="destructive">
          <Trash2 className="h-4 w-4" />
          データ一括クリア
        </Button>
      </div>

      <Dialog open={demoDialogOpen} onOpenChange={setDemoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>デモデータを投入しますか？</DialogTitle>
            <DialogDescription>
              現在のデータを全て置き換えます。この操作は元に戻せません。
              チーム・メンバー・プロジェクト・WBS・スケジュール・アサイン・技術タグに加え、
              所属会社・部門予算・AI利用費・SaaS費用・人員計画・スキル評価・進捗率（EVM）の全データが上書きされます。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDemoDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleLoadDemoData}>投入する</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>全データを削除しますか？</DialogTitle>
            <DialogDescription>
              全データを削除します。スナップショットは保持されます。この操作は元に戻せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearDialogOpen(false)}>
              キャンセル
            </Button>
            <Button variant="destructive" onClick={handleClearAllData}>
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
