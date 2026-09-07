import { expect, type Page, test } from '@playwright/test'

/**
 * /wbs-templates画面（WbsTemplatesPage）のCRUDが実localStorage（DataAdapter経由）へ
 * 正しく永続化されることを検証する。wbs-template-storeをjsonStorage直呼び出しから
 * DataAdapter経由の楽観的更新へ書き換えた際（17ストアのDataAdapter配線・第4弾）、
 * addWbsTemplateの戻り値idを同期的にselectedIdへ使う実装のため、idの安定性
 * （非公開の設計文書/§7.2の解決策）が正しく効いていることも
 * 併せて確認する。このページ自体を検証するE2Eが元々存在しなかったため新規作成した。
 */

const NOW = '2025-10-01T00:00:00.000Z'

function buildSeedData() {
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [],
    members: [],
    wbsTemplates: [],
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
  await page.goto('/wbs-templates')
  await page
    .getByRole('heading', { name: 'WBSテンプレート' })
    .waitFor({ state: 'visible', timeout: 10000 })
}

async function getStoredTemplates(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('resource-manager-data')
    const data = raw ? JSON.parse(raw) : null
    return data?.wbsTemplates ?? []
  })
}

test.describe('WBSテンプレート管理（/wbs-templates）', () => {
  test('新規作成したテンプレートが実localStorageへ永続化され、リロード後も残る', async ({
    page,
  }) => {
    await seedAndNavigate(page)
    // マウント時のseedStandardTemplateで標準テンプレートが1件自動作成される
    await expect
      .poll(async () => (await getStoredTemplates(page)).length)
      .toBe(1)

    await page.getByRole('button', { name: '新規テンプレート作成' }).click()
    await expect
      .poll(async () => (await getStoredTemplates(page)).length)
      .toBe(2)

    const nameInput = page.getByLabel('テンプレート名')
    await expect(nameInput).toHaveValue('新規テンプレート')
    await nameInput.fill('カスタムテンプレート')
    await nameInput.blur()

    await expect
      .poll(async () =>
        (await getStoredTemplates(page)).some(
          (t: { name: string }) => t.name === 'カスタムテンプレート',
        ),
      )
      .toBe(true)

    await page.reload()
    await page
      .getByRole('heading', { name: 'WBSテンプレート' })
      .waitFor({ state: 'visible' })
    const stored = await getStoredTemplates(page)
    expect(stored).toHaveLength(2)
    expect(
      stored.some((t: { name: string }) => t.name === 'カスタムテンプレート'),
    ).toBe(true)
  })

  test('テンプレートを削除すると実localStorageからも消え、リロード後も復活しない', async ({
    page,
  }) => {
    await seedAndNavigate(page)
    await expect
      .poll(async () => (await getStoredTemplates(page)).length)
      .toBe(1)

    await page.getByRole('button', { name: '新規テンプレート作成' }).click()
    await expect
      .poll(async () => (await getStoredTemplates(page)).length)
      .toBe(2)

    await page.getByRole('button', { name: '削除', exact: true }).click()
    const dialog = page
      .getByRole('dialog')
      .filter({ hasText: 'テンプレートの削除' })
    await dialog.getByRole('button', { name: '削除', exact: true }).click()

    await expect
      .poll(async () => (await getStoredTemplates(page)).length)
      .toBe(1)

    await page.reload()
    await page
      .getByRole('heading', { name: 'WBSテンプレート' })
      .waitFor({ state: 'visible' })
    expect(await getStoredTemplates(page)).toHaveLength(1)
  })
})
