export type ArrowKeyNavigationAction =
  | { type: 'none' }
  | { type: 'suppress' }
  | { type: 'navigate-row'; direction: -1 | 1 }

/**
 * アサイン編集グリッド（月次列）の担当者行における上下キー操作を判定する
 * 。AG Gridの`suppressKeyboardEvent`から呼び出す前提の
 * 純粋関数として切り出し、AG Grid依存なしに単体テストできるようにする。
 *
 * - 担当者行以外、またはArrowUp/ArrowDown以外のキーは対象外（none、AG Gridのデフォルト動作）
 * - 担当者行かつ非編集時は、従来通りAG Gridのデフォルト処理を抑制する（suppress、既存動作維持）
 * - 担当者行かつ編集中は、行移動アクションを返す（navigate-row）。編集中は既定では
 *   上下キーが行移動にならない（AG Gridの既定のセル編集の挙動）ため、呼び出し側で
 *   明示的にフォーカス移動を行う必要がある。
 *
 * 担当者セル自体（memberId列、候補リストを持つ`MemberCellEditor`）にはこの関数を
 * 適用しない設計とする（列定義側でsuppressKeyboardEventを設定しない）。これにより、
 * 候補リストが開いている間の上下キー操作（ハイライト移動）は`MemberCellEditor`内部の
 * イベントハンドラがそのまま処理し、本関数とは競合しない。
 */
export function resolveMemberRowArrowKeyAction(
  key: string,
  rowType: string | undefined,
  isEditing: boolean,
): ArrowKeyNavigationAction {
  if (key !== 'ArrowUp' && key !== 'ArrowDown') {
    return { type: 'none' }
  }
  if (rowType !== 'member') {
    return { type: 'none' }
  }
  if (!isEditing) {
    return { type: 'suppress' }
  }
  return { type: 'navigate-row', direction: key === 'ArrowUp' ? -1 : 1 }
}
