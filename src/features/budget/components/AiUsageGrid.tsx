import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/shared/components/ui/button'
import { Combobox } from '@/shared/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Label } from '@/shared/components/ui/label'
import { NumericInput } from '@/shared/components/ui/numeric-input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table'
import type { AiUsageEntry, AiUsageProvider } from '@/shared/types/budget'
import { filterMembersByOrganization } from '@/shared/utils/member-filter'
import {
  useAppStore,
  useBudgetStore,
  useMembersStore,
  useTeamStore,
} from '@/stores'
import {
  type AiUsageMemberAllocationTotal,
  calcAiUsageMemberAllocationTotal,
  getCalendarMonthLabel,
  getFiscalYearMonthKeys,
} from '../utils/expense-budget-utils'
import { AiUsageProviderDialog } from './AiUsageProviderDialog'

// AI利用費タブは＄建てで管理する。他の予算領域（万円建て）とは
// 表示単位が異なる点に注意（AiUsageEntry/AiUsageMemberAllocation自体の数値は変換しない、
// 表示ラベルのみの変更）
// 小数桁を常に2桁固定（ゼロパディング）で表示する。＄換算で生じる小数と整数値が
// 同一列内に混在すると桁が揃わず視認性が悪いため、右寄せ・tabular-numsと組み合わせて統一する
const usdFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

interface AiUsageGridProps {
  divisionId: string
  fiscalYear: number
  // 課単位の予算設定。「部門全体」という選択肢は廃止したため、必ず特定の課のIDを渡す
  // （課が1件も読み込まれていない一瞬だけnullを許容）
  sectionId: string | null
  // 課セレクタの選択変更ハンドラ（AiUsageMemberAllocationPanelと絞り込み状態を共有するため、
  // 状態自体は呼び出し元(BudgetPage)が保持し、本コンポーネントはUIのみを描画する）
  onSectionChange: (sectionId: string) => void
  // 選択中プロバイダ（providers.length===0の場合は常にnull）。AiUsageMemberAllocationPanelの
  // メンバー別配分もこのプロバイダに連動して絞り込む
  providerId: string | null
  onProviderChange: (providerId: string | null) => void
}

function providerLabel(provider: AiUsageProvider): string {
  return provider.plan ? `${provider.name}（${provider.plan}）` : provider.name
}

/**
 * AI利用費の月別予算・実績入力グリッド。月を列（横軸）に配置する。行数が固定小規模のため
 * AG Gridではなく素のTable＋NumericInputパターンを採用する（踏襲）。
 *
 * プロバイダ（Anthropic/OpenAI/Microsoft等）が0件の場合は既存どおり単一の「予算額」行のみ
 * （後方互換）。1件以上登録されると、セレクタで選択した1プロバイダの予算額・実績額行のみを
 * 表示する（未分類=providerId null行はUI上非表示。データ・書き込みAPIは
 * 保持し、予算合計行の算出には引き続き算入する）。課セレクタも本コンポーネント側に配置し、
 * AiUsageMemberAllocationPanelと選択状態を共有する。「部門全体」は選択肢として廃止し、必ず
 * 特定の課を選択させる（課が0件の部門はBudgetPage側で案内表示に切り替える）。
 * 個人予算合計・バッファ合計・割当合計・バッファ割当合計の4行はメンバー別配分
 * （AiUsageMemberAllocationPanel）由来で、選択中の課・プロバイダの両方に応じて絞り込む
 * 。
 */
export function AiUsageGrid({
  divisionId,
  fiscalYear,
  sectionId,
  onSectionChange,
  providerId,
  onProviderChange,
}: AiUsageGridProps) {
  const fiscalYearStartMonth = useAppStore((s) => s.fiscalYearStartMonth)
  const aiUsageEntries = useBudgetStore((s) => s.aiUsageEntries)
  const aiUsageProviders = useBudgetStore((s) => s.aiUsageProviders)
  // メンバー配分の変更を検知して再レンダーされるよう購読する（値は直接参照しない。
  // summaryByMonthはメモ化せず毎レンダー再計算するため、依存配列に含める必要もない）
  useBudgetStore((s) => s.aiUsageMemberAllocations)
  const setAiUsageBudget = useBudgetStore((s) => s.setAiUsageBudget)
  const setAiUsageActual = useBudgetStore((s) => s.setAiUsageActual)
  const deleteAiUsageProvider = useBudgetStore((s) => s.deleteAiUsageProvider)
  const getAiUsageMemberAllocationsByMonth = useBudgetStore(
    (s) => s.getAiUsageMemberAllocationsByMonth,
  )
  const members = useMembersStore((s) => s.members)
  const sections = useTeamStore((s) => s.sections)

  const [providerDialogOpen, setProviderDialogOpen] = useState(false)
  const [editingProvider, setEditingProvider] =
    useState<AiUsageProvider | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AiUsageProvider | null>(null)

  const providers = useMemo(
    () =>
      aiUsageProviders
        .filter((p) => p.divisionId === divisionId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [aiUsageProviders, divisionId],
  )

  // 選択中プロバイダが削除等で存在しなくなった場合、sortOrder最小のプロバイダへ自動フォールバック
  // する（存在しないIDを保持したまま操作不能にならないようにする）
  useEffect(() => {
    const validId = providers.some((p) => p.id === providerId)
      ? providerId
      : (providers[0]?.id ?? null)
    if (validId !== providerId) {
      onProviderChange(validId)
    }
  }, [providers, providerId, onProviderChange])

  const selectedProvider = providers.find((p) => p.id === providerId) ?? null

  const sectionsInDivision = useMemo(
    () =>
      sections
        .filter((s) => s.divisionId === divisionId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [sections, divisionId],
  )

  // 課が選択されている場合のみ、その課所属メンバーの配分に絞り込む（sectionIdは課読み込み前の
  // 一瞬だけnullになりうるため、そのフレームは絞り込みを行わない防御的な扱いとする）
  const memberIdsInSection = useMemo(() => {
    if (!sectionId) return null
    return new Set(
      filterMembersByOrganization(members, sections, divisionId, sectionId)
        .filter((m) => m.isActive)
        .map((m) => m.id),
    )
  }, [members, sections, divisionId, sectionId])

  const monthKeys = useMemo(
    () => getFiscalYearMonthKeys(fiscalYear, fiscalYearStartMonth),
    [fiscalYear, fiscalYearStartMonth],
  )

  // (providerId ?? 'legacy') × month をキーにしたエントリのMap
  const entryByProviderAndMonth = useMemo(() => {
    const map = new Map<string, AiUsageEntry>()
    for (const e of aiUsageEntries) {
      if (
        e.divisionId === divisionId &&
        e.fiscalYear === fiscalYear &&
        (e.sectionId ?? null) === (sectionId ?? null)
      ) {
        map.set(`${e.providerId ?? 'legacy'}:${e.month}`, e)
      }
    }
    return map
  }, [aiUsageEntries, divisionId, fiscalYear, sectionId])

  const getEntry = (
    entryProviderId: string | null,
    monthKey: string,
  ): AiUsageEntry | undefined =>
    entryByProviderAndMonth.get(`${entryProviderId ?? 'legacy'}:${monthKey}`)

  // 上記のaiUsageMemberAllocations購読による再レンダー時に必ず最新値で再計算されるよう、
  // あえてuseMemo化しない（12ヶ月分のループのみで計算コストは軽微なため実用上問題ない）
  const totalsByMonth = new Map<string, AiUsageMemberAllocationTotal>()
  for (const monthKey of monthKeys) {
    const rawAllocations = getAiUsageMemberAllocationsByMonth(
      divisionId,
      fiscalYear,
      monthKey,
      providerId,
    )
    const allocationsForMonth = memberIdsInSection
      ? rawAllocations.filter((a) => memberIdsInSection.has(a.memberId))
      : rawAllocations
    totalsByMonth.set(
      monthKey,
      calcAiUsageMemberAllocationTotal(allocationsForMonth),
    )
  }

  const handleBudgetChange = (
    monthKey: string,
    value: number,
    entryProviderId: string | null = null,
  ) => {
    setAiUsageBudget(
      divisionId,
      fiscalYear,
      monthKey,
      value,
      sectionId,
      entryProviderId,
    )
  }

  const handleActualChange = (
    monthKey: string,
    value: number,
    entryProviderId: string | null,
  ) => {
    setAiUsageActual(
      divisionId,
      fiscalYear,
      monthKey,
      value,
      sectionId,
      entryProviderId,
    )
  }

  const handleAddProvider = () => {
    setEditingProvider(null)
    setProviderDialogOpen(true)
  }

  const handleEditProvider = (provider: AiUsageProvider) => {
    setEditingProvider(provider)
    setProviderDialogOpen(true)
  }

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return
    deleteAiUsageProvider(deleteTarget.id)
    setDeleteTarget(null)
  }

  // 月次予算合計・実績合計の推移チャート用データ。totalsByMonth同様、
  // メンバー配分の変更を即座に反映するためあえてuseMemo化しない
  const chartData = monthKeys.map((m) => {
    const budget =
      providers.length === 0
        ? (getEntry(null, m)?.budgetAmount ?? 0)
        : [...providers, null].reduce(
            (sum, p) => sum + (getEntry(p?.id ?? null, m)?.budgetAmount ?? 0),
            0,
          )
    const actual =
      providers.length === 0
        ? (totalsByMonth.get(m)?.actualTotal ?? 0) +
          (totalsByMonth.get(m)?.bufferActualTotal ?? 0)
        : providers.reduce(
            (sum, p) => sum + (getEntry(p.id, m)?.actualAmount ?? 0),
            0,
          )
    return { month: getCalendarMonthLabel(m), budget, actual }
  })

  const summaryRows: {
    key: 'budgetTotal' | 'bufferTotal' | 'actualTotal' | 'bufferActualTotal'
    label: string
    className: string
  }[] = [
    {
      key: 'budgetTotal',
      label: '個人予算合計（＄）',
      className: 'bg-budget-planned/10',
    },
    {
      key: 'bufferTotal',
      label: 'バッファ合計（＄）',
      className: 'bg-budget-planned/10',
    },
    {
      key: 'actualTotal',
      label: '割当合計（＄）',
      className: 'bg-budget-actual/10',
    },
    {
      key: 'bufferActualTotal',
      label: 'バッファ割当合計（＄）',
      className: 'bg-budget-actual/10',
    },
  ]

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor="ai-usage-grid-section">課</Label>
          <Combobox
            value={sectionId ?? ''}
            onValueChange={onSectionChange}
            options={sectionsInDivision.map((s) => ({
              value: s.id,
              label: s.name,
            }))}
            placeholder="課を選択"
            searchPlaceholder="課を検索..."
            className="w-[220px]"
          />
        </div>
        {providers.length > 0 && (
          <div className="space-y-1">
            <Label htmlFor="ai-usage-grid-provider">プロバイダ</Label>
            <Combobox
              value={providerId ?? ''}
              onValueChange={onProviderChange}
              options={providers.map((p) => ({
                value: p.id,
                label: providerLabel(p),
              }))}
              placeholder="プロバイダを選択"
              searchPlaceholder="プロバイダを検索..."
              className="w-[220px]"
            />
          </div>
        )}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          AIプロバイダ
        </span>
        <Button size="sm" variant="outline" onClick={handleAddProvider}>
          <Plus className="h-3.5 w-3.5" />
          プロバイダを追加
        </Button>
      </div>
      {providers.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className="flex items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs"
            >
              <span>{providerLabel(provider)}</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => handleEditProvider(provider)}
                title="編集"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteTarget(provider)}
                title="削除"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">項目</TableHead>
            {monthKeys.map((m) => (
              <TableHead key={m} className="text-center text-xs">
                {getCalendarMonthLabel(m)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {providers.length === 0 ? (
            <TableRow>
              <TableCell className="bg-budget-planned/10 text-xs text-muted-foreground">
                予算額（＄）
              </TableCell>
              {monthKeys.map((m) => (
                <TableCell key={m} className="bg-budget-planned/10 p-1">
                  <NumericInput
                    value={getEntry(null, m)?.budgetAmount ?? 0}
                    onValueChange={(v) => handleBudgetChange(m, v)}
                    className="h-8 w-20 text-right text-xs tabular-nums"
                  />
                </TableCell>
              ))}
            </TableRow>
          ) : (
            <>
              {selectedProvider && (
                <Fragment key={selectedProvider.id}>
                  <TableRow>
                    <TableCell className="bg-budget-planned/10 text-xs text-muted-foreground">
                      {providerLabel(selectedProvider)} 予算額（＄）
                    </TableCell>
                    {monthKeys.map((m) => (
                      <TableCell key={m} className="bg-budget-planned/10 p-1">
                        <NumericInput
                          value={
                            getEntry(selectedProvider.id, m)?.budgetAmount ?? 0
                          }
                          onValueChange={(v) =>
                            handleBudgetChange(m, v, selectedProvider.id)
                          }
                          className="h-8 w-20 text-right text-xs tabular-nums"
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="bg-budget-actual/10 text-xs text-muted-foreground">
                      {providerLabel(selectedProvider)} 実績額（＄）
                    </TableCell>
                    {monthKeys.map((m) => (
                      <TableCell key={m} className="bg-budget-actual/10 p-1">
                        <NumericInput
                          value={
                            getEntry(selectedProvider.id, m)?.actualAmount ?? 0
                          }
                          onValueChange={(v) =>
                            handleActualChange(m, v, selectedProvider.id)
                          }
                          className="h-8 w-20 text-right text-xs tabular-nums"
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                </Fragment>
              )}
              <TableRow className="font-medium">
                <TableCell className="bg-budget-planned/10 text-xs">
                  予算合計（＄）
                </TableCell>
                {monthKeys.map((m) => {
                  const total = [...providers, null].reduce(
                    (sum, p) =>
                      sum + (getEntry(p?.id ?? null, m)?.budgetAmount ?? 0),
                    0,
                  )
                  return (
                    <TableCell
                      key={m}
                      className="bg-budget-planned/10 p-1 text-right text-xs tabular-nums"
                    >
                      {usdFormatter.format(total)}
                    </TableCell>
                  )
                })}
              </TableRow>
              <TableRow className="font-medium">
                <TableCell className="bg-budget-actual/10 text-xs">
                  実績合計（＄）
                </TableCell>
                {monthKeys.map((m) => {
                  const total = providers.reduce(
                    (sum, p) => sum + (getEntry(p.id, m)?.actualAmount ?? 0),
                    0,
                  )
                  return (
                    <TableCell
                      key={m}
                      className="bg-budget-actual/10 p-1 text-right text-xs tabular-nums"
                    >
                      {usdFormatter.format(total)}
                    </TableCell>
                  )
                })}
              </TableRow>
            </>
          )}
          {summaryRows.map((row) => (
            <TableRow key={row.key}>
              <TableCell
                className={`${row.className} text-xs text-muted-foreground`}
              >
                {row.label}
              </TableCell>
              {monthKeys.map((m) => (
                <TableCell
                  key={m}
                  className={`${row.className} p-1 text-right text-xs tabular-nums`}
                >
                  {usdFormatter.format(totalsByMonth.get(m)?.[row.key] ?? 0)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="mt-4 rounded-lg border border-border bg-card p-4">
        <p className="mb-2 text-sm font-medium">月次予算・実績の推移（＄）</p>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="month"
              className="text-xs"
              tick={{ fill: 'var(--color-muted-foreground)' }}
            />
            <YAxis
              className="text-xs"
              tick={{ fill: 'var(--color-muted-foreground)' }}
              label={{
                value: '＄',
                angle: -90,
                position: 'insideLeft',
                fill: 'var(--color-muted-foreground)',
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-popover)',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                color: 'var(--color-popover-foreground)',
              }}
              formatter={(value: number) => [
                `${usdFormatter.format(value)} ＄`,
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="budget"
              name="予算合計"
              stroke="var(--color-budget-planned)"
              strokeDasharray="4 2"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="actual"
              name="実績合計"
              stroke="var(--color-budget-actual)"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <AiUsageProviderDialog
        open={providerDialogOpen}
        onOpenChange={setProviderDialogOpen}
        divisionId={divisionId}
        provider={editingProvider}
      />

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>プロバイダの削除</DialogTitle>
            <DialogDescription>
              「{deleteTarget ? providerLabel(deleteTarget) : ''}
              」を削除しますか？このプロバイダの月次予算・実績データもすべて削除されます。この操作は元に戻せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              キャンセル
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
