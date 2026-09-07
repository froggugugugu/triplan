import { expect, type Page, test } from '@playwright/test'

// ─── Seed Data Helpers ─────────────────────────────────────────────────────────

const NOW_ISO = new Date().toISOString()
const DIV_DEV_ID = '00000000-0000-4000-8000-00000000dd01'
const PROJECT_ID = '00000000-0000-4000-8000-00000000aa01'
const SCHEDULE_ID = '00000000-0000-4000-8000-00000000ab01'

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
        name: 'EVM確認用案件',
        parentId: null,
        level: 0,
        status: 'active' as const,
        confidence: null,
        divisionId: DIV_DEV_ID,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
      },
    ],
    members: [],
    divisions: [
      {
        id: DIV_DEV_ID,
        name: '開発部',
        sortOrder: 0,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
      },
    ],
    sections: [],
    assignments: [],
    scheduleEntries: [
      {
        id: SCHEDULE_ID,
        projectId: PROJECT_ID,
        phaseKey: 'phase-1',
        startDate: isoDateString(addDays(today, -90)),
        endDate: isoDateString(addDays(today, 90)),
      },
    ],
    projectProgressEntries: [
      {
        id: '00000000-0000-4000-8000-00000000ee01',
        projectId: PROJECT_ID,
        weeklyProgress: { '2025-W20': 0.4 },
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
      },
    ],
    efforts: [
      {
        id: '00000000-0000-4000-8000-00000000ef01',
        projectId: PROJECT_ID,
        columnId: 'effort-1',
        value: 20,
      },
    ],
    estimatedUnitPrice: 100,
    defaultCoefficient: 1,
    divisionBudgets: [],
    budgetAdjustments: [],
    budgetBreakdowns: [],
    aiUsageEntries: [],
    saasContracts: [],
    personnelPlans: [],
    metadata: {
      lastModified: NOW_ISO,
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
  await page.goto('/dashboard')
  await page
    .getByRole('heading', { name: 'ダッシュボード' })
    .waitFor({ state: 'visible', timeout: 10000 })
}

test.describe('EvmPanel', () => {
  test('EVMパネルがダッシュボードに読み取り専用（入力フォームなし）で表示され、ダークモードでも視認できる', async ({
    page,
  }) => {
    await seedAndNavigate(page)

    // DashboardPageのCardTitleと、EvmPanel自身が内部で持つ<p>見出しが同一テキストで
    // 二重表示されるため（既存の軽微なUI重複、本修正のスコープ外）.first()で絞り込む
    await expect(
      page.getByText('EVM（計画・出来高・実コスト）').first(),
    ).toBeVisible()
    // ダッシュボードはreadOnlyモードのため、週次進捗率入力フォームは表示されない
    await expect(
      page.getByText('入力担当: プロジェクト責任者相当を想定'),
    ).toHaveCount(0)

    // ダークモードに切り替え
    await page.getByRole('button', { name: 'ダーク' }).click()
    const rootIsDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    )
    expect(rootIsDark).toBe(true)

    // チャートのコンテナが描画され、PV/EV/ACいずれかの線（stroke色）が
    // 透明・黒一色（トークン未解決）になっていないことを確認する
    // （EvmPanelは.mt-4直下に配置しているため、既存の他チャートと区別してスコープする）
    const container = page.locator('.mt-4 > .recharts-responsive-container')
    await expect(container).toBeVisible()
    const lines = container.locator('.recharts-line-curve')
    await expect(lines.first()).toBeVisible()
    const strokeColors = await lines.evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).stroke),
    )
    for (const color of strokeColors) {
      expect(color).not.toBe('')
      expect(color).not.toBe('rgba(0, 0, 0, 0)')
      expect(color).not.toBe('none')
    }
  })
})
