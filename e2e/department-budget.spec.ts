import { expect, type Page, test } from '@playwright/test'

// ─── Seed Data Constants ───────────────────────────────────────────────────────

const NOW = '2025-10-01T00:00:00.000Z'

const DIV_DEV_ID = '00000000-0000-4000-8000-00000000dd01'

// ─── Seed Data Helpers ─────────────────────────────────────────────────────────

const SECTION_DEV_ID = '00000000-0000-4000-8000-00000000ec01'
const MEMBER_TANAKA_ID = '00000000-0000-4000-8000-00000000be01'

function makeDivision(id: string, name: string, sortOrder: number) {
  return { id, name, sortOrder, createdAt: NOW, updatedAt: NOW }
}

function makeSection(id: string, divisionId: string, name: string) {
  return {
    id,
    divisionId,
    name,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function makeMember(id: string, sectionId: string, name: string) {
  return {
    id,
    name,
    sectionId,
    companyId: null,
    role: 'エンジニア',
    isActive: true,
    startDate: '2025-04-01',
    endDate: null,
    unitPriceHistory: [],
    contractUnitPriceHistory: [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function makeProject(
  id: string,
  code: string,
  name: string,
  divisionId: string | null = null,
) {
  return {
    id,
    code,
    name,
    parentId: null,
    level: 0,
    status: 'active' as const,
    confidence: null,
    divisionId,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function makeAiUsageProvider(
  id: string,
  divisionId: string,
  name: string,
  plan: string | null,
  sortOrder: number,
) {
  return {
    id,
    divisionId,
    name,
    plan,
    sortOrder,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

interface SeedOptions {
  divisions?: ReturnType<typeof makeDivision>[]
  sections?: ReturnType<typeof makeSection>[]
  members?: ReturnType<typeof makeMember>[]
  projects?: ReturnType<typeof makeProject>[]
  // biome-ignore lint/suspicious/noExplicitAny: E2Eシード用の簡易型
  efforts?: any[]
  // biome-ignore lint/suspicious/noExplicitAny: E2Eシード用の簡易型
  assignments?: any[]
  estimatedUnitPrice?: number
  // biome-ignore lint/suspicious/noExplicitAny: E2Eシード用の簡易型
  aiUsageProviders?: any[]
  // biome-ignore lint/suspicious/noExplicitAny: E2Eシード用の簡易型
  saasContracts?: any[]
}

function buildSeedData(options?: SeedOptions) {
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: options?.projects ?? [],
    efforts: options?.efforts ?? [],
    estimatedUnitPrice: options?.estimatedUnitPrice ?? 0,
    members: options?.members ?? [],
    divisions: options?.divisions ?? [],
    sections: options?.sections ?? [],
    assignments: options?.assignments ?? [],
    divisionBudgets: [],
    budgetAdjustments: [],
    aiUsageEntries: [],
    aiUsageProviders: options?.aiUsageProviders ?? [],
    saasContracts: options?.saasContracts ?? [],
    metadata: {
      lastModified: NOW,
      createdBy: 'system',
      version: '1.0.0',
    },
  }
}

/** 実行日から指定ヶ月後の "YYYY-MM-DD" を返す */
function monthsFromToday(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 現在の暦月キー（"YYYY-MM"）を返す（AiUsageMemberAllocationPanelのデフォルト月選択と同じロジック） */
function getCurrentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * 現在の年度（4月始まり）の4月の暦月キー（"YYYY-04"）を返す。
 * BudgetPage.tsxのselectedFiscalYearはシードデータのfiscalYearではなく実行時の
 * 現在日時から算出される（getCurrentFiscalYear）ため、年度をまたぐ集計を検証する
 * テストのアサイン等は、この関数で算出した年度に合わせる必要がある。
 */
function getCurrentFiscalYearAprilKey(startMonth = 4): string {
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const fiscalYear =
    currentMonth >= startMonth ? now.getFullYear() : now.getFullYear() - 1
  return `${fiscalYear}-04`
}

// ─── Page Helpers ──────────────────────────────────────────────────────────────

async function seedAndNavigate(
  page: Page,
  data: ReturnType<typeof buildSeedData>,
) {
  await page.goto('/')
  await page.evaluate((d) => {
    localStorage.setItem('resource-manager-data', JSON.stringify(d))
  }, data)
  await page.goto('/budget')
  await page
    .getByRole('heading', { name: '予算管理' })
    .waitFor({ state: 'visible', timeout: 10000 })
}

async function gotoTab(page: Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).click()
}

function agGridCell(page: Page, rowId: string, colId: string) {
  return page
    .locator(
      `.ag-center-cols-container .ag-row[row-id="${rowId}"] .ag-cell[col-id="${colId}"]`,
    )
    .first()
}

// 合計行（pinnedBottomRowData）は本体行と異なるDOMコンテナ（.ag-floating-bottom）に描画される
function agGridPinnedBottomCell(page: Page, colId: string) {
  return page.locator(`.ag-floating-bottom .ag-cell[col-id="${colId}"]`).first()
}

async function fillAgGridCell(
  page: Page,
  rowId: string,
  colId: string,
  value: string,
) {
  const cell = agGridCell(page, rowId, colId)
  await cell.dblclick()
  await page.keyboard.type(value)
  await page.keyboard.press('Tab')
}

/** "YYYY-MM"形式の月次キーを表示ラベル（例: "10月"）に変換する（AiUsageGridと同じロジック） */
function monthKeyToLabel(monthKey: string): string {
  const month = Number.parseInt(monthKey.split('-')[1] ?? '0', 10)
  return `${month}月`
}

/**
 * AI利用費タブ（横方向テーブル）の「予算額（＄）」行の指定月セルにNumericInputで入力する。
 * AiUsageGridはAG Gridではなく素のTable（月=列、指標=行）で実装されているため、
 * ヘッダーの月ラベルから列位置を特定し、同じ列位置の入力欄を操作する。
 */
async function fillAiUsageBudgetCell(
  page: Page,
  monthKey: string,
  value: string,
) {
  const table = page.locator('table').filter({ hasText: '予算額（＄）' })
  const headerCells = table.locator('thead th')
  const monthLabel = monthKeyToLabel(monthKey)
  const count = await headerCells.count()
  let colIndex = -1
  for (let i = 0; i < count; i++) {
    const text = (await headerCells.nth(i).textContent())?.trim()
    if (text === monthLabel) {
      colIndex = i
      break
    }
  }
  if (colIndex < 0) {
    throw new Error(`月ラベル「${monthLabel}」の列が見つかりません`)
  }
  const budgetRow = table.locator('tbody tr', { hasText: '予算額（＄）' })
  // 先頭列（列0）は「項目」ラベル列のためinputを持たない。inputのインデックスは列位置-1
  const input = budgetRow.locator('input').nth(colIndex - 1)
  await input.fill(value)
  await input.blur()
}

/**
 * AI利用費タブの、指定ラベル（完全一致）の行における指定月のNumericInputを返す。
 * プロバイダ別行（「{プロバイダ名} 予算額（＄）」等）のように複数行が同一部分文字列
 * （「予算額（＄）」）を含みうる場合に、行ラベルの完全一致で対象行を一意に絞り込む
 * （fillAiUsageBudgetCellのプロバイダ対応版）。
 */
async function getAiUsageCellByRowLabel(
  page: Page,
  rowLabel: string,
  monthKey: string,
) {
  const row = page.locator('table tbody tr', {
    has: page.locator(`td:text-is("${rowLabel}")`),
  })
  const table = row.locator('xpath=ancestor::table')
  const headerCells = table.locator('thead th')
  const monthLabel = monthKeyToLabel(monthKey)
  const count = await headerCells.count()
  let colIndex = -1
  for (let i = 0; i < count; i++) {
    const text = (await headerCells.nth(i).textContent())?.trim()
    if (text === monthLabel) {
      colIndex = i
      break
    }
  }
  if (colIndex < 0) {
    throw new Error(`月ラベル「${monthLabel}」の列が見つかりません`)
  }
  return row.locator('input').nth(colIndex - 1)
}

async function fillAiUsageCellByRowLabel(
  page: Page,
  rowLabel: string,
  monthKey: string,
  value: string,
) {
  const input = await getAiUsageCellByRowLabel(page, rowLabel, monthKey)
  await input.fill(value)
  await input.blur()
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

test.describe('部門予算管理', () => {
  test('その他のPJ予算登録 → その他予算変更（増額） → 予実ダッシュボードへの反映', async ({
    page,
  }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
    })
    await seedAndNavigate(page, data)
    // デフォルトタブは「予実ダッシュボード」のため、
    // 部門予算タブへ明示的に切り替える
    await gotoTab(page, '部門予算一覧')

    // 部門予算タブ（俯瞰一覧）: 「その他のPJ予算」ダイアログ（旧「予算内訳」）から
    // 案件予算を登録する（初期予算は内訳から自動計算されるため、行を直接編集するUIは存在しない）
    await page
      .locator('tr', { hasText: '開発部' })
      .getByTitle('その他のPJ予算', { exact: true })
      .click()
    const breakdownDialog = page.getByRole('dialog')
    await expect(breakdownDialog).toBeVisible()
    await expect(
      breakdownDialog.getByRole('heading', { name: 'その他のPJ予算' }),
    ).toBeVisible()
    await breakdownDialog.locator('#breakdown-label').fill('案件A')
    await breakdownDialog.locator('#breakdown-amount').fill('10000')
    await breakdownDialog.getByRole('button', { name: '内訳を追加' }).click()
    await expect(breakdownDialog.getByText('案件A')).toBeVisible()
    await breakdownDialog.getByRole('button', { name: '閉じる' }).click()

    // 俯瞰一覧の「案件予算」列（3行セルの予算合計行）に反映されていること
    await expect(
      page.locator('tr', { hasText: '開発部' }).getByText('10,000').first(),
    ).toBeVisible()

    // 「その他予算変更」ダイアログ（旧「予算追加履歴」）を開く
    await page
      .locator('tr', { hasText: '開発部' })
      .getByTitle('その他予算変更')
      .click()

    const adjustmentDialog = page.getByRole('dialog')
    await expect(adjustmentDialog).toBeVisible()
    await expect(
      adjustmentDialog.getByRole('heading', { name: 'その他予算変更' }),
    ).toBeVisible()
    // 区分の初期値は「増額」
    await adjustmentDialog.locator('#adjustment-amount').fill('2000')
    await adjustmentDialog
      .locator('#adjustment-reason')
      .fill('期中受注に伴う追加')
    await adjustmentDialog.getByRole('button', { name: '変更を記録' }).click()

    await expect(adjustmentDialog.getByText('期中受注に伴う追加')).toBeVisible()
    await expect(adjustmentDialog.getByText('+2,000.00万円')).toBeVisible()
    await adjustmentDialog.getByRole('button', { name: '閉じる' }).click()

    // 俯瞰一覧の「総合計」列は案件予算・その他費用・AI利用費・SaaS費用の4列合計のみで、
    // その他予算変更（増額分）は含まれない（元の要件文「上記1-4の合計」）
    await expect(
      page.locator('tr', { hasText: '開発部' }).getByText('12,000'),
    ).not.toBeVisible()
    await expect(
      page.locator('tr', { hasText: '開発部' }).getByText('10,000').first(),
    ).toBeVisible()

    // 予実ダッシュボードタブの「予算総額」はinitialAmount＋その他予算変更の合計のままなので反映される
    await gotoTab(page, '予実ダッシュボード')
    await expect(page.getByText('予算総額', { exact: true })).toBeVisible()
    await expect(page.getByText('12,000.00万円').first()).toBeVisible()
  })

  test('その他予算変更（減額）を記録すると予実ダッシュボードの予算総額が減算される', async ({
    page,
  }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
    })
    await seedAndNavigate(page, data)
    await gotoTab(page, '部門予算一覧')

    await page
      .locator('tr', { hasText: '開発部' })
      .getByTitle('その他のPJ予算', { exact: true })
      .click()
    const breakdownDialog = page.getByRole('dialog')
    await breakdownDialog.locator('#breakdown-label').fill('案件A')
    await breakdownDialog.locator('#breakdown-amount').fill('10000')
    await breakdownDialog.getByRole('button', { name: '内訳を追加' }).click()
    await breakdownDialog.getByRole('button', { name: '閉じる' }).click()

    await page
      .locator('tr', { hasText: '開発部' })
      .getByTitle('その他予算変更')
      .click()
    const adjustmentDialog = page.getByRole('dialog')
    await adjustmentDialog.locator('#adjustment-type').selectOption('decrease')
    await adjustmentDialog.locator('#adjustment-amount').fill('1500')
    await adjustmentDialog
      .locator('#adjustment-reason')
      .fill('契約内容見直しによる減額')
    await adjustmentDialog.getByRole('button', { name: '変更を記録' }).click()
    await expect(adjustmentDialog.getByText('-1,500.00万円')).toBeVisible()
    await adjustmentDialog.getByRole('button', { name: '閉じる' }).click()

    // 予算総額 = 10,000(初期予算) - 1,500(減額) = 8,500
    await gotoTab(page, '予実ダッシュボード')
    await expect(page.getByText('8,500.00万円').first()).toBeVisible()
  })

  test('部門予算タブ: 主要5列が3行セル（予算合計／実績合計or人件費予算合計／残予算合計）で表示される', async ({
    page,
  }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
    })
    await seedAndNavigate(page, data)
    await gotoTab(page, '部門予算一覧')

    // その他のPJ予算（案件予算）に1,000万円を登録
    await page
      .locator('tr', { hasText: '開発部' })
      .getByTitle('その他のPJ予算', { exact: true })
      .click()
    const breakdownDialog = page.getByRole('dialog')
    await breakdownDialog.locator('#breakdown-label').fill('案件A')
    await breakdownDialog.locator('#breakdown-amount').fill('1000')
    await breakdownDialog.getByRole('button', { name: '内訳を追加' }).click()
    await breakdownDialog.getByRole('button', { name: '閉じる' }).click()

    const row = page.locator('tr', { hasText: '開発部' })
    // 案件予算列: 1行目=予算合計1,000（青字トークン）、人件費予算未登録のため2行目=0、
    // 3行目=残1,000
    const projectCell = row.locator('td').nth(1)
    await expect(projectCell.locator('.text-budget-planned')).toHaveText(
      '1,000.00',
    )
    await expect(projectCell.locator('.text-budget-actual')).toHaveText('0.00')

    // 総合計列（4列合計）にも予算合計1,000が反映される
    const totalCell = row.locator('td').nth(5)
    await expect(totalCell.locator('.text-budget-planned')).toHaveText(
      '1,000.00',
    )
  })

  test('予算管理ページ: デフォルト選択タブが「予実ダッシュボード」で、タブ順が要求通りになっている', async ({
    page,
  }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
    })
    await seedAndNavigate(page, data)

    // タブを一切クリックしない状態で「予実ダッシュボード」の内容が表示されていること
    // （初期表示タブは変更していない。【仮定】要確認-5参照）
    await expect(page.getByText('予算総額', { exact: true })).toBeVisible()

    // タブ順が「部門予算一覧／予実ダッシュボード／プロジェクト／その他費用／AI利用費／SaaS費用／人員計画」
    // （「部門予算」タブが先頭に移動・「部門予算一覧」に改称）
    const tabButtons = page.getByRole('button', {
      name: /^(部門予算一覧|予実ダッシュボード|プロジェクト|その他費用|AI利用費|SaaS費用|人員計画)$/,
    })
    await expect(tabButtons).toHaveText([
      '部門予算一覧',
      '予実ダッシュボード',
      'プロジェクト',
      'その他費用',
      'AI利用費',
      'SaaS費用',
      '人員計画',
    ])
  })

  test('SaaS契約登録 → 次回更新日が2ヶ月以内の契約行に警告背景色が付く', async ({
    page,
  }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
    })
    await seedAndNavigate(page, data)

    await gotoTab(page, 'SaaS費用')

    // 警告対象: 次回更新日が1ヶ月後
    await page.getByRole('button', { name: 'SaaS契約を追加' }).click()
    let dialog = page.getByRole('dialog')
    await dialog.locator('#saas-name').fill('警告対象SaaS')
    await dialog.locator('button[role="combobox"]').click()
    await page.getByRole('option', { name: '開発部' }).click()
    await dialog.locator('#saas-amount').fill('1000')
    await dialog.locator('#saas-contract-start').fill('2025-04-01')
    await dialog.locator('#saas-next-renewal').fill(monthsFromToday(1))
    await dialog.getByRole('button', { name: '登録' }).click()
    await expect(dialog).not.toBeVisible()

    // 警告対象外: 次回更新日が6ヶ月後
    await page.getByRole('button', { name: 'SaaS契約を追加' }).click()
    dialog = page.getByRole('dialog')
    await dialog.locator('#saas-name').fill('通常SaaS')
    await dialog.locator('button[role="combobox"]').click()
    await page.getByRole('option', { name: '開発部' }).click()
    await dialog.locator('#saas-amount').fill('500')
    await dialog.locator('#saas-contract-start').fill('2025-04-01')
    await dialog.locator('#saas-next-renewal').fill(monthsFromToday(6))
    await dialog.getByRole('button', { name: '登録' }).click()
    await expect(dialog).not.toBeVisible()

    const warningRow = page.locator('tr', { hasText: '警告対象SaaS' })
    const normalRow = page.locator('tr', { hasText: '通常SaaS' })

    await expect(warningRow).toBeVisible()
    await expect(normalRow).toBeVisible()

    const warningBg = await warningRow.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    )
    const normalBg = await normalRow.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    )
    expect(warningBg).not.toBe(normalBg)
  })

  test('ダークモード切り替え後も警告表示の視認性が保たれる', async ({
    page,
  }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
    })
    await seedAndNavigate(page, data)

    await gotoTab(page, 'SaaS費用')

    await page.getByRole('button', { name: 'SaaS契約を追加' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('#saas-name').fill('警告対象SaaS')
    await dialog.locator('button[role="combobox"]').click()
    await page.getByRole('option', { name: '開発部' }).click()
    await dialog.locator('#saas-amount').fill('1000')
    await dialog.locator('#saas-contract-start').fill('2025-04-01')
    await dialog.locator('#saas-next-renewal').fill(monthsFromToday(1))
    await dialog.getByRole('button', { name: '登録' }).click()
    await expect(dialog).not.toBeVisible()

    // ダークモードに切り替え
    await page.getByRole('button', { name: 'ダーク' }).click()
    const rootClassDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    )
    expect(rootClassDark).toBe(true)

    const warningRow = page.locator('tr', { hasText: '警告対象SaaS' })
    await expect(warningRow).toBeVisible()

    const bg = await warningRow.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    )
    // 透明ではない警告背景色が適用されていること
    expect(bg).not.toBe('rgba(0, 0, 0, 0)')
    expect(bg).not.toBe('transparent')
  })

  test('その他費用タブ: 予算枠を登録 → 実績明細を追加 → 残額が表示される', async ({
    page,
  }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
    })
    await seedAndNavigate(page, data)

    await gotoTab(page, 'その他費用')
    await page.getByRole('button', { name: /その他費用を管理/ }).click()
    const breakdownDialog = page.getByRole('dialog')
    await expect(breakdownDialog).toBeVisible()
    await breakdownDialog.locator('#breakdown-label').fill('書籍代')
    await breakdownDialog.locator('#breakdown-amount').fill('100')
    await breakdownDialog.getByRole('button', { name: '内訳を追加' }).click()
    await expect(breakdownDialog.getByText('書籍代')).toBeVisible()
    await breakdownDialog.getByRole('button', { name: '閉じる' }).click()

    // 一覧に予算額100が表示される
    await expect(
      page.locator('tr', { hasText: '書籍代' }).getByText('100').first(),
    ).toBeVisible()

    // 実績明細を追加（予算1:実績Nの構造）
    await page
      .locator('tr', { hasText: '書籍代' })
      .getByRole('button', { name: '実績明細' })
      .click()
    const actualDialog = page.getByRole('dialog')
    await expect(actualDialog).toBeVisible()
    await actualDialog.locator('#actual-item-label').fill('技術書')
    await actualDialog.locator('#actual-amount').fill('30')
    await actualDialog.getByRole('button', { name: /実績明細を追加/ }).click()
    await expect(actualDialog.getByText('技術書')).toBeVisible()
    // 残額 = 予算100 − 実績30 = 70万円
    await expect(actualDialog.getByText('70.00万円')).toBeVisible()
    await actualDialog.getByRole('button', { name: '閉じる' }).click()

    // その他費用タブに合計行（予算合計・実績合計・残予算合計）が追加されている
    //
    const footerRow = page.locator('tfoot tr', { hasText: '合計' })
    await expect(footerRow).toBeVisible()
    // 予算合計100・実績合計30・残予算合計70
    await expect(footerRow.getByText('100')).toBeVisible()
    await expect(footerRow.getByText('30')).toBeVisible()
    await expect(footerRow.getByText('70')).toBeVisible()
  })

  test('AI利用費タブ: メンバー配分を一律設定 → 実績超過時に警告表示', async ({
    page,
  }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      sections: [makeSection(SECTION_DEV_ID, DIV_DEV_ID, '第1課')],
      members: [makeMember(MEMBER_TANAKA_ID, SECTION_DEV_ID, '田中太郎')],
    })
    await seedAndNavigate(page, data)

    await gotoTab(page, 'AI利用費')
    await expect(page.getByText('田中太郎')).toBeVisible()

    // 一人あたり個人予算を一律設定
    await page.locator('#bulk-budget').fill('10')
    await page.getByRole('button', { name: '一律設定' }).first().click()

    const row = page.locator('tr', { hasText: '田中太郎' })
    await expect(row).toBeVisible()

    // 上部グリッド（AiUsageGrid）の「個人予算合計」行に、メンバー配分（個人予算10）の
    // 合計が反映される（当月列のみ確認、単位は＄）
    const currentMonthLabel = monthKeyToLabel(getCurrentMonthKey())
    const allocatedRow = page
      .locator('table')
      .filter({ hasText: '個人予算合計（＄）' })
      .locator('tbody tr', { hasText: '個人予算合計（＄）' })
    const headerCells = page
      .locator('table')
      .filter({ hasText: '個人予算合計（＄）' })
      .locator('thead th')
    const headerCount = await headerCells.count()
    let currentMonthColIndex = -1
    for (let i = 0; i < headerCount; i++) {
      const text = (await headerCells.nth(i).textContent())?.trim()
      if (text === currentMonthLabel) {
        currentMonthColIndex = i
        break
      }
    }
    await expect(
      allocatedRow.locator('td').nth(currentMonthColIndex),
    ).toHaveText('10.00')

    // 割当額を個人予算+バッファの合計枠より大きく入力し、超過警告を発生させる
    // （列順は「個人予算／バッファ／割当／バッファ割当」なので割当は3番目の入力欄）
    const actualInput = row.getByRole('textbox').nth(2)
    await actualInput.fill('50')
    await actualInput.blur()

    await expect(
      page.getByText(/割当・バッファ割当の合計が.*超過しています/),
    ).toBeVisible()
  })

  test('SaaS費用タブ: 予算額/実績額/残り予算の列構成・合計行が表示され、年間契約のガイダンス文言が表示される', async ({
    page,
  }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
    })
    await seedAndNavigate(page, data)

    await gotoTab(page, 'SaaS費用')
    await page.getByRole('button', { name: 'SaaS契約を追加' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('#saas-name').fill('GitHub Copilot')
    await dialog.locator('button[role="combobox"]').click()
    await page.getByRole('option', { name: '開発部' }).click()
    await dialog.locator('#saas-amount').fill('1200')
    await dialog.locator('#saas-contract-start').fill('2025-04-01')
    await dialog.locator('#saas-next-renewal').fill(monthsFromToday(6))
    // 年間契約時の運用ガイダンス文言
    await expect(
      dialog.getByText(/支払月に年額をまとめて払う場合/),
    ).toBeVisible()
    await dialog.getByRole('button', { name: '登録' }).click()
    await expect(dialog).not.toBeVisible()

    // 列見出しが「金額」ではなく「予算額」に改称され、「実績額」列が新設されている
    await expect(
      page.getByRole('columnheader', { name: '予算額（万円）' }),
    ).toBeVisible()
    await expect(
      page.getByRole('columnheader', { name: '実績額（万円）' }),
    ).toBeVisible()

    const row = page.locator('tr', { hasText: 'GitHub Copilot' })
    // 予算額（年間換算）=1,200、実績額（未登録）=0、残り予算=1,200-0=1,200
    await expect(row.getByText('1,200').first()).toBeVisible()
    await expect(row.getByText('0').first()).toBeVisible()

    // 残り予算セルには実績色の背景クラスが付いていない（要求⑤: 背景色なしに変更）。
    // 列構成にプラン列が追加されたため列インデックスは7
    const remainingCell = row.locator('td').nth(7)
    const remainingClass = (await remainingCell.getAttribute('class')) ?? ''
    expect(remainingClass).not.toContain('bg-budget-actual')

    // 合計行（TableFooter）が表示され、予算額・実績額・残り予算の合計を表示する
    await expect(page.getByText('合計', { exact: true })).toBeVisible()
    const footerRow = page.locator('tfoot tr')
    await expect(footerRow.getByText('1,200').first()).toBeVisible()
  })

  test('人員計画タブ: 統合表で予定人数を編集でき、実績人数セルは読み取り専用', async ({
    page,
  }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
    })
    await seedAndNavigate(page, data)

    await gotoTab(page, '人員計画')
    // 末尾の折れ線グラフのレジェンドにも同名テキストがあるため、表のセルに限定する
    await expect(
      page.getByRole('cell', { name: '人数（内部リソース）' }),
    ).toBeVisible()

    // 4区分がカード分割されず単一の表にまとまっていること
    await expect(page.locator('table')).toHaveCount(1)

    const table = page.locator('table')
    const plannedRow = table.locator('tr', { hasText: '予定人数' }).first()
    const plannedInput = plannedRow.locator('input').first()
    await plannedInput.fill('3')
    await plannedInput.blur()
    await expect(plannedInput).toHaveValue('3')

    // 人数（内部リソース）の実績人数行は入力欄を持たない（在籍メンバーから自動算出・読取専用）
    const actualRow = table.locator('tr', { hasText: '実績人数' }).first()
    await expect(actualRow.locator('input')).toHaveCount(0)

    // 人件費予算パネル（年間総合予算/実績額見込み/残予算/残契約概算工数の
    // 4エリアが1パネルに統合されている）
    await expect(page.getByText('人件費予算', { exact: true })).toBeVisible()
    await expect(
      page.getByText('残契約概算工数（残予算 ÷ 概算単価）'),
    ).toBeVisible()
    await expect(page.getByText('（合計人数×概算単価）')).toBeVisible()
    await expect(
      page.getByText('（合計（個別での単価実績合計））'),
    ).toBeVisible()
  })

  test('人員計画タブ: 残予算パネルに担当部門一致案件の工数と部門メンバーの割り当て済み工数が表示される', async ({
    page,
  }) => {
    const projectId = '00000000-0000-4000-8000-00000000ad02'
    const assignmentId = '00000000-0000-4000-8000-00000000a501'
    const taskId = '00000000-0000-4000-8000-00000000fa01'
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      sections: [makeSection(SECTION_DEV_ID, DIV_DEV_ID, '第1課')],
      members: [makeMember(MEMBER_TANAKA_ID, SECTION_DEV_ID, '田中太郎')],
      // 担当部門(divisionId)を開発部に設定した案件。WBS総工数40人日 → 1人月=20人日換算で2.0人月
      projects: [
        makeProject(projectId, 'P001', '担当部門一致案件', DIV_DEV_ID),
      ],
      efforts: [
        {
          id: '00000000-0000-4000-8000-00000000ef02',
          projectId,
          columnId: 'effort-1',
          value: 40,
        },
      ],
      // 開発部に所属する田中太郎の当年度4月アサイン0.5人月
      // （BudgetPageのselectedFiscalYearはシードのfiscalYearではなく実行時の現在日時から
      //   算出されるため、現在年度の4月に合わせる）
      assignments: [
        {
          id: assignmentId,
          projectId,
          taskId,
          memberId: MEMBER_TANAKA_ID,
          monthlyValues: { [getCurrentFiscalYearAprilKey()]: 0.5 },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    })
    await seedAndNavigate(page, data)

    await gotoTab(page, '人員計画')

    await expect(page.getByText('プロジェクト工数との比較')).toBeVisible()
    // 40人日 ÷ 20 = 2.0人月
    await expect(
      page.getByText(/プロジェクトの合計工数/).locator('..'),
    ).toContainText('2.0')
    // 田中太郎の2025年4月アサイン0.5人月（他の月は未設定）
    await expect(
      page.getByText(/割り当て済み工数/).locator('..'),
    ).toContainText('0.5')
  })

  test('その他費用タブ: 実績明細に備考を自由記述できる', async ({ page }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
    })
    await seedAndNavigate(page, data)

    await gotoTab(page, 'その他費用')
    await page.getByRole('button', { name: /その他費用を管理/ }).click()
    const breakdownDialog = page.getByRole('dialog')
    await breakdownDialog.locator('#breakdown-label').fill('備品代')
    await breakdownDialog.locator('#breakdown-amount').fill('50')
    await breakdownDialog.getByRole('button', { name: '内訳を追加' }).click()
    await breakdownDialog.getByRole('button', { name: '閉じる' }).click()

    await page
      .locator('tr', { hasText: '備品代' })
      .getByRole('button', { name: '実績明細' })
      .click()
    const actualDialog = page.getByRole('dialog')
    await actualDialog.locator('#actual-item-label').fill('モニター2台')
    await actualDialog
      .locator('#actual-note')
      .fill('経費精算書番号: EX-2025-0421。承認者: 部門長。')
    await actualDialog.locator('#actual-amount').fill('40')
    await actualDialog.getByRole('button', { name: /実績明細を追加/ }).click()

    await expect(actualDialog.getByText('モニター2台')).toBeVisible()
    await expect(
      actualDialog.getByText(/経費精算書番号: EX-2025-0421/),
    ).toBeVisible()
  })

  test('AI利用費タブ: 課を切り替えると、課ごとに独立した予算として扱われ「残」に反映される', async ({
    page,
  }) => {
    const otherSectionId = '00000000-0000-4000-8000-00000000ec02'
    const otherMemberId = '00000000-0000-4000-8000-00000000be02'
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      sections: [
        makeSection(SECTION_DEV_ID, DIV_DEV_ID, '第1課'),
        makeSection(otherSectionId, DIV_DEV_ID, '第2課'),
      ],
      members: [
        makeMember(MEMBER_TANAKA_ID, SECTION_DEV_ID, '田中太郎'),
        makeMember(otherMemberId, otherSectionId, '鈴木花子'),
      ],
    })
    await seedAndNavigate(page, data)
    await gotoTab(page, 'AI利用費')

    const monthKey = getCurrentMonthKey()

    // 「部門全体」は選択肢として廃止されており、先頭課（第1課）が自動選択される
    // 。第1課の予算額を100に設定する
    await fillAiUsageBudgetCell(page, monthKey, '100')
    await expect(
      page.getByText(/AI利用費予算との残/).locator('..'),
    ).toContainText('予算 100.00＄')

    // 課セレクタ（AiUsageGrid上部エリア）を「第2課」に切り替える
    await page.locator('[role="combobox"]').last().click()
    await page.getByRole('option', { name: '第2課' }).click()

    // 第2課ではまだ予算未設定のため0のはず（第1課の値が引き継がれない）
    await expect(
      page.getByText(/AI利用費予算との残/).locator('..'),
    ).toContainText('予算 0.00＄')

    // 第2課の予算額を30に設定する
    await fillAiUsageBudgetCell(page, monthKey, '30')
    await expect(
      page.getByText(/AI利用費予算との残/).locator('..'),
    ).toContainText('予算 30.00＄')

    // 「第1課」に戻すと、第2課の変更に影響されず100のまま
    await page.locator('[role="combobox"]').last().click()
    await page.getByRole('option', { name: '第1課' }).click()
    await expect(
      page.getByText(/AI利用費予算との残/).locator('..'),
    ).toContainText('予算 100.00＄')
  })

  test('案件タブ: 係数はシステム設定値がデフォルトで入り、AG Gridで編集すると概算予算額に反映される', async ({
    page,
  }) => {
    const projectId = '00000000-0000-4000-8000-00000000ad01'
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      projects: [makeProject(projectId, 'P001', 'テスト案件A', DIV_DEV_ID)],
      efforts: [
        {
          id: '00000000-0000-4000-8000-00000000ef01',
          projectId,
          columnId: 'effort-1',
          // 40人日 ÷ 20(人月換算) = 2人月
          value: 40,
        },
      ],
      estimatedUnitPrice: 100,
    })
    await seedAndNavigate(page, data)

    // 管理画面の全社設定で係数のデフォルト値を1.5に設定する
    await page.goto('/admin/settings')
    const coefficientInput = page.getByLabel('係数（デフォルト）')
    await coefficientInput.fill('1.5')
    await coefficientInput.blur()
    await page.goto('/budget')

    await gotoTab(page, 'プロジェクト')
    await expect(page.getByText('テスト案件A')).toBeVisible()

    // 総工数は人月表示（40人日÷20=2.00人月）
    await expect(agGridCell(page, projectId, 'totalEffort')).toHaveText(/2\.00/)

    // 係数のデフォルト値が反映され、概算予算額 = 2人月×100×1.5 = 300万円
    await expect(agGridCell(page, projectId, 'estimateBudget')).toHaveText(
      /300/,
    )

    // 係数を2に編集すると概算予算額が再計算される（2人月×100×2=400万円）
    await fillAgGridCell(page, projectId, 'coefficient', '2')
    await expect(agGridCell(page, projectId, 'estimateBudget')).toHaveText(
      /400/,
    )

    // 合計行: 案件が1件のみのため、合計行の総工数・概算予算額は
    // 当該案件の値と一致する（総工数2人月、概算予算額400万円）
    await expect(agGridPinnedBottomCell(page, 'totalEffort')).toHaveText(
      /2\.00/,
    )
    await expect(agGridPinnedBottomCell(page, 'estimateBudget')).toHaveText(
      /400/,
    )
    // 係数列は合計対象外のため空欄
    await expect(agGridPinnedBottomCell(page, 'coefficient')).toHaveText('')
  })

  test('案件タブ: 列順序が指定通りで、合計行のスタイルがその他費用/SaaS費用タブと統一されている', async ({
    page,
  }) => {
    const projectId = '00000000-0000-4000-8000-00000000ad02'
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      projects: [makeProject(projectId, 'P001', 'テスト案件A', DIV_DEV_ID)],
      efforts: [
        {
          id: '00000000-0000-4000-8000-00000000ef02',
          projectId,
          columnId: 'effort-1',
          value: 40,
        },
      ],
      estimatedUnitPrice: 100,
    })
    await seedAndNavigate(page, data)
    await gotoTab(page, 'プロジェクト')
    await expect(page.getByText('テスト案件A')).toBeVisible()

    // 列順序: コード/プロジェクト名/総工数/割当済工数/未割当工数/係数/概算予算額/割当済概算/未割当概算
    const headerTexts = await page
      .locator('.ag-header-cell-text')
      .allTextContents()
    expect(headerTexts.slice(0, 9)).toEqual([
      'コード',
      'プロジェクト名',
      '総工数（人月）',
      '割当済工数（人月）',
      '未割当工数（人月）',
      '係数',
      '概算予算額（万円）',
      '割当済概算（万円）',
      '未割当概算（万円）',
    ])
    // 人・モノ・金の三位一体強化で追加された損益列が後続に表示される
    // （列仮想化により粗利列は画面外のことがあるため、描画済みヘッダーの包含で検証する）
    expect(headerTexts).toContain('受注金額（万円）')

    // 合計行のスタイル: その他費用/SaaS費用タブ(TableFooter: bg-muted/50 border-t font-medium)と統一
    const pinnedRow = page.locator('.ag-floating-bottom .ag-row').first()
    const style = await pinnedRow.evaluate((el) => {
      const s = getComputedStyle(el)
      return {
        borderTopWidth: s.borderTopWidth,
        fontWeight: s.fontWeight,
        backgroundColor: s.backgroundColor,
      }
    })
    expect(style.borderTopWidth).not.toBe('0px')
    expect(style.fontWeight).toBe('500')
    expect(style.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  })

  test('部門予算タブ: 案件予算列に担当部門一致案件のWBS概算予算額が反映される', async ({
    page,
  }) => {
    const projectId = '00000000-0000-4000-8000-00000000ad03'
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      projects: [makeProject(projectId, 'P001', 'テスト案件A', DIV_DEV_ID)],
      efforts: [
        {
          id: '00000000-0000-4000-8000-00000000ef03',
          projectId,
          columnId: 'effort-1',
          value: 40,
        },
      ],
      estimatedUnitPrice: 100,
    })
    await seedAndNavigate(page, data)
    await gotoTab(page, '部門予算一覧')

    // 手動でBudgetBreakdownを登録していなくても、担当部門一致案件のWBS概算予算額
    // （40人日÷20=2人月×100×係数1=200万円）が「案件予算」列に反映される
    await expect(
      page.locator('tr', { hasText: '開発部' }).getByText('200').first(),
    ).toBeVisible()
  })

  test('システム設定: 為替レートを設定するとAI利用費（＄）が部門予算タブの万円建て集計に反映される（requirements10）', async ({
    page,
  }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      sections: [makeSection(SECTION_DEV_ID, DIV_DEV_ID, '第1課')],
    })
    await seedAndNavigate(page, data)

    const monthKey = getCurrentMonthKey()

    // AI利用費タブで当月の予算額を100＄に設定する
    await gotoTab(page, 'AI利用費')
    await fillAiUsageBudgetCell(page, monthKey, '100')

    // 為替レート未設定のため、部門予算タブの「AI利用費」列（3行セルの予算合計行）はまだ0のまま
    await gotoTab(page, '部門予算一覧')
    const row = page.locator('tr', { hasText: '開発部' })
    const aiUsageCell = row.locator('td').nth(3)
    await expect(aiUsageCell.locator('.text-budget-planned')).toHaveText('0.00')

    // 管理画面の全社設定で為替レートを200円/＄に設定する
    await page.goto('/admin/settings')
    const exchangeRateInput = page.getByLabel('為替レート（＄→円）')
    await exchangeRateInput.fill('200')
    await exchangeRateInput.blur()
    await page.goto('/budget')
    await gotoTab(page, '部門予算一覧')

    // 100＄×200円=20000円=2万円が「AI利用費」列の予算合計行に反映される
    await expect(aiUsageCell.locator('.text-budget-planned')).toHaveText('2.00')
  })

  test('AI利用費タブ: 複数プロバイダを登録して予算・実績を個別入力し、比較・削除できる', async ({
    page,
  }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      sections: [makeSection(SECTION_DEV_ID, DIV_DEV_ID, '第1課')],
    })
    await seedAndNavigate(page, data)
    await gotoTab(page, 'AI利用費')

    // プロバイダ登録前は既存どおり単一の「予算額」行のみ（後方互換）
    await expect(page.getByText('予算額（＄）', { exact: true })).toBeVisible()

    // Anthropicを追加（1件目のため自動的に選択される）
    await page.getByRole('button', { name: 'プロバイダを追加' }).click()
    await page.getByLabel('プロバイダ名').fill('Anthropic')
    await page.getByLabel('グレード・プラン（任意）').fill('Team')
    await page.getByRole('button', { name: '追加' }).click()
    await expect(page.getByText('Anthropic（Team） 予算額（＄）')).toBeVisible()
    // プロバイダ登録済み部門では未分類（プロバイダ未登録時の枠）は表示されない
    await expect(page.getByText('未分類 予算額（＄）')).not.toBeVisible()

    const monthKey = getCurrentMonthKey()
    await fillAiUsageCellByRowLabel(
      page,
      'Anthropic（Team） 予算額（＄）',
      monthKey,
      '200',
    )
    await fillAiUsageCellByRowLabel(
      page,
      'Anthropic（Team） 実績額（＄）',
      monthKey,
      '180',
    )

    // OpenAIを追加（追加しても選択中プロバイダはAnthropicのまま自動で切り替わらない）
    await page.getByRole('button', { name: 'プロバイダを追加' }).click()
    await page.getByLabel('プロバイダ名').fill('OpenAI')
    await page.getByRole('button', { name: '追加' }).click()
    await expect(page.getByText('OpenAI', { exact: true })).toBeVisible()
    await expect(page.getByText('OpenAI 予算額（＄）')).not.toBeVisible()

    // プロバイダセレクタでOpenAIに切り替えて予算を入力する
    await page
      .locator('[role="combobox"]', { hasText: 'Anthropic（Team）' })
      .click()
    await page.getByRole('option', { name: 'OpenAI' }).click()
    await expect(page.getByText('OpenAI 予算額（＄）')).toBeVisible()
    await fillAiUsageCellByRowLabel(
      page,
      'OpenAI 予算額（＄）',
      monthKey,
      '100',
    )

    // 予算合計行は選択中プロバイダに関わらず両プロバイダの合算（200+100=300）を表示する
    const totalRow = page.locator('table tbody tr', {
      has: page.locator('td:text-is("予算合計（＄）")'),
    })
    await expect(totalRow.getByText('300.00', { exact: true })).toBeVisible()

    // Anthropicへ選択を戻すと、入力済みの実績額（180）がそのまま保持されている
    // （プロバイダ切り替えでデータが失われないことの反証）
    await page.locator('[role="combobox"]', { hasText: 'OpenAI' }).click()
    await page.getByRole('option', { name: 'Anthropic（Team）' }).click()
    await expect(
      await getAiUsageCellByRowLabel(
        page,
        'Anthropic（Team） 実績額（＄）',
        monthKey,
      ),
    ).toHaveValue('180')

    // プロバイダ削除（確認ダイアログ経由）で、そのプロバイダの行が消え、合計も再計算される
    const openaiChip = page
      .getByText('OpenAI', { exact: true })
      .locator('xpath=..')
    await openaiChip.getByTitle('削除').click()
    await expect(page.getByText('プロバイダの削除')).toBeVisible()
    await page.getByRole('button', { name: '削除' }).click()
    await expect(page.getByText('OpenAI', { exact: true })).not.toBeVisible()
    await expect(totalRow.getByText('200.00', { exact: true })).toBeVisible()

    // 削除しなかったAnthropicの実績はそのまま残る（選択中のまま）
    await expect(
      await getAiUsageCellByRowLabel(
        page,
        'Anthropic（Team） 実績額（＄）',
        monthKey,
      ),
    ).toHaveValue('180')
  })

  test('SaaS費用タブ: グレード・プランを登録すると一覧に表示され、同一サービス名でソート近接表示される', async ({
    page,
  }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
    })
    await seedAndNavigate(page, data)
    await gotoTab(page, 'SaaS費用')

    for (const plan of ['Enterprise', 'Business']) {
      await page.getByRole('button', { name: 'SaaS契約を追加' }).click()
      await page.getByLabel('サービス名').fill('Notion')
      await page.getByLabel('グレード・プラン（任意）').fill(plan)
      await page.getByText('部門を選択してください').click()
      await page.getByRole('option', { name: '開発部' }).click()
      await page.getByLabel('契約開始日').fill('2025-04-01')
      await page.getByLabel('次回更新日').fill('2026-03-31')
      await page.getByRole('button', { name: '登録' }).click()
      await expect(
        page.getByRole('cell', { name: plan, exact: true }),
      ).toBeVisible()
    }

    // name→planの順でソートされるため、同一サービス（Notion）の2行が連続して表示される
    const rows = page.locator('table tbody tr')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0).getByRole('cell').nth(1)).toHaveText('Business')
    await expect(rows.nth(1).getByRole('cell').nth(1)).toHaveText('Enterprise')
  })

  test('ダークモード: AI利用費プロバイダ行・SaaSプラン列が視認できる', async ({
    page,
  }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      sections: [makeSection(SECTION_DEV_ID, DIV_DEV_ID, '第1課')],
      aiUsageProviders: [
        makeAiUsageProvider(
          '00000000-0000-4000-8000-0000000ae001',
          DIV_DEV_ID,
          'Anthropic',
          'Team',
          0,
        ),
      ],
      saasContracts: [
        {
          id: '00000000-0000-4000-8000-0000000ec001',
          name: 'Notion',
          plan: 'Business',
          divisionId: DIV_DEV_ID,
          contractType: 'annual',
          amount: 50,
          paymentCycle: 'annual',
          contractStartDate: '2025-04-01',
          nextRenewalDate: '2026-03-31',
          note: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    })
    await seedAndNavigate(page, data)
    await page.getByRole('button', { name: 'ダーク' }).click()

    await gotoTab(page, 'AI利用費')
    const providerRow = page.getByText('Anthropic（Team） 予算額（＄）')
    await expect(providerRow).toBeVisible()
    const color = await providerRow.evaluate((el) => getComputedStyle(el).color)
    expect(color).not.toBe('rgba(0, 0, 0, 0)')

    await gotoTab(page, 'SaaS費用')
    await expect(
      page.getByRole('cell', { name: 'Business', exact: true }),
    ).toBeVisible()
  })
})

// ─── : プロジェクト/SaaS費用タブの部門セレクタ・全部門集計（T28） ─────

const DIV_SALES_ID = '00000000-0000-4000-8000-00000000dd02'

test.describe('プロジェクト/SaaS費用タブの部門セレクタ・全部門集計（FR-018〜FR-020）', () => {
  test('プロジェクトタブに部門セレクタが表示され、選択部門の案件のみ表示される', async ({
    page,
  }) => {
    const data = buildSeedData({
      divisions: [
        makeDivision(DIV_DEV_ID, '開発部', 0),
        makeDivision(DIV_SALES_ID, '営業部', 1),
      ],
      projects: [
        makeProject(
          '00000000-0000-4000-8000-0000000fa001',
          'P901',
          '開発部案件',
          DIV_DEV_ID,
        ),
        makeProject(
          '00000000-0000-4000-8000-0000000fa002',
          'P902',
          '営業部案件',
          DIV_SALES_ID,
        ),
      ],
    })
    await seedAndNavigate(page, data)
    await gotoTab(page, 'プロジェクト')

    // 部門セレクタが表示される（先頭部門=開発部が自動選択される）
    await expect(page.locator('button[role="combobox"]')).toContainText(
      '開発部',
    )
    await expect(page.getByText('開発部案件')).toBeVisible()
    await expect(page.getByText('営業部案件')).not.toBeVisible()

    // 部門を切り替えると絞り込み対象も切り替わる
    await page.locator('button[role="combobox"]').click()
    await page.getByRole('option', { name: '営業部' }).click()
    await expect(page.getByText('営業部案件')).toBeVisible()
    await expect(page.getByText('開発部案件')).not.toBeVisible()
  })

  test('SaaS費用タブに部門セレクタが表示され、選択部門の契約のみ表示される', async ({
    page,
  }) => {
    const data = buildSeedData({
      divisions: [
        makeDivision(DIV_DEV_ID, '開発部', 0),
        makeDivision(DIV_SALES_ID, '営業部', 1),
      ],
      saasContracts: [
        {
          id: '00000000-0000-4000-8000-0000000ec101',
          name: 'Notion',
          plan: null,
          divisionId: DIV_DEV_ID,
          contractType: 'annual',
          amount: 50,
          paymentCycle: 'annual',
          contractStartDate: '2025-04-01',
          nextRenewalDate: '2026-03-31',
          note: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
        {
          id: '00000000-0000-4000-8000-0000000ec102',
          name: 'Salesforce',
          plan: null,
          divisionId: DIV_SALES_ID,
          contractType: 'annual',
          amount: 80,
          paymentCycle: 'annual',
          contractStartDate: '2025-04-01',
          nextRenewalDate: '2026-03-31',
          note: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    })
    await seedAndNavigate(page, data)
    await gotoTab(page, 'SaaS費用')

    await expect(page.locator('button[role="combobox"]')).toContainText(
      '開発部',
    )
    await expect(page.getByRole('cell', { name: 'Notion' })).toBeVisible()
    await expect(
      page.getByRole('cell', { name: 'Salesforce' }),
    ).not.toBeVisible()

    await page.locator('button[role="combobox"]').click()
    await page.getByRole('option', { name: '営業部' }).click()
    await expect(page.getByRole('cell', { name: 'Salesforce' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Notion' })).not.toBeVisible()
  })

  test('「全部門」選択肢が追加され、選択すると全部門の合計値が表示される（FR-020）', async ({
    page,
  }) => {
    const data = buildSeedData({
      divisions: [
        makeDivision(DIV_DEV_ID, '開発部', 0),
        makeDivision(DIV_SALES_ID, '営業部', 1),
      ],
      saasContracts: [
        {
          id: '00000000-0000-4000-8000-0000000ec201',
          name: 'Notion',
          plan: null,
          divisionId: DIV_DEV_ID,
          contractType: 'annual',
          amount: 50,
          paymentCycle: 'annual',
          contractStartDate: '2025-04-01',
          nextRenewalDate: '2026-03-31',
          note: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    })
    await seedAndNavigate(page, data)
    await gotoTab(page, 'AI利用費')

    await page.locator('button[role="combobox"]').click()
    await expect(page.getByRole('option', { name: '全部門' })).toBeVisible()
    await page.getByRole('option', { name: '全部門' }).click()

    // 全部門選択時は編集UIの代わりに読み取り専用サマリーが表示される
    await expect(page.getByText('全部門サマリー（2部門合計）')).toBeVisible()

    // プロジェクト/SaaS費用タブは既存の絞り込みロジックがそのままnull=全件扱いになる
    await gotoTab(page, 'SaaS費用')
    await expect(page.getByRole('cell', { name: 'Notion' })).toBeVisible()
  })
})
