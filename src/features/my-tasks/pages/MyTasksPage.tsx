import { ExternalLink } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { getFiscalYearMonthKeys } from '@/shared/utils/budget-utils'
import { buildMyTaskRows } from '@/shared/utils/my-task-utils'
import {
  useAppStore,
  useAssignmentStore,
  useAuthStore,
  useProjectsStore,
  useScheduleStore,
} from '@/stores'

/**
 * 自分の担当タスク。postgresモード専用。
 *
 * 本ツールは全画面が組織・案件の視点で作られており、担当者個人が「自分は何を
 * いつまでにやるのか」を見る場所が無かった（partner・viewerには特に使い道が
 * 無い状態だった）。ここは**金額を一切表示しない**ため、協力会社の担当者にも開ける。
 */
export function MyTasksPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const fiscalYear = useAppStore((s) => s.fiscalYear)
  const projects = useProjectsStore((s) => s.projects)
  const loadProjects = useProjectsStore((s) => s.loadProjects)
  const assignments = useAssignmentStore((s) => s.assignments)
  const loadAssignments = useAssignmentStore((s) => s.loadAssignments)
  const scheduleEntries = useScheduleStore((s) => s.entries)
  const loadSchedule = useScheduleStore((s) => s.loadSchedule)

  useEffect(() => {
    loadProjects()
    loadAssignments()
    loadSchedule()
  }, [loadProjects, loadAssignments, loadSchedule])

  const memberId = currentUser?.memberId ?? null

  const rows = useMemo(
    () =>
      buildMyTaskRows({
        memberId,
        projects,
        assignments,
        scheduleEntries,
        monthKeys: getFiscalYearMonthKeys(fiscalYear),
      }),
    [memberId, projects, assignments, scheduleEntries, fiscalYear],
  )

  if (!memberId) {
    return (
      <div className="space-y-4">
        <h1 className="font-bold text-2xl">自分の担当</h1>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            <p>
              ログインユーザーに担当者が紐づいていないため、担当タスクを表示できません。
            </p>
            <p className="mt-1">
              管理者にユーザー管理画面での担当者の紐づけを依頼してください
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const remaining = rows.filter((r) => !r.completed)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-bold text-2xl">自分の担当</h1>
        <p className="text-muted-foreground text-sm">
          {fiscalYear}年度に配分のあるタスクを期日の近い順に表示します（未完了{' '}
          {remaining.length}件 / 全{rows.length}件）
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">担当タスク</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              今年度に配分されたタスクはありません
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground text-xs">
                    <th className="py-2 pr-3 font-medium">期日</th>
                    <th className="py-2 pr-3 font-medium">プロジェクト</th>
                    <th className="py-2 pr-3 font-medium">タスク</th>
                    <th className="py-2 pr-3 text-right font-medium">
                      配分（人月）
                    </th>
                    <th className="py-2 font-medium">状態</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.taskId}
                      className={
                        row.completed ? 'border-b opacity-60' : 'border-b'
                      }
                    >
                      <td className="whitespace-nowrap py-2 pr-3 text-xs tabular-nums">
                        {row.dueDate ?? (
                          <span className="text-muted-foreground">未設定</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {row.projectId ? (
                          // 詳細はWBS画面で確認する（ここは一覧に徹する）
                          <Link
                            to={`/wbs?projectId=${row.projectId}`}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            {row.projectName}
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : (
                          row.projectName
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="text-xs">{row.taskName}</div>
                        <div className="text-muted-foreground text-xs">
                          {row.taskCode}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right text-xs tabular-nums">
                        {row.allocation.toFixed(2)}
                      </td>
                      <td className="py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                            row.completed
                              ? 'bg-muted text-muted-foreground'
                              : 'bg-accent text-accent-foreground'
                          }`}
                        >
                          {row.completed ? '完了' : '進行中'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
