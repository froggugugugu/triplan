import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AppAlert } from '@/shared/utils/alert-utils'
import { AlertCenter } from '../AlertCenter'

afterEach(() => cleanup())

describe('AlertCenter', () => {
  it('アラートが無い場合は案内メッセージを表示する', () => {
    render(<AlertCenter alerts={[]} />)
    expect(
      screen.getByText('対応が必要なアラートはありません'),
    ).toBeInTheDocument()
  })

  it('アラートを重大度順（critical→warning→info）に表示し、件数バッジを出す', () => {
    const alerts: AppAlert[] = [
      {
        key: 'i1',
        severity: 'info',
        category: 'スキル',
        message: '情報レベル',
      },
      {
        key: 'c1',
        severity: 'critical',
        category: '納期',
        message: '重大レベル',
      },
      {
        key: 'w1',
        severity: 'warning',
        category: '予算',
        message: '警告レベル',
      },
    ]
    render(<AlertCenter alerts={alerts} />)
    expect(screen.getByText('3')).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items[0]?.textContent).toContain('重大レベル')
    expect(items[1]?.textContent).toContain('警告レベル')
    expect(items[2]?.textContent).toContain('情報レベル')
  })

  it('分類ラベルと重大度チップを表示する', () => {
    render(
      <AlertCenter
        alerts={[
          {
            key: 'c1',
            severity: 'critical',
            category: '納期',
            message: '納期超過です',
          },
        ]}
      />,
    )
    expect(screen.getByText('[納期]')).toBeInTheDocument()
    expect(screen.getByText('重大')).toBeInTheDocument()
  })
})
