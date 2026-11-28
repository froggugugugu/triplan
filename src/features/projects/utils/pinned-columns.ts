/**
 * 固定列が表示幅に収まらないときに、どの列の固定を外すかを決める。
 *
 * AG Gridの既定は右固定から先に外すため、WBSの「連携」列（右端固定）が
 * 1280px程度の画面で真っ先に消えてしまう。ここでは呼び出し側が決めた優先順で外す。
 * 優先順に載せていない列（タスク名など）は外さない。
 */
export interface PinnedColumnInfo {
  id: string
  pinned: 'left' | 'right' | null
  width: number
}

/** AG Gridが固定列の収まりを判定するときに表示幅から差し引く余白（px） */
const AG_GRID_PINNED_MARGIN = 50

export function selectColumnsToUnpin(
  columns: readonly PinnedColumnInfo[],
  viewportWidth: number,
  unpinOrder: readonly string[],
): string[] {
  const pinned = columns.filter((c) => c.pinned !== null)
  const totalPinned = pinned.reduce((sum, c) => sum + c.width, 0)
  let shortage = totalPinned - (viewportWidth - AG_GRID_PINNED_MARGIN)

  const removed: string[] = []
  for (const id of unpinOrder) {
    if (shortage <= 0) break
    const column = pinned.find((c) => c.id === id)
    if (!column) continue
    removed.push(column.id)
    shortage -= column.width
  }
  return removed
}
