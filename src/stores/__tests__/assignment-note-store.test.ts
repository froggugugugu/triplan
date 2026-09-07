import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssignmentNote, AssignmentSnapshot } from '@/shared/types'
import { useAssignmentNoteStore } from '@/stores/assignment-note-store'

const mockList = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockRemove = vi.fn()

vi.mock('@/infrastructure/adapters', () => ({
  getDataAdapter: () => ({
    list: mockList,
    create: mockCreate,
    update: mockUpdate,
    remove: mockRemove,
  }),
}))

vi.mock('@/shared/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

const PRJ = '00000000-0000-4000-8000-0000000000f1'
const OTHER = '00000000-0000-4000-8000-0000000000f2'
const TASK = '00000000-0000-4000-8000-0000000000f3'
const MEM = '00000000-0000-4000-8000-0000000000f4'

function assignment(monthlyValues: Record<string, number>, projectId = PRJ) {
  return { projectId, taskId: TASK, memberId: MEM, monthlyValues }
}

describe('useAssignmentNoteStore', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
    // サーバーは確定行を返す（authorNameのスタンプを模す）
    mockCreate.mockImplementation(
      async (
        _entity: string,
        data: Record<string, unknown>,
        opts?: { id?: string },
      ) => ({
        id: opts?.id ?? 'server-id',
        ...data,
        authorName: 'サーバー太郎',
      }),
    )
    mockUpdate.mockImplementation(
      async (_entity: string, id: string, patch: Record<string, unknown>) => ({
        id,
        projectId: PRJ,
        body: '更新後',
        authorName: 'サーバー太郎',
        createdAt: '2026-01-01T00:00:00.000Z',
        ...patch,
        // サーバー時計。クライアントが送った値とは別物であることを表す
        updatedAt: '2099-01-01T00:00:00.000Z',
      }),
    )
    mockRemove.mockResolvedValue(undefined)
    useAssignmentNoteStore.setState({
      assignmentNotes: [],
      assignmentSnapshots: [],
    })
    const { toast } = await import('@/shared/hooks/use-toast')
    vi.mocked(toast).mockClear()
  })

  describe('体制メモ', () => {
    it('追加すると楽観的に反映され、確定後もidが変わらない', async () => {
      useAssignmentNoteStore.getState().addNote(PRJ, '9月から2名増員')
      const optimistic = useAssignmentNoteStore.getState().assignmentNotes[0]
      expect(optimistic?.body).toBe('9月から2名増員')
      const id = optimistic?.id

      await flushMicrotasks()
      const settled = useAssignmentNoteStore.getState().assignmentNotes[0]
      expect(settled?.id).toBe(id)
      // サーバーが確定した投稿者名が反映される
      expect(settled?.authorName).toBe('サーバー太郎')
      expect(mockCreate).toHaveBeenCalledWith(
        'assignmentNotes',
        expect.objectContaining({ projectId: PRJ, body: '9月から2名増員' }),
        { id },
      )
    })

    it('反証: 追加が失敗したら楽観的に追加した行を消す', async () => {
      mockCreate.mockRejectedValueOnce(new Error('boom'))
      useAssignmentNoteStore.getState().addNote(PRJ, '失敗するメモ')
      expect(useAssignmentNoteStore.getState().assignmentNotes).toHaveLength(1)

      await flushMicrotasks()
      expect(useAssignmentNoteStore.getState().assignmentNotes).toHaveLength(0)
      const { toast } = await import('@/shared/hooks/use-toast')
      expect(toast).toHaveBeenCalled()
    })

    it('更新はサーバー確定のupdatedAtを反映する（次回の楽観ロック期待値）', async () => {
      useAssignmentNoteStore.getState().addNote(PRJ, '初回')
      await flushMicrotasks()
      const id = useAssignmentNoteStore.getState().assignmentNotes[0]?.id ?? ''

      mockUpdate.mockClear()
      useAssignmentNoteStore.getState().updateNote(id, '更新後')
      await flushMicrotasks()

      const note = useAssignmentNoteStore.getState().assignmentNotes[0]
      expect(note?.body).toBe('更新後')
      // 反映しないと2回目の更新が古い期待値を送って412になる
      expect(note?.updatedAt).toBe('2099-01-01T00:00:00.000Z')
    })

    it('反証: 2回続けて更新でき、2回目の期待値はサーバー確定値になる', async () => {
      useAssignmentNoteStore.getState().addNote(PRJ, '初回')
      await flushMicrotasks()
      const id = useAssignmentNoteStore.getState().assignmentNotes[0]?.id ?? ''

      useAssignmentNoteStore.getState().updateNote(id, '1回目')
      await flushMicrotasks()
      mockUpdate.mockClear()
      useAssignmentNoteStore.getState().updateNote(id, '2回目')
      await flushMicrotasks()

      expect(mockUpdate.mock.calls[0]?.[3]).toEqual({
        expectedUpdatedAt: '2099-01-01T00:00:00.000Z',
      })
    })

    it('反証: 更新が失敗したら編集前の内容へ戻す', async () => {
      useAssignmentNoteStore.getState().addNote(PRJ, '元の内容')
      await flushMicrotasks()
      const id = useAssignmentNoteStore.getState().assignmentNotes[0]?.id ?? ''

      mockUpdate.mockRejectedValueOnce(new Error('boom'))
      useAssignmentNoteStore.getState().updateNote(id, '壊れた編集')
      await flushMicrotasks()

      expect(useAssignmentNoteStore.getState().assignmentNotes[0]?.body).toBe(
        '元の内容',
      )
    })

    it('反証: 削除が失敗したら消した行を戻す', async () => {
      useAssignmentNoteStore.getState().addNote(PRJ, '消えないメモ')
      await flushMicrotasks()
      const id = useAssignmentNoteStore.getState().assignmentNotes[0]?.id ?? ''

      mockRemove.mockRejectedValueOnce(new Error('boom'))
      useAssignmentNoteStore.getState().deleteNote(id)
      expect(useAssignmentNoteStore.getState().assignmentNotes).toHaveLength(0)

      await flushMicrotasks()
      expect(useAssignmentNoteStore.getState().assignmentNotes).toHaveLength(1)
    })

    it('getNotesForProjectは対象案件のみを新しい順で返す', async () => {
      useAssignmentNoteStore.setState({
        assignmentNotes: [
          {
            id: 'n1',
            projectId: PRJ,
            body: '古い',
            authorName: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'n2',
            projectId: PRJ,
            body: '新しい',
            authorName: null,
            createdAt: '2026-02-01T00:00:00.000Z',
            updatedAt: '2026-02-01T00:00:00.000Z',
          },
          {
            id: 'n3',
            projectId: OTHER,
            body: '別案件',
            authorName: null,
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
          },
        ] as AssignmentNote[],
      })
      const notes = useAssignmentNoteStore.getState().getNotesForProject(PRJ)
      expect(notes.map((n) => n.body)).toEqual(['新しい', '古い'])
    })
  })

  describe('アサインスナップショット', () => {
    it('現在のアサインからentriesを構築して記録する', async () => {
      useAssignmentNoteStore.getState().takeSnapshot({
        projectId: PRJ,
        label: '10月時点',
        assignments: [
          assignment({ '2026-10': 0.5 }),
          // 他案件は含めない
          assignment({ '2026-10': 0.9 }, OTHER),
        ],
      })
      await flushMicrotasks()

      const snapshot = useAssignmentNoteStore.getState().assignmentSnapshots[0]
      expect(snapshot?.label).toBe('10月時点')
      expect(snapshot?.entries).toHaveLength(1)
      expect(snapshot?.entries[0]?.monthlyValues).toEqual({ '2026-10': 0.5 })
    })

    it('反証: 配分が全て0のアサインは記録しない（体制に居ないため）', async () => {
      useAssignmentNoteStore.getState().takeSnapshot({
        projectId: PRJ,
        label: '空の体制',
        assignments: [assignment({ '2026-10': 0 })],
      })
      await flushMicrotasks()
      expect(
        useAssignmentNoteStore.getState().assignmentSnapshots[0]?.entries,
      ).toHaveLength(0)
    })

    it('反証: 記録が失敗したら楽観的に追加した記録を消す', async () => {
      mockCreate.mockRejectedValueOnce(new Error('boom'))
      useAssignmentNoteStore.getState().takeSnapshot({
        projectId: PRJ,
        label: '失敗する記録',
        assignments: [assignment({ '2026-10': 0.5 })],
      })
      expect(
        useAssignmentNoteStore.getState().assignmentSnapshots,
      ).toHaveLength(1)

      await flushMicrotasks()
      expect(
        useAssignmentNoteStore.getState().assignmentSnapshots,
      ).toHaveLength(0)
    })

    it('反証: 更新アクションを持たない（記録は追記専用）', () => {
      const state = useAssignmentNoteStore.getState() as unknown as Record<
        string,
        unknown
      >
      expect(state.updateSnapshot).toBeUndefined()
      // 取り違えた記録を消せるよう削除だけは持つ
      expect(typeof state.deleteSnapshot).toBe('function')
    })

    it('反証: 削除が失敗したら消した記録を戻す', async () => {
      useAssignmentNoteStore.getState().takeSnapshot({
        projectId: PRJ,
        label: '消えない記録',
        assignments: [assignment({ '2026-10': 0.5 })],
      })
      await flushMicrotasks()
      const id =
        useAssignmentNoteStore.getState().assignmentSnapshots[0]?.id ?? ''

      mockRemove.mockRejectedValueOnce(new Error('boom'))
      useAssignmentNoteStore.getState().deleteSnapshot(id)
      expect(
        useAssignmentNoteStore.getState().assignmentSnapshots,
      ).toHaveLength(0)

      await flushMicrotasks()
      expect(
        useAssignmentNoteStore.getState().assignmentSnapshots,
      ).toHaveLength(1)
    })

    it('getSnapshotsForProjectは対象案件のみを新しい順で返す', () => {
      useAssignmentNoteStore.setState({
        assignmentSnapshots: [
          {
            id: 's1',
            projectId: PRJ,
            label: '古い',
            takenAt: '2026-01-01T00:00:00.000Z',
            entries: [],
            authorName: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 's2',
            projectId: PRJ,
            label: '新しい',
            takenAt: '2026-02-01T00:00:00.000Z',
            entries: [],
            authorName: null,
            createdAt: '2026-02-01T00:00:00.000Z',
          },
          {
            id: 's3',
            projectId: OTHER,
            label: '別案件',
            takenAt: '2026-03-01T00:00:00.000Z',
            entries: [],
            authorName: null,
            createdAt: '2026-03-01T00:00:00.000Z',
          },
        ] as AssignmentSnapshot[],
      })
      const snapshots = useAssignmentNoteStore
        .getState()
        .getSnapshotsForProject(PRJ)
      expect(snapshots.map((s) => s.label)).toEqual(['新しい', '古い'])
    })
  })

  describe('読み込み', () => {
    it('メモとスナップショットを両方ロードする', async () => {
      mockList.mockImplementation(async (entity: string) =>
        entity === 'assignmentNotes'
          ? [
              {
                id: 'n1',
                projectId: PRJ,
                body: 'a',
                authorName: null,
                createdAt: '',
                updatedAt: '',
              },
            ]
          : [
              {
                id: 's1',
                projectId: PRJ,
                label: 'b',
                takenAt: '',
                entries: [],
                authorName: null,
                createdAt: '',
              },
            ],
      )
      useAssignmentNoteStore.getState().loadAssignmentNotes()
      await flushMicrotasks()

      expect(useAssignmentNoteStore.getState().assignmentNotes).toHaveLength(1)
      expect(
        useAssignmentNoteStore.getState().assignmentSnapshots,
      ).toHaveLength(1)
    })

    it('反証: 読み取りの403は通知しない（このロールには見えないデータ）', async () => {
      // isForbiddenErrorはApiErrorインスタンスのみを対象にする
      // （statusプロパティだけ持つ別物をtrueにしない、という既存の反証がある）
      const { ApiError } = await import(
        '@/infrastructure/adapters/authenticated-fetch'
      )
      mockList.mockRejectedValue(new ApiError('権限がありません', 403))
      useAssignmentNoteStore.getState().loadAssignmentNotes()
      await flushMicrotasks()

      const { toast } = await import('@/shared/hooks/use-toast')
      expect(toast).not.toHaveBeenCalled()
    })

    it('反証: 403以外の読み込み失敗は通知する（本物の障害を隠さない）', async () => {
      const { ApiError } = await import(
        '@/infrastructure/adapters/authenticated-fetch'
      )
      mockList.mockRejectedValue(new ApiError('サーバーエラー', 500))
      useAssignmentNoteStore.getState().loadAssignmentNotes()
      await flushMicrotasks()

      const { toast } = await import('@/shared/hooks/use-toast')
      expect(toast).toHaveBeenCalled()
    })
  })
})
