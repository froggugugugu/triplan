import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDataAdapterForTesting } from '@/infrastructure/adapters/adapter-factory'
import { COLUMN_SPECS } from '@/shared/utils/master-import-core'
import {
  useAssignmentStore,
  useCompaniesStore,
  useMembersStore,
  useProjectsStore,
  useTeamStore,
} from '@/stores'
import { MasterCsvImportCard } from '../MasterCsvImportCard'

/**
 * マスタCSV一括登録。実ストア＋実LocalJsonAdapterで、
 * **選んだCSVが実際にデータになる**ところまで通す。
 */

const mockToast = vi.fn()
vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

function csvFile(name: string, lines: string[]): File {
  return new File([lines.join('\n')], name, { type: 'text/csv' })
}

async function selectCsv(file: File, section: HTMLElement) {
  const user = userEvent.setup()
  await user.click(
    within(section).getByRole('button', { name: /CSVを取り込む/ }),
  )

  const dialog = await screen.findByRole('dialog')
  const input = dialog.querySelector('input[type="file"]') as HTMLInputElement
  await user.upload(input, file)

  await within(dialog).findByText(/件・.*列を読み込みました/)
  return { user, dialog }
}

async function importCsv(file: File, section: HTMLElement) {
  const { user, dialog } = await selectCsv(file, section)
  await user.click(within(dialog).getByRole('button', { name: '内容を確認' }))
  return { user, dialog }
}

function sectionOf(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: title, level: 3 })
  const section = heading.closest('section')
  if (!section) throw new Error(`section not found: ${title}`)
  return section
}

beforeEach(() => {
  localStorage.clear()
  resetDataAdapterForTesting()
  mockToast.mockClear()
  useMembersStore.setState({ members: [] })
  useProjectsStore.setState({ projects: [] })
  useAssignmentStore.setState({ assignments: [] })
  useTeamStore.setState({ divisions: [], sections: [] })
  useCompaniesStore.setState({ companies: [] })
})
afterEach(() => cleanup())

describe('MasterCsvImportCard', () => {
  it('3種の列一覧を必須/任意つきで表示する', () => {
    render(<MasterCsvImportCard />)
    for (const title of [
      'チームメンバー',
      'プロジェクト・タスク',
      'アサイン',
    ]) {
      expect(
        screen.getByRole('heading', { name: title, level: 3 }),
      ).toBeInTheDocument()
    }

    // 列定義がそのまま画面に出る（テンプレートと同じ正本を読んでいる）
    const memberSection = sectionOf('チームメンバー')
    for (const spec of COLUMN_SPECS.members) {
      expect(within(memberSection).getByText(spec.key)).toBeInTheDocument()
    }
    expect(within(memberSection).getAllByText('必須')).toHaveLength(
      COLUMN_SPECS.members.filter((c) => c.required).length,
    )
  })

  it('メンバーCSVを取り込むと、未登録の部門・課・会社も作られる', async () => {
    render(<MasterCsvImportCard />)
    const { user, dialog } = await importCsv(
      csvFile('members.csv', [
        '氏名*,メール,部門,課,所属会社,単価',
        '山田太郎,yamada@example.com,開発部,第1課,株式会社ABC,100',
      ]),
      sectionOf('チームメンバー'),
    )

    expect(within(dialog).getByText('登録 1 件')).toBeInTheDocument()
    expect(within(dialog).getByText('部門: 開発部')).toBeInTheDocument()
    expect(within(dialog).getByText('課: 開発部 / 第1課')).toBeInTheDocument()
    expect(
      within(dialog).getByText('所属会社: 株式会社ABC'),
    ).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /1 件を登録/ }))

    await waitFor(() => {
      expect(useMembersStore.getState().members).toHaveLength(1)
    })
    const [member] = useMembersStore.getState().members
    const [division] = useTeamStore.getState().divisions
    const [section] = useTeamStore.getState().sections
    const [company] = useCompaniesStore.getState().companies
    expect(member?.name).toBe('山田太郎')
    expect(member?.sectionId).toBe(section?.id)
    expect(member?.companyId).toBe(company?.id)
    expect(section?.divisionId).toBe(division?.id)
    expect(member?.unitPriceHistory[0]?.amount).toBe(100)
  })

  it('反証: 自動作成のチェックを外すと、未登録マスタを参照する行は取り込めない', async () => {
    render(<MasterCsvImportCard />)
    const { user, dialog } = await importCsv(
      csvFile('members.csv', ['氏名,部門', '山田,新規部']),
      sectionOf('チームメンバー'),
    )

    expect(within(dialog).getByText('登録 1 件')).toBeInTheDocument()

    await user.click(
      within(dialog).getByRole('checkbox', {
        name: /未登録の部門・課・所属会社を作成する/,
      }),
    )

    expect(within(dialog).getByText('登録 0 件')).toBeInTheDocument()
    expect(
      within(dialog).getByText(/部門「新規部」が登録されていません/),
    ).toBeInTheDocument()
    // 取り込める行が無ければ適用できない
    expect(
      within(dialog).getByRole('button', { name: /0 件を登録/ }),
    ).toBeDisabled()
  })

  it('プロジェクトCSVは階層を親コードで作る（子が先に書かれていても繋がる）', async () => {
    render(<MasterCsvImportCard />)
    const { user, dialog } = await importCsv(
      csvFile('projects.csv', [
        'コード*,名前*,親コード',
        'P100-01,要件定義,P100',
        'P100,新規案件,',
      ]),
      sectionOf('プロジェクト・タスク'),
    )

    expect(within(dialog).getByText('登録 2 件')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /2 件を登録/ }))

    await waitFor(() => {
      expect(useProjectsStore.getState().projects).toHaveLength(2)
    })
    const projects = useProjectsStore.getState().projects
    const root = projects.find((p) => p.code === 'P100')
    const child = projects.find((p) => p.code === 'P100-01')
    expect(root?.level).toBe(0)
    expect(child?.level).toBe(1)
    expect(child?.parentId).toBe(root?.id)
  })

  it('アサインCSVは月の列から配分を作る', async () => {
    // 先にプロジェクトとメンバーを用意する
    const root = useProjectsStore.getState().addProject({
      code: 'P001',
      name: '案件',
      parentId: null,
      level: 0,
      status: 'not_started',
      confidence: null,
      completed: false,
    })
    const task = useProjectsStore.getState().addProject({
      code: 'P001-01',
      name: 'タスク',
      parentId: root.id,
      level: 1,
      status: 'not_started',
      confidence: null,
      completed: false,
    })
    const member = useMembersStore.getState().addMember({
      name: '山田太郎',
      sectionId: null,
      role: '',
      isActive: true,
      startDate: null,
      endDate: null,
      unitPriceHistory: [],
    })

    render(<MasterCsvImportCard />)
    const { user, dialog } = await importCsv(
      csvFile('assignments.csv', [
        'タスクコード*,担当者*,2026-04,2026-05',
        'P001-01,山田太郎,0.5,0.3',
      ]),
      sectionOf('アサイン'),
    )

    expect(within(dialog).getByText('登録 1 件')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /1 件を登録/ }))

    await waitFor(() => {
      expect(useAssignmentStore.getState().assignments).toHaveLength(1)
    })
    const [assignment] = useAssignmentStore.getState().assignments
    expect(assignment).toMatchObject({
      projectId: root.id,
      taskId: task.id,
      memberId: member.id,
      monthlyValues: { '2026-04': 0.5, '2026-05': 0.3 },
    })
  })

  it('反証: 既に登録済みの行は取り込まず、理由を出す（現行データを上書きしない）', async () => {
    useMembersStore.getState().addMember({
      name: '山田太郎',
      email: 'yamada@example.com',
      sectionId: null,
      role: '',
      isActive: true,
      startDate: null,
      endDate: null,
      unitPriceHistory: [],
    })

    render(<MasterCsvImportCard />)
    const { dialog } = await importCsv(
      csvFile('members.csv', ['氏名,メール', '別名,yamada@example.com']),
      sectionOf('チームメンバー'),
    )

    expect(within(dialog).getByText('登録 0 件')).toBeInTheDocument()
    expect(within(dialog).getByText(/既に登録済み/)).toBeInTheDocument()
    expect(useMembersStore.getState().members).toHaveLength(1)
  })

  it('反証: 適用するまでデータは変わらない（確認画面は書き込まない）', async () => {
    render(<MasterCsvImportCard />)
    await importCsv(
      csvFile('members.csv', ['氏名', '山田太郎']),
      sectionOf('チームメンバー'),
    )

    expect(useMembersStore.getState().members).toEqual([])
    expect(mockToast).not.toHaveBeenCalled()
  })

  describe('プレビュー', () => {
    it('ファイルを選ぶと、解釈前のCSVがそのまま表示される（列のずれに気づける）', async () => {
      render(<MasterCsvImportCard />)
      const { dialog } = await selectCsv(
        csvFile('members.csv', [
          '氏名*,メール,部門',
          '山田太郎,yamada@example.com,開発部',
        ]),
        sectionOf('チームメンバー'),
      )

      // ヘッダは書かれたまま（*付き）出す
      expect(within(dialog).getByText('氏名*')).toBeInTheDocument()
      expect(within(dialog).getByText('yamada@example.com')).toBeInTheDocument()
      expect(within(dialog).getByText('開発部')).toBeInTheDocument()
    })

    it('確認画面には「登録される内容」が解釈後の値で出る', async () => {
      render(<MasterCsvImportCard />)
      const { dialog } = await importCsv(
        csvFile('members.csv', [
          '氏名,部門,課,所属会社,稼働率上限,単価',
          '山田太郎,開発部,第1課,株式会社ABC,0.5,100',
        ]),
        sectionOf('チームメンバー'),
      )

      expect(within(dialog).getByText('登録される内容')).toBeInTheDocument()
      // 部門・課はまとめて「（新規）」つきで示す＝作られることが取込前に分かる
      expect(
        within(dialog).getByText('開発部 / 第1課（新規）'),
      ).toBeInTheDocument()
      expect(
        within(dialog).getByText('株式会社ABC（新規）'),
      ).toBeInTheDocument()
      // 単価は適用開始月つき
      expect(
        within(dialog).getByText('100万円（2026-04〜）'),
      ).toBeInTheDocument()
    })

    it('反証: 取り込まない行は「登録される内容」に出ない', async () => {
      render(<MasterCsvImportCard />)
      const { dialog } = await importCsv(
        csvFile('members.csv', [
          '氏名,メール',
          '正常太郎,ok@example.com',
          '不正次郎,bad-email',
        ]),
        sectionOf('チームメンバー'),
      )

      const previewLabel = within(dialog).getByText('登録される内容')
      const table = previewLabel.parentElement as HTMLElement
      expect(within(table).getByText('正常太郎')).toBeInTheDocument()
      expect(within(table).queryByText('不正次郎')).not.toBeInTheDocument()
      // 取り込まない理由の側には出る
      expect(within(dialog).getByText(/メールの形式/)).toBeInTheDocument()
    })

    it('アサインのプレビューは月ごとの配分と合計を出す', async () => {
      const root = useProjectsStore.getState().addProject({
        code: 'P001',
        name: '案件',
        parentId: null,
        level: 0,
        status: 'not_started',
        confidence: null,
        completed: false,
      })
      useProjectsStore.getState().addProject({
        code: 'P001-01',
        name: 'タスク',
        parentId: root.id,
        level: 1,
        status: 'not_started',
        confidence: null,
        completed: false,
      })
      useMembersStore.getState().addMember({
        name: '山田太郎',
        sectionId: null,
        role: '',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
      })

      render(<MasterCsvImportCard />)
      const { dialog } = await importCsv(
        csvFile('assignments.csv', [
          'タスクコード,担当者,2026-04,2026-05',
          'P001-01,山田太郎,0.5,0.3',
        ]),
        sectionOf('アサイン'),
      )

      expect(within(dialog).getByText('P001-01 タスク')).toBeInTheDocument()
      expect(within(dialog).getByText('0.50')).toBeInTheDocument()
      expect(within(dialog).getByText('0.30')).toBeInTheDocument()
      // 合計
      expect(within(dialog).getByText('0.80')).toBeInTheDocument()
    })
  })

  it('テンプレートをダウンロードできる', async () => {
    const user = userEvent.setup()
    const createObjectURL = vi.fn(() => 'blob:test')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)

    render(<MasterCsvImportCard />)
    await user.click(
      within(sectionOf('チームメンバー')).getByRole('button', {
        name: /テンプレート/,
      }),
    )

    expect(createObjectURL).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    clickSpy.mockRestore()
    vi.unstubAllGlobals()
  })
})
