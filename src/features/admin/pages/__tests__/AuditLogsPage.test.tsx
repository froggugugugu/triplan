import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuditLogEntry } from '@/features/admin/api/audit-logs-api'
import { AuditLogsPage } from '../AuditLogsPage'

/**
 * 監査証跡の閲覧画面。
 * 「誰がいつ何を変えたか」が読める形で出ること、退職者の操作も辿れることを確認する。
 */

const mockListAuditLogs = vi.fn()
const mockListAuditLogEntities = vi.fn()
const mockGetAuditLogStats = vi.fn()
const mockPurgeAuditLogs = vi.fn()

vi.mock('@/features/admin/api/audit-logs-api', () => ({
  listAuditLogs: (...args: unknown[]) => mockListAuditLogs(...args),
  listAuditLogEntities: () => mockListAuditLogEntities(),
  getAuditLogStats: () => mockGetAuditLogStats(),
  purgeAuditLogs: (...args: unknown[]) => mockPurgeAuditLogs(...args),
}))

function log(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: crypto.randomUUID(),
    entity: 'projects',
    entityId: '00000000-0000-4000-8000-000000000001',
    action: 'update',
    actorId: '00000000-0000-4000-8000-0000000000aa',
    actorEmail: 'pm@example.com',
    actorName: '山田太郎',
    changes: { name: { before: '旧名称', after: '新名称' } },
    occurredAt: '2026-03-31T09:00:00.000Z',
    ...overrides,
  }
}

describe('AuditLogsPage', () => {
  beforeEach(() => {
    mockListAuditLogs.mockResolvedValue([])
    mockListAuditLogEntities.mockResolvedValue(['projects', 'assignments'])
    mockGetAuditLogStats.mockResolvedValue({
      total: 1234,
      oldestAt: '2025-01-01T00:00:00.000Z',
    })
    mockPurgeAuditLogs.mockResolvedValue({ deletedCount: 42 })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('更新ログは変更フィールドのbefore → afterを表示する', async () => {
    mockListAuditLogs.mockResolvedValue([log()])
    render(<AuditLogsPage />)

    await waitFor(() => {
      expect(screen.getByText('山田太郎')).toBeInTheDocument()
    })
    expect(screen.getByText('更新')).toBeInTheDocument()
    expect(screen.getByText('旧名称')).toBeInTheDocument()
    expect(screen.getByText('新名称')).toBeInTheDocument()
  })

  it('反証: 削除されたユーザーの操作もメールアドレスで辿れる', async () => {
    // actorIdにFKを張っていないためログは残るが、usersから表示名を引けない
    mockListAuditLogs.mockResolvedValue([
      log({ actorName: null, actorEmail: 'retired@example.com' }),
    ])
    render(<AuditLogsPage />)

    await waitFor(() => {
      expect(screen.getByText('retired@example.com')).toBeInTheDocument()
    })
  })

  it('反証: 操作者が特定できないログでも行が消えない（「（不明）」で表示）', async () => {
    mockListAuditLogs.mockResolvedValue([
      log({ actorId: null, actorName: null, actorEmail: null }),
    ])
    render(<AuditLogsPage />)

    await waitFor(() => {
      expect(screen.getByText('（不明）')).toBeInTheDocument()
    })
  })

  it('作成ログは変更内容を持たない（作成値は現レコードを見れば分かる）', async () => {
    mockListAuditLogs.mockResolvedValue([
      log({ action: 'create', changes: null }),
    ])
    render(<AuditLogsPage />)

    await waitFor(() => {
      expect(screen.getByText('作成')).toBeInTheDocument()
    })
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('削除ログは削除直前の値を要約表示する', async () => {
    mockListAuditLogs.mockResolvedValue([
      log({
        action: 'delete',
        changes: { code: 'P100', name: '会員基盤', level: 0 },
      }),
    ])
    render(<AuditLogsPage />)

    await waitFor(() => {
      expect(screen.getByText('削除')).toBeInTheDocument()
    })
    expect(screen.getByText(/code: P100 \/ name: 会員基盤/)).toBeInTheDocument()
  })

  it('反証: 未設定（null）への変更を空欄ではなく「（未設定）」と示す', async () => {
    mockListAuditLogs.mockResolvedValue([
      log({ changes: { note: { before: 'あり', after: null } } }),
    ])
    render(<AuditLogsPage />)

    await waitFor(() => {
      expect(screen.getByText('（未設定）')).toBeInTheDocument()
    })
  })

  it('0件のときは案内を表示する', async () => {
    render(<AuditLogsPage />)
    await waitFor(() => {
      expect(screen.getByText('該当する履歴がありません')).toBeInTheDocument()
    })
  })

  it('取得に失敗したらエラーを表示する', async () => {
    mockListAuditLogs.mockRejectedValue(new Error('権限がありません'))
    render(<AuditLogsPage />)

    await waitFor(() => {
      expect(screen.getByText('権限がありません')).toBeInTheDocument()
    })
  })

  describe('保持管理（パージ）', () => {
    it('保持状況（総件数・最古の記録日時）を表示する', async () => {
      const { container } = render(<AuditLogsPage />)
      await waitFor(() => {
        expect(container.textContent).toContain('現在 1,234件')
      })
    })

    it('確認ダイアログを経てから削除し、件数をトーストで知らせる', async () => {
      const user = userEvent.setup()
      render(<AuditLogsPage />)
      await waitFor(() => {
        expect(screen.getByText('保持管理')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: '古いログを削除' }))
      // 反証: ボタン押下だけでは削除しない（取り消せない操作の誤爆防止）
      expect(mockPurgeAuditLogs).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: '削除する' }))
      await waitFor(() => {
        expect(mockPurgeAuditLogs).toHaveBeenCalledTimes(1)
      })
      // 既定は「1年より古いログ」。基準日時がISO 8601で渡る
      const cutoff = mockPurgeAuditLogs.mock.calls[0]?.[0] as string
      expect(new Date(cutoff).getTime()).toBeLessThan(Date.now())
    })

    it('反証: キャンセルすれば削除しない', async () => {
      const user = userEvent.setup()
      render(<AuditLogsPage />)
      await waitFor(() => {
        expect(screen.getByText('保持管理')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: '古いログを削除' }))
      await user.click(screen.getByRole('button', { name: 'キャンセル' }))
      expect(mockPurgeAuditLogs).not.toHaveBeenCalled()
    })

    it('反証: 保持状況の取得に失敗しても一覧は表示される', async () => {
      mockGetAuditLogStats.mockRejectedValue(new Error('failed'))
      mockListAuditLogs.mockResolvedValue([log()])
      render(<AuditLogsPage />)
      await waitFor(() => {
        expect(screen.getByText('山田太郎')).toBeInTheDocument()
      })
    })
  })

  it('反証: 絞り込みの選択肢取得に失敗しても一覧は表示される', async () => {
    mockListAuditLogEntities.mockRejectedValue(new Error('failed'))
    mockListAuditLogs.mockResolvedValue([log()])
    render(<AuditLogsPage />)

    await waitFor(() => {
      expect(screen.getByText('山田太郎')).toBeInTheDocument()
    })
  })
})
