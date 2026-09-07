import { expect, type Page, test } from '@playwright/test'

/**
 * /wbs画面のAG Grid工数列インライン編集（efforts-storeのupsertEffort/deleteEffort）が
 * 実localStorage（DataAdapter経由）へ正しく永続化されることを検証する。
 * efforts-storeをjsonStorage直呼び出しからDataAdapter経由の楽観的更新へ書き換えた際
 * （17ストアのDataAdapter配線・第3弾）、ユニットテストはモック化したDataAdapterに
 * 対して行っているため、実ブラウザ・実localStorageでの反証はこのE2Eが唯一の経路になる
 * （新規作成→既存エントリの上書きupdateの両方を確認する）。
 */

const NOW = '2025-10-01T00:00:00.000Z'

const PROJECT_ID = '00000000-0000-4000-8000-00000000fe01'
const TASK_ID = '00000000-0000-4000-8000-00000000fe02'

function buildSeedData() {
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [
      {
        id: PROJECT_ID,
        code: 'P901',
        name: '工数編集テスト案件',
        description: '',
        background: '',
        purpose: '',
        parentId: null,
        level: 0,
        status: 'active' as const,
        confidence: null,
        completed: false,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: TASK_ID,
        code: 'P901-01',
        name: 'タスクA',
        description: '',
        background: '',
        purpose: '',
        parentId: PROJECT_ID,
        level: 1,
        status: 'active' as const,
        confidence: null,
        completed: false,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    members: [],
    assignments: [],
    divisions: [],
    sections: [],
    efforts: [],
    metadata: {
      lastModified: NOW,
      createdBy: 'system',
      version: '1.0.0',
    },
  }
}

async function seedAndNavigate(page: Page) {
  await page.goto('/')
  await page.evaluate((d) => {
    localStorage.setItem('resource-manager-data', JSON.stringify(d))
  }, buildSeedData())
  await page.goto('/wbs')
  await page
    .getByRole('heading', { name: 'WBS' })
    .waitFor({ state: 'visible', timeout: 10000 })
}

async function selectProject(page: Page) {
  await page.getByRole('combobox').first().click()
  await page.getByRole('option', { name: /P901/ }).click()
}

function effortCell(page: Page) {
  return page
    .locator(
      `.ag-center-cols-container .ag-row[row-id="${TASK_ID}"] .ag-cell[col-id="effort_effort-1"]`,
    )
    .first()
}

async function getStoredEfforts(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('resource-manager-data')
    const data = raw ? JSON.parse(raw) : null
    return data?.efforts ?? []
  })
}

test.describe('WBS画面の工数列インライン編集（/wbs）', () => {
  test('新規入力した工数が実localStorageへ永続化され、リロード後も残る', async ({
    page,
  }) => {
    await seedAndNavigate(page)
    await selectProject(page)

    const cell = effortCell(page)
    await cell.dblclick()
    await page.keyboard.type('3')
    await page.keyboard.press('Tab')

    await expect(page.getByText('工数を更新しました').first()).toBeVisible()
    await expect.poll(async () => (await getStoredEfforts(page)).length).toBe(1)
    const stored = await getStoredEfforts(page)
    expect(stored[0].projectId).toBe(TASK_ID)
    expect(stored[0].columnId).toBe('effort-1')
    expect(stored[0].value).toBe(3)

    await page.reload()
    await page
      .getByRole('heading', { name: 'WBS' })
      .waitFor({ state: 'visible' })
    await selectProject(page)
    await expect(effortCell(page)).toHaveText('3.00')
  })

  test('既存の工数を上書きすると、同一idのままupdateされる', async ({
    page,
  }) => {
    await seedAndNavigate(page)
    await selectProject(page)

    const cell = effortCell(page)
    await cell.dblclick()
    await page.keyboard.type('3')
    await page.keyboard.press('Tab')
    await expect.poll(async () => (await getStoredEfforts(page)).length).toBe(1)
    const firstId = (await getStoredEfforts(page))[0].id

    // AG Gridはダブルクリックで既存値を自動選択状態にするため、そのままtypeすれば上書きされる
    // （Control+Aはmac版Chromiumでは「行頭へ移動」と解釈され意図通りに動かないため使わない）
    await cell.dblclick()
    await page.keyboard.type('7')
    await page.keyboard.press('Tab')

    await expect
      .poll(async () => (await getStoredEfforts(page))[0]?.value)
      .toBe(7)
    const entries = await getStoredEfforts(page)
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe(firstId)
  })
})
