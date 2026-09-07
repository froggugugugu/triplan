import type {
  CellValueChangedEvent,
  ColDef,
  ICellRendererParams,
  ValueSetterParams,
} from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { useCallback, useMemo } from 'react'
import { gridTheme } from '@/shared/ag-grid-theme'
import { manYenFormatter } from '@/shared/utils/budget-utils'
import { useBudgetStore } from '@/stores'
import {
  getCalendarMonthLabel,
  getFiscalYearMonthKeys,
} from '../utils/expense-budget-utils'

ModuleRegistry.registerModules([AllCommunityModule])

// ヘッダー(48px) + 12ヶ月分の行(42px×12) + 余白。12ヶ月分をスクロールなしで表示できる高さを確保する
const GRID_HEIGHT = 48 + 42 * 12 + 20

interface SaasActualGridProps {
  contractId: string
  fiscalYear: number
  startMonth: number
}

interface SaasActualRow {
  monthKey: string
  monthLabel: string
  actualAmount: number | null
}

function ActualAmountRenderer(props: ICellRendererParams<SaasActualRow>) {
  if (!props.data) return null
  const value = props.data.actualAmount
  if (value === null) {
    return <span className="text-muted-foreground">未記録</span>
  }
  return <span>{manYenFormatter.format(value)}</span>
}

/**
 * SaaS契約の月次実績入力グリッド（AiUsageGridと同様のパターン）。
 * amountHistory（契約金額改定履歴）とは独立したmonthlyActualsを扱う。
 */
export function SaasActualGrid({
  contractId,
  fiscalYear,
  startMonth,
}: SaasActualGridProps) {
  const saasContracts = useBudgetStore((s) => s.saasContracts)
  const setSaasContractActual = useBudgetStore((s) => s.setSaasContractActual)

  const contract = saasContracts.find((c) => c.id === contractId)

  const rowData = useMemo<SaasActualRow[]>(() => {
    const monthKeys = getFiscalYearMonthKeys(fiscalYear, startMonth)
    const monthlyActuals = contract?.monthlyActuals ?? {}
    return monthKeys.map((monthKey) => ({
      monthKey,
      monthLabel: getCalendarMonthLabel(monthKey),
      actualAmount: monthlyActuals[monthKey] ?? null,
    }))
  }, [contract, fiscalYear, startMonth])

  const columnDefs = useMemo<ColDef<SaasActualRow>[]>(
    () => [
      {
        field: 'monthLabel',
        headerName: '月',
        pinned: 'left',
        width: 100,
        editable: false,
      },
      {
        field: 'actualAmount',
        headerName: '実績額（万円）',
        editable: true,
        cellClass: 'text-right tabular-nums',
        cellRenderer: ActualAmountRenderer,
        valueSetter: (params: ValueSetterParams<SaasActualRow>) => {
          if (!params.data) return false
          const raw = params.newValue
          params.data.actualAmount =
            raw === '' || raw === null || raw === undefined ? null : Number(raw)
          return true
        },
      },
    ],
    [],
  )

  const handleCellValueChanged = useCallback(
    (event: CellValueChangedEvent<SaasActualRow>) => {
      if (!event.data) return
      const { monthKey, actualAmount } = event.data
      // actualAmount === null の場合は当該月のキーを削除して「未記録」に戻す
      setSaasContractActual(contractId, monthKey, actualAmount)
    },
    [contractId, setSaasContractActual],
  )

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        年間契約で支払月に年額をまとめて払う場合は、支払い月に実績年額を入力してください。
      </p>
      <div style={{ height: GRID_HEIGHT }}>
        <AgGridReact<SaasActualRow>
          theme={gridTheme}
          rowData={rowData}
          columnDefs={columnDefs}
          getRowId={(params) => params.data.monthKey}
          onCellValueChanged={handleCellValueChanged}
        />
      </div>
    </div>
  )
}
