import { type RefObject, useLayoutEffect, useState } from 'react'

interface GridRefLike {
  api?: { refreshCells: (params: { force: boolean }) => void } | null
}

/**
 * AG Gridの `context` に渡すオブジェクトを作る。
 *
 * `context` は初期化時だけ有効な設定（@initial）で、AG Grid 36 では後から別のオブジェクトを渡しても
 * セルレンダラーには反映されない（月次締め後も操作ボタンが残る、古い状態を閉じ込めたハンドラが呼ばれる）。
 * そこで常に同じオブジェクトを返して中身だけを最新値へ更新し、値が変わったらセルを描き直させる。
 *
 * `value` は呼び出し側で useMemo して渡すこと（参照が変わったときだけ描き直す）。
 */
export function useGridContext<T extends object>(
  value: T,
  gridRef: RefObject<GridRefLike | null>,
): T {
  const [context] = useState<T>(() => ({ ...value }))
  // セルレンダラーの描画より前に最新化するため、レンダー中に反映する（同一参照なので副作用は閉じている）
  Object.assign(context, value)

  useLayoutEffect(() => {
    gridRef.current?.api?.refreshCells({ force: true })
  }, [value, gridRef])

  return context
}
