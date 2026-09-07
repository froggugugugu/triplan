import { FileSpreadsheet } from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { CsvMappingExportDialog } from '@/shared/components/CsvMappingExportDialog'
import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { Label } from '@/shared/components/ui/label'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/ui/tabs'
import { useToast } from '@/shared/hooks/use-toast'
import {
  getFiscalYearMonthKeys,
  manYenFormatter,
} from '@/shared/utils/budget-utils'
import { CSV_BOM, toCsvContent } from '@/shared/utils/csv-utils'
import { SETTLEMENT_KIND_LABELS } from '@/shared/utils/settlement-utils'
import {
  buildClientStatementCsvRows,
  buildClientStatementLines,
  buildClientStatementRecords,
  buildPartnerPaymentCsvRows,
  buildPartnerPaymentLines,
  buildPartnerPaymentRecords,
  CLIENT_STATEMENT_SOURCE,
  PARTNER_PAYMENT_SOURCE,
  type StatementLine,
  sumStatementAmount,
  sumStatementRatio,
} from '@/shared/utils/statement-utils'
import {
  useAppStore,
  useAssignmentStore,
  useBudgetStore,
  useCompaniesStore,
  useMembersStore,
  useProjectsStore,
} from '@/stores'

function getCurrentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** 指定キーでグルーピングする（挿入順を保つ） */
function groupBy(
  lines: StatementLine[],
  keyOf: (line: StatementLine) => string,
): Map<string, StatementLine[]> {
  const groups = new Map<string, StatementLine[]>()
  for (const line of lines) {
    const key = keyOf(line)
    const list = groups.get(key) ?? []
    list.push(line)
    groups.set(key, list)
  }
  return groups
}

/**
 * 月次明細ページ（/statements）。単価の二重管理を2方向の帳票に写す:
 * - 協力会社への支払（会社→人→案件PJコード、契約単価ベース）＝協力会社とのやり取り用
 * - 発注元向け明細（案件→会社→人、見積単価ベース）＝発注元とのやり取り用
 * どちらも対象月セレクタ・計画/実績トグル・CSV出力を持つ。
 */
export function StatementsPage() {
  const { toast } = useToast()
  const fiscalYear = useAppStore((s) => s.fiscalYear)
  const fiscalYearStartMonth = useAppStore((s) => s.fiscalYearStartMonth)
  const members = useMembersStore((s) => s.members)
  const loadMembers = useMembersStore((s) => s.loadMembers)
  const companies = useCompaniesStore((s) => s.companies)
  const loadCompanies = useCompaniesStore((s) => s.loadCompanies)
  const projects = useProjectsStore((s) => s.projects)
  const loadProjects = useProjectsStore((s) => s.loadProjects)
  const assignments = useAssignmentStore((s) => s.assignments)
  const loadAssignments = useAssignmentStore((s) => s.loadAssignments)

  useEffect(() => {
    loadMembers()
    loadCompanies()
    loadProjects()
    loadAssignments()
  }, [loadMembers, loadCompanies, loadProjects, loadAssignments])

  const monthKeys = useMemo(
    () => getFiscalYearMonthKeys(fiscalYear, fiscalYearStartMonth),
    [fiscalYear, fiscalYearStartMonth],
  )
  const [month, setMonth] = useState(() => {
    const current = getCurrentMonthKey()
    return current
  })
  // 年度切替などで選択月が年度外になった場合は年度先頭月へ寄せる
  const effectiveMonth = monthKeys.includes(month)
    ? month
    : (monthKeys[0] ?? month)

  const [useActual, setUseActual] = useState(false)
  const [customExportTab, setCustomExportTab] = useState<
    'partner' | 'client' | null
  >(null)

  const workdaysPerMonth = useBudgetStore((s) => s.workdaysPerMonth)
  const hoursPerDay = useBudgetStore((s) => s.hoursPerDay)

  const input = useMemo(
    () => ({
      month: effectiveMonth,
      members,
      companies,
      projects,
      assignments,
      useActual,
      // 準委任精算の時間換算
      workdaysPerMonth,
      hoursPerDay,
    }),
    [
      effectiveMonth,
      members,
      companies,
      projects,
      assignments,
      useActual,
      workdaysPerMonth,
      hoursPerDay,
    ],
  )

  const partnerLines = useMemo(() => buildPartnerPaymentLines(input), [input])
  const clientLines = useMemo(() => buildClientStatementLines(input), [input])

  const partnerByCompany = useMemo(
    () => groupBy(partnerLines, (line) => line.companyName),
    [partnerLines],
  )
  const clientByProject = useMemo(
    () => groupBy(clientLines, (line) => line.projectId),
    [clientLines],
  )

  const downloadCsv = useCallback(
    (filename: string, rows: (string | number | null)[][]) => {
      const blob = new Blob([CSV_BOM + toCsvContent(rows)], {
        type: 'text/csv;charset=utf-8;',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
      toast({ title: `${filename} を出力しました` })
    },
    [toast],
  )

  const kindLabel = useActual ? '実績' : '計画'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">月次明細</h1>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="statement-month" className="text-xs">
              対象月
            </Label>
            <select
              id="statement-month"
              className="h-9 rounded border border-border bg-background px-2 text-sm"
              value={effectiveMonth}
              onChange={(e) => setMonth(e.target.value)}
            >
              {monthKeys.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={useActual ? 'outline' : 'default'}
              onClick={() => setUseActual(false)}
            >
              計画
            </Button>
            <Button
              type="button"
              size="sm"
              variant={useActual ? 'default' : 'outline'}
              onClick={() => setUseActual(true)}
            >
              実績
            </Button>
          </div>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        実績はアサイン画面の例外入力を優先し、未入力の月は計画どおりとして扱います
      </p>

      <Tabs defaultValue="partner">
        <TabsList>
          <TabsTrigger value="partner">協力会社への支払</TabsTrigger>
          <TabsTrigger value="client">発注元向け（案件別）</TabsTrigger>
        </TabsList>

        {/* ── 協力会社向け: 会社→人→案件PJコード（契約単価ベース） ── */}
        <TabsContent value="partner">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>
                  協力会社への支払（{effectiveMonth}・{kindLabel}）
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadCsv(
                      `協力会社支払_${effectiveMonth}_${kindLabel}.csv`,
                      buildPartnerPaymentCsvRows(partnerLines, effectiveMonth),
                    )
                  }
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  CSV出力
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCustomExportTab('partner')}
                  title="外部システムの取込レイアウトに合わせて列をマッピングして出力します"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  カスタムCSV
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                契約単価（所属会社への支払用）×配分で算出。協力会社への支払通知・検収のやり取りに使用します。単価0の行は契約単価の入力漏れです
              </p>
            </CardHeader>
            <CardContent>
              {partnerLines.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">
                  対象月に協力会社メンバーのアサインがありません
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-1.5 pr-2">担当者</th>
                      <th className="py-1.5 pr-2">役割</th>
                      <th className="py-1.5 pr-2">PJコード</th>
                      <th className="py-1.5 pr-2">プロジェクト名</th>
                      <th className="py-1.5 pr-2 text-right">配分(人月)</th>
                      <th className="py-1.5 pr-2 text-right">契約単価(万円)</th>
                      <th className="py-1.5 text-right">支払額(万円)</th>
                      {useActual && <th className="py-1.5 pl-2">精算</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {[...partnerByCompany.entries()].map(
                      ([companyName, lines]) => (
                        <Fragment key={companyName}>
                          <tr className="border-b border-border bg-muted/40">
                            <td colSpan={6} className="py-1.5 pr-2 font-bold">
                              {companyName}
                              {(lines[0]?.paymentDueDate ||
                                lines[0]?.invoiceRegistrationNumber) && (
                                <span className="ml-2 font-normal text-xs text-muted-foreground">
                                  {lines[0]?.paymentDueDate &&
                                    `支払期日: ${lines[0].paymentDueDate}`}
                                  {lines[0]?.paymentDueDate &&
                                    lines[0]?.invoiceRegistrationNumber &&
                                    ' ／ '}
                                  {lines[0]?.invoiceRegistrationNumber &&
                                    `登録番号: ${lines[0].invoiceRegistrationNumber}`}
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 text-right font-bold tabular-nums">
                              {manYenFormatter.format(
                                sumStatementAmount(lines),
                              )}
                            </td>
                            {useActual && <td />}
                          </tr>
                          {lines.map((line) => (
                            <tr
                              key={`${line.memberId}-${line.projectId}`}
                              className="border-b border-border"
                            >
                              <td className="py-1.5 pr-2">{line.memberName}</td>
                              <td className="py-1.5 pr-2 text-muted-foreground">
                                {line.memberRole}
                              </td>
                              <td className="py-1.5 pr-2 font-mono text-xs">
                                {line.projectCode}
                              </td>
                              <td className="py-1.5 pr-2">
                                {line.projectName}
                              </td>
                              <td className="py-1.5 pr-2 text-right tabular-nums">
                                {line.ratio.toFixed(2)}
                              </td>
                              <td
                                className={
                                  line.unitPrice === 0
                                    ? 'py-1.5 pr-2 text-right tabular-nums text-destructive'
                                    : 'py-1.5 pr-2 text-right tabular-nums'
                                }
                              >
                                {manYenFormatter.format(line.unitPrice)}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">
                                {manYenFormatter.format(line.amount)}
                              </td>
                              {useActual && (
                                <td
                                  className="py-1.5 pl-2 text-xs"
                                  title={
                                    line.settlementKind
                                      ? `実績${line.settlementActualHours}h／基準額${line.settlementBaseAmount}万円（精算幅による自動計算）`
                                      : undefined
                                  }
                                >
                                  {line.settlementKind
                                    ? SETTLEMENT_KIND_LABELS[
                                        line.settlementKind
                                      ]
                                    : ''}
                                </td>
                              )}
                            </tr>
                          ))}
                        </Fragment>
                      ),
                    )}
                    <tr className="border-t-2 border-border bg-muted/60 font-bold">
                      <td colSpan={4} className="py-2 pr-2">
                        総合計
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {sumStatementRatio(partnerLines).toFixed(2)}
                      </td>
                      <td />
                      <td className="py-2 text-right tabular-nums">
                        {manYenFormatter.format(
                          sumStatementAmount(partnerLines),
                        )}
                      </td>
                      {useActual && <td />}
                    </tr>
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 発注元向け: 案件→会社→人（見積単価ベース） ── */}
        <TabsContent value="client">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>
                  発注元向け明細（{effectiveMonth}・{kindLabel}）
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadCsv(
                      `発注元向け明細_${effectiveMonth}_${kindLabel}.csv`,
                      buildClientStatementCsvRows(clientLines, effectiveMonth),
                    )
                  }
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  CSV出力
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCustomExportTab('client')}
                  title="外部システムの取込レイアウトに合わせて列をマッピングして出力します"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  カスタムCSV
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                見積単価（予算・請求根拠用）×配分で算出。発注元への体制提示・請求根拠のやり取りに使用します
              </p>
            </CardHeader>
            <CardContent>
              {clientLines.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">
                  対象月のアサインがありません
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-1.5 pr-2">所属会社</th>
                      <th className="py-1.5 pr-2">担当者</th>
                      <th className="py-1.5 pr-2">役割</th>
                      <th className="py-1.5 pr-2 text-right">配分(人月)</th>
                      <th className="py-1.5 pr-2 text-right">単価(万円)</th>
                      <th className="py-1.5 text-right">金額(万円)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...clientByProject.entries()].map(
                      ([projectId, lines]) => {
                        const head = lines[0]
                        return (
                          <Fragment key={projectId}>
                            <tr className="border-b border-border bg-muted/40">
                              <td colSpan={5} className="py-1.5 pr-2 font-bold">
                                <span className="font-mono text-xs">
                                  {head?.projectCode}
                                </span>{' '}
                                {head?.projectName}
                                {head?.clientName && (
                                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                                    発注元: {head.clientName}
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5 text-right font-bold tabular-nums">
                                {manYenFormatter.format(
                                  sumStatementAmount(lines),
                                )}
                              </td>
                            </tr>
                            {lines.map((line) => (
                              <tr
                                key={`${line.memberId}-${line.projectId}`}
                                className="border-b border-border"
                              >
                                <td className="py-1.5 pr-2">
                                  {line.companyName}
                                </td>
                                <td className="py-1.5 pr-2">
                                  {line.memberName}
                                </td>
                                <td className="py-1.5 pr-2 text-muted-foreground">
                                  {line.memberRole}
                                </td>
                                <td className="py-1.5 pr-2 text-right tabular-nums">
                                  {line.ratio.toFixed(2)}
                                </td>
                                <td className="py-1.5 pr-2 text-right tabular-nums">
                                  {manYenFormatter.format(line.unitPrice)}
                                </td>
                                <td className="py-1.5 text-right tabular-nums">
                                  {manYenFormatter.format(line.amount)}
                                </td>
                              </tr>
                            ))}
                          </Fragment>
                        )
                      },
                    )}
                    <tr className="border-t-2 border-border bg-muted/60 font-bold">
                      <td colSpan={3} className="py-2 pr-2">
                        総合計
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {sumStatementRatio(clientLines).toFixed(2)}
                      </td>
                      <td />
                      <td className="py-2 text-right tabular-nums">
                        {manYenFormatter.format(
                          sumStatementAmount(clientLines),
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {customExportTab && (
        <CsvMappingExportDialog
          open={customExportTab !== null}
          onOpenChange={(open) => {
            if (!open) setCustomExportTab(null)
          }}
          source={
            customExportTab === 'partner'
              ? PARTNER_PAYMENT_SOURCE
              : CLIENT_STATEMENT_SOURCE
          }
          rows={
            customExportTab === 'partner'
              ? buildPartnerPaymentRecords(partnerLines, effectiveMonth)
              : buildClientStatementRecords(clientLines, effectiveMonth)
          }
          fileName={
            customExportTab === 'partner'
              ? `協力会社支払_${effectiveMonth}_${kindLabel}`
              : `発注元向け明細_${effectiveMonth}_${kindLabel}`
          }
        />
      )}
    </div>
  )
}
