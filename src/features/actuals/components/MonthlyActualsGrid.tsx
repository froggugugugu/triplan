import type {
  CellValueChangedEvent,
  ColDef,
  ICellRendererParams,
} from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { Undo2 } from 'lucide-react'
import { memo, useCallback, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { gridTheme } from '@/shared/ag-grid-theme'
import { toast } from '@/shared/hooks/use-toast'
import { parseAllocationInput } from '@/shared/utils/allocation-input-utils'
import type {
  MonthlyActualsDetailRow,
  MonthlyActualsMemberRow,
  MonthlyActualsRow,
} from '../utils/monthly-actuals-utils'

ModuleRegistry.registerModules([AllCommunityModule])

interface MonthlyActualsGridProps {
  rows: MonthlyActualsRow[]
  /** 実績の更新。value=nullは明示的なクリア（計画どおりへ戻す） */
  onActualChange: (assignmentId: string, value: number | null) => void
  /** 締め済み月の表示（P1-b）。実績セルの編集とクリアボタンを無効化する */
  readOnly?: boolean
}

const STATUS_LABELS: Record<MonthlyActualsDetailRow['status'], string> = {
  planned: '計画どおり',
  overridden: '上書き',
  zeroActual: '上書き（実働0）',
}

/**
 * 実績セルの表示（DESIGN §4.2）:
 * - キー欠落（計画どおり）= 計画値を括弧＋薄色のゴースト表示
 * - 明示入力（0含む）= 通常色＋実績背景。0.00も実値として表示する
 * 状態の区別は色だけに依存させない（括弧表記＋状態列を併用）
 */
const ActualCellRenderer = memo(function ActualCellRenderer(
  props: ICellRendererParams<MonthlyActualsRow>,
) {
  const data = props.data
  if (!data || data.kind !== 'detail') return null
  if (data.actual === undefined) {
    return (
      <span className="text-muted-foreground tabular-nums">
        ({data.planned.toFixed(2)})
      </span>
    )
  }
  return <span className="tabular-nums">{data.actual.toFixed(2)}</span>
})

const VarianceCellRenderer = memo(function VarianceCellRenderer(
  props: ICellRendererParams<MonthlyActualsRow>,
) {
  const data = props.data
  if (!data || data.kind !== 'detail') return null
  const v = data.variance
  if (Math.abs(v) < 0.005) {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <span
      className={cn(
        'tabular-nums',
        Math.abs(v) >= 0.25 && 'font-medium text-amber-600 dark:text-amber-400',
      )}
    >
      {v > 0 ? '+' : ''}
      {v.toFixed(2)}
    </span>
  )
})

const StatusCellRenderer = memo(function StatusCellRenderer(
  props: ICellRendererParams<MonthlyActualsRow>,
) {
  const data = props.data
  if (!data || data.kind !== 'detail') return null
  const context = props.context as {
    onClear: (assignmentId: string) => void
    readOnly: boolean
  }
  return (
    <div className="flex h-full items-center gap-1">
      <span
        className={cn(
          'text-xs',
          data.status === 'planned' && 'text-muted-foreground',
        )}
      >
        {STATUS_LABELS[data.status]}
      </span>
      {data.actual !== undefined && !context.readOnly && (
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:bg-gray-200 hover:text-foreground dark:hover:bg-gray-600"
          onClick={() => context.onClear(data.assignmentId)}
          title="計画どおりに戻す（明示入力をクリア）"
        >
          <Undo2 className="h-3 w-3" />
        </button>
      )}
    </div>
  )
})

/** 担当者グループ行（フルワイズ行）。月合計と稼働率上限の超過警告を表示する */
const MemberFullWidthRenderer = memo(function MemberFullWidthRenderer(
  props: ICellRendererParams<MonthlyActualsRow>,
) {
  const data = props.data as MonthlyActualsMemberRow | undefined
  if (!data || data.kind !== 'member') return null
  return (
    <div className="flex h-full items-center justify-between bg-muted/60 px-3">
      <span className="text-sm font-medium">
        {data.memberName}
        {data.role ? `（${data.role}）` : ''}
      </span>
      <span
        className={cn(
          'text-xs tabular-nums',
          data.isOverCapacity
            ? 'font-medium text-destructive'
            : 'text-muted-foreground',
        )}
      >
        実績合計 {data.actualTotal.toFixed(2)} ／ 上限{' '}
        {data.capacityRatio.toFixed(2)}
        {data.isOverCapacity ? ' ⚠ 超過' : ''}
      </span>
    </div>
  )
})

export function MonthlyActualsGrid({
  rows,
  onActualChange,
  readOnly = false,
}: MonthlyActualsGridProps) {
  const handleClear = useCallback(
    (assignmentId: string) => {
      onActualChange(assignmentId, null)
    },
    [onActualChange],
  )

  const context = useMemo(
    () => ({ onClear: handleClear, readOnly }),
    [handleClear, readOnly],
  )

  const onCellValueChanged = useCallback(
    (event: CellValueChangedEvent<MonthlyActualsRow>) => {
      const data = event.data
      if (!data || data.kind !== 'detail') return
      // 値の検証・row dataへの反映はvalueSetter側で完結済み。ここでは確定値を
      // ストアへ保存するのみ（event.newValueはvalueGetter経由で再解決された文字列に
      // なるため使わない＝valueSetterがdataへ書き込まないとnewValueが常に空文字に
      // なる、というAG Grid v33の挙動をE2Eで反証・発見した）
      onActualChange(data.assignmentId, data.actual ?? null)
    },
    [onActualChange],
  )

  const columnDefs = useMemo<ColDef<MonthlyActualsRow>[]>(
    () => [
      {
        headerName: 'プロジェクト',
        field: 'projectLabel',
        flex: 2,
        minWidth: 200,
        editable: false,
      },
      {
        headerName: 'タスク',
        field: 'taskName',
        flex: 2,
        minWidth: 160,
        editable: false,
      },
      {
        headerName: '計画（人月）',
        field: 'planned',
        width: 120,
        editable: false,
        cellClass: 'text-right tabular-nums',
        valueFormatter: (p) =>
          p.data?.kind === 'detail' ? (p.value as number).toFixed(2) : '',
      },
      {
        headerName: '実績（人月）',
        field: 'actual',
        width: 130,
        editable: (p) => !readOnly && p.data?.kind === 'detail',
        cellRenderer: ActualCellRenderer,
        cellClass: 'text-right bg-budget-actual/10',
        // 編集開始時は空欄（ゴーストの計画値をプリフィルしない。DESIGN §4.2）
        valueGetter: (p) =>
          p.data?.kind === 'detail' && p.data.actual !== undefined
            ? String(p.data.actual)
            : '',
        valueSetter: (p) => {
          if (p.data.kind !== 'detail') return false
          const raw = String(p.newValue ?? '').trim()
          // 空欄でEnter＝クリア（計画どおりへ戻す）。DESIGN §4.2
          if (raw === '') {
            p.data.actual = undefined
            return true
          }
          // 実績は上限でブロックしない（DESIGN §4.0 原則5）ためmaxを指定しない
          const parsed = parseAllocationInput(raw)
          if (parsed === null) {
            toast({
              title: '0以上の数値を入力してください',
              variant: 'destructive',
            })
            // false=変更なし扱い。イベントは発火せず表示も元のまま
            return false
          }
          p.data.actual = parsed
          return true
        },
      },
      {
        headerName: '乖離',
        field: 'variance',
        width: 90,
        editable: false,
        cellClass: 'text-right',
        cellRenderer: VarianceCellRenderer,
      },
      {
        headerName: '状態',
        colId: 'status',
        width: 140,
        editable: false,
        cellRenderer: StatusCellRenderer,
      },
    ],
    [readOnly],
  )

  const defaultColDef = useMemo<ColDef>(
    () => ({ resizable: true, sortable: false, filter: false }),
    [],
  )

  const getRowId = useCallback(
    (params: { data: MonthlyActualsRow }) => params.data.id,
    [],
  )

  const isFullWidthRow = useCallback(
    (params: { rowNode: { data?: MonthlyActualsRow } }) =>
      params.rowNode.data?.kind === 'member',
    [],
  )

  return (
    <div style={{ height: Math.min(640, 80 + rows.length * 40) }}>
      <AgGridReact<MonthlyActualsRow>
        theme={gridTheme}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        context={context}
        getRowId={getRowId}
        isFullWidthRow={isFullWidthRow}
        fullWidthCellRenderer={MemberFullWidthRenderer}
        onCellValueChanged={onCellValueChanged}
        rowHeight={40}
        headerHeight={40}
        animateRows={false}
        domLayout="normal"
      />
    </div>
  )
}
