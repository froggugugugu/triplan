import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSchema } from '@/shared/types'
import { useAppStore } from '@/stores'
import { ProjectSummaryPage } from '../ProjectSummaryPage'

const PROJECT_ID = '00000000-0000-4000-8000-000000000001'
const MEMBER_ID = '00000000-0000-4000-8000-000000000002'
const TASK_ID = '00000000-0000-4000-8000-000000000003'

/** 今日が属する月のキー（"YYYY-MM"）。当月配分・体制行の表示に使う */
function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * 実ストア＋実LocalJsonAdapter（jsdomのlocalStorage）でページを検証する。
 * シードはDatabaseSchema.parseを通して**静かな読み込み失敗**（不正なシードで空DBへ
 * フォールバックし原因が分かりにくくなる既知の落とし穴）を組立時点で検出する。
 */
function seedDatabase() {
  const now = new Date().toISOString()
  const seed = {
    version: '1.0.0',
    fiscalYear: 2026,
    projects: [
      {
        id: PROJECT_ID,
        code: 'P001',
        name: 'テストプロジェクト',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: 'S',
        // 過去日付固定=テスト実行日に関わらず必ず納期超過（critical）になる
        masterDueDate: '2000-01-01',
        contractAmount: 1000,
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
        unitPriceHistory: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
    assignments: [
      {
        id: '00000000-0000-4000-8000-000000000004',
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { [currentMonthKey()]: 0.5 },
        createdAt: now,
        updatedAt: now,
      },
    ],
    metadata: { lastModified: now, createdBy: 'test', version: '1.0.0' },
  }
  const parsed = DatabaseSchema.parse(seed)
  localStorage.setItem('resource-manager-data', JSON.stringify(parsed))
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/project-summary?projectId=${PROJECT_ID}`]}>
      <ProjectSummaryPage />
    </MemoryRouter>,
  )
}

describe('ProjectSummaryPage', () => {
  beforeEach(() => {
    localStorage.clear()
    seedDatabase()
    useAppStore.setState({ showFinancials: true })
  })

  afterEach(() => {
    useAppStore.setState({ showFinancials: true })
  })

  it('クエリパラメータのプロジェクトが自動選択され、納期超過で総合判定が危険になる', async () => {
    renderPage()

    // ストアの非同期ロード完了→自動選択を待つ
    expect(
      await screen.findByText(/P001 - テストプロジェクト/),
    ).toBeInTheDocument()

    const badge = await screen.findByTestId('summary-overall')
    expect(badge).toHaveTextContent('危険')
    expect(
      await screen.findByText(/マスター納期（2000-01-01）を超過/),
    ).toBeInTheDocument()
  })

  it('金・商流セクションと体制テーブルが表示される（金額表示ON）', async () => {
    renderPage()
    await screen.findByTestId('summary-overall')

    expect(screen.getByText('金（予算・損益）')).toBeInTheDocument()
    expect(screen.getByText('商流（請求・変更管理）')).toBeInTheDocument()
    expect(screen.getByText('受注額')).toBeInTheDocument()
    // 体制: アサインされたメンバーが行になる
    expect(screen.getByText('山田太郎')).toBeInTheDocument()
  })

  it('反証: 金額非表示時は金・商流セクションが一切描画されない（非金額の判定・体制は残る）', async () => {
    useAppStore.setState({ showFinancials: false })
    renderPage()
    await screen.findByTestId('summary-overall')

    expect(screen.queryByText('金（予算・損益）')).not.toBeInTheDocument()
    expect(screen.queryByText('商流（請求・変更管理）')).not.toBeInTheDocument()
    expect(screen.queryByText('受注額')).not.toBeInTheDocument()
    // 非金額の情報は引き続き見える（partnerロール・トグルOFFでも進捗確認に使える設計）
    expect(
      screen.getByText(/マスター納期（2000-01-01）を超過/),
    ).toBeInTheDocument()
    expect(screen.getByText('山田太郎')).toBeInTheDocument()
  })

  it('反証: プロジェクト未選択（クエリパラメータなし）では案内カードを表示する', async () => {
    render(
      <MemoryRouter initialEntries={['/project-summary']}>
        <ProjectSummaryPage />
      </MemoryRouter>,
    )
    expect(
      await screen.findByText(/プロジェクトを選択すると、判断に必要な情報/),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('summary-overall')).not.toBeInTheDocument()
  })
})
