import { expect, test } from '@playwright/test'

// ─── Seed Data Constants ───────────────────────────────────────────────────────

const NOW = '2025-10-01T00:00:00.000Z'

const DIV_DEV_ID = '00000000-0000-4000-8000-00000000dd01'
const SEC_1_ID = '00000000-0000-4000-8000-0000000000c1'

// ─── Seed Data Helpers ─────────────────────────────────────────────────────────

function makeDivision(id: string, name: string, sortOrder: number) {
  return { id, name, sortOrder, createdAt: NOW, updatedAt: NOW }
}

function makeSection(
  id: string,
  divisionId: string,
  name: string,
  sortOrder: number,
) {
  return { id, divisionId, name, sortOrder, createdAt: NOW, updatedAt: NOW }
}

/**
 * シードデータを注入する
 */
async function seedDatabase() {
  const seedData = {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [],
    members: [],
    divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
    sections: [makeSection(SEC_1_ID, DIV_DEV_ID, '第1課', 0)],
    metadata: {
      lastModified: NOW,
      createdBy: 'e2e-test',
      version: '1.0.0',
    },
  }
  return seedData
}

test.describe('担当者編集: 開始日のデフォルト動作', () => {
  test.beforeEach(async ({ page }) => {
    const seedData = await seedDatabase()
    await page.goto('/')
    await page.evaluate((d) => {
      localStorage.setItem('resource-manager-data', JSON.stringify(d))
    }, seedData)
    await page.reload()
  })

  test('担当者追加ダイアログを開いた時、開始日が今日の日付になる', async ({
    page,
  }) => {
    // チームページに移動
    await page.goto('/team')
    await page.waitForSelector('button:has-text("メンバー追加")')

    // 今日の日付を取得（YYYY-MM-DD形式）
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    const todayStr = `${year}-${month}-${day}`

    // 担当者追加ダイアログを開く（メンバー追加ボタンをクリック）
    await page.getByRole('button', { name: 'メンバー追加' }).click()

    // ダイアログが開いていることを確認
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('新規担当者')).toBeVisible()

    // 開始日フィールドの値が今日の日付であることを確認
    const dialog = page.getByRole('dialog')
    const startDateInput = dialog.locator('#member-start-date')
    await expect(startDateInput).toHaveValue(todayStr)

    // 終了日フィールドは空であることを確認
    const endDateInput = dialog.locator('#member-end-date')
    await expect(endDateInput).toHaveValue('')
  })

  test('担当者を追加すると、開始日が今日の日付で保存される', async ({
    page,
  }) => {
    await page.goto('/team')
    await page.waitForSelector('button:has-text("メンバー追加")')

    // 今日の日付を取得
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    const todayStr = `${year}-${month}-${day}`

    // 担当者追加ダイアログを開く
    await page.getByRole('button', { name: 'メンバー追加' }).click()

    // ダイアログが開いていることを確認
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // 必須フィールドを入力（開始日はデフォルト値のまま）
    await dialog.locator('#member-name').fill('田中太郎')

    // 追加ボタンをクリック
    await dialog.getByRole('button', { name: '追加', exact: true }).click()

    // ダイアログが閉じることを確認
    await expect(dialog).not.toBeVisible({ timeout: 5000 })

    // localStorageから保存されたデータを確認
    const savedData = await page.evaluate(() => {
      const json = localStorage.getItem('resource-manager-data')
      return json ? JSON.parse(json) : null
    })

    expect(savedData).not.toBeNull()
    expect(savedData.members).toHaveLength(1)
    expect(savedData.members[0].name).toBe('田中太郎')
    expect(savedData.members[0].startDate).toBe(todayStr)
    expect(savedData.members[0].endDate).toBeNull()
  })

  test('既存の担当者を編集すると、開始日が維持される', async ({ page }) => {
    // 既存の担当者データを含むシードデータを注入
    const seedData = await seedDatabase()
    const existingMemberId = '00000000-0000-4000-8000-0000000000a1'
    seedData.members = [
      {
        id: existingMemberId,
        name: '鈴木花子',
        sectionId: SEC_1_ID,
        role: 'PM',
        isActive: true,
        techTagIds: [],
        startDate: '2025-01-15',
        endDate: null,
        unitPriceHistory: [{ effectiveFrom: '2025-01', amount: 100 }],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]

    await page.goto('/')
    await page.evaluate((d) => {
      localStorage.setItem('resource-manager-data', JSON.stringify(d))
    }, seedData)
    await page.reload()

    await page.goto('/team')
    await page.waitForSelector('text=鈴木花子')

    // 担当者の行にホバーして編集ボタンをクリック
    const memberRow = page
      .getByText('鈴木花子')
      .locator('xpath=ancestor::div[contains(@class, "group")]')
    await memberRow.hover()
    await memberRow.getByRole('button', { name: '編集', exact: true }).click()

    // ダイアログが開いていることを確認
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('担当者を編集')).toBeVisible()

    // 開始日フィールドの値が既存の値であることを確認
    const startDateInput = dialog.locator('#member-start-date')
    await expect(startDateInput).toHaveValue('2025-01-15')

    // 名前だけ変更
    await dialog.locator('#member-name').fill('鈴木花子（更新）')

    // 更新ボタンをクリック
    await dialog.getByRole('button', { name: '更新' }).click()

    // ダイアログが閉じることを確認
    await expect(dialog).not.toBeVisible({ timeout: 5000 })

    // localStorageから保存されたデータを確認
    const savedData = await page.evaluate(() => {
      const json = localStorage.getItem('resource-manager-data')
      return json ? JSON.parse(json) : null
    })

    expect(savedData).not.toBeNull()
    expect(savedData.members).toHaveLength(1)
    expect(savedData.members[0].name).toBe('鈴木花子（更新）')
    expect(savedData.members[0].startDate).toBe('2025-01-15') // 維持される
  })

  test('終了日フィールドは開始日より前の日付を入力できない（HTMLバリデーション）', async ({
    page,
  }) => {
    await page.goto('/team')
    await page.waitForSelector('button:has-text("メンバー追加")')

    // 担当者追加ダイアログを開く
    await page.getByRole('button', { name: 'メンバー追加' }).click()

    // ダイアログが開いていることを確認
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // 開始日を設定
    await dialog.locator('#member-start-date').fill('2025-04-30')

    // 終了日フィールドのmin属性が開始日に設定されていることを確認
    const endDateInput = dialog.locator('#member-end-date')
    await expect(endDateInput).toHaveAttribute('min', '2025-04-30')

    // 開始日が未設定の場合、終了日フィールドは無効化されていることを確認
    await dialog.locator('#member-start-date').fill('')
    await expect(endDateInput).toBeDisabled()
  })
})
