import { expect, type Page, test } from '@playwright/test'

/**
 * 体制メモ・アサインスナップショット（/assignment）。
 *
 * どちらも実localStorage（DataAdapter経由）へ永続化されることと、
 * スナップショットの差分が「記録した時点」と「現在」の違いを正しく出すことを検証する。
 * 差分の算出そのものは純関数のユニットテストで網羅しているので、ここでは
 * **記録→編集→差分表示という一連の動線が実データで通ること**に絞る。
 */

const NOW = '2025-10-01T00:00:00.000Z'
const PRJ = '00000000-0000-4000-8000-00000000ab01'
const TASK = '00000000-0000-4000-8000-00000000ab02'
const MEM = '00000000-0000-4000-8000-00000000ab03'
const ASSIGN = '00000000-0000-4000-8000-00000000ab04'

function buildSeedData() {
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [
      {
        id: PRJ,
        code: 'P800',
        name: '体制メモ検証案件',
        description: '',
        background: '',
        purpose: '',
        parentId: null,
        level: 0,
        status: 'active' as const,
        confidence: null,
        completed: false,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: TASK,
        code: 'P800-01',
        name: '設計タスク',
        description: '',
        background: '',
        purpose: '',
        parentId: PRJ,
        level: 1,
        status: 'active' as const,
        confidence: null,
        completed: false,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    members: [
      {
        id: MEM,
        name: '記録太郎',
        sectionId: null,
        role: 'エンジニア',
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
        id: ASSIGN,
        projectId: PRJ,
        taskId: TASK,
        memberId: MEM,
        monthlyValues: { '2025-10': 0.5 },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    divisions: [],
    sections: [],
    efforts: [],
    metadata: { lastModified: NOW, createdBy: 'system', version: '1.0.0' },
  }
}

async function seedAndOpen(page: Page) {
  await page.goto('/')
  await page.evaluate((d) => {
    localStorage.setItem('resource-manager-data', JSON.stringify(d))
  }, buildSeedData())
  await page.clock.setFixedTime(new Date('2025-10-01T09:00:00'))
  await page.goto('/assignment')
  await page.getByRole('combobox').first().click()
  await page
    .locator('[cmdk-list] [role="option"]')
    .filter({ hasText: 'P800' })
    .first()
    .dispatchEvent('click')
  await expect(page.getByRole('combobox').first()).toContainText('P800')
}

/** localStorageに保存された体制メモを読む */
async function readNotes(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('resource-manager-data')
    const db = raw ? JSON.parse(raw) : {}
    return (db.assignmentNotes ?? []) as Array<{ body: string }>
  })
}

test.describe('体制メモ', () => {
  test('追加した内容が実localStorageへ永続化され、リロード後も残る', async ({
    page,
  }) => {
    await seedAndOpen(page)

    await page
      .getByPlaceholder('体制の申し送りを残す', { exact: false })
      .fill('9月から2名増員、予算は変更なし')
    await page.getByRole('button', { name: '体制メモを追加' }).click()

    await expect(page.getByText('9月から2名増員、予算は変更なし')).toBeVisible()
    await expect
      .poll(async () => (await readNotes(page)).length, { timeout: 5000 })
      .toBe(1)

    // リロードするとプロジェクト選択は復元されない（既存仕様）ため選び直す
    await page.reload()
    await page.getByRole('combobox').first().click()
    await page
      .locator('[cmdk-list] [role="option"]')
      .filter({ hasText: 'P800' })
      .first()
      .dispatchEvent('click')
    await expect(page.getByText('9月から2名増員、予算は変更なし')).toBeVisible({
      timeout: 15000,
    })
  })

  test('反証: 空白のみのメモは追加できない', async ({ page }) => {
    await seedAndOpen(page)
    await page
      .getByPlaceholder('体制の申し送りを残す', { exact: false })
      .fill('   ')
    await expect(
      page.getByRole('button', { name: '追加' }).last(),
    ).toBeDisabled()
    expect(await readNotes(page)).toHaveLength(0)
  })
})

test.describe('アサインスナップショット', () => {
  test('記録した体制と現在の差分が表示される', async ({ page }) => {
    await seedAndOpen(page)

    // 現在の体制を記録する
    await page.getByRole('button', { name: /スナップショット/ }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('記録の名前').fill('10月キックオフ時点')
    await dialog.getByRole('button', { name: 'いまの体制を記録' }).click()
    await expect(dialog.getByText('10月キックオフ時点')).toBeVisible()

    // 記録直後は差分なし
    await dialog.getByRole('button', { name: '現在と比較' }).click()
    await expect(
      dialog.getByText('記録した時点から体制は変わっていません'),
    ).toBeVisible()

    // 配分を変えてから再比較する（アサインを直接書き換えてリロード）
    await page.evaluate(
      ({ assignId }) => {
        const raw = localStorage.getItem('resource-manager-data')
        const db = JSON.parse(raw ?? '{}')
        const target = db.assignments.find(
          (a: { id: string }) => a.id === assignId,
        )
        target.monthlyValues['2025-10'] = 0.2
        localStorage.setItem('resource-manager-data', JSON.stringify(db))
      },
      { assignId: ASSIGN },
    )
    await page.reload()
    await page.getByRole('combobox').first().click()
    await page
      .locator('[cmdk-list] [role="option"]')
      .filter({ hasText: 'P800' })
      .first()
      .dispatchEvent('click')

    await page.getByRole('button', { name: /スナップショット/ }).click()
    const dialog2 = page.getByRole('dialog')
    await dialog2.getByRole('button', { name: '現在と比較' }).click()

    // 反証: 変化した月と増減が出る（0.5 → 0.20 で -0.30）
    await expect(dialog2.getByRole('cell', { name: '変更' })).toBeVisible()
    await expect(dialog2.getByText('記録太郎')).toBeVisible()
    await expect(dialog2.getByText('2025-10: 0.50 → 0.20')).toBeVisible()
    await expect(dialog2.getByText('-0.30').first()).toBeVisible()
  })

  test('反証: 名前を入れないと記録できない', async ({ page }) => {
    await seedAndOpen(page)
    await page.getByRole('button', { name: /スナップショット/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(
      dialog.getByRole('button', { name: 'いまの体制を記録' }),
    ).toBeDisabled()
  })
})
