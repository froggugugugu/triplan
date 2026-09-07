import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/shared/components/ui/button'
import { Label } from '@/shared/components/ui/label'
import { NumericInput } from '@/shared/components/ui/numeric-input'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table'
import { filterMembersByOrganization } from '@/shared/utils/member-filter'
import {
  useAppStore,
  useBudgetStore,
  useMembersStore,
  useTeamStore,
} from '@/stores'
import {
  calcAiUsageMemberAllocationTotal,
  getCalendarMonthLabel,
  getFiscalYearMonthKeys,
} from '../utils/expense-budget-utils'

// AI利用費タブは＄建てで管理する。小数桁を常に2桁固定（ゼロパディング）
// で表示し、右寄せ・tabular-numsと組み合わせて桁揃えする
const usdFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

interface AiUsageMemberAllocationPanelProps {
  divisionId: string
  fiscalYear: number
  // 課単位の絞り込み。「部門全体」は廃止したため必ず特定の課のIDを渡す（課の読み込み前の
  // 一瞬だけnullを許容）。課セレクタ自体はAiUsageGrid（上部エリア）に一本化されており、
  // 本コンポーネントは選択状態を受け取るのみ
  sectionId: string | null
  // 選択中プロバイダ（AiUsageGridのセレクタと連動、providers.length===0なら常にnull）。
  // メンバー別配分もこのプロバイダに絞り込む
  providerId: string | null
}

function getCurrentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * AI利用費のメンバー別予算配分・実績登録パネル。対象部門の在籍中メンバー一覧を表示し、
 * 月を選んで一人あたりの月間設定額・バッファ額を一律設定したうえで、Gridで個人別に
 * 実績割当額を微調整する。【仮定】対象メンバーは部門所属かつisActive=trueのメンバーとする
 * （人員計画のような年度在籍判定は行わない。次工程で確認）。
 */
export function AiUsageMemberAllocationPanel({
  divisionId,
  fiscalYear,
  sectionId,
  providerId,
}: AiUsageMemberAllocationPanelProps) {
  const fiscalYearStartMonth = useAppStore((s) => s.fiscalYearStartMonth)
  const members = useMembersStore((s) => s.members)
  const sections = useTeamStore((s) => s.sections)
  const getOrCreateAiUsageMemberAllocations = useBudgetStore(
    (s) => s.getOrCreateAiUsageMemberAllocations,
  )
  const setAiUsageMemberAllocation = useBudgetStore(
    (s) => s.setAiUsageMemberAllocation,
  )
  const bulkSetAiUsageMemberMonthlyBudget = useBudgetStore(
    (s) => s.bulkSetAiUsageMemberMonthlyBudget,
  )
  const bulkSetAiUsageMemberBufferAmount = useBudgetStore(
    (s) => s.bulkSetAiUsageMemberBufferAmount,
  )
  const getAiUsageMemberAllocationsByMonth = useBudgetStore(
    (s) => s.getAiUsageMemberAllocationsByMonth,
  )
  const getAiUsageBudgetAmountForMonth = useBudgetStore(
    (s) => s.getAiUsageBudgetAmountForMonth,
  )
  // 配分・AI利用費予算データの変更を検知して再レンダーされるよう購読する
  useBudgetStore((s) => s.aiUsageMemberAllocations)
  useBudgetStore((s) => s.aiUsageEntries)

  const monthKeys = useMemo(
    () => getFiscalYearMonthKeys(fiscalYear, fiscalYearStartMonth),
    [fiscalYear, fiscalYearStartMonth],
  )
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const currentKey = getCurrentMonthKey()
    return monthKeys.includes(currentKey) ? currentKey : (monthKeys[0] ?? '')
  })

  // 年度切り替え等でselectedMonthが当年度の月一覧に含まれなくなった場合は先頭月へ戻す
  useEffect(() => {
    if (monthKeys.length > 0 && !monthKeys.includes(selectedMonth)) {
      setSelectedMonth(monthKeys[0] ?? '')
    }
  }, [monthKeys, selectedMonth])

  const divisionMembers = useMemo(
    () =>
      filterMembersByOrganization(
        members,
        sections,
        divisionId,
        sectionId ?? '',
      ).filter((m) => m.isActive),
    [members, sections, divisionId, sectionId],
  )
  const memberIds = useMemo(
    () => divisionMembers.map((m) => m.id),
    [divisionMembers],
  )

  useEffect(() => {
    if (!selectedMonth || memberIds.length === 0) return
    getOrCreateAiUsageMemberAllocations(
      divisionId,
      fiscalYear,
      selectedMonth,
      memberIds,
      providerId,
    )
  }, [
    divisionId,
    fiscalYear,
    selectedMonth,
    memberIds,
    providerId,
    getOrCreateAiUsageMemberAllocations,
  ])

  // : フッター合計をテーブル本体と一致させるため、表示中のメンバー
  // （divisionMembers、課で絞り込み済み）に紐づく配分のみを集計対象にする。
  // : 選択中プロバイダにも絞り込む
  const memberIdSet = useMemo(() => new Set(memberIds), [memberIds])
  const allocations = selectedMonth
    ? getAiUsageMemberAllocationsByMonth(
        divisionId,
        fiscalYear,
        selectedMonth,
        providerId,
      ).filter((a) => memberIdSet.has(a.memberId))
    : []
  const allocationByMember = useMemo(
    () => new Map(allocations.map((a) => [a.memberId, a])),
    [allocations],
  )
  const totals = calcAiUsageMemberAllocationTotal(allocations)

  // 当月の（部門または課）予算額と、実際に使う額（割当合計＋バッファ割当合計）との差分。
  // 「個人予算」「バッファ」はメンバーへの予算配分（計画）であり、実際に消化されるのは
  // 「割当」「バッファ割当」（実績）のため、残額はこの2つを予算額から差し引いて算出する
  // （是正。時点ではbufferActualAmountが存在せず
  // bufferTotal＝バッファ予算を代用していたが、本来はバッファ実績を使うべきだった）
  const monthlyBudgetAmount = selectedMonth
    ? getAiUsageBudgetAmountForMonth(
        divisionId,
        sectionId,
        fiscalYear,
        selectedMonth,
        providerId,
      )
    : 0
  const remainingAgainstBudget =
    monthlyBudgetAmount - (totals.actualTotal + totals.bufferActualTotal)

  const [bulkBudget, setBulkBudget] = useState(0)
  const [bulkBuffer, setBulkBuffer] = useState(0)

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-3 text-sm font-medium">
          メンバー別配分（一律設定・微調整）
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label htmlFor="allocation-month">月</Label>
            <select
              id="allocation-month"
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              {monthKeys.map((m) => (
                <option key={m} value={m}>
                  {getCalendarMonthLabel(m)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="bulk-budget">一人あたり個人予算（＄）</Label>
            <div className="flex gap-1">
              <NumericInput
                id="bulk-budget"
                value={bulkBudget}
                onValueChange={setBulkBudget}
                className="w-24"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selectedMonth}
                onClick={() =>
                  bulkSetAiUsageMemberMonthlyBudget(
                    divisionId,
                    fiscalYear,
                    selectedMonth,
                    bulkBudget,
                    memberIds,
                    providerId,
                  )
                }
              >
                一律設定
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="bulk-buffer">一人あたりバッファ（＄）</Label>
            <div className="flex gap-1">
              <NumericInput
                id="bulk-buffer"
                value={bulkBuffer}
                onValueChange={setBulkBuffer}
                className="w-24"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selectedMonth}
                onClick={() =>
                  bulkSetAiUsageMemberBufferAmount(
                    divisionId,
                    fiscalYear,
                    selectedMonth,
                    bulkBuffer,
                    memberIds,
                    providerId,
                  )
                }
              >
                一律設定
              </Button>
            </div>
          </div>
        </div>
      </div>

      {divisionMembers.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          この部門に在籍中のメンバーがいません。
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">番号</TableHead>
              <TableHead>メンバー名</TableHead>
              <TableHead className="bg-budget-planned/10 text-right">
                個人予算（＄）
              </TableHead>
              <TableHead className="bg-budget-planned/10 text-right">
                バッファ（＄）
              </TableHead>
              <TableHead className="bg-budget-actual/10 text-right">
                割当（＄）
              </TableHead>
              <TableHead className="bg-budget-actual/10 text-right">
                バッファ割当（＄）
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {divisionMembers.map((member, index) => {
              const allocation = allocationByMember.get(member.id)
              if (!allocation) return null
              return (
                <TableRow key={member.id}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>{member.name}</TableCell>
                  <TableCell className="p-1">
                    <NumericInput
                      value={allocation.monthlyBudget}
                      onValueChange={(v) =>
                        setAiUsageMemberAllocation(allocation.id, {
                          monthlyBudget: v,
                        })
                      }
                      className="text-right"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <NumericInput
                      value={allocation.bufferAmount}
                      onValueChange={(v) =>
                        setAiUsageMemberAllocation(allocation.id, {
                          bufferAmount: v,
                        })
                      }
                      className="text-right"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <NumericInput
                      value={allocation.actualAmount}
                      onValueChange={(v) =>
                        setAiUsageMemberAllocation(allocation.id, {
                          actualAmount: v,
                        })
                      }
                      className="text-right"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <NumericInput
                      value={allocation.bufferActualAmount}
                      onValueChange={(v) =>
                        setAiUsageMemberAllocation(allocation.id, {
                          bufferActualAmount: v,
                        })
                      }
                      className="text-right"
                    />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2}>合計</TableCell>
              <TableCell className="bg-budget-planned/10 text-right font-medium tabular-nums">
                {usdFormatter.format(totals.budgetTotal)}
              </TableCell>
              <TableCell className="bg-budget-planned/10 text-right font-medium tabular-nums">
                {usdFormatter.format(totals.bufferTotal)}
              </TableCell>
              <TableCell
                className={cn(
                  'bg-budget-actual/10 text-right font-medium tabular-nums',
                  totals.isOverBudget && 'text-destructive',
                )}
              >
                {usdFormatter.format(totals.actualTotal)}
              </TableCell>
              <TableCell
                className={cn(
                  'bg-budget-actual/10 text-right font-medium tabular-nums',
                  totals.isOverBudget && 'text-destructive',
                )}
              >
                {usdFormatter.format(totals.bufferActualTotal)}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell colSpan={2} className="text-muted-foreground">
                AI利用費予算との残
              </TableCell>
              <TableCell
                colSpan={2}
                className="text-right text-xs text-muted-foreground tabular-nums"
              >
                予算 {usdFormatter.format(monthlyBudgetAmount)}＄
              </TableCell>
              <TableCell
                colSpan={2}
                className={cn(
                  'text-right font-medium tabular-nums',
                  remainingAgainstBudget < 0 && 'text-destructive',
                )}
              >
                残 {usdFormatter.format(remainingAgainstBudget)}＄
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      )}

      {totals.isOverBudget && (
        <p className="text-sm text-destructive">
          割当・バッファ割当の合計が、個人予算とバッファの合計枠を超過しています。個人別の割当額を調整してください。
        </p>
      )}
    </div>
  )
}
