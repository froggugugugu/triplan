import { expect, type Page, test } from '@playwright/test'

/**
 * 見積の段階記録と簡易FP（非公開の設計文書）。
 *
 * - 簡易FPの入力→記録が実localStorage（DataAdapter経由）へ永続化され、リロード後も残る
 * - WBS段階の記録がWBS画面の概算予算と**同じ金額**になる（別実装を作らない）
 * - 実績を記録すると振り返りに誤差比が出る
 * - Infoポップオーバーに段階×幅の表が出る
 * - `/projects`の行アイコン「見積」から遷移先のセレクタに同一案件が選ばれる
 * - 反証: 金額表示OFFでは`/estimates`が案内カードに置き換わりサイドバー「見積」が消える
 */

const NOW = '2025-10-01T00:00:00.000Z'
const PROJECT_ID = '00000000-0000-4000-8000-00000000ee01'
const TASK_ID = '00000000-0000-4000-8000-00000000ee02'
const EFFORT_ID = '00000000-0000-4000-8000-00000000ee03'

function buildSeedData() {
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [
      {
        id: PROJECT_ID,
        code: 'P800',
        name: '見積検証案件',
        description: '',
        parentId: null,
        level: 0,
        status: 'active' as const,
        confidence: 'B' as const,
        completed: false,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: TASK_ID,
        code: 'P800-01',
        name: '要件定義',
        description: '',
        parentId: PROJECT_ID,
        level: 1,
        status: 'not_started' as const,
        confidence: null,
        completed: false,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    // WBS工数: 要件定義 40人日（effort-1列、既定で有効）→ 2人月 × 概算単価100 = 200万円
    efforts: [
      { id: EFFORT_ID, projectId: TASK_ID, columnId: 'effort-1', value: 40 },
    ],
    members: [],
    assignments: [],
    estimatedUnitPrice: 100,
    defaultCoefficient: 1,
    workdaysPerMonth: 20,
    hoursPerDay: 8,
    hoursPerFunctionPoint: 10,
    metadata: {
      lastModified: NOW,
      createdBy: 'system',
      version: '1.0.0',
    },
  }
}

async function seedAndOpen(
  page: Page,
  path = `/estimates?projectId=${PROJECT_ID}`,
) {
  await page.goto('/')
  await page.evaluate((d) => {
    localStorage.setItem('resource-manager-data', JSON.stringify(d))
  }, buildSeedData())
  await page.goto(path)
}

async function readStoredSnapshots(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('resource-manager-data')
    if (!raw) return []
    const db = JSON.parse(raw) as {
      estimateSnapshots?: Array<{
        version: number
        method: string
        stage: string
        amount: number
        effortDays: number
        fp?: { totalFp: number }
      }>
    }
    return db.estimateSnapshots ?? []
  })
}

test.describe('見積の段階記録と簡易FP', () => {
  test('簡易FPの記録が永続化され、WBS段階の記録はWBS概算と同じ金額になる', async ({
    page,
  }) => {
    await seedAndOpen(page)
    await expect(page.getByRole('heading', { name: '見積' })).toBeVisible()
    await expect(
      page.getByRole('combobox', { name: 'プロジェクトを選択' }),
    ).toContainText('P800 - 見積検証案件')

    // Infoポップオーバーに段階×幅の表が出る
    await page
      .getByRole('button', { name: '不確実性コーンの解説' })
      .first()
      .click()
    await expect(page.getByText('要件定義完了')).toBeVisible()
    await expect(page.getByText('0.67x〜1.5x')).toBeVisible()
    await page.keyboard.press('Escape')

    // 簡易FP（概算法）: ILF×2=70FP → 87.5人日 → 438万円
    await page.getByRole('button', { name: '見積を記録' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: '記録' })).toBeDisabled()
    await dialog.getByLabel('ラベル').fill('引合時の超概算')
    await dialog.getByLabel('FP項目の名前').fill('顧客')
    await dialog.getByLabel('FP項目の件数').fill('2')
    await dialog.getByLabel('FP項目の件数').blur()
    await expect(dialog.getByText(/87\.50人日/)).toBeVisible()
    await dialog.getByRole('button', { name: '記録' }).click()

    await expect(page.getByTestId('estimate-history-row')).toHaveCount(1)
    await expect(
      page.getByTestId('estimate-history-row').first(),
    ).toContainText('70FP')

    // WBS段階: 方法をWBS積み上げに切り替えると現在のWBS概算（40人日=200万円）を記録する
    await page.getByRole('button', { name: '見積を記録' }).click()
    await dialog.getByLabel('方法', { exact: true }).click()
    await page.getByRole('option', { name: 'WBS積み上げ' }).click()
    await dialog.getByLabel('段階', { exact: true }).click()
    await page.getByRole('option', { name: /要件定義完了/ }).click()
    await expect(dialog.getByText('40.00人日', { exact: true })).toBeVisible()
    await dialog.getByLabel('ラベル').fill('要件確定後のWBS')
    await dialog.getByRole('button', { name: '記録' }).click()
    await expect(page.getByTestId('estimate-history-row')).toHaveCount(2)

    // 実localStorageへの永続化（楽観的更新の完了を待つ）
    await expect
      .poll(async () => (await readStoredSnapshots(page)).length)
      .toBe(2)
    const stored = await readStoredSnapshots(page)
    expect(stored.map((s) => s.version)).toEqual([1, 2])
    expect(stored[0]?.fp?.totalFp).toBe(70)
    expect(stored[0]?.amount).toBe(438)
    expect(stored[1]?.method).toBe('wbs')
    expect(stored[1]?.amount).toBe(200)

    // WBS画面の総工数（人日／人月）と同じ数字であることを確かめる（別実装を作らない。
    // 万円への換算はcalcProjectEstimateBudgetの共用を単体テストで固定している）
    await page.goto(`/wbs?projectId=${PROJECT_ID}`)
    await expect(page.getByText('40.00(2.00)').first()).toBeVisible()

    // リロードしても残る
    await page.goto(`/estimates?projectId=${PROJECT_ID}`)
    await expect(page.getByTestId('estimate-history-row')).toHaveCount(2)

    // 実績を記録 → 振り返りに誤差比が出る
    await page.getByRole('tab', { name: '振り返り' }).click()
    await page.getByRole('button', { name: '実績を記録' }).click()
    await dialog.getByLabel('ラベル').fill('完了時の実績')
    await dialog.getByLabel('実績工数（人日）').fill('50')
    await dialog.getByLabel('実コスト（万円）').fill('250')
    await dialog.getByRole('button', { name: '記録' }).click()
    const retro = page.getByTestId('estimate-retrospective-row')
    await expect(retro).toHaveCount(2)
    // v2（要件定義完了、200万円）に対し実績250万円 → 1.25x（幅0.67x〜1.5xの内側）
    await expect(retro.nth(1)).toContainText('1.25x')
    await expect(retro.nth(1)).toContainText('幅の内側')
    // v1（初期コンセプト...ではなく製品定義=0.5x〜2x、438万円）→ 0.57x は内側
    await expect(retro.nth(0)).toContainText('幅の内側')
  })

  test('プロジェクト一覧の行アイコンから遷移し、同一案件が選ばれる', async ({
    page,
  }) => {
    await seedAndOpen(page, '/projects')
    await page
      .getByRole('button', {
        name: '見積（段階ごとの記録・不確実性コーン・振り返り）',
      })
      .first()
      .click()
    await expect(page).toHaveURL(
      new RegExp(`/estimates\\?projectId=${PROJECT_ID}`),
    )
    await expect(
      page.getByRole('combobox', { name: 'プロジェクトを選択' }),
    ).toContainText('P800 - 見積検証案件')
  })

  test('反証: 金額表示OFFでは案内カードに置き換わり、サイドバーの「見積」が消える', async ({
    page,
  }) => {
    await seedAndOpen(page, '/dashboard')
    await expect(page.getByRole('link', { name: '見積' })).toBeVisible()

    // 金額の表示トグルをOFFにする（全社設定）
    await page.goto('/admin/settings')
    await page.getByRole('button', { name: '金額の表示' }).click()
    await expect(
      page.getByRole('button', { name: '金額の表示' }),
    ).toHaveAttribute('aria-pressed', 'false')

    await page.goto(`/estimates?projectId=${PROJECT_ID}`)
    await expect(
      page.getByText('金額情報は非表示に設定されています'),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: '見積を記録' })).toHaveCount(
      0,
    )
    await expect(page.getByRole('link', { name: '見積' })).toHaveCount(0)
  })
})
