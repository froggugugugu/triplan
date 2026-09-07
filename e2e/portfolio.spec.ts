import { expect, type Page, test } from '@playwright/test'

/**
 * ポートフォリオ（/portfolio）。
 *
 * - 全ルートプロジェクトが健全性の悪い順に並ぶ（納期超過critical=「危険」が先頭）
 * - 反証: 完了済みプロジェクトは行にならない
 * - 行の「開く」でプロジェクトサマリーへ遷移し、同一プロジェクトが自動選択される
 *   （クエリパラメータ連携）
 */

const NOW = '2025-10-01T00:00:00.000Z'

const OVERDUE_ID = '00000000-0000-4000-8000-00000000bb01'
const HEALTHY_ID = '00000000-0000-4000-8000-00000000bb02'
const DONE_ID = '00000000-0000-4000-8000-00000000bb03'
const HEALTHY_TASK_ID = '00000000-0000-4000-8000-00000000bb04'

function baseProject(id: string, code: string, name: string) {
  return {
    id,
    code,
    name,
    description: '',
    parentId: null,
    level: 0,
    status: 'active' as const,
    confidence: 'S' as const,
    completed: false,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function buildSeedData() {
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [
      // 過去日付固定=実行日に関わらず必ず納期超過（critical=危険）
      {
        ...baseProject(OVERDUE_ID, 'P810', '炎上検証案件'),
        masterDueDate: '2000-01-01',
        contractAmount: 1000,
      },
      // 完了チェック済みタスクを持つ=進捗ソースあり・問題なし（good=良好）
      baseProject(HEALTHY_ID, 'P820', '順調検証案件'),
      {
        ...baseProject(HEALTHY_TASK_ID, 'P820-01', '完了済みタスク'),
        parentId: HEALTHY_ID,
        level: 1,
        completed: true,
        completedAt: '2025-09-01',
      },
      // 完了済みプロジェクト=ポートフォリオに出ない（反証用）
      {
        ...baseProject(DONE_ID, 'P830', '終了済み案件'),
        status: 'completed' as const,
        masterDueDate: '2000-01-01',
        contractAmount: 500,
      },
    ],
    members: [],
    assignments: [],
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
  await page.goto('/portfolio')
  await page
    .getByRole('heading', { name: 'ポートフォリオ' })
    .waitFor({ state: 'visible', timeout: 10000 })
}

test.describe('ポートフォリオ（/portfolio）', () => {
  test('健全性の悪い順に並び、納期超過が「危険」バッジと理由になる', async ({
    page,
  }) => {
    await seedAndNavigate(page)

    // 2行のみ（完了済みのP830は出ない=反証）。案件名は判定メッセージのセルにも
    // 現れるため、名前セル（案件名＋コード）の完全な結合テキストで特定する
    await expect(
      page.getByRole('cell', { name: '炎上検証案件 P810' }),
    ).toBeVisible()
    await expect(
      page.getByRole('cell', { name: '順調検証案件 P820' }),
    ).toBeVisible()
    await expect(page.getByText('終了済み案件')).toHaveCount(0)

    // 並び順: 危険（納期超過）が先頭
    const rows = page.locator('tbody tr')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText('炎上検証案件')
    await expect(rows.nth(0)).toContainText('危険')
    await expect(rows.nth(0)).toContainText('マスター納期（2000-01-01）を超過')
    await expect(rows.nth(1)).toContainText('順調検証案件')
    await expect(rows.nth(1)).toContainText('良好')
  })

  test('行の「開く」でプロジェクトサマリーへ遷移し同一プロジェクトが選択される', async ({
    page,
  }) => {
    await seedAndNavigate(page)

    await page
      .locator('tbody tr')
      .first()
      .getByRole('link', { name: /開く/ })
      .click()

    await expect(page).toHaveURL(new RegExp(`projectId=${OVERDUE_ID}`))
    await expect(page.getByText(/P810 - 炎上検証案件/)).toBeVisible()
  })
})
