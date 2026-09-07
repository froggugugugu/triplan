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
    projects: [makeProject(PROJECT_ID, 'P001', 'テストプロジェクト', 0, null)],
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
 * WBS設定のデフォルト表示名を検証する。
 * 旧テストは「プロジェクト選択がbutton要素」「WBS設定がダイアログ」という旧UI前提で
 * 恒常的に失敗していた（P0-cで刷新）。現行UIはプロジェクト選択がCombobox
 * （role="combobox"）、WBS設定は専用ページ（/wbs-settings/:projectId）。
 */
test.describe('WBS設定: デフォルト表示名「区分」', () => {
  test.beforeEach(async ({ page }) => {
    const seedData = await seedDatabase()
    await page.goto('/')
    await page.evaluate((d) => {
      localStorage.setItem('resource-manager-data', JSON.stringify(d))
    }, seedData)
    await page.goto('/wbs')
  })

  test('WBS設定ページで、デフォルト列の表示名が「区分」になっている', async ({
    page,
  }) => {
    // プロジェクトを選択（Combobox。efforts.spec.tsと同じパターン）
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: /P001/ }).click()

    // WBS設定（アイコンボタン）→ 専用ページへ遷移
    await page.locator('[title="WBS設定"]').click()
    await expect(page).toHaveURL(new RegExp(`/wbs-settings/${PROJECT_ID}`))

    // デフォルト列（effort-1）の表示名が「区分」であることを確認
    const firstColumnNameInput = page.getByRole('textbox').first()
    await expect(firstColumnNameInput).toHaveValue('区分')
  })
})
