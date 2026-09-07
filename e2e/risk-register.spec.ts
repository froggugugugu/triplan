import { expect, type Page, test } from '@playwright/test'

/**
 * リスク登録簿（非公開の設計文書）。
 *
 * - ダイアログでの登録が実localStorage（DataAdapter経由）へ永続化され、
 *   リロード後も残る
 * - 重大リスク（確率高×影響高）がプロジェクトサマリーのR9判定（要注意）と
 *   リスク区画に現れる（登録→判定への一気通貫）
 * - 反証: 内容が空のままでは追加できない
 */

const NOW = '2025-10-01T00:00:00.000Z'
const PROJECT_ID = '00000000-0000-4000-8000-00000000cc01'

function buildSeedData() {
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [
      {
        id: PROJECT_ID,
        code: 'P900',
        name: 'リスク検証案件',
        description: '',
        parentId: null,
        level: 0,
        status: 'active' as const,
        confidence: 'S' as const,
        contractAmount: 1000,
        completed: false,
        createdAt: NOW,
        updatedAt: NOW,
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

async function seedAndOpenDialog(page: Page) {
  await page.goto('/')
  await page.evaluate((d) => {
    localStorage.setItem('resource-manager-data', JSON.stringify(d))
  }, buildSeedData())
  await page.goto('/projects')
  await page
    .getByRole('button', { name: 'リスク登録簿（識別・評価・対応・監視）' })
    .first()
    .click()
  await expect(
    page.getByRole('heading', { name: /リスク登録簿 — リスク検証案件/ }),
  ).toBeVisible()
}

test.describe('リスク登録簿', () => {
  test('登録が実localStorageへ永続化され、サマリーのR9判定とリスク区画に現れる', async ({
    page,
  }) => {
    await seedAndOpenDialog(page)

    const dialog = page.getByRole('dialog')

    // 反証: 内容が空のままでは追加できない
    await expect(dialog.getByRole('button', { name: '追加' })).toBeDisabled()

    // 確率:高 × 影響:高 の重大リスクを登録する
    await dialog.getByLabel('内容').fill('主要メンバーの離任リスク')
    await dialog.getByLabel('発生確率').click()
    await page.getByRole('option', { name: '高', exact: true }).click()
    await dialog.getByLabel('影響度').click()
    await page.getByRole('option', { name: '高', exact: true }).click()
    await dialog.getByLabel('対応方針').fill('代替要員の育成を前倒しする')
    await dialog.getByRole('button', { name: '追加' }).click()

    // 一覧に重大バッジ付きで表示される
    await expect(dialog.getByText('主要メンバーの離任リスク')).toBeVisible()
    await expect(dialog.getByText('重大', { exact: true })).toBeVisible()

    // 実localStorageへの永続化（DataAdapter経由の楽観的更新の完了を待つ）
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem('resource-manager-data')
          if (!raw) return 0
          const db = JSON.parse(raw) as {
            riskEntries?: { title: string; probability: string }[]
          }
          return (db.riskEntries ?? []).length
        }),
      )
      .toBe(1)

    // リロードしても残る
    await page.reload()
    await page
      .getByRole('button', { name: 'リスク登録簿（識別・評価・対応・監視）' })
      .first()
      .click()
    await expect(
      page.getByRole('dialog').getByText('主要メンバーの離任リスク'),
    ).toBeVisible()
    await page.keyboard.press('Escape')

    // プロジェクトサマリー: R9判定（要注意）とリスク区画に現れる
    await page.goto(`/project-summary?projectId=${PROJECT_ID}`)
    await expect(page.getByTestId('summary-overall')).toHaveText('要注意')
    await expect(
      page.getByText(/重大リスク（発生確率:高×影響:高）が1件/),
    ).toBeVisible()
    // リスク区画に登録したリスクが行として現れる（CardTitleはheading roleを持たないため
    // 区画内の実データで検証する）
    await expect(page.getByText('主要メンバーの離任リスク')).toBeVisible()
  })

  test('状態をclosedへ変えるとR9判定が消える（反証: 解消済みは警戒対象でない）', async ({
    page,
  }) => {
    await seedAndOpenDialog(page)
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('内容').fill('解消予定のリスク')
    await dialog.getByLabel('発生確率').click()
    await page.getByRole('option', { name: '高', exact: true }).click()
    await dialog.getByLabel('影響度').click()
    await page.getByRole('option', { name: '高', exact: true }).click()
    await dialog.getByRole('button', { name: '追加' }).click()
    await expect(dialog.getByText('解消予定のリスク')).toBeVisible()

    // 状態を「解消」へ
    await dialog.getByLabel('「解消予定のリスク」の状態').click()
    await page.getByRole('option', { name: '解消' }).click()

    // localStorageの永続化を待つ（status: closed）
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem('resource-manager-data')
          if (!raw) return null
          const db = JSON.parse(raw) as {
            riskEntries?: { status: string }[]
          }
          return db.riskEntries?.[0]?.status ?? null
        }),
      )
      .toBe('closed')

    await page.keyboard.press('Escape')
    await page.goto(`/project-summary?projectId=${PROJECT_ID}`)
    // R9は出ない（closedは数えない）。判定材料はあるため「良好」になる
    await expect(page.getByTestId('summary-overall')).toHaveText('良好')
    await expect(page.getByText(/重大リスク（発生確率:高/)).toHaveCount(0)
  })
})
