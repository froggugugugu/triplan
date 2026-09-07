import { expect, test } from '@playwright/test'
import { E2E_ADMIN } from './global-setup'
import { installToastRecorder } from './personas'

/**
 * postgresモードのブラウザ経路スモーク。
 * Testcontainers統合テスト（API層）ではカバーできない「ブラウザ→認証→DataAdapter→
 * 実APIサーバー→PostgreSQL」の一気通貫を検証する:
 * ログイン／楽観的更新の実DB永続化（リロード残存）／リフレッシュによるセッション維持
 */

test.describe.configure({ mode: 'serial' })

test('未認証で保護ページへアクセスするとログイン画面へ送られる', async ({
  page,
}) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/, { timeout: 15000 })
})

test('ログイン→部門・プロジェクト作成が実DBへ永続化され、リロード後も残る', async ({
  page,
}) => {
  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill(E2E_ADMIN.email)
  await page.getByLabel('パスワード').fill(E2E_ADMIN.password)
  await page.getByRole('button', { name: /ログイン/ }).click()
  await expect(
    page.getByRole('heading', { name: 'ダッシュボード' }),
  ).toBeVisible({ timeout: 20000 })

  // 部門を作成（チーム画面のNameInputDialog）
  await page.goto('/team')
  await page.getByRole('button', { name: '部追加' }).click()
  const orgDialog = page.getByRole('dialog')
  await orgDialog.locator('#org-name').fill('E2E検証部門')
  await orgDialog.getByRole('button', { name: '追加' }).click()
  await expect(orgDialog).not.toBeVisible({ timeout: 5000 })
  await expect(page.getByText('E2E検証部門')).toBeVisible()

  // プロジェクトを作成
  await page.goto('/projects')
  await page.getByRole('button', { name: '新規プロジェクト' }).click()
  const projectDialog = page.getByRole('dialog')
  await projectDialog
    .getByPlaceholder('プロジェクト名を入力')
    .fill('PG-E2E案件')
  await projectDialog.getByRole('button', { name: '追加' }).click()
  await expect(projectDialog).not.toBeVisible({ timeout: 5000 })
  await expect(page.getByText('PG-E2E案件')).toBeVisible()

  // フルリロード: リフレッシュトークンでセッションが維持され、データはDBから再取得される
  // （restoreSessionのsingle-flight＝したセッション喪失バグの実機回帰でもある）
  await page.reload()
  await expect(page.getByText('PG-E2E案件')).toBeVisible({ timeout: 20000 })
  await page.goto('/team')
  await expect(page.getByText('E2E検証部門')).toBeVisible()
})

/**
 * 楽観ロックの回帰テスト。
 *
 * サーバーは`X-Expected-Updated-At`をUPDATEのWHERE句へ畳み込み、期待値と一致しなければ
 * 412で拒否する。このとき**サーバー確定の`updatedAt`をローカルへ反映し損ねる**と、
 * 2回目の更新が古い期待値を送って必ず412になり、単独ユーザーでも「1回しか編集できない」
 * 機能停止級の回帰になる。サーバー時計とクライアント時計が別なので、
 * ユニットテスト（モックアダプタ）でもlocalモードE2E（そもそもロックしない）でも
 * 原理的に検出できず、この経路でしか捕まえられない。
 */
test('同じレコードを続けて2回編集できる（楽観ロックの期待値がサーバー確定値に追従する）', async ({
  page,
}) => {
  // 412のトーストは約5秒で自動的に消えるため、出現を記録して後から検証する
  // （偽陰性を踏んだのと同じ理由）
  await installToastRecorder(page)
  const statuses: number[] = []
  page.on('response', (res) => {
    if (res.request().method() === 'PATCH') statuses.push(res.status())
  })
  // PATCHがCORSのプリフライトで弾かれるとレスポンス自体が発生しない
  // （`net::ERR_FAILED`）。statusesが空のまま素通りしないよう失敗も拾う
  const networkFailures: string[] = []
  page.on('requestfailed', (r) => {
    if (['PATCH', 'POST', 'DELETE'].includes(r.method())) {
      networkFailures.push(
        `${r.method()} ${r.url()}: ${r.failure()?.errorText}`,
      )
    }
  })

  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill(E2E_ADMIN.email)
  await page.getByLabel('パスワード').fill(E2E_ADMIN.password)
  await page.getByRole('button', { name: /ログイン/ }).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 })

  // 前テストで作成済みの所属会社ではなく、この検証用に1件作る
  await page.goto('/companies')
  await page
    .getByRole('button', { name: /所属会社を追加|会社を追加|追加/ })
    .first()
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('#company-name').fill('ロック検証社')
  await dialog.getByRole('button', { name: '追加' }).click()
  await expect(dialog).not.toBeVisible({ timeout: 5000 })
  await expect(page.getByText('ロック検証社')).toBeVisible({ timeout: 10000 })

  // 会社はこのテストで作った1件だけなので、行の絞り込みは行わない
  const rename = async (to: string) => {
    await page.getByRole('button', { name: '所属会社名を編集' }).first().click()
    const d = page.getByRole('dialog')
    await d.locator('#company-name').fill(to)
    await d.getByRole('button', { name: /更新|保存/ }).click()
    await expect(d).not.toBeVisible({ timeout: 5000 })
  }

  // 1回目
  await rename('ロック検証社A')
  await expect(page.getByText('ロック検証社A')).toBeVisible({ timeout: 10000 })

  // 2回目（ここが回帰の本体。修正前は412でロールバックし名前がAへ戻る）
  await rename('ロック検証社B')
  await expect(page.getByText('ロック検証社B')).toBeVisible({ timeout: 10000 })

  // 反証: 書き込みがネットワークレベルで失敗していない。
  // CORSのallow-methodsにPATCHが無いと全滅する（実際に発見）
  expect(networkFailures, '書き込みリクエストが送信できていない').toEqual([])

  // 反証: PATCHが1件も412で拒否されていない（トーストより決定論的）
  expect(
    statuses.filter((code) => code === 412),
    'PATCHが412で拒否された',
  ).toEqual([])

  // 反証: 「他のユーザーが先に更新しました」のトーストが出ていない
  const toasts = await page.evaluate(
    () => (window as unknown as { __toastLog?: string[] }).__toastLog ?? [],
  )
  expect(
    toasts.filter((t) => /他のユーザーが先に更新|失敗しました/.test(t)),
  ).toEqual([])

  // 反証: リロード後も2回目の変更が実DBに残っている（楽観的表示だけではない）
  await page.reload()
  await expect(page.getByText('ロック検証社B')).toBeVisible({ timeout: 20000 })
})
