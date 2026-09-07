import { expect, test } from '@playwright/test'
import {
  collectForbiddenResponses,
  expectNoErrorToast,
  installToastRecorder,
  loginAs,
  navLink,
  PERSONAS,
} from './personas'

/**
 * ペルソナ別ユーザーストーリーテスト（* 計画は非公開の設計文書）。
 *
 * 権限マトリクスの単体テストとAPI統合テストは「定義が正しいか」「サーバーが守るか」を
 * 見ているが、**そのロールの人が画面を通して仕事を完遂できるか**は別問題として残る。
 * ここでは5ロールそれぞれの一連の業務を実ブラウザで通し、
 * できるべきことができ／できてはいけないことができない／**開いただけで壊れない**
 * ことを確認する。
 *
 * 単一DBを共有するためファイル内は直列実行。先頭の「共通データ準備」が
 * 後続ペルソナの前提（部門・プロジェクト）を作る。
 */

test.describe.configure({ mode: 'serial' })

const PROJECT_NAME = 'ペルソナ検証案件'

test('共通データ準備: adminが部門とプロジェクトを用意する', async ({
  page,
}) => {
  await installToastRecorder(page)
  await loginAs(page, PERSONAS.admin)

  await page.goto('/team')
  // 既にsmoke.spec.tsが部門を作っている場合があるため、無ければ作る
  const hasDivision = await page
    .getByText('ペルソナ検証部門')
    .isVisible()
    .catch(() => false)
  if (!hasDivision) {
    await page.getByRole('button', { name: '部追加' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('#org-name').fill('ペルソナ検証部門')
    await dialog.getByRole('button', { name: '追加' }).click()
    await expect(dialog).not.toBeVisible({ timeout: 5000 })
  }
  await expect(page.getByText('ペルソナ検証部門')).toBeVisible()

  await page.goto('/projects')
  const hasProject = await page
    .getByText(PROJECT_NAME)
    .isVisible()
    .catch(() => false)
  if (!hasProject) {
    await page.getByRole('button', { name: '新規プロジェクト' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByPlaceholder('プロジェクト名を入力').fill(PROJECT_NAME)
    await dialog.getByRole('button', { name: '追加' }).click()
    await expect(dialog).not.toBeVisible({ timeout: 5000 })
  }
  await expect(page.getByText(PROJECT_NAME)).toBeVisible()
})

// ============================================================================
// P1 佐藤（admin）— 利用者に適切な権限で使わせたい
// ============================================================================

test.describe('P1 佐藤（admin・情報システム管理者）', () => {
  test('ユーザー管理・外部ツール接続・全社設定へ到達できる', async ({
    page,
  }) => {
    await installToastRecorder(page)
    await loginAs(page, PERSONAS.admin)

    // ユーザー管理: 種まきした5人が見える
    await page.goto('/admin/users')
    await expect(
      page.getByRole('heading', { name: /ユーザー管理/ }),
    ).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(PERSONAS.partner.email)).toBeVisible()

    // 外部ツール接続（した管理画面）
    await page.goto('/admin/external-tools')
    await expect(
      page.getByRole('heading', { name: '外部ツール接続' }),
    ).toBeVisible({ timeout: 15000 })

    await expectNoErrorToast(page)
  })

  test('管理画面から全社設定を編集でき、管理者メニューも見える', async ({
    page,
  }) => {
    await installToastRecorder(page)
    await loginAs(page, PERSONAS.admin)
    await page.getByRole('button', { name: '管理画面を開く' }).click()

    // settings:manage を持つので全社設定が開ける
    await expect(
      page.getByRole('heading', { name: '全社設定', level: 1 }),
    ).toBeVisible({ timeout: 10000 })
    // users:manage を持つので管理者グループも出る
    await expect(page.getByRole('link', { name: 'ユーザー' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'データ管理' })).toBeVisible()

    await expectNoErrorToast(page)
  })
})

// ============================================================================
// P2 田中（manager）— PMとして計画を確定し、変更を承認したい
// ============================================================================

test.describe('P2 田中（manager・PM／部門長）', () => {
  test('金額を見て計画を編集でき、全社設定も変更できる', async ({ page }) => {
    await installToastRecorder(page)
    await loginAs(page, PERSONAS.manager)

    // financials:read があるので予算メニューが見え、開ける
    await expect(navLink(page, /予算管理/)).toBeVisible()
    await page.goto('/budget')
    await expect(
      page.getByRole('heading', { name: /予算/ }).first(),
    ).toBeVisible({ timeout: 15000 })

    // data:write があるのでプロジェクトを編集できる（新規作成ボタンが機能する）
    await page.goto('/projects')
    await expect(
      page.getByRole('button', { name: '新規プロジェクト' }),
    ).toBeEnabled()

    // settings:manage があるので全社設定が編集できる
    await page.goto('/admin/settings')
    await expect(
      page.getByRole('heading', { name: '全社設定', level: 1 }),
    ).toBeVisible({ timeout: 10000 })
    // 反証: users:manage は無いので管理者メニューとデータ管理は出ない
    await expect(page.getByRole('link', { name: 'ユーザー' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'データ管理' })).toHaveCount(0)

    await expectNoErrorToast(page)
  })

  test('反証: ユーザー管理には入れない（管理者権限の分離）', async ({
    page,
  }) => {
    await installToastRecorder(page)
    await loginAs(page, PERSONAS.manager)
    await page.goto('/admin/users')
    // requiredRole="admin" のガードでダッシュボードへ戻される
    await expect(page).not.toHaveURL(/\/admin\/users/, { timeout: 15000 })
    await expect(
      page.getByRole('heading', { name: /ユーザー管理/ }),
    ).toHaveCount(0)
  })
})

// ============================================================================
// P3 鈴木（editor）— 担当分のWBSと実績を入力したい
// ============================================================================

test.describe('P3 鈴木（editor・開発リーダー）', () => {
  test('WBS・アサイン・月次実績の画面で日常業務ができる', async ({ page }) => {
    await installToastRecorder(page)
    await loginAs(page, PERSONAS.editor)

    for (const [path, heading] of [
      ['/wbs', 'WBS'],
      ['/assignment', /アサイン/],
      ['/monthly-actuals', /月次実績/],
    ] as const) {
      await page.goto(path)
      await expect(
        page.getByRole('heading', { name: heading }).first(),
      ).toBeVisible({ timeout: 15000 })
    }

    // financials:read は持つので予算も見える（原価意識のため）
    await expect(navLink(page, /予算管理/)).toBeVisible()

    await expectNoErrorToast(page)
  })

  test('反証: 全社設定値の編集とユーザー管理はできない（統制と管理の分離）', async ({
    page,
  }) => {
    await installToastRecorder(page)
    await loginAs(page, PERSONAS.editor)

    // settings:manage が無いので全社設定はメニューに出ず、
    // URL直打ちでも中身が描画されない（メニューを隠すだけでは素通りするため）
    await page.goto('/admin/companies')
    await expect(page.getByRole('link', { name: '全社設定' })).toHaveCount(0)
    await page.goto('/admin/settings')
    await expect(
      page.getByText('この機能を利用する権限がありません'),
    ).toBeVisible({ timeout: 10000 })
    await expect(
      page.getByRole('heading', { name: '全社設定', level: 1 }),
    ).toHaveCount(0)

    // users:manage が無いので管理画面へ入れない
    await page.goto('/admin/external-tools')
    await expect(page).not.toHaveURL(/\/admin\/external-tools/, {
      timeout: 15000,
    })
  })
})

// ============================================================================
// P4 山本（viewer）— 数字を見たいが、触って壊したくない
// ============================================================================

test.describe('P4 山本（viewer・経営企画）', () => {
  test('ダッシュボード・予算・レポートを閲覧でき、エラーも出ない', async ({
    page,
  }) => {
    await installToastRecorder(page)
    await loginAs(page, PERSONAS.viewer)

    for (const path of ['/dashboard', '/budget', '/reports', '/projects']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
    }
    // 見ているだけでエラー通知が出ないこと（読み取り専用ロールのUX）
    await expectNoErrorToast(page)
  })

  test('反証: 編集操作はサーバーに拒否される（data:writeなし）', async ({
    page,
  }) => {
    await installToastRecorder(page)
    await loginAs(page, PERSONAS.viewer)
    // 画面操作ではなくAPIへ直接投げて、サーバーが最終防衛線として拒否することを確認する
    // （UIの出し分けが漏れても書き込めない、という多層防御の反証）
    const status = await page.evaluate(async () => {
      const res = await fetch('http://localhost:3101/api/divisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: 'viewerが作った部門', sortOrder: 99 }),
      })
      return res.status
    })
    // 401（トークン無し）か403（権限不足）のいずれでも「書けない」ことは満たされる
    expect([401, 403]).toContain(status)
  })
})

// ============================================================================
// P5 高橋（partner）— 進捗と体制だけ見たい。金額は見せられない
// ============================================================================

test.describe('P5 高橋（partner・協力会社のPM）', () => {
  test('進捗と体制は見えるが、金額系メニューは現れない', async ({ page }) => {
    await installToastRecorder(page)
    await loginAs(page, PERSONAS.partner)

    // 業務データ（進捗・体制）は見える
    await page.goto('/projects')
    await expect(page.getByText(PROJECT_NAME)).toBeVisible({ timeout: 15000 })

    // 反証: 金額系メニューがナビに出ない
    await expect(navLink(page, /予算管理/)).toHaveCount(0)
    await expect(navLink(page, /月次明細/)).toHaveCount(0)
  })

  test('反証: 予算画面へ直接URLで入っても内容が出ない（フェイルクローズ）', async ({
    page,
  }) => {
    await installToastRecorder(page)
    await loginAs(page, PERSONAS.partner)
    await page.goto('/budget')
    await page.waitForLoadState('networkidle')
    // FinancialAccessGuardが本体を描画せず案内カードへ差し替える（フェイルクローズ）
    await expect(
      page.getByText('金額情報は非表示に設定されています'),
    ).toBeVisible({ timeout: 15000 })
    // 金額系タブ（AI利用費等）自体が出ていないこと
    await expect(page.getByRole('tab', { name: /AI利用費/ })).toHaveCount(0)
  })

  test('反証: 画面を開いただけでエラートーストが出ない（読み取り403の握り潰し）', async ({
    page,
  }) => {
    await installToastRecorder(page)
    await loginAs(page, PERSONAS.partner)

    // ダッシュボードは金額系7エンティティ＋ベースラインを読みにいくため、
    // 403をエラー通知すると「予算情報の読み込みに失敗しました」が出る
    // （ペルソナE2Eにより発見・修正した実バグの回帰テスト）
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await expectNoErrorToast(page)

    // 同じくloadBudgetDataを呼ぶ画面群でも出ないこと。
    // 月次実績は「協力会社メンバーも触れる（金額を出さない）」という設計意図の画面
    for (const path of ['/projects', '/wbs', '/monthly-actuals']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await expectNoErrorToast(page)
    }
  })

  test('金額系エンティティを読みにいっても画面は成立する（403は想定内）', async ({
    page,
  }) => {
    const getForbidden = collectForbiddenResponses(page)
    await loginAs(page, PERSONAS.partner)
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // サーバーが金額系を確かに拒否していること（多層防御が効いている証跡）
    const forbidden = getForbidden()
    expect(forbidden).toContain('/api/divisionBudgets')

    // その上で、画面自体は壊れず主要な見出しが出ていること
    await expect(
      page.getByRole('heading', { name: 'ダッシュボード' }),
    ).toBeVisible()
    await expectNoErrorToast(page)
  })

  test('プロジェクトサマリーは金額区画が消え、進捗・体制が残る', async ({
    page,
  }) => {
    await installToastRecorder(page)
    await loginAs(page, PERSONAS.partner)

    // プロジェクト一覧のサマリーアイコンから遷移する（の導線＝実際の使い方）。
    // プロジェクトを選択しない状態では全区画が出ないため、選択済みで検証しないと
    // マスクされていることの確認にならない
    await page.goto('/projects')
    await page.locator('button[title^="プロジェクトサマリー"]').first().click()
    await expect(page).toHaveURL(/projectId=/, { timeout: 15000 })
    await page.waitForLoadState('networkidle')

    // 選択済みであること（総合判定バッジが出る）を先に確かめる
    await expect(page.getByTestId('summary-overall')).toBeVisible({
      timeout: 15000,
    })

    // 反証: 金・商流の区画見出しが出ない（セクション単位マスク）
    await expect(page.getByText('金（予算・損益）')).toHaveCount(0)
    await expect(page.getByText('商流（請求・変更管理）')).toHaveCount(0)

    // 一方で、非金額の区画（モノ＝進捗／人＝体制）は残る
    await expect(page.getByText(/モノ（/)).toBeVisible()
    await expect(page.getByText(/人（/)).toBeVisible()

    await expectNoErrorToast(page)
  })
})
