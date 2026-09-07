import { expect, type Page, test } from '@playwright/test'

/**
 * 初期設定ウィザードのE2E。
 * クローン直後の「空のlocalStorage」から始まる実シナリオを検証する:
 * 1. ウィザード完走で組織・担当者・プロジェクト（＋標準WBSテンプレート）が実localStorageへ永続化される
 * 2. デモデータで開始→本番データへの切り替え（全削除→基本設定から再開）が一本の動線で回る
 * 3. 「はじめに」カードのdismissがリロード後も維持される（永続化の反証）
 */

async function gotoEmptyDashboard(page: Page) {
  await page.goto('/dashboard')
  await expect(
    page.getByRole('heading', { name: 'ダッシュボード' }),
  ).toBeVisible({ timeout: 10000 })
}

function loadBusinessData(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('resource-manager-data')
    return raw ? JSON.parse(raw) : null
  })
}

test.describe('初期設定ウィザード', () => {
  test('空環境からウィザード完走で組織・担当者・プロジェクト＋WBSテンプレートが永続化される', async ({
    page,
  }) => {
    await gotoEmptyDashboard(page)

    // 空データでは「はじめに」カードが表示される
    await expect(page.getByText('ようこそ！まずは初期設定から')).toBeVisible()
    await page.getByRole('button', { name: '初期設定ウィザードを開始' }).click()

    // ようこそ → 自分のデータで始める
    await page.getByText('自分のデータで始める').click()

    // 基本設定: 概算単価を入力
    await expect(page.getByRole('heading', { name: /基本設定/ })).toBeVisible()
    const unitPrice = page.getByLabel('概算単価（万円）')
    await unitPrice.fill('100')
    await page.getByRole('button', { name: '次へ' }).click()

    // 組織
    await page.getByLabel('部門名').fill('開発部')
    await page.getByLabel('課名1').fill('第1開発課')
    await page.getByRole('button', { name: '次へ' }).click()

    // 担当者（課を選択・単価入力）
    await page.getByLabel('担当者名1').fill('田中太郎')
    await page.getByRole('dialog').getByRole('combobox').click()
    await page.getByRole('option', { name: '第1開発課' }).click()
    await page.getByLabel('単価1（万円）').fill('80')
    await page.getByRole('button', { name: '次へ' }).click()

    // プロジェクト（標準テンプレート適用はデフォルトON）
    await page.getByLabel('プロジェクト名').fill('基幹システム刷新')
    await page.getByRole('button', { name: '作成して完了' }).click()

    // 完了画面 → 実localStorageへの永続化を反証
    await expect(
      page.getByRole('heading', { name: 'セットアップ完了' }),
    ).toBeVisible()
    await expect
      .poll(async () => {
        const db = await loadBusinessData(page)
        return {
          divisions: db?.divisions?.length ?? 0,
          sections: db?.sections?.length ?? 0,
          members: db?.members?.length ?? 0,
          projects: db?.projects?.length ?? 0,
          unitPrice: db?.estimatedUnitPrice ?? 0,
        }
      })
      .toMatchObject({
        divisions: 1,
        sections: 1,
        members: 1,
        unitPrice: 100,
      })
    const db = await loadBusinessData(page)
    // 標準WBSテンプレート（14工程＋成果物ノード）がルート配下に展開されている
    expect(db.projects.length).toBeGreaterThan(10)
    const root = db.projects.find((p: { level: number }) => p.level === 0)
    expect(root.code).toBe('P001')
    expect(root.name).toBe('基幹システム刷新')
    // 作成した部門が担当部門として設定される
    expect(root.divisionId).toBe(db.divisions[0].id)
    // 担当者の単価履歴が登録されている
    expect(db.members[0].unitPriceHistory).toHaveLength(1)

    // 「WBSを開く」で作成プロジェクトのWBSへ遷移する
    await page.getByRole('button', { name: 'WBSを開く' }).click()
    await expect(page).toHaveURL(new RegExp(`projectId=${root.id}`))

    // データが入ったのでリロード後はカードが出ない
    await page.goto('/dashboard')
    await expect(
      page.getByRole('heading', { name: 'ダッシュボード' }),
    ).toBeVisible({ timeout: 10000 })
    await expect(
      page.getByText('ようこそ！まずは初期設定から'),
    ).not.toBeVisible()
  })

  test('デモデータで開始→本番データへの切り替えで全削除され基本設定から再開する', async ({
    page,
  }) => {
    await gotoEmptyDashboard(page)

    await page.getByRole('button', { name: '初期設定ウィザードを開始' }).click()
    await page.getByText('デモデータで試す', { exact: true }).click()

    // デモデータが投入され試用中カードへ切り替わる
    await expect(page.getByText('デモデータで試用中です')).toBeVisible({
      timeout: 15000,
    })
    await expect
      .poll(async () => (await loadBusinessData(page))?.projects?.length ?? 0)
      .toBeGreaterThan(0)

    // リロードしても試用中表示が維持される（demoDataActiveの永続化）
    await page.reload()
    await expect(page.getByText('デモデータで試用中です')).toBeVisible({
      timeout: 10000,
    })

    // 本番データへの切り替え（二段階確認）
    await page
      .getByRole('button', { name: '本番データへ切り替える' })
      .first()
      .click()
    await expect(
      page.getByRole('dialog').getByText(/デモデータで試用中/),
    ).toBeVisible()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '本番データへ切り替える' })
      .click()
    await expect(page.getByText('この操作は取り消せません')).toBeVisible()
    await page
      .getByRole('button', { name: '削除して本番データへ切り替える' })
      .click()

    // 全削除され基本設定ステップから再開
    await expect(page.getByRole('heading', { name: /基本設定/ })).toBeVisible()
    await expect
      .poll(async () => {
        // jsonStorage.clear()はキーごと削除するためnull＝クリア成功
        const db = await loadBusinessData(page)
        return db === null ? 0 : (db.projects?.length ?? 0)
      })
      .toBe(0)

    // 中断すると空データ＋非デモなので「はじめに」カードに戻る
    await page.getByRole('button', { name: '中断する' }).click()
    await expect(page.getByText('ようこそ！まずは初期設定から')).toBeVisible()
  })

  test('反証: カードを閉じるとリロード後も再表示されない（設定メニューから再開できる）', async ({
    page,
  }) => {
    await gotoEmptyDashboard(page)
    await expect(page.getByText('ようこそ！まずは初期設定から')).toBeVisible()
    await page.getByRole('button', { name: 'はじめにカードを閉じる' }).click()
    await expect(
      page.getByText('ようこそ！まずは初期設定から'),
    ).not.toBeVisible()

    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'ダッシュボード' }),
    ).toBeVisible({ timeout: 10000 })
    await expect(
      page.getByText('ようこそ！まずは初期設定から'),
    ).not.toBeVisible()

    // 管理画面の全社設定からは引き続き起動できる。
    // ウィザード本体はDashboardPageがマウントするため、押すとダッシュボードへ戻る
    await page.goto('/admin/settings')
    await page.getByRole('button', { name: '初期設定ウィザードを開く' }).click()
    await expect(page.getByRole('dialog').getByText('ようこそ')).toBeVisible()
  })
})
