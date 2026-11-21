import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Member, Section } from '@/shared/types'
import { useOrgDesignStore } from '@/stores/org-design-store'

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

const mockToast = vi.fn()
vi.mock('@/shared/hooks/use-toast', () => ({
  toast: (...a: unknown[]) => mockToast(...a),
}))

async function flush() {
  for (let i = 0; i < 4; i++) await Promise.resolve()
}

const NOW = '2026-08-01T00:00:00.000Z'
const SERVER_UPDATED_AT = '2099-01-01T00:00:00.000Z'
const DIV = '00000000-0000-4000-8000-0000000000d1'
const SEC = '00000000-0000-4000-8000-0000000000e1'
const MEM = '00000000-0000-4000-8000-0000000000f1'

const sections: Section[] = [
  {
    id: SEC,
    divisionId: DIV,
    name: '第1課',
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
]
const members: Member[] = [
  {
    id: MEM,
    name: '佐藤',
    sectionId: SEC,
    role: 'dev',
    isActive: true,
    startDate: '2020-04-01',
    endDate: null,
    unitPriceHistory: [],
    createdAt: NOW,
    updatedAt: NOW,
  },
]

describe('useOrgDesignStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useOrgDesignStore.setState({ drafts: [] })
    mockList.mockResolvedValue([])
    mockCreate.mockImplementation(
      async (
        _e: string,
        data: Record<string, unknown>,
        opts?: { id?: string },
      ) => ({
        id: opts?.id,
        ...data,
        createdAt: NOW,
        updatedAt: SERVER_UPDATED_AT,
      }),
    )
    mockUpdate.mockImplementation(
      async (_e: string, id: string, patch: Record<string, unknown>) => ({
        ...useOrgDesignStore.getState().drafts.find((d) => d.id === id),
        ...patch,
        updatedAt: SERVER_UPDATED_AT,
      }),
    )
    mockRemove.mockResolvedValue(undefined)
  })

  it('createDraft は現在の課と所属を複製した案を作り、IDを返す', async () => {
    const id = useOrgDesignStore
      .getState()
      .createDraft({ name: '案A', fiscalYear: 2026, sections, members })
    const draft = useOrgDesignStore.getState().drafts[0]
    expect(draft?.id).toBe(id)
    expect(draft?.teams[0]).toMatchObject({
      sourceSectionId: SEC,
      name: '第1課',
    })
    expect(draft?.placements[MEM]).toBe(draft?.teams[0]?.id)
    await flush()
    expect(mockCreate).toHaveBeenCalledWith(
      'orgDesignDrafts',
      expect.objectContaining({ name: '案A' }),
      { id },
    )
    // サーバー確定行（updatedAt）へ差し替わる
    expect(useOrgDesignStore.getState().drafts[0]?.updatedAt).toBe(
      SERVER_UPDATED_AT,
    )
  })

  // 反証: 案の操作は本番データ（引数で渡した sections / members）を書き換えない
  it('反証: 案の作成・移動で本番の課・所属は変わらない', () => {
    const before = JSON.stringify({ sections, members })
    const id = useOrgDesignStore
      .getState()
      .createDraft({ name: '案A', fiscalYear: 2026, sections, members })
    const draft = useOrgDesignStore.getState().drafts.find((d) => d.id === id)
    useOrgDesignStore
      .getState()
      .saveDesign(id, {
        teams: draft?.teams ?? [],
        placements: { [MEM]: null },
      })
    expect(JSON.stringify({ sections, members })).toBe(before)
  })

  it('反証: 作成に失敗したら案を取り消して通知する', async () => {
    mockCreate.mockRejectedValueOnce(new Error('boom'))
    useOrgDesignStore
      .getState()
      .createDraft({ name: '案A', fiscalYear: 2026, sections, members })
    await flush()
    expect(useOrgDesignStore.getState().drafts).toEqual([])
    expect(mockToast).toHaveBeenCalled()
  })

  it('saveDesign は即時に反映し、楽観ロックの期待値を送る', async () => {
    const id = useOrgDesignStore
      .getState()
      .createDraft({ name: '案A', fiscalYear: 2026, sections, members })
    await flush()
    const draft = useOrgDesignStore.getState().drafts[0]
    useOrgDesignStore
      .getState()
      .saveDesign(id, {
        teams: draft?.teams ?? [],
        placements: { [MEM]: null },
      })
    expect(useOrgDesignStore.getState().drafts[0]?.placements[MEM]).toBeNull()
    await flush()
    expect(mockUpdate).toHaveBeenCalledWith(
      'orgDesignDrafts',
      id,
      expect.objectContaining({ placements: { [MEM]: null } }),
      { expectedUpdatedAt: SERVER_UPDATED_AT },
    )
  })

  it('反証: 保存に失敗したら直前の配置へ戻す', async () => {
    const id = useOrgDesignStore
      .getState()
      .createDraft({ name: '案A', fiscalYear: 2026, sections, members })
    await flush()
    const before = useOrgDesignStore.getState().drafts[0]
    mockUpdate.mockRejectedValueOnce(new Error('boom'))
    useOrgDesignStore
      .getState()
      .saveDesign(id, {
        teams: before?.teams ?? [],
        placements: { [MEM]: null },
      })
    await flush()
    expect(useOrgDesignStore.getState().drafts[0]?.placements[MEM]).toBe(
      before?.teams[0]?.id,
    )
  })

  it('duplicateDraft は同じ構成で別IDの案を作る／renameDraft は空白だけの名前を拒否する', async () => {
    const id = useOrgDesignStore
      .getState()
      .createDraft({ name: '案A', fiscalYear: 2026, sections, members })
    await flush()
    const copyId = useOrgDesignStore
      .getState()
      .duplicateDraft(id, '案A のコピー')
    const [a, b] = useOrgDesignStore.getState().drafts
    expect(copyId).not.toBe(id)
    expect(b?.placements).toEqual(a?.placements)
    expect(useOrgDesignStore.getState().renameDraft(id, '   ')).toBe(false)
    expect(useOrgDesignStore.getState().drafts[0]?.name).toBe('案A')
  })

  it('反証: 削除に失敗したら案を元に戻す', async () => {
    const id = useOrgDesignStore
      .getState()
      .createDraft({ name: '案A', fiscalYear: 2026, sections, members })
    await flush()
    mockRemove.mockRejectedValueOnce(new Error('boom'))
    useOrgDesignStore.getState().deleteDraft(id)
    expect(useOrgDesignStore.getState().drafts).toEqual([])
    await flush()
    expect(useOrgDesignStore.getState().drafts).toHaveLength(1)
  })
})
