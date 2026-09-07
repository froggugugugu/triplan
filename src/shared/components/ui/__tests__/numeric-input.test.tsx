import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NumericInput } from '@/shared/components/ui/numeric-input'

afterEach(() => cleanup())

describe('NumericInput', () => {
  it('valueをテキストとして表示する', () => {
    render(<NumericInput value={5} onValueChange={() => {}} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('5')
  })

  it('type="number"ではなくtype="text"としてレンダリングする（全角入力を妨げないため）', () => {
    render(<NumericInput value={0} onValueChange={() => {}} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.type).toBe('text')
  })

  it('入力するとonValueChangeが数値で呼ばれる', () => {
    const onValueChange = vi.fn()
    render(<NumericInput value={0} onValueChange={onValueChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '5' } })
    expect(onValueChange).toHaveBeenCalledWith(5)
  })

  it('先頭ゼロの状態から数字を入力すると先頭ゼロが除去される（例: 0→05入力で5と表示）', () => {
    render(<NumericInput value={0} onValueChange={() => {}} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '05' } })
    expect(input.value).toBe('5')
  })

  it('入力途中の"0."は先頭ゼロが除去されない（1未満の小数入力を妨げない）', () => {
    render(<NumericInput value={0} onValueChange={() => {}} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '0.' } })
    expect(input.value).toBe('0.')
  })

  it('入力途中の"0.5"は先頭ゼロが除去されずそのまま表示される', () => {
    render(<NumericInput value={0} onValueChange={() => {}} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '0.5' } })
    expect(input.value).toBe('0.5')
    expect(input.value).not.toBe('.5')
  })

  it('フォーカスアウト時に全角数字を半角に変換する', () => {
    const onValueChange = vi.fn()
    render(<NumericInput value={0} onValueChange={onValueChange} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '１２３' } })
    fireEvent.blur(input)
    expect(input.value).toBe('123')
    expect(onValueChange).toHaveBeenLastCalledWith(123)
  })

  it('フォーカスアウト時に全角小数（全角ピリオド含む）を半角に変換する', () => {
    render(<NumericInput value={0} onValueChange={() => {}} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '１２．５' } })
    fireEvent.blur(input)
    expect(input.value).toBe('12.5')
  })

  // 反証: 外部からvalueプロパティが変更された場合（フォーム全体のリセット等）に、
  // 内部表示テキストが追随して更新されるか
  it('外部からvalueが変更されると表示テキストが同期する', () => {
    const { rerender } = render(
      <NumericInput value={5} onValueChange={() => {}} />,
    )
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('5')

    rerender(<NumericInput value={99} onValueChange={() => {}} />)
    expect(input.value).toBe('99')
  })

  // 反証: 空文字列に到達した場合（全消去）、onValueChangeが0で呼ばれ、
  // かつクラッシュしないか
  it('全て削除して空文字列にするとonValueChangeが0で呼ばれる', () => {
    const onValueChange = vi.fn()
    render(<NumericInput value={5} onValueChange={onValueChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '' } })
    expect(onValueChange).toHaveBeenCalledWith(0)
  })

  // 反証: 数値として解釈できない入力（無効値）を入力した場合、
  // onValueChangeが呼ばれず（外部stateを不正値で汚染しない）、
  // 表示だけはユーザーの入力どおりに反映されるか
  it('無効な入力ではonValueChangeが呼ばれないが、表示は入力どおりになる', () => {
    const onValueChange = vi.fn()
    render(<NumericInput value={0} onValueChange={onValueChange} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'abc' } })
    expect(onValueChange).not.toHaveBeenCalled()
    expect(input.value).toBe('abc')
  })

  // 反証: フォーカスアウト時に無効な入力が残っていた場合、
  // クラッシュせず0にフォールバックして正常値へ復帯するか
  it('無効な入力のままフォーカスアウトすると0にフォールバックする', () => {
    const onValueChange = vi.fn()
    render(<NumericInput value={0} onValueChange={onValueChange} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.blur(input)
    expect(input.value).toBe('0')
    expect(onValueChange).toHaveBeenLastCalledWith(0)
  })

  // 反証: onBlurをprops経由で渡した場合、内部処理を壊さずに呼び出し元のonBlurも実行されるか
  it('props経由のonBlurも呼ばれる（内部のフォーカスアウト処理と共存する）', () => {
    const onBlur = vi.fn()
    render(<NumericInput value={0} onValueChange={() => {}} onBlur={onBlur} />)
    const input = screen.getByRole('textbox')
    fireEvent.blur(input)
    expect(onBlur).toHaveBeenCalledTimes(1)
  })

  // 反証: disabledのときにユーザー入力を受け付けないか（HTML標準挙動の確認）
  it('disabled指定時はinputが無効化される', () => {
    render(<NumericInput value={0} onValueChange={() => {}} disabled />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveProperty('disabled', true)
  })

  // 反証: 全角の先頭ゼロ（"０５"）は入力中はstripLeadingZerosの対象外
  // （半角のみを検知する実装のため）だが、フォーカスアウト時の
  // 半角変換＋再パースで最終的に正しい表示("5")へ収束するか
  it('全角の先頭ゼロ入力もフォーカスアウトで正しく5に収束する', () => {
    const onValueChange = vi.fn()
    render(<NumericInput value={0} onValueChange={onValueChange} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '０５' } })
    // 入力中は全角のまま（半角の先頭ゼロ除去は効かない）
    expect(input.value).toBe('０５')
    fireEvent.blur(input)
    expect(input.value).toBe('5')
    expect(onValueChange).toHaveBeenLastCalledWith(5)
  })

  // 反証: このアプリの数値フィールドは全て0以上の制約のため、
  // 負の値の入力はonValueChangeを発火させない（parseNumericInputの仕様どおり）
  it('負の値を入力してもonValueChangeは呼ばれない', () => {
    const onValueChange = vi.fn()
    render(<NumericInput value={0} onValueChange={onValueChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '-5' } })
    expect(onValueChange).not.toHaveBeenCalled()
  })

  // 反証: 外部からのvalue変更が小数の場合も表示テキストへ正しく反映されるか
  // （整数のケースのみのテストでは丸められて消えるバグを見逃す可能性がある）
  it('外部からvalueが小数に変更されても表示テキストが小数のまま同期する', () => {
    const { rerender } = render(
      <NumericInput value={1} onValueChange={() => {}} />,
    )
    const input = screen.getByRole('textbox') as HTMLInputElement
    rerender(<NumericInput value={1.5} onValueChange={() => {}} />)
    expect(input.value).toBe('1.5')
  })

  it('placeholderを渡すと表示される', () => {
    render(
      <NumericInput
        value={0}
        onValueChange={() => {}}
        placeholder="金額を入力"
      />,
    )
    expect(screen.getByPlaceholderText('金額を入力')).toBeDefined()
  })
})
