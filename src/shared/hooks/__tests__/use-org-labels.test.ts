import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useBudgetStore } from '@/stores/budget-store'
import { useOrgLabels } from '../use-org-labels'

afterEach(() => {
  useBudgetStore.setState({ orgLevel1Label: '部門', orgLevel2Label: '課' })
})

describe('useOrgLabels', () => {
  it('既定では「部門」「課」を返す', () => {
    const { result } = renderHook(() => useOrgLabels())
    expect(result.current).toEqual({ level1: '部門', level2: '課' })
  })

  it('設定が変わると再描画して新しい呼称を返す（購読漏れの反証）', () => {
    const { result } = renderHook(() => useOrgLabels())
    act(() => {
      useBudgetStore.setState({
        orgLevel1Label: '本部',
        orgLevel2Label: 'チーム',
      })
    })
    expect(result.current).toEqual({ level1: '本部', level2: 'チーム' })
  })
})
