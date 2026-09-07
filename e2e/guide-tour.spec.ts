import { expect, type Page, test } from '@playwright/test'

// ─── Seed Data Helpers ───────────────────────────────────────────────────────

const NOW = '2025-10-01T00:00:00.000Z'

function buildSeedData() {
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [],
    members: [],
    divisions: [],
    sections: [],
    assignments: [],
    metadata: {
      lastModified: NOW,
      createdBy: 'system',
      version: '1.0.0',
    },
  }
}

async function seedAndNavigate(page: Page, path: string) {
  await page.goto('/')
  await page.evaluate((d) => {
    localStorage.setItem('resource-manager-data', JSON.stringify(d))
  }, buildSeedData())
  await page.goto(path)
}

// ─── Tour Helpers ────────────────────────────────────────────────────────────

/** ツアーメニューのポップオーバーを開く */
async function openTourMenu(page: Page) {
  await page.getByRole('button', { name: '操作ガイド' }).click()
  // ポップオーバー内のヘッダーテキストが表示されるまで待機
  await expect(
    page.locator('[data-radix-popper-content-wrapper]'),
  ).toBeVisible()
}

/** ツアーを選択して開始する */
async function startTour(page: Page, tourLabel: string) {
  await openTourMenu(page)
  await page.getByRole('button', { name: tourLabel }).click()
}

/** 指定のステップカウンターが表示されるまで待機し検証する */
async function expectStepVisible(
  page: Page,
  stepNumber: number,
  totalSteps: number,
  title?: string,
) {
  const counter = `${stepNumber} / ${totalSteps}`
  await expect(page.getByText(counter, { exact: true })).toBeVisible({
    timeout: 3000,
  })
  if (title) {
    await expect(page.locator('h4').filter({ hasText: title })).toBeVisible()
  }
}

/**
 * ツアーツールチップ内のボタンを取得する。
 * React Joyride v3 は primaryProps/backProps に英語の aria-label を設定するため
 * getByRole では日本語テキストのボタンが見つからない。
 * テキスト内容でフィルタして取得する。
 */
function tourButton(page: Page, label: string) {
  return page.locator('button').filter({ hasText: label })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('ガイドツアー機能', () => {
  test.describe('ツアーメニューボタン', () => {
    test('サイドバーに操作ガイドボタンが表示される', async ({ page }) => {
      await seedAndNavigate(page, '/dashboard')
      await expect(
        page.getByRole('heading', { name: 'ダッシュボード' }),
      ).toBeVisible({ timeout: 10000 })

      await expect(
        page.getByRole('button', { name: '操作ガイド' }),
      ).toBeVisible()
    })

    test('クリックでポップオーバーが開き全体概要とページ固有ツアーが表示される', async ({
      page,
    }) => {
      await seedAndNavigate(page, '/dashboard')
      await expect(
        page.getByRole('heading', { name: 'ダッシュボード' }),
      ).toBeVisible({ timeout: 10000 })

      await openTourMenu(page)

      // 全体概要は常に表示
      await expect(page.getByRole('button', { name: '全体概要' })).toBeVisible()
      // ダッシュボードページ固有のツアー
      await expect(
        page.getByRole('button', { name: 'ダッシュボードガイド' }),
      ).toBeVisible()
    })

    test('各ページで対応するページ固有ツアーが選択肢に表示される', async ({
      page,
    }) => {
      await seedAndNavigate(page, '/dashboard')
      await expect(
        page.getByRole('heading', { name: 'ダッシュボード' }),
      ).toBeVisible({ timeout: 10000 })

      const routes = [
        { href: '/dashboard', tour: 'ダッシュボードガイド' },
        { href: '/team', tour: 'チームガイド' },
        { href: '/projects', tour: 'プロジェクトガイド' },
        { href: '/wbs', tour: 'WBSガイド' },
        { href: '/schedule', tour: 'スケジュールガイド' },
        { href: '/assignment', tour: 'アサインガイド' },
      ]

      for (const { href, tour } of routes) {
        await page.click(`a[href="${href}"]`)
        await page.waitForLoadState('networkidle')

        await openTourMenu(page)
        await expect(
          page.getByRole('button', { name: '全体概要' }),
        ).toBeVisible()
        await expect(page.getByRole('button', { name: tour })).toBeVisible()
        // ポップオーバーを閉じる
        await page.keyboard.press('Escape')
      }
    })
  })

  test.describe('グローバルツアー', () => {
    test('ツアーを開始すると最初のステップのツールチップが表示される', async ({
      page,
    }) => {
      await seedAndNavigate(page, '/dashboard')
      await expect(
        page.getByRole('heading', { name: 'ダッシュボード' }),
      ).toBeVisible({ timeout: 10000 })

      await startTour(page, '全体概要')

      // ステップ1: サイドバー
      await expectStepVisible(page, 1, 9, 'サイドバー')
      await expect(
        page.getByText(
          'アプリの各機能にはサイドバーからアクセスできます。折りたたみ/展開も可能です。',
        ),
      ).toBeVisible()

      // 最初のステップでは「戻る」ボタンは非表示
      await expect(tourButton(page, '戻る')).not.toBeVisible()
      // 「次へ」ボタンが表示される
      await expect(tourButton(page, '次へ')).toBeVisible()
    })

    test('「次へ」ボタンでステップを進め「戻る」ボタンで前に戻れる', async ({
      page,
    }) => {
      await seedAndNavigate(page, '/dashboard')
      await expect(
        page.getByRole('heading', { name: 'ダッシュボード' }),
      ).toBeVisible({ timeout: 10000 })

      await startTour(page, '全体概要')
      await expectStepVisible(page, 1, 9, 'サイドバー')

      // ステップ2に進む
      await tourButton(page, '次へ').click()
      await expectStepVisible(page, 2, 9)

      // ステップ3に進む
      await tourButton(page, '次へ').click()
      await expectStepVisible(page, 3, 9, 'チーム')

      // 「戻る」でステップ2に戻る
      await tourButton(page, '戻る').click()
      await expectStepVisible(page, 2, 9)

      // さらに「戻る」でステップ1に戻る
      await tourButton(page, '戻る').click()
      await expectStepVisible(page, 1, 9, 'サイドバー')

      // ステップ1では「戻る」が消える
      await expect(tourButton(page, '戻る')).not.toBeVisible()
    })

    test('全ステップを完了するとツアーが終了する', async ({ page }) => {
      await seedAndNavigate(page, '/dashboard')
      await expect(
        page.getByRole('heading', { name: 'ダッシュボード' }),
      ).toBeVisible({ timeout: 10000 })

      await startTour(page, '全体概要')
      await expectStepVisible(page, 1, 9)

      // ステップ1〜8を「次へ」で進む
      for (let i = 1; i < 9; i++) {
        await tourButton(page, '次へ').click()
        await expectStepVisible(page, i + 1, 9)
      }

      // 最後のステップ（9/9）では「完了」が表示される
      await expect(tourButton(page, '完了')).toBeVisible()
      await expect(tourButton(page, '次へ')).not.toBeVisible()

      // 「完了」をクリック
      await tourButton(page, '完了').click()

      // ツールチップが消える
      await expect(page.getByText('9 / 9', { exact: true })).not.toBeVisible({
        timeout: 3000,
      })
    })
  })

  test.describe('ページ固有ツアー', () => {
    test('ダッシュボードガイドを開始し全ステップを完了できる', async ({
      page,
    }) => {
      await seedAndNavigate(page, '/dashboard')
      await expect(
        page.getByRole('heading', { name: 'ダッシュボード' }),
      ).toBeVisible({ timeout: 10000 })

      await startTour(page, 'ダッシュボードガイド')

      // ステップ1: 年度選択
      await expectStepVisible(page, 1, 5, '年度選択')

      // ステップ2: プロジェクト別アサイン
      await tourButton(page, '次へ').click()
      await expectStepVisible(page, 2, 5, 'プロジェクト別アサイン')

      // ステップ3〜4
      await tourButton(page, '次へ').click()
      await expectStepVisible(page, 3, 5, '売上予算 vs 見込売上')

      await tourButton(page, '次へ').click()
      await expectStepVisible(page, 4, 5, 'メンバー別アサイン')

      // ステップ5: 最終（完了ボタン）
      await tourButton(page, '次へ').click()
      await expectStepVisible(page, 5, 5, 'アサイン充足率')
      await expect(tourButton(page, '完了')).toBeVisible()

      // 完了
      await tourButton(page, '完了').click()
      await expect(page.getByText('5 / 5', { exact: true })).not.toBeVisible({
        timeout: 3000,
      })
    })
  })

  test.describe('ツアー終了操作', () => {
    test('ESCキーでツアーを途中終了できる', async ({ page }) => {
      await seedAndNavigate(page, '/dashboard')
      await expect(
        page.getByRole('heading', { name: 'ダッシュボード' }),
      ).toBeVisible({ timeout: 10000 })

      await startTour(page, '全体概要')
      await expectStepVisible(page, 1, 9, 'サイドバー')

      // ESCキーでツアーを閉じる
      await page.keyboard.press('Escape')

      // ツールチップが消える
      await expect(page.getByText('1 / 9', { exact: true })).not.toBeVisible({
        timeout: 3000,
      })
    })

    test('ツアー終了後に再度ツアーを開始できる', async ({ page }) => {
      await seedAndNavigate(page, '/dashboard')
      await expect(
        page.getByRole('heading', { name: 'ダッシュボード' }),
      ).toBeVisible({ timeout: 10000 })

      // 1回目のツアーを開始して終了
      await startTour(page, '全体概要')
      await expectStepVisible(page, 1, 9, 'サイドバー')
      await page.keyboard.press('Escape')
      await expect(page.getByText('1 / 9', { exact: true })).not.toBeVisible({
        timeout: 3000,
      })

      // 2回目のツアーを開始
      await startTour(page, 'ダッシュボードガイド')
      await expectStepVisible(page, 1, 5, '年度選択')
    })
  })
})
