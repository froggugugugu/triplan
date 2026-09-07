import { describe, expect, it } from 'vitest'
import { diffChangedFields } from '../diff.js'

/**
 * 監査証跡の差分抽出。
 * 「実際に値が変わったフィールドだけ」を残すのが要点で、
 * ノイズ（毎回変わるupdatedAt・送っただけで変わっていない値）を記録しない。
 */

describe('diffChangedFields', () => {
  it('値が変わったフィールドのbefore/afterを返す', () => {
    const before = { id: 'x', name: '旧名称', level: 1 }
    const patch = { name: '新名称' }
    expect(diffChangedFields(before, patch)).toEqual({
      name: { before: '旧名称', after: '新名称' },
    })
  })

  it('複数フィールドの変更をまとめて返す', () => {
    const before = { name: 'A', status: 'active', level: 1 }
    const patch = { name: 'B', status: 'completed' }
    const diff = diffChangedFields(before, patch)
    expect(Object.keys(diff ?? {}).sort()).toEqual(['name', 'status'])
  })

  describe('反証: ノイズを記録しない', () => {
    it('patchに含まれていても値が同じならフィールドごと落とす', () => {
      const before = { name: '同じ', level: 1 }
      const patch = { name: '同じ', level: 2 }
      expect(diffChangedFields(before, patch)).toEqual({
        level: { before: 1, after: 2 },
      })
    })

    it('updatedAtは常に変わるため差分から除外する', () => {
      const before = { name: 'A', updatedAt: '2025-01-01T00:00:00.000Z' }
      const patch = { name: 'A', updatedAt: '2026-01-01T00:00:00.000Z' }
      // 実質的な変更が無い更新は「変更なし」として扱う
      expect(diffChangedFields(before, patch)).toBeNull()
    })

    it('変更が1件も無ければnull（空オブジェクトを残さない）', () => {
      expect(diffChangedFields({ name: 'A' }, { name: 'A' })).toBeNull()
      expect(diffChangedFields({ name: 'A' }, {})).toBeNull()
    })

    it('patchに無いフィールドは（beforeに値があっても）差分に含めない', () => {
      const before = { name: 'A', secret: 'xxx' }
      const diff = diffChangedFields(before, { name: 'B' })
      expect(diff).not.toHaveProperty('secret')
    })
  })

  describe('値の比較', () => {
    it('オブジェクト・配列は構造で比較する（参照が違うだけでは差分にしない）', () => {
      const before = { monthlyValues: { '2025-04': 0.5 } }
      const patch = { monthlyValues: { '2025-04': 0.5 } }
      expect(diffChangedFields(before, patch)).toBeNull()
    })

    it('オブジェクトの中身が変われば差分になる', () => {
      const before = { monthlyValues: { '2025-04': 0.5 } }
      const patch = { monthlyValues: { '2025-04': 0.8 } }
      expect(diffChangedFields(before, patch)).toEqual({
        monthlyValues: {
          before: { '2025-04': 0.5 },
          after: { '2025-04': 0.8 },
        },
      })
    })

    it('反証: nullとundefinedを同一視する（未設定への変更を偽の差分にしない）', () => {
      // Drizzleは未設定列をnullで返し、クライアントのZodはoptionalをundefinedで送る
      expect(diffChangedFields({ note: null }, { note: undefined })).toBeNull()
      expect(diffChangedFields({ note: undefined }, { note: null })).toBeNull()
    })

    it('null → 値 / 値 → null は差分として残す', () => {
      expect(diffChangedFields({ note: null }, { note: 'あり' })).toEqual({
        note: { before: null, after: 'あり' },
      })
      expect(diffChangedFields({ note: 'あり' }, { note: null })).toEqual({
        note: { before: 'あり', after: null },
      })
    })

    it('反証: Dateと同時刻のISO文字列を同一視する（型の違いだけで差分にしない）', () => {
      // timestamp列はDateで返り、クライアントはISO文字列を送るため素の比較では常に差分になる
      const before = { approvedAt: new Date('2026-03-31T00:00:00.000Z') }
      const patch = { approvedAt: '2026-03-31T00:00:00.000Z' }
      expect(diffChangedFields(before, patch)).toBeNull()
    })
  })
})
