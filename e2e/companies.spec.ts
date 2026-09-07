import { expect, type Page, test } from '@playwright/test'

/**
 * /companies画面（CompaniesPage）のCRUDが実localStorage（DataAdapter経由）に
 * 正しく永続化されることを検証する。companies-storeをjsonStorage直呼び出しから
 * DataAdapter経由の楽観的更新へ書き換えた際、ユニットテストは
 * モック化したDataAdapterに対して行っているため、実ブラウザ・実localStorageでの
 * 反証はこのE2Eが唯一の経路になる。
 */

const NOW = '2025-10-01T00:00:00.000Z'

function buildSeedData() {
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [],
    members: [],
    companies: [],
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
  await page.goto('/companies')
  await page
    .getByRole('heading', { name: '所属会社' })
    .waitFor({ state: 'visible', timeout: 10000 })
}

async function getStoredCompanies(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('resource-manager-data')
    const data = raw ? JSON.parse(raw) : null
    return data?.companies ?? []
  })
}

test.describe('所属会社管理（/companies）', () => {
  test('追加した所属会社がlocalStorageへ実際に永続化され、リロード後も残る', async ({
    page,
  }) => {
    await seedAndNavigate(page)

    await page.getByRole('button', { name: '所属会社を追加' }).click()
    await page.getByLabel('名称').fill('テスト株式会社')
    await page.getByLabel('内部リソース').check()
    await page.getByRole('button', { name: '追加', exact: true }).click()

    await expect(page.getByText('テスト株式会社')).toBeVisible()

    // DataAdapter確定後の値が実localStorageへ書き込まれるまで待つ（楽観的更新の
    // 差し替えは非同期のため、リロード前に永続化を待機する）
    await expect
      .poll(async () => (await getStoredCompanies(page)).length)
      .toBe(1)
    const stored = await getStoredCompanies(page)
    expect(stored[0].name).toBe('テスト株式会社')
    expect(stored[0].isInternal).toBe(true)

    // 実際にページをリロードし、jsonStorageからの再読み込み（loadCompanies）経由でも
    // 正しく表示されることを確認する（Reactの楽観的state更新だけが表示されているのではなく
    // 実データが永続化されていることの反証）
    await page.reload()
    await page
      .getByRole('heading', { name: '所属会社' })
      .waitFor({ state: 'visible' })
    await expect(page.getByText('テスト株式会社')).toBeVisible()
    await expect(page.getByText('内部リソース')).toBeVisible()
  })

  test('所属会社を編集すると、内容がlocalStorageへ反映されリロード後も残る', async ({
    page,
  }) => {
    await seedAndNavigate(page)

    await page.getByRole('button', { name: '所属会社を追加' }).click()
    await page.getByLabel('名称').fill('編集前株式会社')
    await page.getByRole('button', { name: '追加', exact: true }).click()
    await expect(page.getByText('編集前株式会社')).toBeVisible()
    await expect
      .poll(async () => (await getStoredCompanies(page)).length)
      .toBe(1)

    const row = page.locator('.group').filter({ hasText: '編集前株式会社' })
    await row.hover()
    await row.locator('button[title="所属会社名を編集"]').click()
    await page.getByLabel('名称').fill('編集後株式会社')
    await page.getByRole('button', { name: '更新', exact: true }).click()

    await expect(page.getByText('編集後株式会社')).toBeVisible()
    await expect(page.getByText('編集前株式会社')).not.toBeVisible()

    await expect
      .poll(async () => (await getStoredCompanies(page))[0]?.name)
      .toBe('編集後株式会社')

    await page.reload()
    await page
      .getByRole('heading', { name: '所属会社' })
      .waitFor({ state: 'visible' })
    await expect(page.getByText('編集後株式会社')).toBeVisible()
  })

  test('所属会社を削除すると、localStorageからも消えリロード後も復活しない', async ({
    page,
  }) => {
    await seedAndNavigate(page)

    await page.getByRole('button', { name: '所属会社を追加' }).click()
    await page.getByLabel('名称').fill('削除対象株式会社')
    await page.getByRole('button', { name: '追加', exact: true }).click()
    await expect(page.getByText('削除対象株式会社')).toBeVisible()
    await expect
      .poll(async () => (await getStoredCompanies(page)).length)
      .toBe(1)

    const row = page.locator('.group').filter({ hasText: '削除対象株式会社' })
    await row.hover()
    await row.locator('button[title="所属会社を削除"]').click()
    await page.getByRole('button', { name: '削除', exact: true }).click()

    await expect(page.getByText('削除対象株式会社')).not.toBeVisible()
    await expect
      .poll(async () => (await getStoredCompanies(page)).length)
      .toBe(0)

    await page.reload()
    await page
      .getByRole('heading', { name: '所属会社' })
      .waitFor({ state: 'visible' })
    await expect(page.getByText('削除対象株式会社')).not.toBeVisible()
    expect(await getStoredCompanies(page)).toHaveLength(0)
  })
})
