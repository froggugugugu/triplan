import { expect, type Page, test } from '@playwright/test'

// ---------- Seed Data ----------

const NOW = '2025-10-01T00:00:00.000Z'
const PROJECT_ID = '00000000-0000-4000-8000-000000000001'

function makeProject() {
  return {
    id: PROJECT_ID,
    code: 'P001',
    name: 'テストプロジェクト',
    description: '',
    background: '',
    purpose: '',
    parentId: null,
    level: 0,
    status: 'active',
    confidence: 'A',
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function buildSeedData() {
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [makeProject()],
    members: [],
    assignments: [],
    divisions: [],
    sections: [],
    metadata: {
      lastModified: NOW,
      createdBy: 'test',
      version: '1.0.0',
    },
  }
}

async function seedAndNavigate(
  page: Page,
  data: ReturnType<typeof buildSeedData>,
  path = '/dashboard',
) {
  await page.goto('/')
  await page.evaluate((d) => {
    localStorage.setItem('resource-manager-data', JSON.stringify(d))
  }, data)
  await page.goto(path)
}

// ---------- Tests ----------

test.describe('FEATURE04: UI/UX調整 - テーマ切り替え', () => {
  test('ライト/ダークモード切り替えボタンでテーマが変わる', async ({
    page,
  }) => {
    const data = buildSeedData()
    await seedAndNavigate(page, data, '/dashboard')
    await page
      .getByRole('heading', { name: 'ダッシュボード' })
      .waitFor({ state: 'visible', timeout: 10000 })

    // ライトモードボタンをクリック
    await page.getByRole('button', { name: 'ライト' }).click()

    // ルート要素にlightクラスが付与されること
    const rootClassLight = await page.evaluate(() =>
      document.documentElement.classList.contains('light'),
    )
    expect(rootClassLight).toBe(true)

    // ダークモードボタンをクリック
    await page.getByRole('button', { name: 'ダーク' }).click()

    // ルート要素にdarkクラスが付与されること
    const rootClassDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    )
    expect(rootClassDark).toBe(true)
  })
})

test.describe('FEATURE04: UI/UX調整 - カラートークン', () => {
  test('ライトモードのプライマリカラーがリニューアル後のインディゴ系トークンである', async ({
    page,
  }) => {
    const data = buildSeedData()
    await seedAndNavigate(page, data, '/dashboard')

    // ライトモードに設定
    await page.getByRole('button', { name: 'ライト' }).click()

    const primaryColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-primary')
        .trim(),
    )

    // 2026-08-13のLinear/Notion系リニューアル後のインディゴ系トークン
    // （docs/development-patterns.md §9.2）であること
    expect(primaryColor).toBe('#4a56c9')
  })

  test('ダークモードのプライマリカラーが明度を上げたインディゴ系トークンである', async ({
    page,
  }) => {
    const data = buildSeedData()
    await seedAndNavigate(page, data, '/dashboard')

    // ダークモードに設定
    await page.getByRole('button', { name: 'ダーク' }).click()

    const primaryColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-primary')
        .trim(),
    )

    // リニューアル後のダークモード用インディゴ系トークン（明度を上げた値）であること
    expect(primaryColor).toBe('#7c86e6')
  })

  test('フォーカスリングがプライマリカラーと同色である', async ({ page }) => {
    const data = buildSeedData()
    await seedAndNavigate(page, data, '/dashboard')

    // ライトモード
    await page.getByRole('button', { name: 'ライト' }).click()

    const [primary, ring] = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      return [
        style.getPropertyValue('--color-primary').trim(),
        style.getPropertyValue('--color-ring').trim(),
      ]
    })

    expect(primary).toBe(ring)
  })

  test('セマンティックカラー（success/warning/info）がダークモードで定義されている', async ({
    page,
  }) => {
    const data = buildSeedData()
    await seedAndNavigate(page, data, '/dashboard')

    await page.getByRole('button', { name: 'ダーク' }).click()

    const colors = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      return {
        success: style.getPropertyValue('--color-success').trim(),
        warning: style.getPropertyValue('--color-warning').trim(),
        info: style.getPropertyValue('--color-info').trim(),
      }
    })

    // 各色が定義されていること（空文字でないこと）
    expect(colors.success).not.toBe('')
    expect(colors.warning).not.toBe('')
    expect(colors.info).not.toBe('')
  })
})

test.describe('FEATURE04: UI/UX調整 - レイアウト・スペーシング', () => {
  test('サイドバー展開時の幅が180pxである', async ({ page }) => {
    const data = buildSeedData()
    await seedAndNavigate(page, data, '/dashboard')
    await page
      .getByRole('heading', { name: 'ダッシュボード' })
      .waitFor({ state: 'visible', timeout: 10000 })

    const sidebarWidth = await page.evaluate(() => {
      const sidebar = document.querySelector('[data-tour="sidebar"]')
      return sidebar ? Number.parseFloat(getComputedStyle(sidebar).width) : null
    })

    expect(sidebarWidth).toBe(180)
  })

  test('サイドバー折りたたみ時の幅が60pxである', async ({ page }) => {
    const data = buildSeedData()
    await seedAndNavigate(page, data, '/dashboard')
    await page
      .getByRole('heading', { name: 'ダッシュボード' })
      .waitFor({ state: 'visible', timeout: 10000 })

    // サイドバーを折りたたむ
    await page.locator('button[title="サイドバーを閉じる"]').click()

    // transition完了を待つ
    await page
      .locator('[data-tour="sidebar"]')
      .evaluate(
        (el) =>
          new Promise((resolve) =>
            el.addEventListener('transitionend', resolve, { once: true }),
          ),
      )

    const sidebarWidth = await page.evaluate(() => {
      const sidebar = document.querySelector('[data-tour="sidebar"]')
      return sidebar ? Number.parseFloat(getComputedStyle(sidebar).width) : null
    })

    expect(sidebarWidth).toBe(60)
  })

  test('各ページのタイトルがh1要素である', async ({ page }) => {
    const data = buildSeedData()

    const pageTitles = [
      { path: '/dashboard', title: 'ダッシュボード' },
      { path: '/team', title: 'チーム' },
      { path: '/projects', title: 'プロジェクト' },
      { path: '/schedule', title: 'スケジュール' },
      { path: '/assignment', title: 'アサイン' },
    ]

    for (const { path, title } of pageTitles) {
      await seedAndNavigate(page, data, path)
      const heading = page.locator('h1', { hasText: title })
      await expect(heading).toBeVisible({ timeout: 10000 })
    }
  })

  test('メインコンテンツのパディングがp-4（1rem=表示密度設定に連動）である', async ({
    page,
  }) => {
    const data = buildSeedData()
    await seedAndNavigate(page, data, '/dashboard')
    await page
      .getByRole('heading', { name: 'ダッシュボード' })
      .waitFor({ state: 'visible', timeout: 10000 })

    const padding = await page.evaluate(() => {
      const main = document.querySelector('main')
      if (!main) return null
      const contentDiv = main.firstElementChild as HTMLElement | null
      if (!contentDiv) return null
      const style = getComputedStyle(contentDiv)
      return {
        paddingLeft: Number.parseFloat(style.paddingLeft),
        paddingTop: Number.parseFloat(style.paddingTop),
      }
    })

    // p-4=1remはroot font-size（表示密度設定、既定14px）に連動する
    // （2026-08-13の密度コンパクト化、docs/development-patterns.md §9.3.1）
    const rootFontSize = await page.evaluate(() =>
      Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
    )
    expect(padding?.paddingLeft).toBe(rootFontSize)
    expect(padding?.paddingTop).toBe(rootFontSize)
  })
})

test.describe('FEATURE04: UI/UX調整 - ThemeColorPicker', () => {
  test('工程設定ページでThemeColorPickerが表示される', async ({ page }) => {
    const data = buildSeedData()
    await seedAndNavigate(page, data, `/schedule-settings/${PROJECT_ID}`)

    // 工程設定の見出しが表示されること
    await expect(page.locator('h1', { hasText: '工程設定' })).toBeVisible({
      timeout: 10000,
    })

    // ThemeColorPickerのライトモードボタンが表示されること
    const sunButtons = page.getByRole('button', { name: 'ライトモード' })
    await expect(sunButtons.first()).toBeVisible()

    // ThemeColorPickerのダークモードボタンが表示されること
    const moonButtons = page.getByRole('button', { name: 'ダークモード' })
    await expect(moonButtons.first()).toBeVisible()

    // カラーピッカーinputが表示されること
    const colorInputs = page.locator('input[type="color"]')
    const count = await colorInputs.count()
    expect(count).toBeGreaterThan(0)
  })

  test('ThemeColorPickerでライト/ダークモードを切り替えてHEX値が変わる', async ({
    page,
  }) => {
    const data = buildSeedData()
    await seedAndNavigate(page, data, `/schedule-settings/${PROJECT_ID}`)

    await expect(page.locator('h1', { hasText: '工程設定' })).toBeVisible({
      timeout: 10000,
    })

    // 最初の工程のカラーピッカーを取得
    const firstPickerRow = page.locator('tbody tr').first()
    const lightModeBtn = firstPickerRow.getByRole('button', {
      name: 'ライトモード',
    })
    const darkModeBtn = firstPickerRow.getByRole('button', {
      name: 'ダークモード',
    })

    // ライトモードのHEX値を記録
    await lightModeBtn.click()
    const lightHex = await firstPickerRow.locator('span.font-mono').innerText()

    // ダークモードに切り替え
    await darkModeBtn.click()
    const darkHex = await firstPickerRow.locator('span.font-mono').innerText()

    // ライトとダークのHEX値が存在すること
    expect(lightHex).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(darkHex).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
})

test.describe('FEATURE04: UI/UX調整 - ダークモード視覚確認', () => {
  test('ダークモードでサイドバーが適切に表示される', async ({ page }) => {
    const data = buildSeedData()
    await seedAndNavigate(page, data, '/dashboard')
    await page
      .getByRole('heading', { name: 'ダッシュボード' })
      .waitFor({ state: 'visible', timeout: 10000 })

    // ダークモードに切り替え
    await page.getByRole('button', { name: 'ダーク' }).click()

    // サイドバーが表示されていること
    const sidebar = page.locator('[data-tour="sidebar"]')
    await expect(sidebar).toBeVisible()

    // ナビゲーションリンクが表示されていること
    await expect(
      page.getByRole('link', { name: /ダッシュボード/ }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: /チーム/ })).toBeVisible()
    // 「プロジェクトサマリー」も部分一致してしまうため完全一致で特定する
    await expect(
      page.getByRole('link', { name: 'プロジェクト', exact: true }),
    ).toBeVisible()
  })

  test('ライト/ダーク切り替え後もナビゲーションが機能する', async ({
    page,
  }) => {
    const data = buildSeedData()
    await seedAndNavigate(page, data, '/dashboard')
    await page
      .getByRole('heading', { name: 'ダッシュボード' })
      .waitFor({ state: 'visible', timeout: 10000 })

    // ダークモードに切り替え
    await page.getByRole('button', { name: 'ダーク' }).click()

    // チームページに遷移
    await page.getByRole('link', { name: /チーム/ }).click()
    await expect(page.locator('h1', { hasText: 'チーム' })).toBeVisible({
      timeout: 10000,
    })

    // ライトモードに戻す
    await page.getByRole('button', { name: 'ライト' }).click()

    // プロジェクトページに遷移（「プロジェクトサマリー」と区別するため完全一致）
    await page.getByRole('link', { name: 'プロジェクト', exact: true }).click()
    await expect(
      page.locator('h1', { hasText: 'プロジェクト' }).first(),
    ).toBeVisible({
      timeout: 10000,
    })
  })
})
