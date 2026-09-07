import { expect, test } from '@playwright/test'

/**
 * 管理画面。
 * 全社設定はメニュー内での直接編集（ポップオーバー）をやめ、マスタ系と同じ
 * 左ペイン＋右ペインの管理画面へ統合した。ここでは
 * ①業務画面との行き来 ②旧URLからの転送 ③設定値の実localStorageへの永続化
 * を固定する。
 */

test.describe('管理画面', () => {
  test('システム設定ボタンから入り、「システムに戻る」で業務画面へ戻れる', async ({
    page,
  }) => {
    await page.goto('/dashboard')

    await page.getByRole('button', { name: '管理画面を開く' }).click()
    await expect(
      page.getByRole('heading', { name: '全社設定', level: 1 }),
    ).toBeVisible()

    // 左ペインのメニューからマスタへ移動できる（同じレイアウトのまま）
    await page.getByRole('link', { name: '技術タグ' }).click()
    await expect(page).toHaveURL(/\/admin\/tech-tags$/)
    await expect(
      page.getByRole('button', { name: 'システムに戻る' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'システムに戻る' }).click()
    await expect(
      page.getByRole('heading', { name: 'ダッシュボード' }),
    ).toBeVisible({ timeout: 10000 })
  })

  test('旧URLは管理画面へ転送される（ブックマーク・既存リンクを壊さない）', async ({
    page,
  }) => {
    for (const [oldPath, newPath] of [
      ['/companies', '/admin/companies'],
      ['/tech-tags', '/admin/tech-tags'],
      ['/wbs-templates', '/admin/wbs-templates'],
      ['/document-templates', '/admin/document-templates'],
    ]) {
      await page.goto(oldPath)
      await expect(page).toHaveURL(new RegExp(`${newPath}$`))
    }
  })

  test('全社設定の変更が実localStorageへ永続化され、リロード後も残る', async ({
    page,
  }) => {
    await page.goto('/admin/settings')

    const workdays = page.getByLabel('人月換算')
    await workdays.fill('18')
    await workdays.blur()

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem('resource-manager-data')
          return raw
            ? (JSON.parse(raw) as { workdaysPerMonth?: number })
                .workdaysPerMonth
            : undefined
        }),
      )
      .toBe(18)

    await page.reload()
    await expect(page.getByLabel('人月換算')).toHaveValue('18')
  })

  test('反証: 設定ボタンはポップオーバーではなく画面遷移する', async ({
    page,
  }) => {
    await page.goto('/dashboard')
    await page.getByRole('button', { name: '管理画面を開く' }).click()

    // 旧実装（その場で開くポップオーバー）ならURLは/dashboardのまま。
    // 遷移していることが「別画面へ切り出した」ことの証拠になる
    await expect(page).toHaveURL(/\/admin\/settings$/)
    await expect(
      page.getByRole('heading', { name: 'ダッシュボード' }),
    ).toHaveCount(0)
  })
})
