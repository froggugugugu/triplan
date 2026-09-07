import { expect, type Page, test } from '@playwright/test'

/**
 * /wbs画面の「進捗率をEVMに反映」ボタン（project-progress-storeのsetWeeklyProgress）が
 * 実localStorage（DataAdapter経由）へ正しく永続化されることを検証する。
 * project-progress-storeをjsonStorage直呼び出しからDataAdapter経由の楽観的更新へ
 * 書き換えた際（17ストアのDataAdapter配線・第2弾）、ユニットテストはモック化した
 * DataAdapterに対して行っているため、実ブラウザ・実localStorageでの反証はこのE2Eが
 * 唯一の経路になる（新規作成→upsert更新の両方を確認する）。
 */

const NOW = '2025-10-01T00:00:00.000Z'

const PROJECT_ID = '00000000-0000-4000-8000-00000000ff01'

function buildSeedData() {
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [
      {
        id: PROJECT_ID,
        code: 'P900',
        name: 'EVM進捗テスト案件',
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
    ],
    members: [],
    assignments: [],
    divisions: [],
    sections: [],
    // EVM対象条件（ScheduleEntryが1件以上）を満たすための最小限のスケジュール
    scheduleEntries: [
      {
        id: '00000000-0000-4000-8000-00000000ff02',
        projectId: PROJECT_ID,
        phaseKey: 'phase-1',
        startDate: '2025-04-01',
        endDate: '2025-04-30',
      },
    ],
    projectProgressEntries: [],
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

async function getStoredProgressEntries(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('resource-manager-data')
    const data = raw ? JSON.parse(raw) : null
    return data?.projectProgressEntries ?? []
  })
}

test.describe('WBS画面の週次進捗率記録（/wbs、EVM）', () => {
  test('「進捗率をEVMに反映」で新規レコードが実localStorageへ永続化され、リロード後も残る', async ({
    page,
  }) => {
    await seedAndNavigate(page)
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: /P900/ }).click()

    const updateButton = page.getByRole('button', {
      name: '進捗率をEVMに反映',
    })
    await expect(updateButton).toBeVisible()
    const selectedWeek = await page.locator('#wbs-progress-week').inputValue()

    await updateButton.click()
    await expect(page.getByText(/を.*に記録しました/).first()).toBeVisible()

    await expect
      .poll(async () => (await getStoredProgressEntries(page)).length)
      .toBe(1)
    const stored = await getStoredProgressEntries(page)
    expect(stored[0].projectId).toBe(PROJECT_ID)
    expect(stored[0].weeklyProgress[selectedWeek]).toBeDefined()

    await page.reload()
    await page
      .getByRole('heading', { name: 'WBS' })
      .waitFor({ state: 'visible' })
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: /P900/ }).click()
    await expect(
      page.getByRole('button', { name: '進捗率をEVMに反映' }),
    ).toBeVisible()
    const afterReload = await getStoredProgressEntries(page)
    expect(afterReload).toHaveLength(1)
    expect(afterReload[0].id).toBe(stored[0].id)
  })

  test('同一案件へ2回目の記録は既存レコードをupsert更新する（idは変わらない）', async ({
    page,
  }) => {
    await seedAndNavigate(page)
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: /P900/ }).click()

    const updateButton = page.getByRole('button', {
      name: '進捗率をEVMに反映',
    })
    await updateButton.click()
    await expect
      .poll(async () => (await getStoredProgressEntries(page)).length)
      .toBe(1)
    const firstId = (await getStoredProgressEntries(page))[0].id

    // 対象週を変えて2回目を記録する
    const weekSelect = page.locator('#wbs-progress-week')
    const options = await weekSelect.locator('option').allTextContents()
    const currentValue = await weekSelect.inputValue()
    const otherOption = options.find((_, i) => i > 0) ?? options[0]
    if (otherOption) {
      await weekSelect.selectOption({ label: otherOption })
    }
    const secondWeek = await weekSelect.inputValue()
    test.skip(secondWeek === currentValue, '選択可能な別の週が無い')

    await updateButton.click()
    await expect
      .poll(
        async () =>
          Object.keys(
            (await getStoredProgressEntries(page))[0]?.weeklyProgress ?? {},
          ).length,
      )
      .toBe(2)

    const entries = await getStoredProgressEntries(page)
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe(firstId)
  })
})
