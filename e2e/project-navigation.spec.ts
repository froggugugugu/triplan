import { expect, type Page, test } from '@playwright/test'

// ─── Seed Data Constants ───────────────────────────────────────────────────────
// （FR-010〜FR-015, FR-014）: プロジェクト一覧からの遷移導線・
// URLクエリパラメータ直接アクセス・EVM列ダイアログのE2E検証（T25）

const NOW = '2025-10-01T00:00:00.000Z'

const PROJECT_ID = '00000000-0000-4000-8000-000000000001'
const TASK_ID = '00000000-0000-4000-8000-000000000011'
const SCHEDULE_ID = '00000000-0000-4000-8000-000000000021'
const PROGRESS_ID = '00000000-0000-4000-8000-000000000031'

function isoDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

function buildSeedData() {
  const today = new Date()
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [
      {
        id: PROJECT_ID,
        code: 'P001',
        name: 'ナビゲーション確認案件',
        description: '',
        background: '',
        purpose: '',
        parentId: null,
        level: 0,
        status: 'active' as const,
        confidence: null,
        completed: false,
        divisionId: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: TASK_ID,
        code: 'P001-01',
        name: 'タスク1',
        description: '',
        background: '',
        purpose: '',
        parentId: PROJECT_ID,
        level: 1,
        status: 'active' as const,
        confidence: null,
        completed: false,
        divisionId: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    members: [],
    divisions: [],
    sections: [],
    assignments: [],
    scheduleEntries: [
      {
        id: SCHEDULE_ID,
        projectId: PROJECT_ID,
        phaseKey: 'phase-1',
        startDate: isoDateString(addDays(today, -30)),
        endDate: isoDateString(addDays(today, 30)),
      },
    ],
    projectProgressEntries: [
      {
        id: PROGRESS_ID,
        projectId: PROJECT_ID,
        weeklyProgress: { '2025-W40': 0.3 },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    efforts: [],
    estimatedUnitPrice: 100,
    defaultCoefficient: 1,
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
  await page.goto('/projects')
  await page
    .getByRole('heading', { name: 'プロジェクト', exact: true })
    .waitFor({ state: 'visible', timeout: 10000 })
}

test.describe('プロジェクト一覧からの遷移導線・URLクエリパラメータ直接アクセス', () => {
  test('WBS数アイコンをクリックすると/wbs?projectId=xxxへ遷移し、対象プロジェクトが初期選択される', async ({
    page,
  }) => {
    await seedAndNavigate(page)

    await page.getByTitle('WBS画面で確認する').click()
    await page.waitForURL(/\/wbs\?projectId=/)
    await expect(page.getByRole('heading', { name: 'WBS' })).toBeVisible()
    await expect(
      page.locator('[data-tour="wbs-project-selector"]').getByRole('combobox'),
    ).toContainText('ナビゲーション確認案件')
  })

  test('スケジュールアイコンをクリックすると/schedule?projectId=xxxへ遷移し、対象プロジェクトが初期選択される', async ({
    page,
  }) => {
    await seedAndNavigate(page)

    await page.getByTitle('スケジュール画面で確認する').click()
    await page.waitForURL(/\/schedule\?projectId=/)
    await expect(
      page.getByRole('heading', { name: 'スケジュール' }),
    ).toBeVisible()
    await expect(
      page
        .locator('[data-tour="schedule-project-selector"]')
        .getByRole('combobox'),
    ).toContainText('ナビゲーション確認案件')
  })

  test('未割当工数アイコンをクリックすると/assignment?projectId=xxxへ遷移し、対象プロジェクトが初期選択される', async ({
    page,
  }) => {
    await seedAndNavigate(page)

    await page.getByTitle('アサイン画面で配分する').click()
    await page.waitForURL(/\/assignment\?projectId=/)
    await expect(
      page.getByRole('heading', { name: 'アサイン', level: 1 }),
    ).toBeVisible()
    await expect(
      page
        .locator('[data-tour="assignment-project-selector"]')
        .getByRole('combobox'),
    ).toContainText('ナビゲーション確認案件')
  })

  test('/wbs?projectId=xxxへ直接アクセスすると対象プロジェクトが初期選択された状態で開く', async ({
    page,
  }) => {
    await page.goto('/')
    await page.evaluate((d) => {
      localStorage.setItem('resource-manager-data', JSON.stringify(d))
    }, buildSeedData())
    await page.goto(`/wbs?projectId=${PROJECT_ID}`)
    await expect(page.getByRole('heading', { name: 'WBS' })).toBeVisible()
    await expect(
      page.locator('[data-tour="wbs-project-selector"]').getByRole('combobox'),
    ).toContainText('ナビゲーション確認案件', { timeout: 10000 })
  })

  test('EVM列アイコンをクリックするとダイアログが開き、PV/EV/ACグラフが表示される（FR-014）', async ({
    page,
  }) => {
    await seedAndNavigate(page)

    await page.getByTitle('EVM（計画・出来高・実コスト）を表示').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('ナビゲーション確認案件')
    await expect(dialog.locator('.recharts-responsive-container')).toBeVisible()
  })
})
