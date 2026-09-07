import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/stores/app-store'
import { useAuthStore } from '@/stores/auth-store'
import { FinancialAccessGuard } from '../FinancialAccessGuard'

describe('FinancialAccessGuard', () => {
  beforeEach(() => {
    useAppStore.setState({ showFinancials: true })
    useAuthStore.setState({ currentUser: null })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('金額の可視性がある場合はchildrenをそのまま描画する', () => {
    vi.stubEnv('VITE_STORAGE_MODE', 'local')
    render(
      <FinancialAccessGuard>
        <div>予算管理ページ本体</div>
      </FinancialAccessGuard>,
    )
    expect(screen.getByText('予算管理ページ本体')).toBeDefined()
  })

  // 反証: 可視性がない場合、ページ本体は一切描画されない（フェイルクローズ）
  it('反証: 可視性がない場合はchildrenを描画せず案内カードを表示する', () => {
    vi.stubEnv('VITE_STORAGE_MODE', 'local')
    useAppStore.setState({ showFinancials: false })
    render(
      <FinancialAccessGuard>
        <div>予算管理ページ本体</div>
      </FinancialAccessGuard>,
    )
    expect(screen.queryByText('予算管理ページ本体')).toBeNull()
    expect(screen.getByText('金額情報は非表示に設定されています')).toBeDefined()
  })

  // 反証: postgresモードのpartnerロールにも同様にフェイルクローズ
  it('反証: postgresモードのpartnerロールにはchildrenを描画しない', () => {
    vi.stubEnv('VITE_STORAGE_MODE', 'postgres')
    useAuthStore.setState({
      currentUser: {
        id: crypto.randomUUID(),
        email: 'partner@example.com',
        name: '協力会社ユーザー',
        role: 'partner',
      },
    })
    render(
      <FinancialAccessGuard>
        <div>予算管理ページ本体</div>
      </FinancialAccessGuard>,
    )
    expect(screen.queryByText('予算管理ページ本体')).toBeNull()
  })
})
