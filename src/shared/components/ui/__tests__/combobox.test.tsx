import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Combobox } from '@/shared/components/ui/combobox'

afterEach(() => cleanup())

const options = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
]

describe('Combobox', () => {
  it('renders placeholder when no value selected', () => {
    render(
      <Combobox
        value=""
        onValueChange={() => {}}
        options={options}
        placeholder="Pick a fruit"
      />,
    )
    expect(screen.getByText('Pick a fruit')).toBeDefined()
  })

  it('shows selected label when value is set', () => {
    render(
      <Combobox value="banana" onValueChange={() => {}} options={options} />,
    )
    expect(screen.getByText('Banana')).toBeDefined()
  })

  it('calls onValueChange when option is selected', () => {
    const onChange = vi.fn()
    render(<Combobox value="" onValueChange={onChange} options={options} />)
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByText('Cherry'))
    expect(onChange).toHaveBeenCalledWith('cherry')
  })

  it('renders grouped options', () => {
    const groups = [
      { label: 'Fruits', options: [{ value: 'apple', label: 'Apple' }] },
      { label: 'Vegs', options: [{ value: 'carrot', label: 'Carrot' }] },
    ]
    render(<Combobox value="" onValueChange={() => {}} groups={groups} />)
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getByText('Fruits')).toBeDefined()
    expect(screen.getByText('Vegs')).toBeDefined()
    expect(screen.getByText('Apple')).toBeDefined()
    expect(screen.getByText('Carrot')).toBeDefined()
  })

  it('shows empty message when no options match filter', () => {
    render(
      <Combobox
        value=""
        onValueChange={() => {}}
        options={options}
        emptyMessage="Nothing found"
      />,
    )
    fireEvent.click(screen.getByRole('combobox'))
    const searchInput = document.querySelector(
      '[cmdk-input]',
    ) as HTMLInputElement
    expect(searchInput).toBeTruthy()
    fireEvent.change(searchInput, { target: { value: 'zzzzzzz' } })
    expect(screen.getByText('Nothing found')).toBeDefined()
  })

  it('disables button when disabled prop is set', () => {
    render(
      <Combobox value="" onValueChange={() => {}} options={options} disabled />,
    )
    const trigger = screen.getByRole('combobox')
    expect(trigger).toHaveProperty('disabled', true)
  })
})
