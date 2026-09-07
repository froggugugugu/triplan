import { expect, test } from '@playwright/test'

// ─── Seed Data Constants ───────────────────────────────────────────────────────

const NOW = '2025-10-01T00:00:00.000Z'

const PROJECT_ID = '00000000-0000-4000-8000-000000000001'

// ─── Seed Data Helpers ─────────────────────────────────────────────────────────

function makeProject(
  id: string,
  code: string,
  name: string,
  level: number,
  parentId: string | null,
) {
  return {
    id,
    code,
    name,
    description: '',
    background: '',
    purpose: '',
    level,
    parentId,
    status: 'not_started',
    confidence: level === 0 ? 'S' : null,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

/**
 * シードデータを注入する
 */
async function seedDatabase() {
  const seedData = {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [makeProject(PROJECT_ID, 'P001', '親プロジェクト', 0, null)],
    members: [],
    metadata: {
      lastModified: NOW,
      createdBy: 'e2e-test',
      version: '1.0.0',
    },
  }
  return seedData
}

/**
 * ProjectDialogのタイトル・ラベル出し分け（プロジェクト/タスク）を検証する。
 * 旧テストは「プロジェクトを追加ボタン」「role=treeitem」という旧UI前提で恒常的に
 * 失敗していた（P0-cで刷新）。現行UIはAG Grid（ProjectTreeGrid）＋「新規プロジェクト」
 * ボタン＋操作列のアイコンボタン（タスクを追加/編集/削除）。
 */
test.describe('ProjectDialog: タスク追加時のUI変更', () => {
  test.beforeEach(async ({ page }) => {
    const seedData = await seedDatabase()
    await page.goto('/')
    await page.evaluate((d) => {
      localStorage.setItem('resource-manager-data', JSON.stringify(d))
    }, seedData)
    await page.goto('/projects')
    // AG Gridの行描画を待つ（pinned/centerの重複があるため.first()）
    await expect(page.getByText('親プロジェクト').first()).toBeVisible()
  })

  test('プロジェクト（level=0）追加時: タイトルは「新規プロジェクト」、ラベルは「プロジェクト名」、プロジェクト確度フィールドあり', async ({
    page,
  }) => {
    await page.getByRole('button', { name: '新規プロジェクト' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByRole('heading', { name: '新規プロジェクト' }),
    ).toBeVisible()
    await expect(
      dialog.getByText('プロジェクト名', { exact: true }),
    ).toBeVisible()
    await expect(
      dialog.getByText('プロジェクト確度', { exact: true }),
    ).toBeVisible()
    await expect(dialog.getByText('ステータス', { exact: true })).toBeVisible()
  })

  test('タスク（level=1）追加時: タイトルは「新規タスク」、ラベルは「タスク名」、プロジェクト確度フィールドなし', async ({
    page,
  }) => {
    // タスク追加の導線は現行UIではWBS画面（ProjectTreeGridの操作列）にある。
    // プロジェクト一覧はトップレベルの管理・各画面への遷移ハブで、子タスク追加は持たない
    await page.goto('/wbs')
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: /P001/ }).click()

    // 操作列の子タスク追加アイコンボタン（level=0行の子=level1のラベルは「レベル1」）
    await page.locator('[title="レベル1を追加"]').first().click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByRole('heading', { name: '新規タスク' }),
    ).toBeVisible()
    await expect(dialog.getByText('タスク名', { exact: true })).toBeVisible()
    await expect(
      dialog.getByText('プロジェクト確度', { exact: true }),
    ).toHaveCount(0)
    await expect(dialog.getByText('ステータス', { exact: true })).toBeVisible()
  })

  test('プロジェクト（level=0）編集時: タイトルは「プロジェクトを編集」', async ({
    page,
  }) => {
    // 操作列の「編集」アイコンボタン
    await page.locator('[title="編集"]').first().click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByRole('heading', { name: 'プロジェクトを編集' }),
    ).toBeVisible()
    await expect(
      dialog.getByText('プロジェクト確度', { exact: true }),
    ).toBeVisible()
  })
})
