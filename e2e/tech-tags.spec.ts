import { expect, type Page, test } from '@playwright/test'

/**
 * /tech-tags画面（TechTagsPage）のマスタデータ初回シード（tech-tags-storeのseedFromMaster）が
 * 実localStorage（DataAdapter経由）へ正しく永続化され、React StrictModeの二重発火・タブ切替相当の
 * 再マウント・リロードいずれでも重複生成しないことを検証する（17ストアのDataAdapter配線・第10弾）。
 * wbs-template-store（seedStandardTemplate）で発見した重複シードバグの回帰確認も兼ねる。
 */

const NOW = '2025-10-01T00:00:00.000Z'

function buildSeedData() {
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [],
    members: [],
    techTags: [],
    techTagCategories: [],
    techTagSubCategories: [],
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
  await page.goto('/tech-tags')
  await page
    .getByRole('heading', { name: '技術タグ管理' })
    .waitFor({ state: 'visible', timeout: 10000 })
}

async function getStoredCounts(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('resource-manager-data')
    const data = raw ? JSON.parse(raw) : null
    return {
      tags: data?.techTags?.length ?? 0,
      categories: data?.techTagCategories?.length ?? 0,
      subCategories: data?.techTagSubCategories?.length ?? 0,
    }
  })
}

test.describe('技術タグ管理のマスタデータ自動シード（/tech-tags）', () => {
  test('初回表示で199タグ・17カテゴリちょうど生成され、リロードしても重複しない', async ({
    page,
  }) => {
    await seedAndNavigate(page)

    await expect
      .poll(async () => (await getStoredCounts(page)).tags, { timeout: 10000 })
      .toBe(199)
    const counts = await getStoredCounts(page)
    expect(counts.categories).toBe(17)
    expect(counts.subCategories).toBeGreaterThan(0)

    await page.reload()
    await page
      .getByRole('heading', { name: '技術タグ管理' })
      .waitFor({ state: 'visible' })
    await page.waitForTimeout(500)
    const afterReload = await getStoredCounts(page)
    expect(afterReload.tags).toBe(199)
    expect(afterReload.categories).toBe(17)
  })
})
