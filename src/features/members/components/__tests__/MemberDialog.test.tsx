import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Member } from '@/shared/types'
import {
  useCompaniesStore,
  useMembersStore,
  useTeamStore,
  useTechTagsStore,
} from '@/stores'
import { MemberDialog } from '../MemberDialog'

// Mock stores
vi.mock('@/stores', () => ({
  useMembersStore: vi.fn(),
  useTeamStore: vi.fn(),
  useTechTagsStore: vi.fn(),
  useCompaniesStore: vi.fn(),
}))

// Mock toast
vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}))

/**
 * 今日の日付を YYYY-MM-DD 形式で取得（テスト用）
 */
function getTodayDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

describe('MemberDialog', () => {
  const mockAddMember = vi.fn()
  const mockUpdateMember = vi.fn()
  const mockGetRoles = vi.fn(() => ['エンジニア', 'デザイナー'])
  const mockLoadTechTags = vi.fn()
  const mockLoadCompanies = vi.fn()
  const mockOnOpenChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup store mocks
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useMembersStore).mockImplementation((selector: any) => {
      const state = {
        addMember: mockAddMember,
        updateMember: mockUpdateMember,
        getRoles: mockGetRoles,
      }
      return selector(state)
    })

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useTeamStore).mockImplementation((selector: any) => {
      const state = {
        divisions: [],
        sections: [],
      }
      return selector(state)
    })

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useTechTagsStore).mockImplementation((selector: any) => {
      const state = {
        techTags: [],
        techTagCategories: [],
        techTagSubCategories: [],
        loadTechTags: mockLoadTechTags,
      }
      return selector(state)
    })

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useCompaniesStore).mockImplementation((selector: any) => {
      const state = {
        companies: [],
        loadCompanies: mockLoadCompanies,
      }
      return selector(state)
    })
  })

  describe('新規作成時のデフォルト値', () => {
    test('開始日が今日の日付になる', async () => {
      render(
        <MemberDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          member={null}
        />,
      )

      const startDateInput = screen.getByLabelText('開始日') as HTMLInputElement
      const expectedDate = getTodayDate()

      await waitFor(() => {
        expect(startDateInput.value).toBe(expectedDate)
      })
    })

    test('終了日が空である', async () => {
      render(
        <MemberDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          member={null}
        />,
      )

      const endDateInput = screen.getByLabelText('終了日') as HTMLInputElement

      await waitFor(() => {
        expect(endDateInput.value).toBe('')
      })
    })
  })

  describe('編集時の既存値維持', () => {
    const existingMember: Member = {
      id: 'test-id-1',
      name: '山田太郎',
      sectionId: null,
      role: 'エンジニア',
      isActive: true,
      techTagIds: [],
      startDate: '2024-04-01',
      endDate: '2025-03-31',
      unitPriceHistory: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    test('既存の開始日が正しく表示される', async () => {
      render(
        <MemberDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          member={existingMember}
        />,
      )

      const startDateInput = screen.getByLabelText('開始日') as HTMLInputElement

      await waitFor(() => {
        expect(startDateInput.value).toBe('2024-04-01')
      })
    })

    test('既存の終了日が正しく表示される', async () => {
      render(
        <MemberDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          member={existingMember}
        />,
      )

      const endDateInput = screen.getByLabelText('終了日') as HTMLInputElement

      await waitFor(() => {
        expect(endDateInput.value).toBe('2025-03-31')
      })
    })

    test('startDateがnullの既存メンバーは今日の日付になる', async () => {
      const memberWithoutStartDate: Member = {
        ...existingMember,
        startDate: null,
      }

      render(
        <MemberDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          member={memberWithoutStartDate}
        />,
      )

      const startDateInput = screen.getByLabelText('開始日') as HTMLInputElement
      const expectedDate = getTodayDate()

      await waitFor(() => {
        expect(startDateInput.value).toBe(expectedDate)
      })
    })
  })

  describe('フォーム送信', () => {
    test('新規作成時、startDate/endDateが正しく送信される', async () => {
      const user = userEvent.setup()

      render(
        <MemberDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          member={null}
        />,
      )

      // フォーム入力
      await user.type(screen.getByLabelText('氏名'), '田中花子')
      await user.type(screen.getByLabelText('役割'), 'デザイナー')

      // 開始日・終了日はデフォルト値を使用（変更しない）
      const startDateInput = screen.getByLabelText('開始日') as HTMLInputElement
      const todayDate = getTodayDate()
      expect(startDateInput.value).toBe(todayDate)

      // 送信
      await user.click(screen.getByRole('button', { name: '追加' }))

      await waitFor(() => {
        expect(mockAddMember).toHaveBeenCalledWith(
          expect.objectContaining({
            name: '田中花子',
            role: 'デザイナー',
            startDate: todayDate,
            endDate: null,
            unitPriceHistory: [],
          }),
        )
      })
    })

    test('終了日を入力した場合、正しく送信される', async () => {
      const user = userEvent.setup()

      render(
        <MemberDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          member={null}
        />,
      )

      await user.type(screen.getByLabelText('氏名'), '佐藤次郎')
      await user.type(screen.getByLabelText('役割'), 'PM')

      // 終了日を設定（今日以降の日付にする）
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 365) // 1年後
      const futureDateStr = futureDate.toISOString().split('T')[0] ?? ''

      const endDateInput = screen.getByLabelText('終了日')
      await user.clear(endDateInput)
      await user.type(endDateInput, futureDateStr)

      await user.click(screen.getByRole('button', { name: '追加' }))

      await waitFor(() => {
        expect(mockAddMember).toHaveBeenCalledWith(
          expect.objectContaining({
            name: '佐藤次郎',
            endDate: futureDateStr,
          }),
        )
      })
    })

    test('編集時、startDate/endDateが正しく送信される', async () => {
      const user = userEvent.setup()
      const existingMember: Member = {
        id: 'test-id-2',
        name: '鈴木一郎',
        sectionId: null,
        role: 'エンジニア',
        isActive: true,
        techTagIds: [],
        startDate: '2024-01-15',
        endDate: null,
        unitPriceHistory: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      render(
        <MemberDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          member={existingMember}
        />,
      )

      // 開始日を変更
      const startDateInput = screen.getByLabelText('開始日')
      await user.clear(startDateInput)
      await user.type(startDateInput, '2024-02-01')

      await user.click(screen.getByRole('button', { name: '更新' }))

      await waitFor(() => {
        expect(mockUpdateMember).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'test-id-2',
            startDate: '2024-02-01',
            endDate: null,
          }),
        )
      })
    })

    test('空文字の日付はnullとして送信される', async () => {
      const user = userEvent.setup()

      render(
        <MemberDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          member={null}
        />,
      )

      await user.type(screen.getByLabelText('氏名'), '高橋三郎')
      await user.type(screen.getByLabelText('役割'), 'QA')

      // 開始日をクリア
      const startDateInput = screen.getByLabelText('開始日')
      await user.clear(startDateInput)

      await user.click(screen.getByRole('button', { name: '追加' }))

      await waitFor(() => {
        expect(mockAddMember).toHaveBeenCalledWith(
          expect.objectContaining({
            name: '高橋三郎',
            startDate: null,
            endDate: null,
          }),
        )
      })
    })
  })
})
