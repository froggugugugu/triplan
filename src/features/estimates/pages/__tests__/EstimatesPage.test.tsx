import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSchema } from '@/shared/types'
import { useAppStore } from '@/stores'
import { EstimatesPage } from '../EstimatesPage'

const PROJECT_ID = '00000000-0000-4000-8000-0000000000e1'
const MEMBER_ID = '00000000-0000-4000-8000-0000000000e2'
const TASK_ID = '00000000-0000-4000-8000-0000000000e3'

/**
 * 実ストア＋実LocalJsonAdapter（jsdomのlocalStorage）でページを検証する。
 * シードはDatabaseSchema.parseを通して静かな読み込み失敗を組立時点で検出する
 * （ProjectSummaryPage.test.tsxと同じ流儀）。
 */
function seedDatabase(options: { withEstimates?: boolean } = {}) {
  const now = new Date().toISOString()
  const seed = {
    version: '1.0.0',
    fiscalYear: 2026,
    projects: [
      {
        id: PROJECT_ID,
        code: 'P001',
        name: '見積検証プロジェクト',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: 'B',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: TASK_ID,
        code: 'P001-01',
        name: '要件定義',
        parentId: PROJECT_ID,
        level: 1,
        status: 'not_started',
        confidence: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    members: [
      {
        id: MEMBER_ID,
        name: '山田太郎',
        sectionId: null,
        role: 'PM',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [{ effectiveFrom: '2020-01', amount: 100 }],
        createdAt: now,
        updatedAt: now,
      },
    ],
    assignments: [],
    estimatedUnitPrice: 100,
    defaultCoefficient: 1,
    workdaysPerMonth: 20,
    hoursPerDay: 8,
    hoursPerFunctionPoint: 10,
    estimateSnapshots: options.withEstimates
      ? [
          {
            id: '00000000-0000-4000-8000-0000000000e9',
            projectId: PROJECT_ID,
            version: 1,
            stage: 'initial_concept',
            method: 'manual',
            label: '引合時の超概算',
            takenAt: '2026-04-01T00:00:00.000Z',
            effortDays: 100,
            amount: 500,
            basis: {
              estimatedUnitPrice: 100,
              coefficient: 1,
              workdaysPerMonth: 20,
              hoursPerDay: 8,
            },
            changeRequestId: null,
            authorName: null,
            createdAt: '2026-04-01T00:00:00.000Z',
          },
        ]
      : [],
    metadata: { lastModified: now, createdBy: 'test', version: '1.0.0' },
  }
  const parsed = DatabaseSchema.parse(seed)
  localStorage.setItem('resource-manager-data', JSON.stringify(parsed))
}

function readStoredSnapshots(): Array<{
  version: number
  method: string
  amount: number
  effortDays: number
  fp?: { totalFp: number }
}> {
  const raw = localStorage.getItem('resource-manager-data')
  if (!raw) return []
  return (JSON.parse(raw) as { estimateSnapshots?: [] }).estimateSnapshots ?? []
}

function renderPage(path = `/estimates?projectId=${PROJECT_ID}`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <EstimatesPage />
    </MemoryRouter>,
  )
}

describe('EstimatesPage', () => {
  beforeEach(() => {
    localStorage.clear()
    useAppStore.setState({ showFinancials: true })
  })

  afterEach(() => {
    useAppStore.setState({ showFinancials: true })
  })

  it('クエリパラメータのプロジェクトが自動選択され、記録済みの版が一覧に出る', async () => {
    seedDatabase({ withEstimates: true })
    renderPage()
    expect(
      await screen.findByText(/P001 - 見積検証プロジェクト/),
    ).toBeInTheDocument()
    const rows = await screen.findAllByTestId('estimate-history-row')
    expect(rows).toHaveLength(1)
    expect(within(rows[0] as HTMLElement).getByText('v1')).toBeInTheDocument()
    expect(
      within(rows[0] as HTMLElement).getByText('引合時の超概算'),
    ).toBeInTheDocument()
    // 段階の幅（初期コンセプト=0.25x〜4x）が導出表示される
    expect(
      within(rows[0] as HTMLElement).getByText('0.25x〜4x'),
    ).toBeInTheDocument()
  })

  it('簡易FPで見積を記録すると換算結果が実localStorageへ永続化される', async () => {
    seedDatabase()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(/P001 - 見積検証プロジェクト/)

    await user.click(screen.getByRole('button', { name: '見積を記録' }))
    const dialog = await screen.findByRole('dialog')

    // 反証: ラベルが空のままでは記録できない
    const submit = within(dialog).getByRole('button', { name: '記録' })
    expect(submit).toBeDisabled()

    await user.type(within(dialog).getByLabelText('ラベル'), '引合時の超概算')
    // 既定の方法=簡易FP（概算法）。1行目に名前と件数を入れる
    await user.type(within(dialog).getByLabelText('FP項目の名前'), '顧客')
    const count = within(dialog).getByLabelText('FP項目の件数')
    await user.clear(count)
    await user.type(count, '2')
    await user.tab()

    // ライブ表示: ILF×2=70FP → 70×10h÷8h=87.5人日 → 4.375人月×100万円=438万円
    expect(within(dialog).getByText('70')).toBeInTheDocument()
    expect(within(dialog).getByText(/87\.50人日/)).toBeInTheDocument()
    expect(submit).toBeEnabled()
    await user.click(submit)

    const rows = await screen.findAllByTestId('estimate-history-row')
    expect(rows).toHaveLength(1)
    expect(within(rows[0] as HTMLElement).getByText(/70FP/)).toBeInTheDocument()

    await expect.poll(() => readStoredSnapshots().length).toBe(1)
    const stored = readStoredSnapshots()[0]
    expect(stored?.method).toBe('function_point')
    expect(stored?.fp?.totalFp).toBe(70)
    expect(stored?.effortDays).toBe(87.5)
    expect(stored?.amount).toBe(438)
  })

  it('反証: 確認ダイアログをキャンセルしても最新版は消えない・確定すると消える', async () => {
    seedDatabase({ withEstimates: true })
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByTestId('estimate-history-row')

    await user.click(screen.getByRole('button', { name: '最新版を取り消す' }))
    let dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'キャンセル' }))
    expect(screen.getAllByTestId('estimate-history-row')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: '最新版を取り消す' }))
    dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '取り消す' }))
    expect(
      await screen.findByText(/記録された見積はありません/),
    ).toBeInTheDocument()
    await expect.poll(() => readStoredSnapshots().length).toBe(0)
  })

  it('振り返りタブに版ごとの実績÷見積と幅の判定が出る', async () => {
    seedDatabase({ withEstimates: true })
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByTestId('estimate-history-row')
    await user.click(screen.getByRole('tab', { name: '振り返り' }))
    const rows = await screen.findAllByTestId('estimate-retrospective-row')
    expect(rows).toHaveLength(1)
    // アサインが無いので実績0 → 誤差比0.00x、初期コンセプト（0.25x〜4x）の外側
    expect(
      within(rows[0] as HTMLElement).getByText('幅の外側'),
    ).toBeInTheDocument()
  })

  it('反証: プロジェクト未選択（クエリパラメータなし）では案内カードを表示する', async () => {
    seedDatabase()
    renderPage('/estimates')
    expect(
      await screen.findByText(/プロジェクトを選択すると、段階ごとの見積の記録/),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('estimate-history-row')).not.toBeInTheDocument()
  })
})
