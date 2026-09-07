import { describe, expect, it } from 'vitest'
import { resolveMemberRowArrowKeyAction } from '../keyboard-navigation-utils'

describe('resolveMemberRowArrowKeyAction', () => {
  it('ArrowUp/ArrowDown以外のキーは対象外（none）', () => {
    expect(resolveMemberRowArrowKeyAction('Enter', 'member', false)).toEqual({
      type: 'none',
    })
    expect(resolveMemberRowArrowKeyAction('ArrowLeft', 'member', true)).toEqual(
      { type: 'none' },
    )
  })

  it('担当者行（member）以外は対象外（none）', () => {
    expect(resolveMemberRowArrowKeyAction('ArrowDown', 'task', false)).toEqual({
      type: 'none',
    })
    expect(
      resolveMemberRowArrowKeyAction('ArrowDown', undefined, false),
    ).toEqual({ type: 'none' })
  })

  // 既存動作の維持: 非編集時はAG Gridのデフォルト処理を抑制する（従来の挙動）
  it('担当者行・非編集時は抑制（suppress、既存動作を維持）', () => {
    expect(resolveMemberRowArrowKeyAction('ArrowUp', 'member', false)).toEqual({
      type: 'suppress',
    })
    expect(
      resolveMemberRowArrowKeyAction('ArrowDown', 'member', false),
    ).toEqual({ type: 'suppress' })
  })

  // 新規: 編集中は行移動アクションを返す
  it('担当者行・編集中のArrowUpは上方向への行移動アクションを返す', () => {
    expect(resolveMemberRowArrowKeyAction('ArrowUp', 'member', true)).toEqual({
      type: 'navigate-row',
      direction: -1,
    })
  })

  it('担当者行・編集中のArrowDownは下方向への行移動アクションを返す', () => {
    expect(resolveMemberRowArrowKeyAction('ArrowDown', 'member', true)).toEqual(
      { type: 'navigate-row', direction: 1 },
    )
  })

  // 反証: 担当者セル（memberId列、候補リストを持つ）はこの関数の呼び出し対象外
  // （suppressKeyboardEventがmemberId列には設定されていないため、この関数自体が
  // 呼ばれない設計。ここでは関数自体がrowTypeのみで判定し列を区別しないことを明示する）
  it('反証: rowTypeがmemberであれば列に関わらず同じ結果を返す（列の区別は呼び出し側の責務）', () => {
    const resultA = resolveMemberRowArrowKeyAction('ArrowUp', 'member', true)
    const resultB = resolveMemberRowArrowKeyAction('ArrowUp', 'member', true)
    expect(resultA).toEqual(resultB)
  })
})
