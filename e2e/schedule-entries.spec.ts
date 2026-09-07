import { expect, type Page, test } from '@playwright/test'

/**
 * /schedule画面（ScheduleGantt）のバー日付編集ダイアログ（schedule-storeのupsertEntry）が
 * 実localStorage（DataAdapter経由）へ正しく永続化されることを検証する。
 * schedule-storeをjsonStorage直呼び出しからDataAdapter経由の楽観的更新へ書き換えた際
 * （17ストアのDataAdapter配線・第8弾）、ユニットテストはモック化したDataAdapterに対して
 * 行っているため、実ブラウザ・実localStorageでの反証はこのE2Eが唯一の経路になる。
 * ダブルクリックでの編集ダイアログを開く手順は既存のdebug-gantt-dom.spec.tsで確立済みの
 * パターン（[data-col-id$="startText"][data-row-id$=...]）を踏襲する。SVAR Gantt 2.7以降は
 * 属性値の先頭に「:」が付くため、後方一致（$=）で新旧どちらの形でも当たるようにしている。
 */

const NOW = '2025-10-01T00:00:00.000Z'
const PROJECT_ID = '00000000-0000-4000-8000-00000000fd01'
const ENTRY_ID = '00000000-0000-4000-8000-00000000fd02'

function buildSeedData() {
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [
      {
        id: PROJECT_ID,
        code: 'P902',
        name: 'スケジュール編集テスト案件',
        level: 0,
        parentId: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    members: [],
    scheduleEntries: [
      {
        id: ENTRY_ID,
        projectId: PROJECT_ID,
        phaseKey: 'phase-1',
        startDate: '2025-04-01',
        endDate: '2025-06-30',
      },
    ],
    dependencies: [],
    assignments: [],
    metadata: {
      lastModified: NOW,
      createdBy: 'system',
      version: '1.0.0',
    },
  }
}

function buildScheduleSettings() {
  return {
    state: {
      settingsMap: {
        [PROJECT_ID]: {
          phases: [
            {
              phaseKey: 'phase-1',
              name: '要件定義',
              color: '#3b82f6',
              enabled: true,
              sortOrder: 0,
            },
          ],
        },
      },
    },
    version: 0,
  }
}

async function seedAndNavigate(page: Page) {
  await page.goto('/')
  await page.evaluate(
    ({ data, settings }) => {
      localStorage.setItem('resource-manager-data', JSON.stringify(data))
      localStorage.setItem(
        'schedule-settings-storage',
        JSON.stringify(settings),
      )
    },
    { data: buildSeedData(), settings: buildScheduleSettings() },
  )
  await page.goto('/schedule')
  await page.getByRole('combobox').first().click()
  await page.getByRole('option', { name: /P902/ }).click()
  await expect(page.locator('.schedule-gantt-container')).toBeVisible()
}

async function getStoredEntries(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('resource-manager-data')
    const data = raw ? JSON.parse(raw) : null
    return data?.scheduleEntries ?? []
  })
}

test.describe('スケジュール画面のバー日付編集（/schedule）', () => {
  test('既存エントリの日付編集が実localStorageへ永続化され、idは変わらずリロード後も残る', async ({
    page,
  }) => {
    await seedAndNavigate(page)

    const startCell = page.locator(
      '[data-col-id$="startText"][data-row-id$="phase-1"]',
    )
    await startCell.first().dblclick()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('#bar-end-date').fill('2025-07-31')
    await dialog.getByRole('button', { name: '保存' }).click()
    await expect(dialog).not.toBeVisible()

    await expect
      .poll(async () => (await getStoredEntries(page))[0]?.endDate)
      .toBe('2025-07-31')
    const stored = await getStoredEntries(page)
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe(ENTRY_ID)

    await page.reload()
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: /P902/ }).click()
    await expect(page.locator('.schedule-gantt-container')).toBeVisible()
    const afterReload = await getStoredEntries(page)
    expect(afterReload).toHaveLength(1)
    expect(afterReload[0].endDate).toBe('2025-07-31')
    expect(afterReload[0].id).toBe(ENTRY_ID)
  })
})
