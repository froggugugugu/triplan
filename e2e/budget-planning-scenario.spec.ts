import { expect, type Page, test } from '@playwright/test'

// ─── Seed Data Constants ───────────────────────────────────────────────────────

const NOW = new Date().toISOString()

const DIV_DEV_ID = '00000000-0000-4000-8000-000000000001'
const SECTION_ID = '00000000-0000-4000-8000-000000000002'
const PROJECT_ID = '00000000-0000-4000-8000-000000000003'
const MEMBER_ID = '00000000-0000-4000-8000-000000000004'

/** BudgetPage/TeamPageのgetCurrentFiscalYearと同じロジック（4月始まり固定）で現在年度を算出する */
function getCurrentFiscalYear(startMonth = 4): number {
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  return currentMonth >= startMonth ? now.getFullYear() : now.getFullYear() - 1
}

const FISCAL_YEAR = getCurrentFiscalYear()
const FY_APR = `${FISCAL_YEAR}-04`
const CONTRACT_START = `${FISCAL_YEAR}-04-01`
const NEXT_RENEWAL = `${FISCAL_YEAR + 1}-03-31`

// ─── Seed Data Helpers ─────────────────────────────────────────────────────────

function buildSeedData() {
  return {
    version: '1.0.0',
    fiscalYear: FISCAL_YEAR,
    projects: [
      {
        id: PROJECT_ID,
        code: 'P001',
        name: 'テスト案件A',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: 'A',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    members: [
      {
        id: MEMBER_ID,
        name: 'テスト太郎',
        sectionId: SECTION_ID,
        companyId: null,
        role: 'エンジニア',
        isActive: true,
        startDate: CONTRACT_START,
        endDate: null,
        unitPriceHistory: [],
        contractUnitPriceHistory: [],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    divisions: [
      {
        id: DIV_DEV_ID,
        name: '開発部',
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    sections: [
      {
        id: SECTION_ID,
        divisionId: DIV_DEV_ID,
        name: '第1課',
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    assignments: [],
    divisionBudgets: [],
    budgetAdjustments: [],
    budgetBreakdowns: [],
    aiUsageEntries: [],
    saasContracts: [],
    personnelPlans: [],
    // ＄=1万円相当（10000円/＄）の為替レートを最初期の月から適用しておく（requirements10）。
    // AiUsageEntryは＄建てのため、setExchangeRateアクション経由（UI操作）
    // だと「現在の月」が起点になり、テスト対象の年度月（過去月）には遡って適用されない。
    // シードデータに直接、常に適用可能な古い月付きの履歴を仕込むことで、＄の数値をそのまま
    // 万円として扱える状態にし、既存の期待値（万円換算前と同じ数値）で検証できるようにする
    exchangeRateHistory: [{ effectiveFrom: '2000-01', rate: 10000 }],
    metadata: {
      lastModified: NOW,
      createdBy: 'system',
      version: '1.0.0',
    },
  }
}

// ─── Page Helpers ──────────────────────────────────────────────────────────────

async function seedAndNavigate(page: Page) {
  await page.goto('/')
  await page.evaluate((d) => {
    localStorage.setItem('resource-manager-data', JSON.stringify(d))
  }, buildSeedData())
  await page.goto('/budget')
  await page
    .getByRole('heading', { name: '予算管理' })
    .waitFor({ state: 'visible', timeout: 10000 })
}

async function gotoTab(page: Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).click()
}

/** Comboboxを開いてテキストで選択肢を選ぶ。
 * SaaS費用タブ等に部門セレクタが追加され、ダイアログの背面にも
 * 同名テキスト（「開発部」等）が存在するようになったため、選択肢のクリックは
 * cmdkのリスト（[cmdk-list]）内に限定する（背面要素を掴んでオーバーレイに遮られる
 * 誤選択の防止、P0-cで堅牢化） */
async function selectComboboxOption(
  page: Page,
  triggerHint: string,
  optionText: string,
) {
  await page
    .locator('[role="combobox"]')
    .filter({ hasText: triggerHint })
    .click()
  await page
    .locator('[cmdk-list]')
    .getByText(optionText, { exact: false })
    .first()
    .click()
}

function agGridCell(page: Page, rowId: string, colId: string) {
  return page
    .locator(
      `.ag-center-cols-container .ag-row[row-id="${rowId}"] .ag-cell[col-id="${colId}"]`,
    )
    .first()
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

/** "YYYY-MM"形式の月次キーを表示ラベル（例: "4月"）に変換する（AiUsageGridと同じロジック） */
function monthKeyToLabel(monthKey: string): string {
  const month = Number.parseInt(monthKey.split('-')[1] ?? '0', 10)
  return `${month}月`
}

/**
 * AI利用費タブ（横方向テーブル）の指定行・指定月のNumericInputに入力する。
 * AiUsageGridはAG Gridではなく素のTable（月=列、指標=行）で実装されている
 * （PersonnelPlanPanelと同じパターン）。
 */
async function fillAiUsageTableCell(
  page: Page,
  rowLabel: string,
  monthKey: string,
  value: string,
) {
  const table = page.locator('table').filter({ hasText: rowLabel })
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
  const targetRow = table.locator('tbody tr', { hasText: rowLabel })
  const input = targetRow.locator('input').nth(colIndex - 1)
  await input.fill(value)
  await input.blur()
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

test.describe('予算計画シナリオの一気通貫フロー', () => {
  test('案件概算×係数→超概算→一般経費→人員計画（内部リソース/外部リソース）が予実ダッシュボードに反映される', async ({
    page,
  }) => {
    await seedAndNavigate(page)
    // デフォルトタブは「予実ダッシュボード」のため、
    // 部門予算タブへ明示的に切り替える
    await gotoTab(page, '部門予算一覧')

    // ① 案件をピックアップし、概算額×係数で超概算額を算出して案件予算に計上する
    // 「その他のPJ予算」ボタン（旧「予算内訳」）はproject_personnel/
    // project_expenseの2区分のみに絞り込まれているため、一般経費（general_expense）は
    // 選択肢に含まれない
    await page.getByTitle('その他のPJ予算').first().click()
    const breakdownDialog = page.getByRole('dialog')
    await expect(breakdownDialog).toBeVisible()

    await selectComboboxOption(page, 'プロジェクトを選択', 'P001 テスト案件A')
    await expect(breakdownDialog.locator('#breakdown-label')).toHaveValue(
      'テスト案件A (A)',
    )
    await breakdownDialog.locator('#breakdown-estimate').fill('800')
    await breakdownDialog.locator('#breakdown-coefficient').fill('1.25')
    await expect(breakdownDialog.locator('#breakdown-amount')).toHaveValue(
      '1000',
    )
    await expect(breakdownDialog.locator('#breakdown-amount')).toBeDisabled()
    await breakdownDialog.getByRole('button', { name: '内訳を追加' }).click()
    await expect(page.getByText('内訳を追加しました').first()).toBeVisible()

    // 案件予算の小計が表示される
    await expect(
      breakdownDialog.getByText('プロジェクト予算 小計'),
    ).toBeVisible()
    const projectSubtotalRow = breakdownDialog
      .locator('div', {
        hasText: 'プロジェクト予算 小計',
      })
      .last()
    await expect(projectSubtotalRow).toContainText('1,000.00万円')
    await breakdownDialog.getByRole('button', { name: '閉じる' }).click()

    // ⑥ 案件に紐づかない一般経費（テスト用端末代等）は、その他費用タブから登録する
    // （の絞り込みにより、この経路が唯一の一般経費登録手段になった）
    await gotoTab(page, 'その他費用')
    await page.getByRole('button', { name: /その他費用を管理/ }).click()
    const expenseDialog = page.getByRole('dialog')
    await expect(expenseDialog).toBeVisible()
    await expenseDialog.locator('#breakdown-label').fill('テスト用端末代')
    await expenseDialog.locator('#breakdown-amount').fill('30')
    await expenseDialog.getByRole('button', { name: '内訳を追加' }).click()
    const generalSubtotalRow = expenseDialog
      .locator('div', {
        hasText: '一般経費 小計',
      })
      .last()
    await expect(generalSubtotalRow).toContainText('30.00万円')
    await expenseDialog.getByRole('button', { name: '閉じる' }).click()

    // 部門予算総額に反映されている（1000 + 30 = 1030）
    await gotoTab(page, '部門予算一覧')
    await expect(
      page.locator('tr', { hasText: '開発部' }).getByText('1,030').first(),
    ).toBeVisible()

    // ② 概算単価（全社共通）を管理画面の全社設定で決める
    await page.goto('/admin/settings')
    const estimatedUnitPriceInput = page.getByLabel('概算単価')
    await estimatedUnitPriceInput.fill('100')
    await estimatedUnitPriceInput.blur()
    await page.getByRole('button', { name: 'システムに戻る' }).click()
    await page.goto('/budget')

    // ③ 人員計画タブ: 人数（内部リソース）区分の予定人数を入力する
    // （4区分は部門×年度で自動生成される固定枠のため、計画の追加操作は不要。
    //   4区分×12ヶ月の単一表にまとまっており、区分ラベルのセルを含む行が「予定人数」行）
    await gotoTab(page, '人員計画')
    const properPlannedRow = page.locator('tr', {
      hasText: '人数（内部リソース）',
    })
    const properPlannedInput = properPlannedRow.locator('input').first()
    await properPlannedInput.fill('2')
    await properPlannedInput.blur()

    // 人件費予算カード: 内部リソース予算 = 2人 × 概算単価100万円 = 200万円
    // （.last()による div 特定はカード内の見出し行（現在のチーム人数表示の追加）を
    // 掴んでしまい構造変更に弱いため、表示テキストの存在検証へ変更。P0-cで堅牢化）
    await expect(
      page
        .getByText('内部リソース: 200.00万円 ／ 外部リソース: 0.00万円')
        .first(),
    ).toBeVisible()

    // ④ 人数（外部リソース）区分の予定人数を入力する
    const nonProperPlannedRow = page.locator('tr', {
      hasText: '人数（外部リソース）',
    })
    const nonProperPlannedInput = nonProperPlannedRow.locator('input').first()
    await nonProperPlannedInput.fill('1')
    await nonProperPlannedInput.blur()

    // 年間総合予算額 = 内部リソース200 + 外部リソース100 = 300万円
    await expect(
      page
        .getByText('内部リソース: 200.00万円 ／ 外部リソース: 100.00万円')
        .first(),
    ).toBeVisible()
    await expect(
      page.getByText('300.00万円', { exact: true }).first(),
    ).toBeVisible()
  })

  test('SaaS予算・AI利用料予算・月次実績登録が予実ダッシュボードの残予算・年度末着地予測に反映される', async ({
    page,
  }) => {
    await seedAndNavigate(page)
    // デフォルトタブは「予実ダッシュボード」のため、
    // 部門予算タブへ明示的に切り替える
    await gotoTab(page, '部門予算一覧')

    // 事前に「その他のPJ予算」画面を開き、DivisionBudgetレコードを用意しておく
    // （initialAmountの自動計算は既存レコードに対してのみ再計算されるため、
    //   案件予算内訳と同様にまず部門予算画面を経由するのが実運用上の前提となる）
    await page.getByTitle('その他のPJ予算').first().click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '閉じる' })
      .click()

    // ④ SaaS契約の予算を立てる
    await gotoTab(page, 'SaaS費用')
    await page.getByRole('button', { name: 'SaaS契約を追加' }).click()
    const saasDialog = page.getByRole('dialog')
    await saasDialog.locator('#saas-name').fill('開発支援ツール')
    await selectComboboxOption(page, '部門を選択してください', '開発部')
    await saasDialog.locator('#saas-amount').fill('100')
    await saasDialog.locator('#saas-contract-start').fill(CONTRACT_START)
    await saasDialog.locator('#saas-next-renewal').fill(NEXT_RENEWAL)
    await saasDialog.getByRole('button', { name: '登録', exact: true }).click()
    await expect(saasDialog).not.toBeVisible()
    // 末尾の棒グラフ（軸ラベル・ツールチップ）にも同名テキストがあるため表のセルに限定する
    await expect(
      page.getByRole('cell', { name: '開発支援ツール' }),
    ).toBeVisible()

    // ⑤ AI利用料の予算を立てる（AiUsageGridは月を列に配置した横方向テーブル。
    // 「予算額（＄）」行の4月列に入力する）
    await gotoTab(page, 'AI利用費')
    await fillAiUsageTableCell(page, '予算額（＄）', FY_APR, '50')

    // ⑦ 実際に契約・購入・利用した実績を月ベースで登録する（AI利用費）
    // AiUsageEntry.actualAmountの直接編集UIは廃止され、メンバー別配分（割当額）経由で
    // 登録すると、部門全体の実績額へ自動同期される（budget-store.tsの同期処理）
    await page.locator('#allocation-month').selectOption(FY_APR)
    const memberRow = page.locator('tr', { hasText: 'テスト太郎' })
    await expect(memberRow).toBeVisible()
    // 列順は「個人予算／バッファ／割当／バッファ割当」のため、割当は3番目の入力欄
    const memberActualInput = memberRow.getByRole('textbox').nth(2)
    await memberActualInput.fill('40')
    await memberActualInput.blur()

    // ⑦ SaaS契約の月次実績を登録する
    await gotoTab(page, 'SaaS費用')
    await page.getByTitle('月次実績').first().click()
    const saasActualDialog = page.getByRole('dialog')
    await expect(saasActualDialog).toBeVisible()
    await fillAgGridCell(page, FY_APR, 'actualAmount', '90')
    await saasActualDialog.getByRole('button', { name: '閉じる' }).click()

    // ⑧ 登録状況を俯瞰し、残予算・年度末着地予測をダッシュボードで確認する
    await gotoTab(page, '予実ダッシュボード')
    // 「残予算」は人員計画パネル（人件費予算）にも同じ語を含む見出しがあるため、
    // ダッシュボード側のカード見出しは完全一致で指定する
    await expect(page.getByText('残予算', { exact: true })).toBeVisible()
    await expect(page.getByText('年度末着地予測')).toBeVisible()
    await expect(page.getByText('月次推移')).toBeVisible()

    // 予算総額 = SaaS年間コスト100 + AI利用費予算50 = 150万円
    await expect(page.getByText('150.00万円').first()).toBeVisible()
  })

  test('ダークモードでも残予算・年度末着地予測カードと月次推移グラフの視認性が保たれる', async ({
    page,
  }) => {
    await seedAndNavigate(page)

    await gotoTab(page, '予実ダッシュボード')
    // 「残予算」は人員計画パネル（人件費予算）にも同じ語を含む見出しがあるため、
    // ダッシュボード側のカード見出しは完全一致で指定する
    await expect(page.getByText('残予算', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'ダーク' }).click()
    const isDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    )
    expect(isDark).toBe(true)

    const remainingBudgetCard = page
      .getByText('残予算', { exact: true })
      .locator('..')
    await expect(remainingBudgetCard).toBeVisible()
    const bg = await remainingBudgetCard.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    )
    expect(bg).not.toBe('rgba(0, 0, 0, 0)')
    expect(bg).not.toBe('transparent')

    await expect(page.getByText('月次推移')).toBeVisible()
  })
})
