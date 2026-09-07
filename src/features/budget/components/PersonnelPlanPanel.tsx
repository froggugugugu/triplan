import { Fragment, useEffect, useMemo } from 'react'
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
import { NumericInput } from '@/shared/components/ui/numeric-input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table'
import {
  PERSONNEL_PLAN_CATEGORIES,
  type PersonnelPlanCategory,
} from '@/shared/types/personnel-plan'
import { usePersonnelPlanStore } from '@/stores'
import {
  getCalendarMonthLabel,
  getFiscalYearMonthKeys,
} from '../utils/expense-budget-utils'
import { PersonnelCostSummary } from './PersonnelCostSummary'

const CATEGORY_LABELS: Record<PersonnelPlanCategory, string> = {
  personnel_internal: '人数（内部リソース）',
  personnel_external: '人数（外部リソース）',
  planned_internal: '追加予定（内部リソース）',
  planned_external: '追加予定（外部リソース）',
}

// 4区分を色相で判別できるよう固定パレットを割り当てる（budget-planned/actualの
// 2色運用とは別軸で、区分そのものを見分けるための配色）
const CATEGORY_CHART_COLORS: Record<PersonnelPlanCategory, string> = {
  personnel_internal: '#3b82f6',
  personnel_external: '#22c55e',
  planned_internal: '#eab308',
  planned_external: '#ef4444',
}

// 実績人数を在籍メンバーから自動算出する区分（手入力不可）
const AUTO_HEADCOUNT_CATEGORIES = new Set<PersonnelPlanCategory>([
  'personnel_internal',
  'personnel_external',
])

interface PersonnelPlanPanelProps {
  divisionId: string
  fiscalYear: number
  startMonth: number
}

/**
 * 人員計画パネル。4固定区分（人数内部リソース/外部リソース、追加予定内部リソース/外部リソース）を
 * 部門×年度で自動生成し、4区分×12ヶ月の単一表（区分ごとに「予定人数」「実績人数」の2行、
 * 計8行）＋末尾の「合計」行2行（全区分の月別合計人数）の計10行×12列にまとめて表示・編集する。
 * 区分を1つの表内で見比べながら、「案件に対してマンパワーが足りないので総合計人数を増やす」
 * 「内部リソースを追加して外部リソースを減らす」という主要な操作を行いやすくする。
 * 予定人数（手入力・編集可能、青系背景）と実績人数（人件費区分は在籍メンバーから自動算出し
 * 編集不可、追加予定区分は実現人数を手入力可能。赤系背景）を視覚的に区別する。
 */
export function PersonnelPlanPanel({
  divisionId,
  fiscalYear,
  startMonth,
}: PersonnelPlanPanelProps) {
  const getOrCreateAllCategories = usePersonnelPlanStore(
    (s) => s.getOrCreateAllCategories,
  )
  const getPersonnelPlanByCategory = usePersonnelPlanStore(
    (s) => s.getPersonnelPlanByCategory,
  )
  const updatePersonnelPlanEntry = usePersonnelPlanStore(
    (s) => s.updatePersonnelPlanEntry,
  )
  const getActiveHeadcountForCategory = usePersonnelPlanStore(
    (s) => s.getActiveHeadcountForCategory,
  )
  // 計画変更を検知して再レンダーされるよう購読する（セレクタ関数自体は安定参照のため、
  // 値の変化を拾うにはこの購読が必要）。chartDataのuseMemo依存にも使用する
  const personnelPlans = usePersonnelPlanStore((s) => s.personnelPlans)

  useEffect(() => {
    getOrCreateAllCategories(divisionId, fiscalYear)
  }, [divisionId, fiscalYear, getOrCreateAllCategories])

  const monthKeys = useMemo(
    () => getFiscalYearMonthKeys(fiscalYear, startMonth),
    [fiscalYear, startMonth],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: personnelPlansの変更を再計算のトリガーとして使用
  const chartData = useMemo(
    () =>
      monthKeys.map((m) => {
        const point: Record<string, string | number> = {
          month: getCalendarMonthLabel(m),
        }
        for (const category of PERSONNEL_PLAN_CATEGORIES) {
          const entry = getPersonnelPlanByCategory(
            divisionId,
            fiscalYear,
            category,
          )
          point[category] = entry?.monthlyHeadcount[m] ?? 0
        }
        return point
      }),
    [
      monthKeys,
      divisionId,
      fiscalYear,
      getPersonnelPlanByCategory,
      personnelPlans,
    ],
  )

  // Grid下部の合計行用。月ごとに4区分の予定人数・実績人数を合算し、全体の合計人数を
  // 把握できるようにする（人件費区分は在籍メンバーからの自動算出値、追加予定区分は
  // 手入力値をそのまま合算する）
  // biome-ignore lint/correctness/useExhaustiveDependencies: personnelPlansの変更を再計算のトリガーとして使用
  const monthlyTotals = useMemo(() => {
    const planned: Record<string, number> = {}
    const actual: Record<string, number> = {}
    for (const m of monthKeys) {
      planned[m] = 0
      actual[m] = 0
    }
    for (const category of PERSONNEL_PLAN_CATEGORIES) {
      const entry = getPersonnelPlanByCategory(divisionId, fiscalYear, category)
      const isAutoHeadcount = AUTO_HEADCOUNT_CATEGORIES.has(category)
      const activeHeadcount = getActiveHeadcountForCategory(
        divisionId,
        fiscalYear,
        category,
        startMonth,
      )
      for (const m of monthKeys) {
        planned[m] = (planned[m] ?? 0) + (entry?.monthlyHeadcount[m] ?? 0)
        actual[m] =
          (actual[m] ?? 0) +
          (isAutoHeadcount
            ? (activeHeadcount[m] ?? 0)
            : (entry?.monthlyRealizedHeadcount[m] ?? 0))
      }
    }
    return { planned, actual }
  }, [
    monthKeys,
    divisionId,
    fiscalYear,
    startMonth,
    getPersonnelPlanByCategory,
    getActiveHeadcountForCategory,
    personnelPlans,
  ])

  // 推移グラフ用にGrid下部の合計行（予定人数合計・実績人数合計）を各月のデータ点へ合成する
  const chartDataWithTotals = useMemo(
    () =>
      chartData.map((point, i) => {
        const m = monthKeys[i]
        return {
          ...point,
          plannedTotal: m ? (monthlyTotals.planned[m] ?? 0) : 0,
          actualTotal: m ? (monthlyTotals.actual[m] ?? 0) : 0,
        }
      }),
    [chartData, monthlyTotals, monthKeys],
  )

  const handlePlannedChange = (
    category: PersonnelPlanCategory,
    monthKey: string,
    value: number,
  ) => {
    const entry = getPersonnelPlanByCategory(divisionId, fiscalYear, category)
    if (!entry) return
    updatePersonnelPlanEntry({
      id: entry.id,
      monthlyHeadcount: { ...entry.monthlyHeadcount, [monthKey]: value },
    })
  }

  const handleRealizedChange = (
    category: PersonnelPlanCategory,
    monthKey: string,
    value: number,
  ) => {
    const entry = getPersonnelPlanByCategory(divisionId, fiscalYear, category)
    if (!entry) return
    updatePersonnelPlanEntry({
      id: entry.id,
      monthlyRealizedHeadcount: {
        ...entry.monthlyRealizedHeadcount,
        [monthKey]: value,
      },
    })
  }

  return (
    <div className="space-y-4">
      <PersonnelCostSummary
        divisionId={divisionId}
        fiscalYear={fiscalYear}
        startMonth={startMonth}
      />

      <div className="overflow-x-auto rounded-lg border border-border bg-card p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">区分</TableHead>
              <TableHead className="text-xs">項目</TableHead>
              {monthKeys.map((m) => (
                <TableHead key={m} className="text-center text-xs">
                  {getCalendarMonthLabel(m)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {PERSONNEL_PLAN_CATEGORIES.map((category) => {
              const entry = getPersonnelPlanByCategory(
                divisionId,
                fiscalYear,
                category,
              )
              const isAutoHeadcount = AUTO_HEADCOUNT_CATEGORIES.has(category)
              const activeHeadcount = getActiveHeadcountForCategory(
                divisionId,
                fiscalYear,
                category,
                startMonth,
              )

              return (
                <Fragment key={category}>
                  <TableRow>
                    <TableCell
                      rowSpan={2}
                      className="align-middle text-xs font-medium"
                    >
                      {CATEGORY_LABELS[category]}
                    </TableCell>
                    <TableCell className="bg-budget-planned/10 text-xs text-muted-foreground">
                      予定人数
                    </TableCell>
                    {monthKeys.map((m) => (
                      <TableCell key={m} className="bg-budget-planned/10 p-1">
                        <NumericInput
                          value={entry?.monthlyHeadcount[m] ?? 0}
                          onValueChange={(v) =>
                            handlePlannedChange(category, m, v)
                          }
                          className="h-8 w-16 text-right text-xs tabular-nums"
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="bg-budget-actual/10 text-xs text-muted-foreground">
                      実績人数
                    </TableCell>
                    {monthKeys.map((m) => (
                      <TableCell
                        key={m}
                        className="bg-budget-actual/10 p-1 text-right text-xs tabular-nums"
                      >
                        {isAutoHeadcount ? (
                          <span>{activeHeadcount[m] ?? 0}</span>
                        ) : (
                          <NumericInput
                            value={entry?.monthlyRealizedHeadcount[m] ?? 0}
                            onValueChange={(v) =>
                              handleRealizedChange(category, m, v)
                            }
                            className="h-8 w-16 text-right text-xs tabular-nums"
                          />
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                </Fragment>
              )
            })}
            <Fragment key="total">
              <TableRow className="font-medium">
                <TableCell
                  rowSpan={2}
                  className="align-middle text-xs font-medium"
                >
                  合計
                </TableCell>
                <TableCell className="bg-budget-planned/10 text-xs text-muted-foreground">
                  予定人数合計
                </TableCell>
                {monthKeys.map((m) => (
                  <TableCell
                    key={m}
                    className="bg-budget-planned/10 p-1 text-right text-xs tabular-nums"
                  >
                    {monthlyTotals.planned[m] ?? 0}
                  </TableCell>
                ))}
              </TableRow>
              <TableRow className="font-medium">
                <TableCell className="bg-budget-actual/10 text-xs text-muted-foreground">
                  実績人数合計
                </TableCell>
                {monthKeys.map((m) => (
                  <TableCell
                    key={m}
                    className="bg-budget-actual/10 p-1 text-right text-xs tabular-nums"
                  >
                    {monthlyTotals.actual[m] ?? 0}
                  </TableCell>
                ))}
              </TableRow>
            </Fragment>
          </TableBody>
        </Table>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-2 text-sm font-medium">区分別 予定人数の推移</p>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartDataWithTotals}>
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
                value: '人',
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
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {PERSONNEL_PLAN_CATEGORIES.map((category) => (
              <Line
                key={category}
                type="monotone"
                dataKey={category}
                name={CATEGORY_LABELS[category]}
                stroke={CATEGORY_CHART_COLORS[category]}
                dot={false}
              />
            ))}
            {/* Grid下部の合計行と対応する合計人数の推移。4区分より濃い色・太線で
                全体トレンドを強調する（budget-planned=予定/budget-actual=実績の
                濃色バリエーション） */}
            <Line
              type="monotone"
              dataKey="plannedTotal"
              name="予定人数合計"
              stroke="#1e3a8a"
              strokeWidth={2.5}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="actualTotal"
              name="実績人数合計"
              stroke="#7f1d1d"
              strokeWidth={2.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
