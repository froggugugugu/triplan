import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BaselineFreezeDialog } from '../BaselineFreezeDialog'

afterEach(() => cleanup())

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    open: true,
    onOpenChange: vi.fn(),
    projectName: 'テスト案件',
    nextVersion: 1,
    bacAmount: 1000,
    monthlyPlannedCost: { '2025-04': 300, '2025-05': 150 },
    onConfirm: vi.fn(),
    ...overrides,
  }
}

describe('BaselineFreezeDialog', () => {
  it('作成される版番号をタイトルに表示する', () => {
    render(<BaselineFreezeDialog {...baseProps({ nextVersion: 2 })} />)
    expect(
      screen.getByText(/計画を凍結（ベースライン v2）/),
    ).toBeInTheDocument()
  })

  it('BACとアサイン計画の総額・月数を表示する', () => {
    render(<BaselineFreezeDialog {...baseProps()} />)
    expect(screen.getByText('1,000.00 万円')).toBeInTheDocument()
    // 300 + 150 = 450
    expect(screen.getByText('450.00 万円')).toBeInTheDocument()
    expect(screen.getByText('2 ヶ月')).toBeInTheDocument()
  })

  it('v1の場合は凍結理由の初期値が「当初計画」になる', () => {
    render(<BaselineFreezeDialog {...baseProps({ nextVersion: 1 })} />)
    expect(screen.getByLabelText('凍結理由')).toHaveValue('当初計画')
  })

  // 再凍結（v2以降）は理由の入力を促すため、初期値を空にする
  it('v2以降は凍結理由の初期値が空になる', () => {
    render(<BaselineFreezeDialog {...baseProps({ nextVersion: 2 })} />)
    expect(screen.getByLabelText('凍結理由')).toHaveValue('')
  })

  it('凍結ボタンで入力された理由とともにonConfirmが呼ばれる', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <BaselineFreezeDialog
        {...baseProps({ nextVersion: 2, onConfirm, onOpenChange })}
      />,
    )
    await user.type(screen.getByLabelText('凍結理由'), 'CR#1 追加開発分')
    await user.click(screen.getByRole('button', { name: '凍結する' }))
    expect(onConfirm).toHaveBeenCalledWith('CR#1 追加開発分')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  // 反証: 理由が無いと履歴パネルで「なぜ再凍結したか」が追えなくなる
  it('反証: 凍結理由が空の場合は凍結ボタンが無効になる', () => {
    render(<BaselineFreezeDialog {...baseProps({ nextVersion: 2 })} />)
    expect(screen.getByRole('button', { name: '凍結する' })).toBeDisabled()
  })

  // 反証: 空白のみの入力を理由として通さない
  it('反証: 空白のみの凍結理由では凍結できない', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <BaselineFreezeDialog {...baseProps({ nextVersion: 2, onConfirm })} />,
    )
    await user.type(screen.getByLabelText('凍結理由'), '   ')
    expect(screen.getByRole('button', { name: '凍結する' })).toBeDisabled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  // アサイン計画が無いとPV曲線を引けないため、凍結前に警告する
  it('アサイン計画が1件も無い場合は警告文を表示する', () => {
    render(<BaselineFreezeDialog {...baseProps({ monthlyPlannedCost: {} })} />)
    expect(
      screen.getByText(/アサイン計画が1件も無いため、PV曲線を引けません/),
    ).toBeInTheDocument()
  })

  it('アサイン計画がある場合はBACへスケールする旨の説明を表示する', () => {
    render(<BaselineFreezeDialog {...baseProps()} />)
    expect(
      screen.getByText(/総額はBACに一致するようスケールします/),
    ).toBeInTheDocument()
  })
})
