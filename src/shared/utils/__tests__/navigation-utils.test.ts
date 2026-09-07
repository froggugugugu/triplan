import { describe, expect, it } from 'vitest'
import { resolveInitialProjectId } from '../navigation-utils'

describe('resolveInitialProjectId', () => {
  const isValid = (id: string) => id === 'valid-1' || id === 'valid-2'

  it('クエリパラメータが有効な場合、クエリパラメータの値を返す', () => {
    expect(resolveInitialProjectId('valid-1', null, isValid)).toBe('valid-1')
  })

  it('クエリパラメータが無く、location.stateが有効な場合、location.stateの値を返す', () => {
    expect(resolveInitialProjectId(null, 'valid-2', isValid)).toBe('valid-2')
  })

  it('クエリパラメータとlocation.stateが両方無い場合、空文字を返す', () => {
    expect(resolveInitialProjectId(null, null, isValid)).toBe('')
  })

  // 反証: クエリパラメータとlocation.stateが両方存在し異なる値の場合、クエリパラメータが優先される
  it('クエリパラメータとlocation.stateが両方有効な場合、クエリパラメータが優先される', () => {
    expect(resolveInitialProjectId('valid-1', 'valid-2', isValid)).toBe(
      'valid-1',
    )
  })

  // 反証: クエリパラメータが存在するが無効な場合、location.stateにフォールバックする
  it('クエリパラメータが無効(存在しないプロジェクト等)な場合、location.stateにフォールバックする', () => {
    expect(resolveInitialProjectId('invalid', 'valid-2', isValid)).toBe(
      'valid-2',
    )
  })

  // 反証: クエリパラメータもlocation.stateも無効な場合、エラーにならず空文字にフォールバックする
  it('クエリパラメータとlocation.stateの両方が無効な場合、空文字にフォールバックする', () => {
    expect(resolveInitialProjectId('invalid', 'also-invalid', isValid)).toBe('')
  })

  it('クエリパラメータが空文字の場合、無指定として扱いlocation.stateにフォールバックする', () => {
    expect(resolveInitialProjectId('', 'valid-2', isValid)).toBe('valid-2')
  })
})
