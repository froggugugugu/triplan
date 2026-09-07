import { Download, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table'
import { useToast } from '@/shared/hooks/use-toast'
import { getFiscalYearMonthKeys } from '@/shared/utils/budget-utils'
import {
  applyAssignmentImport,
  applyMemberImport,
  applyProjectImport,
  type MasterImportDeps,
} from '@/shared/utils/master-import-apply'
import { buildAssignmentImportPlan } from '@/shared/utils/master-import-assignments'
import {
  buildTemplateCsv,
  COLUMN_SPECS,
  KIND_LABELS,
  type MasterImportKind,
  templateFileName,
} from '@/shared/utils/master-import-core'
import { buildMemberImportPlan } from '@/shared/utils/master-import-members'
import {
  buildAssignmentPreview,
  buildMemberPreview,
  buildProjectPreview,
} from '@/shared/utils/master-import-preview'
import { buildProjectImportPlan } from '@/shared/utils/master-import-projects'
import {
  useActualsStore,
  useAppStore,
  useAssignmentStore,
  useCompaniesStore,
  useMembersStore,
  useProjectsStore,
  useTeamStore,
} from '@/stores'
import {
  MasterCsvImportDialog,
  type MasterImportPreview,
} from './MasterCsvImportDialog'

/**
 * マスタCSV一括登録。
 *
 * 現行CSVで管理しているデータの移行が目的。3種（メンバー／プロジェクト／アサイン）を
 * 同じ形の「列の一覧 → テンプレートDL → 取込」で並べる。
 * 列の一覧は`COLUMN_SPECS`を読むだけなので、テンプレートと必ず一致する。
 */

const DESCRIPTIONS: Record<MasterImportKind, string> = {
  members:
    '氏名だけでも登録できます。部門・課・所属会社は未登録なら作成できます',
  projects:
    '階層は「親コード」で表します。行の順序は問いません（子が先でも解決します）',
  assignments:
    '月を列にした横持ちで記入します（1行＝1人×1タスク）。取り込むのは計画で、実績は月次実績画面から取り込みます',
}

export function MasterCsvImportCard() {
  const { toast } = useToast()
  const [openKind, setOpenKind] = useState<MasterImportKind | null>(null)

  const fiscalYear = useAppStore((s) => s.fiscalYear)
  const fiscalYearStartMonth = useAppStore((s) => s.fiscalYearStartMonth)

  const members = useMembersStore((s) => s.members)
  const addMember = useMembersStore((s) => s.addMember)
  const projects = useProjectsStore((s) => s.projects)
  const addProject = useProjectsStore((s) => s.addProject)
  const assignments = useAssignmentStore((s) => s.assignments)
  const upsertAssignment = useAssignmentStore((s) => s.upsertAssignment)
  const divisions = useTeamStore((s) => s.divisions)
  const sections = useTeamStore((s) => s.sections)
  const addDivision = useTeamStore((s) => s.addDivision)
  const addSection = useTeamStore((s) => s.addSection)
  const companies = useCompaniesStore((s) => s.companies)
  const addCompany = useCompaniesStore((s) => s.addCompany)
  const isMonthClosed = useActualsStore((s) => s.isMonthClosed)
  // 締め状態の変化で再レンダーさせるために購読する（値そのものは下で使わない）
  useActualsStore((s) => s.monthlyCloseEvents)

  const monthKeys = useMemo(
    () => getFiscalYearMonthKeys(fiscalYear, fiscalYearStartMonth),
    [fiscalYear, fiscalYearStartMonth],
  )

  // 締め済み月へは配分を書き込めない（P1-b）。ドライランの時点で落として見せる。
  // 12ヶ月ぶんの判定なのでメモ化しない（isMonthClosedはストア由来で参照が変わらず、
  // monthlyCloseEventsを依存に足す形にするとBiomeが「不要な依存」と誤検知する）
  const closedMonths = new Set(monthKeys.filter((m) => isMonthClosed(m)))

  const deps: MasterImportDeps = {
    addDivision,
    addSection,
    addCompany: (name) => addCompany(name),
    addMember,
    addProject,
    upsertAssignment,
  }

  const memberCtx = (autoCreateMasters: boolean) => ({
    members,
    divisions,
    sections,
    companies,
    autoCreateMasters,
    // 単価の適用開始が書かれていないときは年度の最初の月から適用する
    fallbackEffectiveFrom: monthKeys[0] ?? `${fiscalYear}-04`,
  })

  const handleDownloadTemplate = (kind: MasterImportKind) => {
    const csv = buildTemplateCsv(
      kind,
      kind === 'assignments' ? { monthColumns: monthKeys } : undefined,
    )
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = templateFileName(kind)
    a.click()
    URL.revokeObjectURL(url)
  }

  const dryRun = (
    kind: MasterImportKind,
    rows: string[][],
    autoCreateMasters: boolean,
  ): MasterImportPreview => {
    if (kind === 'members') {
      const plan = buildMemberImportPlan(rows, memberCtx(autoCreateMasters))
      return {
        candidateCount: plan.candidates.length,
        skips: plan.skips,
        newMasters: [
          ...plan.newDivisions.map((n) => `部門: ${n}`),
          ...plan.newSections.map((s) => `課: ${s.divisionName} / ${s.name}`),
          ...plan.newCompanies.map((n) => `所属会社: ${n}`),
        ],
        notes: [],
        table: buildMemberPreview(plan, { divisions, sections, companies }),
      }
    }
    if (kind === 'projects') {
      const plan = buildProjectImportPlan(rows, {
        projects,
        divisions,
        autoCreateMasters,
      })
      const rootCount = plan.candidates.filter((c) => c.level === 0).length
      return {
        candidateCount: plan.candidates.length,
        skips: plan.skips,
        newMasters: plan.newDivisions.map((n) => `部門: ${n}`),
        notes:
          plan.candidates.length > 0
            ? [
                `プロジェクト ${rootCount} 件・タスク ${plan.candidates.length - rootCount} 件`,
              ]
            : [],
        table: buildProjectPreview(plan, { divisions }),
      }
    }
    const plan = buildAssignmentImportPlan(rows, {
      projects,
      members,
      assignments,
      closedMonths,
    })
    const notes: string[] = []
    if (plan.targetMonths.length > 0) {
      notes.push(
        `対象月: ${plan.targetMonths[0]} 〜 ${plan.targetMonths[plan.targetMonths.length - 1]}（配分の合計 ${plan.totalValue.toFixed(2)} 人月）`,
      )
    }
    if (plan.closedMonthsSkipped.length > 0) {
      notes.push(
        `締め済みのため取り込まない月: ${plan.closedMonthsSkipped.join('、')}`,
      )
    }
    return {
      candidateCount: plan.candidates.length,
      skips: plan.skips,
      newMasters: [],
      notes,
      table: buildAssignmentPreview(plan),
    }
  }

  const apply = (
    kind: MasterImportKind,
    rows: string[][],
    autoCreateMasters: boolean,
  ) => {
    if (kind === 'members') {
      const plan = buildMemberImportPlan(rows, memberCtx(autoCreateMasters))
      const result = applyMemberImport(plan, deps)
      toast({
        title: `${result.createdCount}件のメンバーを登録しました`,
        description: describeCreatedMasters(result),
      })
      return
    }
    if (kind === 'projects') {
      const plan = buildProjectImportPlan(rows, {
        projects,
        divisions,
        autoCreateMasters,
      })
      const result = applyProjectImport(plan, deps)
      toast({
        title: `${result.createdCount}件のプロジェクト・タスクを登録しました`,
        description: describeCreatedMasters(result),
      })
      return
    }
    const plan = buildAssignmentImportPlan(rows, {
      projects,
      members,
      assignments,
      closedMonths,
    })
    const result = applyAssignmentImport(plan, deps)
    toast({ title: `${result.createdCount}件のアサインを登録しました` })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>CSV一括登録</CardTitle>
        <CardDescription>
          現行のCSVからメンバー・プロジェクト・アサインをまとめて登録します。
          既に登録されているデータは変更しません（重複した行は取り込まずに理由を表示します）
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {(['members', 'projects', 'assignments'] as const).map((kind) => (
          <section key={kind} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-medium text-sm">{KIND_LABELS[kind]}</h3>
                <p className="text-muted-foreground text-xs">
                  {DESCRIPTIONS[kind]}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => handleDownloadTemplate(kind)}
                >
                  <Download className="h-4 w-4" />
                  テンプレート
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setOpenKind(kind)}
                >
                  <Upload className="h-4 w-4" />
                  CSVを取り込む
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">列</TableHead>
                    <TableHead className="w-20">必須/任意</TableHead>
                    <TableHead>説明</TableHead>
                    <TableHead className="w-44">例</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {COLUMN_SPECS[kind].map((spec) => (
                    <TableRow key={spec.key}>
                      <TableCell className="font-medium">{spec.key}</TableCell>
                      <TableCell>
                        {spec.required ? (
                          <Badge variant="destructive">必須</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            任意
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {spec.description}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {spec.example}
                      </TableCell>
                    </TableRow>
                  ))}
                  {kind === 'assignments' && (
                    <TableRow>
                      <TableCell className="font-medium">
                        {monthKeys[0] ?? 'YYYY-MM'} …
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive">必須</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        月ごとの配分（0〜1）。必要な月の列だけでよく、順序も問いません。
                        空欄は配分なし
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        0.5
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        ))}

        <p className="text-muted-foreground text-xs">
          テンプレートはUTF-8（BOM付き）なので、そのままExcelで開けます。
          必須の列名には <span className="font-medium">*</span>{' '}
          が付いていますが、付けたまま取り込めます。
        </p>
      </CardContent>

      {openKind && (
        <MasterCsvImportDialog
          kind={openKind}
          open
          onOpenChange={(next) => {
            if (!next) setOpenKind(null)
          }}
          supportsAutoCreate={openKind !== 'assignments'}
          onDryRun={(rows, autoCreateMasters) =>
            dryRun(openKind, rows, autoCreateMasters)
          }
          onApply={(rows, autoCreateMasters) =>
            apply(openKind, rows, autoCreateMasters)
          }
        />
      )}
    </Card>
  )
}

function describeCreatedMasters(result: {
  createdDivisions: number
  createdSections: number
  createdCompanies: number
}): string | undefined {
  const parts: string[] = []
  if (result.createdDivisions > 0) parts.push(`部門 ${result.createdDivisions}`)
  if (result.createdSections > 0) parts.push(`課 ${result.createdSections}`)
  if (result.createdCompanies > 0)
    parts.push(`所属会社 ${result.createdCompanies}`)
  return parts.length > 0 ? `あわせて作成: ${parts.join('・')}` : undefined
}
