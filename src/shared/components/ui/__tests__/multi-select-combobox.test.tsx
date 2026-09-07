import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MultiSelectCombobox } from '@/shared/components/ui/multi-select-combobox'

afterEach(() => cleanup())

const options = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
]

describe('MultiSelectCombobox', () => {
  it('未選択時はplaceholderを表示する', () => {
    render(
      <MultiSelectCombobox
        values={[]}
        onValuesChange={() => {}}
        options={options}
        placeholder="Pick fruits"
      />,
    )
    expect(screen.getByText('Pick fruits')).toBeDefined()
  })

  it('選択済み項目がBadgeのチップとして表示される', () => {
    render(
      <MultiSelectCombobox
        values={['apple', 'banana']}
        onValuesChange={() => {}}
        options={options}
      />,
    )
    expect(screen.getByText('Apple')).toBeDefined()
    expect(screen.getByText('Banana')).toBeDefined()
  })

  it('未選択の項目を選択するとonValuesChangeが選択後の配列で呼ばれる', () => {
    const onChange = vi.fn()
    render(
      <MultiSelectCombobox
        values={['apple']}
        onValuesChange={onChange}
        options={options}
      />,
    )
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByText('Cherry'))
    expect(onChange).toHaveBeenCalledWith(['apple', 'cherry'])
  })

  it('選択済みチップの×クリックで解除され、解除後の配列でonValuesChangeが呼ばれる', () => {
    const onChange = vi.fn()
    render(
      <MultiSelectCombobox
        values={['apple', 'banana']}
        onValuesChange={onChange}
        options={options}
      />,
    )
    const appleChip = screen.getByText('Apple').closest('[data-testid="chip"]')
    expect(appleChip).toBeTruthy()
    // biome-ignore lint/style/noNonNullAssertion: 直前でtruthyを検証済み
    fireEvent.click(appleChip!)
    expect(onChange).toHaveBeenCalledWith(['banana'])
  })

  it('全選択済みの場合はドロップダウン内の選択肢がすべてチェック済み表示になる', () => {
    render(
      <MultiSelectCombobox
        values={['apple', 'banana', 'cherry']}
        onValuesChange={() => {}}
        options={options}
      />,
    )
    fireEvent.click(screen.getByRole('combobox'))
    const checkedItems = document.querySelectorAll('[data-checked="true"]')
    expect(checkedItems).toHaveLength(3)
  })

  it('0件のoptionsでもクラッシュせずemptyMessageを表示する', () => {
    render(
      <MultiSelectCombobox
        values={[]}
        onValuesChange={() => {}}
        options={[]}
        emptyMessage="No items"
      />,
    )
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getByText('No items')).toBeDefined()
  })
})
