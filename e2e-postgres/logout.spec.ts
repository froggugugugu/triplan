import { expect, test } from '@playwright/test'
import { E2E_ADMIN } from './global-setup'

/**
 * ログアウト。
 *
 * `auth-store.logout()`とサーバーAPIは以前から実装されていたが、
 * **UIから呼ぶ導線が無く、ログイン後にアプリから抜ける手段が無かった**
 * （ブラウザのデータを手で消すしかない）。別ロールで入り直せないため、
 * 権限まわりの動作確認すらできない状態だった。
 */
test('ログアウトすると/loginへ戻り、保護ページへは入れない', async ({
  page,
}) => {
  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill(E2E_ADMIN.email)
  await page.getByLabel('パスワード').fill(E2E_ADMIN.password)
  await page.getByRole('button', { name: /ログイン/ }).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 })

  // サイドバー下部のアカウントメニューから抜ける
  await page.getByRole('button', { name: 'アカウント' }).click()
  await expect(page.getByText(E2E_ADMIN.email)).toBeVisible()
  await page.getByRole('button', { name: 'ログアウト' }).click()

  await expect(page).toHaveURL(/\/login/, { timeout: 15000 })

  // 反証: ログアウト後に保護ページへ直接行っても入れない
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/, { timeout: 15000 })

  // 反証: 別アカウントで入り直せる（元の目的）
  await page.getByLabel('メールアドレス').fill(E2E_ADMIN.email)
  await page.getByLabel('パスワード').fill(E2E_ADMIN.password)
  await page.getByRole('button', { name: /ログイン/ }).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 })
})
