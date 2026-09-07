import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Project } from '@/shared/types'
import {
  useAppStore,
  useMembersStore,
  useProjectsStore,
  useTeamStore,
} from '@/stores'
import { GettingStartedCard } from '../GettingStartedCard'

function makeProject(): Project {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    code: 'P001',
    name: '既存案件',
    parentId: null,
    level: 0,
    status: 'active',
    confidence: null,
    completed: false,
    createdAt: now,
    updatedAt: now,
  }
}

describe('GettingStartedCard', () => {
  beforeEach(() => {
    localStorage.clear()
    useAppStore.setState({
      setupCardDismissed: false,
      demoDataActive: false,
      isSetupWizardOpen: false,
    })
    useProjectsStore.setState({ projects: [] })
    useMembersStore.setState({ members: [] })
    useTeamStore.setState({ divisions: [], sections: [] })
  })

  afterEach(() => cleanup())

  it('業務データが空のとき「はじめに」カードとウィザード開始ボタンを表示する', () => {
    render(<GettingStartedCard />)
    expect(screen.getByText('ようこそ！まずは初期設定から')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '初期設定ウィザードを開始' }),
    ).toBeInTheDocument()
  })

  it('反証: 業務データが1件でもあれば表示しない（既存ユーザーの邪魔をしない）', () => {
    useProjectsStore.setState({ projects: [makeProject()] })
    render(<GettingStartedCard />)
    expect(
      screen.queryByText('ようこそ！まずは初期設定から'),
    ).not.toBeInTheDocument()
  })

  it('開始ボタンでopenSetupWizardが呼ばれウィザードが開く状態になる', async () => {
    const user = userEvent.setup()
    render(<GettingStartedCard />)
    await user.click(
      screen.getByRole('button', { name: '初期設定ウィザードを開始' }),
    )
    expect(useAppStore.getState().isSetupWizardOpen).toBe(true)
  })

  it('閉じるとsetupCardDismissedが永続化され、以降は空データでも表示しない', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<GettingStartedCard />)
    await user.click(
      screen.getByRole('button', { name: 'はじめにカードを閉じる' }),
    )
    expect(useAppStore.getState().setupCardDismissed).toBe(true)
    unmount()

    render(<GettingStartedCard />)
    expect(
      screen.queryByText('ようこそ！まずは初期設定から'),
    ).not.toBeInTheDocument()
  })

  it('デモ試用中はデータがあっても表示され、「本番データへ切り替える」ラベルになる', () => {
    useAppStore.setState({ demoDataActive: true })
    useProjectsStore.setState({ projects: [makeProject()] })
    render(<GettingStartedCard />)
    expect(screen.getByText('デモデータで試用中です')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '本番データへ切り替える' }),
    ).toBeInTheDocument()
  })

  it('反証: デモ試用中でも閉じた後は表示しない（切り替えは設定ポップオーバーから可能）', () => {
    useAppStore.setState({ demoDataActive: true, setupCardDismissed: true })
    render(<GettingStartedCard />)
    expect(screen.queryByText('デモデータで試用中です')).not.toBeInTheDocument()
  })
})
