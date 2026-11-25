import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useGridContext } from '../use-grid-context'

function makeGridRef() {
  const refreshCells = vi.fn()
  return { ref: { current: { api: { refreshCells } } }, refreshCells }
}

describe('useGridContext', () => {
  it('再レンダーしても同じオブジェクトを返す（AG Gridのcontextは初期化時だけ有効なため）', () => {
    const { ref } = makeGridRef()
    const { result, rerender } = renderHook(
      ({ value }) => useGridContext(value, ref),
      { initialProps: { value: { readOnly: false } } },
    )
    const first = result.current
    rerender({ value: { readOnly: true } })
    expect(result.current).toBe(first)
  })

  it('値が変わると中身が最新になり、セルを描き直させる', () => {
    const { ref, refreshCells } = makeGridRef()
    const onClear = vi.fn()
    const { result, rerender } = renderHook(
      ({ value }) => useGridContext(value, ref),
      { initialProps: { value: { readOnly: false, onClear } } },
    )
    refreshCells.mockClear()
    const nextOnClear = vi.fn()
    rerender({ value: { readOnly: true, onClear: nextOnClear } })

    expect(result.current.readOnly).toBe(true)
    result.current.onClear()
    expect(nextOnClear).toHaveBeenCalledTimes(1)
    expect(onClear).not.toHaveBeenCalled()
    expect(refreshCells).toHaveBeenCalledWith({ force: true })
  })

  it('反証: 同じ値（同一参照）での再レンダーではセルを描き直さない', () => {
    const { ref, refreshCells } = makeGridRef()
    const value = { readOnly: false }
    const { rerender } = renderHook(() => useGridContext(value, ref))
    refreshCells.mockClear()
    rerender()
    expect(refreshCells).not.toHaveBeenCalled()
  })

  it('境界: グリッドの準備前（apiが無い）でも落ちない', () => {
    const ref = { current: null }
    const { result, rerender } = renderHook(
      ({ value }) => useGridContext(value, ref),
      { initialProps: { value: { readOnly: false } } },
    )
    expect(() => rerender({ value: { readOnly: true } })).not.toThrow()
    expect(result.current.readOnly).toBe(true)
  })
})
