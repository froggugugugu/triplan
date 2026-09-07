import { expect, type Page, test } from '@playwright/test'

/**
 * プロジェクトサマリー統合ビュー（/project-summary、非公開の設計文書）。
 *
 * - `?projectId=`直アクセスでの自動選択（パターン）
 * - 決定論的な判定ルール（納期超過=critical）が総合判定バッジと理由リストに出ること
 * - 相互リンク（WBSを開く）でクエリパラメータ連携が機能し、遷移先でも同一プロジェクトが
 *   選択されること
 * - 反証: 金額の表示トグルOFFで金・商流セクションが消え、非金額情報は残ること
 */

const NOW = '2025-10-01T00:00:00.000Z'

const PROJECT_ID = '00000000-0000-4000-8000-00000000aa01'
const MEMBER_ID = '00000000-0000-4000-8000-00000000aa02'
const TASK_ID = '00000000-0000-4000-8000-00000000aa03'

/** 実行時の今日が属する月キー（体制テーブルの当月配分に使う） */
function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function buildSeedData() {
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [
      {
        id: PROJECT_ID,
        code: 'P800',
        name: 'サマリー検証案件',
        description: '',
        parentId: null,
        level: 0,
        status: 'active' as const,
        confidence: 'S' as const,
        // 過去日付固定=実行日に関わらず必ず納期超過（critical）
        masterDueDate: '2000-01-01',
        contractAmount: 1000,
        completed: false,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    members: [
      {
        id: MEMBER_ID,
        name: 'サマリー太郎',
        sectionId: null,
        role: 'PM',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    assignments: [
      {
        id: '00000000-0000-4000-8000-00000000aa04',
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { [currentMonthKey()]: 0.5 },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    metadata: {
      lastModified: NOW,
      createdBy: 'system',
      version: '1.0.0',
    },
  }
}

async function seedAndNavigate(page: Page) {
  await page.goto('/')
  await page.evaluate((d) => {
    localStorage.setItem('resource-manager-data', JSON.stringify(d))
  }, buildSeedData())
  await page.goto(`/project-summary?projectId=${PROJECT_ID}`)
  await page
    .getByRole('heading', { name: 'プロジェクトサマリー' })
    .waitFor({ state: 'visible', timeout: 10000 })
}

test.describe('プロジェクトサマリー統合ビュー（/project-summary）', () => {
  test('クエリパラメータ直アクセスで自動選択され、納期超過が判定バッジと理由に出る', async ({
    page,
  }) => {
    await seedAndNavigate(page)

    // ?projectId= からの自動選択（ストアロード完了待ちの2段階パターン）
    await expect(page.getByText(/P800 - サマリー検証案件/)).toBeVisible()

    // 総合判定バッジ=危険（マスター納期2000-01-01は必ず超過）
    await expect(page.getByTestId('summary-overall')).toHaveText('危険')
    await expect(
      page.getByText(/マスター納期（2000-01-01）を超過/),
    ).toBeVisible()

    // 金・商流セクションと体制（アサインメンバー）が表示される
    // メンバー名は山積みグラフの凡例にも出るため、体制テーブルのセルに限定して検証する
    await expect(page.getByText('金（予算・損益）')).toBeVisible()
    await expect(page.getByText('商流（請求・変更管理）')).toBeVisible()
    await expect(page.getByRole('cell', { name: /サマリー太郎/ })).toBeVisible()
  })

  test('相互リンク「WBSを開く」で遷移先でも同一プロジェクトが選択される', async ({
    page,
  }) => {
    await seedAndNavigate(page)
    await expect(page.getByTestId('summary-overall')).toBeVisible()

    await page.getByRole('button', { name: 'WBSを開く' }).click()
    await page
      .getByRole('heading', { name: 'WBS' })
      .waitFor({ state: 'visible', timeout: 10000 })

    // WBS画面の対象プロジェクトComboboxに同一プロジェクトが選択されている
    await expect(page.getByRole('combobox').first()).toContainText('P800')
  })

  test('反証: 金額の表示トグルOFFで金・商流セクションが消え、非金額の判定・体制は残る', async ({
    page,
  }) => {
    await seedAndNavigate(page)
    await expect(page.getByText('金（予算・損益）')).toBeVisible()

    // 管理画面の全社設定で「金額の表示」をOFFにする（localモードの表示制御）
    const summaryUrl = page.url()
    await page.goto('/admin/settings')
    const financialsToggle = page.getByRole('button', { name: '金額の表示' })
    await expect(financialsToggle).toHaveAttribute('aria-pressed', 'true')
    await financialsToggle.click()
    await expect(financialsToggle).toHaveAttribute('aria-pressed', 'false')
    await page.goto(summaryUrl)

    await expect(page.getByText('金（予算・損益）')).not.toBeVisible()
    await expect(page.getByText('商流（請求・変更管理）')).not.toBeVisible()
    // 非金額情報は残る（納期超過の判定・体制テーブル）
    await expect(
      page.getByText(/マスター納期（2000-01-01）を超過/),
    ).toBeVisible()
    await expect(page.getByRole('cell', { name: /サマリー太郎/ })).toBeVisible()
  })
})
