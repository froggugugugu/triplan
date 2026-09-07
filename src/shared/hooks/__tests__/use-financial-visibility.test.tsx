import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from '@/shared/types'
import { useAppStore } from '@/stores/app-store'
import { useAuthStore } from '@/stores/auth-store'
import { useCanViewFinancials } from '../use-financial-visibility'

function buildUser(role: AuthUser['role']): AuthUser {
  return {
    id: crypto.randomUUID(),
    email: 'user@example.com',
    name: 'テストユーザー',
    role,
  }
}

describe('useCanViewFinancials', () => {
  beforeEach(() => {
    useAppStore.setState({ showFinancials: true })
    useAuthStore.setState({ currentUser: null })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('localモード（認証なし）', () => {
    it('既定（showFinancials=true）ではtrueを返す', () => {
      vi.stubEnv('VITE_STORAGE_MODE', '')
      const { result } = renderHook(() => useCanViewFinancials())
      expect(result.current).toBe(true)
    })

    it('表示トグルOFF（showFinancials=false）ではfalseを返す', () => {
      vi.stubEnv('VITE_STORAGE_MODE', 'local')
      useAppStore.setState({ showFinancials: false })
      const { result } = renderHook(() => useCanViewFinancials())
      expect(result.current).toBe(false)
    })

    // 反証: localモードではロール（auth-store）の状態に影響されない
    it('反証: localモードではauth-storeのユーザーに関わらずトグルが優先される', () => {
      vi.stubEnv('VITE_STORAGE_MODE', 'local')
      useAuthStore.setState({ currentUser: buildUser('partner') })
      const { result } = renderHook(() => useCanViewFinancials())
      expect(result.current).toBe(true)
    })
  })

  describe('postgresモード（権限ベース）', () => {
    it.each(['admin', 'manager', 'editor', 'viewer'] as const)(
      '%sロールはfinancials:readを持つためtrueを返す',
      (role) => {
        vi.stubEnv('VITE_STORAGE_MODE', 'postgres')
        useAuthStore.setState({ currentUser: buildUser(role) })
        const { result } = renderHook(() => useCanViewFinancials())
        expect(result.current).toBe(true)
      },
    )

    // 反証: 協力会社ロール（partner）には金額を表示しない（要求#2の核心）
    it('反証: partnerロールはfalseを返す', () => {
      vi.stubEnv('VITE_STORAGE_MODE', 'postgres')
      useAuthStore.setState({ currentUser: buildUser('partner') })
      const { result } = renderHook(() => useCanViewFinancials())
      expect(result.current).toBe(false)
    })

    // 反証: 未ログインはフェイルクローズ
    it('反証: 未ログイン（currentUser=null）はfalseを返す', () => {
      vi.stubEnv('VITE_STORAGE_MODE', 'postgres')
      const { result } = renderHook(() => useCanViewFinancials())
      expect(result.current).toBe(false)
    })

    // 反証: postgresモードではlocalモードの表示トグルは効かない
    // （partnerがトグルで金額を見られてしまう抜け道を作らない）
    it('反証: showFinancials=trueでもpartnerロールならfalseを返す', () => {
      vi.stubEnv('VITE_STORAGE_MODE', 'postgres')
      useAppStore.setState({ showFinancials: true })
      useAuthStore.setState({ currentUser: buildUser('partner') })
      const { result } = renderHook(() => useCanViewFinancials())
      expect(result.current).toBe(false)
    })
  })
})
