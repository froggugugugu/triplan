import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMemberPreferenceStore } from '@/stores/member-preference-store'

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
vi.mock('@/shared/hooks/use-toast', () => ({ toast: vi.fn() }))

async function flush() {
  for (let i = 0; i < 4; i++) await Promise.resolve()
}

const MEM = '00000000-0000-4000-8000-0000000000f1'
const PROD = '00000000-0000-4000-8000-0000000000a1'
const SERVER_UPDATED_AT = '2099-01-01T00:00:00.000Z'

describe('useMemberPreferenceStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMemberPreferenceStore.setState({ preferences: [] })
    mockCreate.mockImplementation(
      async (
        _e: string,
        data: Record<string, unknown>,
        opts?: { id?: string },
      ) => ({
        id: opts?.id,
        ...data,
        createdAt: SERVER_UPDATED_AT,
        updatedAt: SERVER_UPDATED_AT,
      }),
    )
    mockUpdate.mockImplementation(
      async (_e: string, id: string, patch: Record<string, unknown>) => ({
        ...useMemberPreferenceStore
          .getState()
          .preferences.find((p) => p.id === id),
        ...patch,
        updatedAt: SERVER_UPDATED_AT,
      }),
    )
    mockRemove.mockResolvedValue(undefined)
  })

  const input = {
    memberId: MEM,
    desiredProductIds: [PROD],
    desiredTechTagIds: [],
    consentedAt: '2026-11-20',
  }

  it('savePreference は未登録なら作成、登録済みなら同じ行を更新する（1担当者1件）', async () => {
    expect(useMemberPreferenceStore.getState().savePreference(input)).toBe(true)
    await flush()
    expect(mockCreate).toHaveBeenCalledTimes(1)
    useMemberPreferenceStore
      .getState()
      .savePreference({ ...input, desiredProductIds: [] })
    await flush()
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(useMemberPreferenceStore.getState().preferences).toHaveLength(1)
    expect(
      useMemberPreferenceStore.getState().getPreference(MEM)?.desiredProductIds,
    ).toEqual([])
  })

  it('反証: 了解日のない入力は保存せず false を返す（アダプタを呼ばない）', () => {
    expect(
      useMemberPreferenceStore
        .getState()
        .savePreference({ ...input, consentedAt: '' }),
    ).toBe(false)
    expect(mockCreate).not.toHaveBeenCalled()
    expect(useMemberPreferenceStore.getState().preferences).toEqual([])
  })

  it('反証: 作成に失敗したら取り消す', async () => {
    mockCreate.mockRejectedValueOnce(new Error('boom'))
    useMemberPreferenceStore.getState().savePreference(input)
    await flush()
    expect(useMemberPreferenceStore.getState().preferences).toEqual([])
  })

  it('deletePreference は担当者の希望を消す。失敗したら戻す', async () => {
    useMemberPreferenceStore.getState().savePreference(input)
    await flush()
    mockRemove.mockRejectedValueOnce(new Error('boom'))
    useMemberPreferenceStore.getState().deletePreference(MEM)
    expect(useMemberPreferenceStore.getState().preferences).toEqual([])
    await flush()
    expect(useMemberPreferenceStore.getState().preferences).toHaveLength(1)
  })
})
