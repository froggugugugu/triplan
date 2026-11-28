import { describe, expect, it } from 'vitest'
import { type PinnedColumnInfo, selectColumnsToUnpin } from '../pinned-columns'

// WBSグリッドの実際の列幅（ProjectTreeGridの列定義）。左940 + 右130 = 1070
const WBS_COLUMNS: PinnedColumnInfo[] = [
  { id: 'id', pinned: 'left', width: 40 },
  { id: 'name', pinned: 'left', width: 300 },
  { id: 'level', pinned: 'left', width: 90 },
  { id: 'id_1', pinned: 'left', width: 110 },
  { id: 'effortSubtotal', pinned: 'left', width: 140 },
  { id: 'progress', pinned: 'left', width: 120 },
  { id: 'assignee', pinned: 'left', width: 140 },
  { id: 'effort_a', pinned: null, width: 150 },
  { id: 'externalTaskId', pinned: 'right', width: 130 },
]
const ORDER = [
  'level',
  'effortSubtotal',
  'progress',
  'id_1',
  'assignee',
  'externalTaskId',
]

describe('selectColumnsToUnpin', () => {
  it('固定列が収まるなら何も外さない', () => {
    expect(selectColumnsToUnpin(WBS_COLUMNS, 1400, ORDER)).toEqual([])
  })

  it('1280px画面（表示幅1040）ではレベル列だけ外し、担当者と連携は固定のまま残す', () => {
    // 1070 - (1040 - 50) = 80px不足。レベル(90)で足りる
    expect(selectColumnsToUnpin(WBS_COLUMNS, 1040, ORDER)).toEqual(['level'])
  })

  it('不足が大きいときは優先順に必要なだけ外す', () => {
    // 1070 - (700 - 50) = 420 → レベル90 + 小計140 + 進捗120 = 350 では足りず、操作110まで
    expect(selectColumnsToUnpin(WBS_COLUMNS, 700, ORDER)).toEqual([
      'level',
      'effortSubtotal',
      'progress',
      'id_1',
    ])
  })

  it('反証: 優先順に載せていない列（ドラッグハンドル・タスク名）はどれだけ狭くても外さない', () => {
    const result = selectColumnsToUnpin(WBS_COLUMNS, 100, ORDER)
    expect(result).toEqual(ORDER)
    expect(result).not.toContain('id')
    expect(result).not.toContain('name')
  })

  it('反証: 優先順にあっても固定されていない列は外す対象にしない', () => {
    const unpinnedLevel = WBS_COLUMNS.map((c) =>
      c.id === 'level' ? { ...c, pinned: null } : c,
    )
    // 固定合計は980 → 980 - (1000 - 50) = 30px不足。レベルは非固定なので小計を外す
    expect(selectColumnsToUnpin(unpinnedLevel, 1000, ORDER)).toEqual([
      'effortSubtotal',
    ])
  })

  it('境界: 不足が0なら外さず、1pxでも足りなければ外す（AG Gridの既定判定と同じ）', () => {
    // 1070 = 1120 - 50 → 不足0。AG Gridも「不足 > 0」の間だけ外す
    expect(selectColumnsToUnpin(WBS_COLUMNS, 1120, ORDER)).toEqual([])
    expect(selectColumnsToUnpin(WBS_COLUMNS, 1119, ORDER)).toEqual(['level'])
  })

  it('境界: 列が空なら何も外さない', () => {
    expect(selectColumnsToUnpin([], 0, ORDER)).toEqual([])
  })
})
