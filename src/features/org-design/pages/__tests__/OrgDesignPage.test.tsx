import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSchema } from '@/shared/types'
import {
  useAppStore,
  useMembersStore,
  useOrgDesignStore,
  useTeamStore,
} from '@/stores'
import { OrgDesignPage } from '../OrgDesignPage'

const DIV = '00000000-0000-4000-8000-0000000000d1'
const SEC1 = '00000000-0000-4000-8000-0000000000e1'
const SEC2 = '00000000-0000-4000-8000-0000000000e2'
const MEM_A = '00000000-0000-4000-8000-0000000000a1'
const MEM_B = '00000000-0000-4000-8000-0000000000b1'
const MEM_GONE = '00000000-0000-4000-8000-0000000000f9'
const PROJ = '00000000-0000-4000-8000-0000000000c1'
const PROJ_OTHER = '00000000-0000-4000-8000-0000000000c2'
const TEAM1 = '00000000-0000-4000-8000-000000000101'
const TEAM2 = '00000000-0000-4000-8000-000000000102'
const DRAFT = '00000000-0000-4000-8000-000000000201'

const now = '2026-04-01T00:00:00.000Z'

function member(id: string, name: string, sectionId: string) {
  return {
    id,
    name,
    sectionId,
    role: '開発',
    isActive: true,
    startDate: null,
    endDate: null,
    unitPriceHistory: [],
    createdAt: now,
    updatedAt: now,
  }
}

function project(id: string, code: string, name: string) {
  return {
    id,
    code,
    name,
    parentId: null,
    level: 0,
    status: 'active',
    confidence: 'S',
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * 実ストア＋実LocalJsonAdapter（jsdomのlocalStorage）。
 * A: 課1所属・受け持ち外のPROJ_OTHERに5月1.0（兼務1・稼働率 1/12≈8%）
 * B: 課2所属・アサインなし
 */
function seed({ withDraft = true, extraPlacement = false } = {}) {
  const db = {
    version: '1.0.0',
    fiscalYear: 2026,
    divisions: [
      { id: DIV, name: '開発本部', sortOrder: 0, createdAt: now, updatedAt: now },
    ],
    sections: [
      { id: SEC1, divisionId: DIV, name: '第1課', sortOrder: 0, createdAt: now, updatedAt: now },
      { id: SEC2, divisionId: DIV, name: '第2課', sortOrder: 1, createdAt: now, updatedAt: now },
    ],
    projects: [project(PROJ, 'P001', '基幹'), project(PROJ_OTHER, 'P002', '別製品')],
    members: [member(MEM_A, '青木', SEC1), member(MEM_B, '馬場', SEC2)],
    assignments: [
      {
        id: '00000000-0000-4000-8000-000000000301',
        projectId: PROJ_OTHER,
        taskId: PROJ_OTHER,
        memberId: MEM_A,
        monthlyValues: { '2026-05': 1 },
        createdAt: now,
        updatedAt: now,
      },
    ],
    orgDesignDrafts: withDraft
      ? [
          {
            id: DRAFT,
            name: '案A',
            fiscalYear: 2026,
            teams: [
              {
                id: TEAM1,
                sourceSectionId: SEC1,
                divisionId: DIV,
                name: '第1課',
                sortOrder: 0,
                productIds: [PROJ],
                techTagIds: [],
              },
              {
                id: TEAM2,
                sourceSectionId: SEC2,
                divisionId: DIV,
                name: '第2課',
                sortOrder: 1,
                productIds: [PROJ_OTHER],
                techTagIds: [],
              },
            ],
            placements: {
              [MEM_A]: TEAM1,
              [MEM_B]: TEAM2,
              ...(extraPlacement && { [MEM_GONE]: TEAM1 }),
            },
            createdAt: now,
            updatedAt: now,
          },
        ]
      : [],
    metadata: { lastModified: now, createdBy: 'test', version: '1.0.0' },
  }
  localStorage.setItem(
    'resource-manager-data',
    JSON.stringify(DatabaseSchema.parse(db)),
  )
}

function renderPage() {
  return render(
    <MemoryRouter>
      <OrgDesignPage />
    </MemoryRouter>,
  )
}

function teamMetrics(teamId: string) {
  return within(screen.getByTestId(`org-team-metrics-${teamId}`))
}

function savedDraft() {
  const raw = JSON.parse(localStorage.getItem('resource-manager-data') ?? '{}')
  return raw.orgDesignDrafts?.[0]
}

describe('OrgDesignPage', () => {
  beforeEach(() => {
    localStorage.clear()
    useOrgDesignStore.setState({ drafts: [] })
    useAppStore.setState({
      fiscalYear: 2026,
      fiscalYearStartMonth: 4,
      showFinancials: true,
    })
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('移動先メニューで人を動かすとチームの指標が即時に変わり、本番の所属は変わらない', async () => {
    seed()
    const user = userEvent.setup()
    renderPage()

    await waitFor(() =>
      expect(teamMetrics(TEAM1).getByText('8%')).toBeInTheDocument(),
    )
    // 受け持ち外のPROJ_OTHERに関与 → 課1の兼務者1名
    expect(teamMetrics(TEAM1).getByText('1名', { selector: 'dd:nth-of-type(3)' }))
      .toBeInTheDocument()
    expect(teamMetrics(TEAM2).getByText('0%')).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: '青木の移動先' }))
    await user.click(await screen.findByRole('option', { name: '開発本部 / 第2課' }))

    // 課2に移る: 課2の稼働率は(1)/(24)≈4%、PROJ_OTHERは課2の受け持ちなので兼務0
    expect(teamMetrics(TEAM2).getByText('4%')).toBeInTheDocument()
    expect(teamMetrics(TEAM1).getByText('—', { selector: 'dd:nth-of-type(2)' }))
      .toBeInTheDocument()
    expect(within(screen.getByTestId(`org-team-${TEAM2}`)).getByText('青木'))
      .toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('未保存の変更があります')

    // 本番（members-store・課）は一切変わらない
    expect(
      useMembersStore.getState().members.find((m) => m.id === MEM_A)?.sectionId,
    ).toBe(SEC1)
    expect(useTeamStore.getState().sections).toHaveLength(2)
    // 未保存のうちは永続化されない
    expect(savedDraft().placements[MEM_A]).toBe(TEAM1)

    await user.click(screen.getByRole('button', { name: /案を保存/ }))
    await waitFor(() => expect(savedDraft().placements[MEM_A]).toBe(TEAM2))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    const persisted = JSON.parse(localStorage.getItem('resource-manager-data') ?? '{}')
    expect(
      persisted.members.find((m: { id: string }) => m.id === MEM_A).sectionId,
    ).toBe(SEC1)
  })

  it('変更を破棄すると保存済みの配置に戻る', async () => {
    seed()
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('combobox', { name: '青木の移動先' })

    await user.click(screen.getByRole('combobox', { name: '青木の移動先' }))
    await user.click(await screen.findByRole('option', { name: '未配置' }))
    expect(within(screen.getByTestId('org-team-unplaced')).getByText('青木'))
      .toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /変更を破棄/ }))
    expect(within(screen.getByTestId(`org-team-${TEAM1}`)).getByText('青木'))
      .toBeInTheDocument()
    expect(savedDraft().placements[MEM_A]).toBe(TEAM1)
  })

  it('チームを案から削除しても人は消えず未配置へ戻る', async () => {
    seed()
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('button', { name: '第1課を案から削除' })

    await user.click(screen.getByRole('button', { name: '第1課を案から削除' }))
    expect(screen.queryByTestId(`org-team-${TEAM1}`)).not.toBeInTheDocument()
    expect(within(screen.getByTestId('org-team-unplaced')).getByText('青木'))
      .toBeInTheDocument()
  })

  it('比較タブに現組織→案の差分を記号付きで表示する', async () => {
    seed()
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('combobox', { name: '青木の移動先' }))
    await user.click(await screen.findByRole('option', { name: '開発本部 / 第2課' }))

    await user.click(screen.getByRole('tab', { name: '現組織と比較' }))
    // 列順: チーム / 人数 / 稼働率 / 兼務者 / 過負荷 / コスト
    const cells1 = within(screen.getByTestId(`org-compare-${SEC1}`)).getAllByRole(
      'cell',
    )
    expect(cells1[1]).toHaveTextContent('1名 → 0名▼1')
    expect(cells1[2]).toHaveTextContent('8% → ——')
    expect(cells1[3]).toHaveTextContent('1名 → 0名▼1')
    const cells2 = within(screen.getByTestId(`org-compare-${SEC2}`)).getAllByRole(
      'cell',
    )
    expect(cells2[1]).toHaveTextContent('1名 → 2名▲1')
    expect(cells2[2]).toHaveTextContent('0% → 4%▲4pt')
  })

  it('案がないときは現組織から作成でき、本番の課構成が複製される', async () => {
    seed({ withDraft: false })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /現組織から案を作成/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '更新' }))

    await waitFor(() => expect(savedDraft()).toBeDefined())
    const created = savedDraft()
    expect(created.teams.map((t: { sourceSectionId: string }) => t.sourceSectionId))
      .toEqual([SEC1, SEC2])
    expect(await screen.findByRole('combobox', { name: '青木の移動先' }))
      .toBeInTheDocument()
  })

  it('本番から消えた担当者が配置に残っていても落ちず、件数を注記する', async () => {
    seed({ extraPlacement: true })
    renderPage()
    expect(
      await screen.findByText(/本番に存在しない担当者 1/),
    ).toBeInTheDocument()
  })

  it('金額非表示ではチームのコストを出さない', async () => {
    seed()
    useAppStore.setState({ showFinancials: false })
    renderPage()
    await screen.findByTestId(`org-team-metrics-${TEAM1}`)
    expect(teamMetrics(TEAM1).queryByText('コスト')).not.toBeInTheDocument()
  })
})
