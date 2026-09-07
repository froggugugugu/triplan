import { expect, type Page, test } from '@playwright/test'

/**
 * /budget画面「人員計画」タブ（personnel-plan-storeのgetOrCreateAllCategories/
 * updatePersonnelPlanEntry）が実localStorage（DataAdapter経由）へ正しく永続化されることを
 * 検証する。getOrCreateAllCategoriesはwbs-template-storeのseedStandardTemplateと同種の
 * 「マウント時に無ければ生成する」パターンのため、React StrictMode二重発火や
 * loadPersonnelPlans()との競合で4区分が重複生成されないこと（8件にならないこと）を
 * 明示的に確認する。
 */

const NOW = '2025-10-01T00:00:00.000Z'
const DIV_ID = '00000000-0000-4000-8000-00000000fc01'

function buildSeedData() {
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [],
    members: [],
    divisions: [
      {
        id: DIV_ID,
        name: '開発部',
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    sections: [],
    personnelPlans: [],
    estimatedUnitPrice: 100,
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
  await page.goto('/budget')
  await page
    .getByRole('heading', { name: '予算管理' })
    .waitFor({ state: 'visible', timeout: 10000 })
}

async function gotoPersonnelPlanTab(page: Page) {
  await page.getByRole('button', { name: '人員計画', exact: true }).click()
}

async function getStoredPersonnelPlans(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('resource-manager-data')
    const data = raw ? JSON.parse(raw) : null
    return data?.personnelPlans ?? []
  })
}

test.describe('人員計画タブの4区分自動生成（/budget）', () => {
  test('初回表示で4区分のみ生成され、React StrictModeの二重発火でも重複しない', async ({
    page,
  }) => {
    await seedAndNavigate(page)
    await gotoPersonnelPlanTab(page)

    await expect
      .poll(async () => (await getStoredPersonnelPlans(page)).length)
      .toBe(4)
    const stored = await getStoredPersonnelPlans(page)
    const categories = stored
      .map((p: { category: string }) => p.category)
      .sort()
    expect(categories).toEqual(
      [
        'personnel_external',
        'personnel_internal',
        'planned_external',
        'planned_internal',
      ].sort(),
    )

    // タブを切り替えて戻る（コンポーネントの再マウントを誘発）でも重複しない
    await page
      .getByRole('button', { name: '予実ダッシュボード', exact: true })
      .click()
    await gotoPersonnelPlanTab(page)
    await page.waitForTimeout(500)
    expect(await getStoredPersonnelPlans(page)).toHaveLength(4)

    // リロード後も4件のまま
    await page.reload()
    await page
      .getByRole('heading', { name: '予算管理' })
      .waitFor({ state: 'visible' })
    await gotoPersonnelPlanTab(page)
    await page.waitForTimeout(500)
    expect(await getStoredPersonnelPlans(page)).toHaveLength(4)
  })
})
