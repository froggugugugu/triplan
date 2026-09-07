import { expect, test } from '@playwright/test'

/**
 * テーマ解決の回帰テスト。
 *
 * `@media (prefers-color-scheme: dark) { @theme { ... } }` と書いていたため、
 * **Tailwind CSS 4がメディアクエリを剥がしてダーク値を`:root`へ無条件展開**し、
 * OSがライト設定でも常にダーク表示になっていた（既定は`theme: 'system'`なので
 * 初回起動が必ずダークになる）。ビルド構成の変更で再発しうるため、
 * 「OS設定 × 明示選択」の4通りを実ブラウザで固定する。
 */

const LIGHT_BG = 'rgb(247, 247, 248)'
const DARK_BG = 'rgb(14, 14, 16)'

const bodyBg = () => getComputedStyle(document.body).backgroundColor

async function setExplicitTheme(
  page: import('@playwright/test').Page,
  theme: 'light' | 'dark' | null,
) {
  await page.evaluate((t) => {
    document.documentElement.classList.remove('light', 'dark')
    if (t) document.documentElement.classList.add(t)
  }, theme)
}

test.describe('テーマ解決（OS設定 × 明示選択）', () => {
  test('OSがライトなら既定でライト表示になる', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/dashboard')
    await setExplicitTheme(page, null)
    expect(await page.evaluate(bodyBg)).toBe(LIGHT_BG)
  })

  test('OSがダークなら既定でダーク表示になる', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/dashboard')
    await setExplicitTheme(page, null)
    expect(await page.evaluate(bodyBg)).toBe(DARK_BG)
  })

  test('反証: OSがダークでも明示的にライトを選べばライトになる', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/dashboard')
    await setExplicitTheme(page, 'light')
    // `:root:not(.light)`にしていないと、OS設定がユーザーの選択を上書きしてしまう
    expect(await page.evaluate(bodyBg)).toBe(LIGHT_BG)
  })

  test('反証: OSがライトでも明示的にダークを選べばダークになる', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/dashboard')
    await setExplicitTheme(page, 'dark')
    expect(await page.evaluate(bodyBg)).toBe(DARK_BG)
  })

  test('反証: 主要なトークンがライト/ダークで実際に切り替わる（背景だけの偶然でない）', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/dashboard')

    const read = () =>
      page.evaluate(() => {
        const s = getComputedStyle(document.documentElement)
        return {
          background: s.getPropertyValue('--color-background').trim(),
          foreground: s.getPropertyValue('--color-foreground').trim(),
          card: s.getPropertyValue('--color-card').trim(),
        }
      })

    await setExplicitTheme(page, 'light')
    const light = await read()
    await setExplicitTheme(page, 'dark')
    const dark = await read()

    expect(light.background).not.toBe(dark.background)
    expect(light.foreground).not.toBe(dark.foreground)
    expect(light.card).not.toBe(dark.card)
  })
})
