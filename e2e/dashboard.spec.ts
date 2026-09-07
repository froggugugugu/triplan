import { expect, type Page, test } from '@playwright/test'

// ─── Seed Data Constants ───────────────────────────────────────────────────────

const PROJECT_X_ID = '00000000-0000-4000-8000-000000000001'
const PROJECT_X_TASK1_ID = '00000000-0000-4000-8000-000000000011'
const PROJECT_Y_ID = '00000000-0000-4000-8000-000000000002'
const PROJECT_Y_TASK1_ID = '00000000-0000-4000-8000-000000000021'

const MEMBER_A_ID = '00000000-0000-4000-8000-0000000000a1'
const MEMBER_B_ID = '00000000-0000-4000-8000-0000000000a2'

const NOW = '2025-10-01T00:00:00.000Z'

// ─── Seed Data Helpers ─────────────────────────────────────────────────────────

function makeProject(
  id: string,
  code: string,
  name: string,
  level: number,
  parentId: string | null,
) {
  return {
    id,
    code,
    name,
    description: '',
    background: '',
    purpose: '',
    level,
    parentId,
    status: 'active',
    confidence: null,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function makeMember(id: string, name: string) {
  return {
    id,
    name,
    sectionId: null,
    role: 'Developer',
    isActive: true,
    startDate: null,
    endDate: null,
    unitPriceHistory: [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function makeAssignment(
  projectId: string,
  taskId: string,
  memberId: string,
  monthlyValues: Record<string, number>,
) {
  return {
    id: crypto.randomUUID(),
    projectId,
    taskId,
    memberId,
    monthlyValues,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function buildSeedData(options?: {
  fiscalYear?: number
  assignments?: ReturnType<typeof makeAssignment>[]
}) {
  return {
    version: '1.0.0',
    fiscalYear: options?.fiscalYear ?? 2025,
    projects: [
      makeProject(PROJECT_X_ID, 'P001', 'Project X', 0, null),
      makeProject(PROJECT_X_TASK1_ID, 'P001-01', 'Task X-1', 1, PROJECT_X_ID),
      makeProject(PROJECT_Y_ID, 'P002', 'Project Y', 0, null),
      makeProject(PROJECT_Y_TASK1_ID, 'P002-01', 'Task Y-1', 1, PROJECT_Y_ID),
    ],
    members: [
      makeMember(MEMBER_A_ID, 'Member A'),
      makeMember(MEMBER_B_ID, 'Member B'),
    ],
    allocations: [],
    scheduleEntries: [],
    assignments: options?.assignments ?? [],
    metadata: {
      lastModified: NOW,
      createdBy: 'system',
      version: '1.0.0',
    },
  }
}

// ─── Page Helpers ──────────────────────────────────────────────────────────────

/**
 * Inject seed data into localStorage and navigate to the dashboard page.
 * Uses the WBS workaround to ensure stores are properly hydrated.
 */
async function seedAndNavigate(
  page: Page,
  data: ReturnType<typeof buildSeedData>,
) {
  // シード（2025年度の固定月キー）とアプリの年度算出（実行時の現在日時由来）を
  // 一致させるため、ブラウザ時刻を2025年度内へ固定する（assignment.spec.tsと同じ対策。
  // 実行時の今日を基準にシードを組み立てるEVM系テストのseedAndNavigateToDashboardには適用しない）
  await page.clock.setFixedTime(new Date('2025-10-01T12:00:00'))
  await page.goto('/')
  await page.evaluate((d) => {
    localStorage.setItem('resource-manager-data', JSON.stringify(d))
  }, data)
  // Navigate to WBS first to populate stores, then SPA-navigate to dashboard
  await page.goto('/wbs')
  await page
    .getByRole('heading', { name: 'WBS' })
    .waitFor({ state: 'visible', timeout: 10000 })
  await page.click('a[href="/dashboard"]')
  await page
    .getByRole('heading', { name: 'ダッシュボード' })
    .waitFor({ state: 'visible', timeout: 10000 })
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Dashboard - Navigation', () => {
  // LandingPage導入（`/`はランディングページ表示、自動リダイレクトなし）に追随して刷新。
  // 「ダッシュボードへ」リンクからアプリ本体へ入る現行の導線を検証する
  test('Visiting / shows the landing page and links into /dashboard', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page).not.toHaveURL(/\/dashboard/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    await page.getByRole('button', { name: 'アプリを開く' }).click()
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(
      page.getByRole('heading', { name: 'ダッシュボード' }),
    ).toBeVisible()
  })
})

test.describe('Dashboard - Chart Rendering', () => {
  test('Bar charts render with test data', async ({ page }) => {
    const data = buildSeedData({
      assignments: [
        makeAssignment(PROJECT_X_ID, PROJECT_X_TASK1_ID, MEMBER_A_ID, {
          '2025-04': 0.5,
          '2025-05': 0.3,
        }),
        makeAssignment(PROJECT_Y_ID, PROJECT_Y_TASK1_ID, MEMBER_B_ID, {
          '2025-04': 0.4,
        }),
      ],
    })
    await seedAndNavigate(page, data)

    // Verify both chart cards are visible
    await expect(page.getByText('プロジェクト別アサイン')).toBeVisible()
    await expect(page.getByText('メンバー別アサイン')).toBeVisible()

    // Verify Recharts SVG elements are rendered for the project chart
    const projectChartContainer = page
      .locator('.recharts-responsive-container')
      .first()
    await expect(projectChartContainer).toBeVisible()
    await expect(
      projectChartContainer.locator('.recharts-cartesian-grid'),
    ).toBeVisible()
    await expect(
      projectChartContainer.locator('.recharts-bar').first(),
    ).toBeVisible()

    // Verify Recharts SVG elements are rendered for the member chart
    const memberChartContainer = page
      .locator('.recharts-responsive-container')
      .nth(1)
    await expect(memberChartContainer).toBeVisible()
    await expect(
      memberChartContainer.locator('.recharts-cartesian-grid'),
    ).toBeVisible()
    await expect(
      memberChartContainer.locator('.recharts-bar').first(),
    ).toBeVisible()

    // Verify the member chart has legend entries (month labels)
    const memberLegend = memberChartContainer.locator(
      '.recharts-legend-wrapper',
    )
    await expect(memberLegend).toBeVisible()
  })

  test('Chart legend displays project names', async ({ page }) => {
    const data = buildSeedData({
      assignments: [
        makeAssignment(PROJECT_X_ID, PROJECT_X_TASK1_ID, MEMBER_A_ID, {
          '2025-04': 0.5,
        }),
      ],
    })
    await seedAndNavigate(page, data)

    // The legend should show the project code:name format
    const legend = page.locator('.recharts-legend-wrapper').first()
    await expect(legend).toBeVisible()
    await expect(legend).toContainText('P001')
    await expect(legend).toContainText('Project X')
  })
})

test.describe('Dashboard - Fiscal Year Switch', () => {
  test('Changing fiscal year updates chart data', async ({ page }) => {
    // Assignments in FY2025 (Apr 2025 - Mar 2026) and FY2024 (Apr 2024 - Mar 2025)
    const data = buildSeedData({
      assignments: [
        makeAssignment(PROJECT_X_ID, PROJECT_X_TASK1_ID, MEMBER_A_ID, {
          '2025-04': 0.5,
        }),
        makeAssignment(PROJECT_Y_ID, PROJECT_Y_TASK1_ID, MEMBER_B_ID, {
          '2024-04': 0.3,
        }),
      ],
    })
    await seedAndNavigate(page, data)

    // Initially on FY2025 — charts should show data (Project X assignment in 2025-04)
    const projectChart = page.locator('.recharts-responsive-container').first()
    await expect(projectChart.locator('.recharts-bar').first()).toBeVisible()

    // Switch to FY2024 — Project Y assignment in 2024-04 should be shown
    const fiscalYearTrigger = page.locator('button[role="combobox"]')
    await fiscalYearTrigger.click()
    await page.getByRole('option', { name: '2024年度' }).click()

    // The member chart should show Member B (who has assignment in FY2024)
    const memberChart = page.locator('.recharts-responsive-container').nth(1)
    await expect(memberChart.locator('.recharts-bar').first()).toBeVisible()

    // Switch to a year with no data (e.g. 2027)
    await fiscalYearTrigger.click()
    await page.getByRole('option', { name: '2027年度' }).click()

    // Both charts should show empty state
    await expect(
      page.getByText('アサインデータがありません').first(),
    ).toBeVisible()
  })

  test('Fiscal year dropdown defaults to current fiscal year', async ({
    page,
  }) => {
    const data = buildSeedData()
    await seedAndNavigate(page, data)

    // The dropdown should show "2025年度" (the fiscalYear from seed data)
    const fiscalYearTrigger = page.locator('button[role="combobox"]')
    await expect(fiscalYearTrigger).toContainText('2025年度')
  })
})

test.describe('Dashboard - Empty State', () => {
  test('Displays empty state message when no assignment data', async ({
    page,
  }) => {
    // Seed with no assignments
    const data = buildSeedData({ assignments: [] })
    await seedAndNavigate(page, data)

    // Both charts should show the empty state message
    const emptyMessages = page.getByText('アサインデータがありません')
    await expect(emptyMessages.first()).toBeVisible()
    await expect(emptyMessages.nth(1)).toBeVisible()

    // Recharts bars should NOT be present
    await expect(page.locator('.recharts-bar')).not.toBeVisible()
  })

  test('Displays empty state when assignments exist in different fiscal year', async ({
    page,
  }) => {
    // Assignments only in FY2024, but current view is FY2025
    const data = buildSeedData({
      assignments: [
        makeAssignment(PROJECT_X_ID, PROJECT_X_TASK1_ID, MEMBER_A_ID, {
          '2024-04': 0.5,
        }),
      ],
    })
    await seedAndNavigate(page, data)

    // FY2025 is selected by default — no assignments in this year
    const emptyMessages = page.getByText('アサインデータがありません')
    await expect(emptyMessages.first()).toBeVisible()
  })
})

// ───  FR-001・FR-002: ダッシュボード新レイアウト・EVMパネル（T27） ─────

const DIV_DEV_ID = '00000000-0000-4000-8000-00000000dd01'
const EVM_PROJECT_ID = '00000000-0000-4000-8000-00000000ee01'
const EVM_SCHEDULE_ID = '00000000-0000-4000-8000-00000000ee02'
const EVM_PROGRESS_ID = '00000000-0000-4000-8000-00000000ee03'

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

function buildEvmDashboardSeedData() {
  const today = new Date()
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [
      {
        id: EVM_PROJECT_ID,
        code: 'P901',
        name: 'ダッシュボードEVM確認案件',
        parentId: null,
        level: 0,
        status: 'active' as const,
        confidence: null,
        divisionId: DIV_DEV_ID,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    members: [],
    divisions: [
      {
        id: DIV_DEV_ID,
        name: '開発部',
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    sections: [],
    assignments: [],
    scheduleEntries: [
      {
        id: EVM_SCHEDULE_ID,
        projectId: EVM_PROJECT_ID,
        phaseKey: 'phase-1',
        startDate: isoDateString(addDays(today, -90)),
        endDate: isoDateString(addDays(today, 90)),
      },
    ],
    projectProgressEntries: [
      {
        id: EVM_PROGRESS_ID,
        projectId: EVM_PROJECT_ID,
        weeklyProgress: { '2025-W20': 0.4 },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    efforts: [
      {
        id: '00000000-0000-4000-8000-00000000ee04',
        projectId: EVM_PROJECT_ID,
        columnId: 'effort-1',
        value: 20,
      },
    ],
    estimatedUnitPrice: 100,
    defaultCoefficient: 1,
    metadata: {
      lastModified: NOW,
      createdBy: 'system',
      version: '1.0.0',
    },
  }
}

async function seedAndNavigateToDashboard(
  page: Page,
  data: ReturnType<typeof buildEvmDashboardSeedData>,
) {
  await page.goto('/')
  await page.evaluate((d) => {
    localStorage.setItem('resource-manager-data', JSON.stringify(d))
  }, data)
  await page.goto('/dashboard')
  await page
    .getByRole('heading', { name: 'ダッシュボード' })
    .waitFor({ state: 'visible', timeout: 10000 })
}

test.describe('ダッシュボードの横2分割レイアウト（FR-001、T27）', () => {
  test('プロジェクト別アサインと売上予算vs見込売上のチャートが横並び（同一行）で配置される', async ({
    page,
  }) => {
    await seedAndNavigateToDashboard(page, buildEvmDashboardSeedData())

    const projectChartCard = page.locator(
      '[data-tour="dashboard-project-chart"]',
    )
    const budgetChartCard = page.locator('[data-tour="dashboard-budget-chart"]')
    await expect(projectChartCard).toBeVisible()
    await expect(budgetChartCard).toBeVisible()

    const projectBox = await projectChartCard.boundingBox()
    const budgetBox = await budgetChartCard.boundingBox()
    if (!projectBox || !budgetBox) throw new Error('bounding box not found')

    // 横並び（desktopビューポート）であればY座標がほぼ同じ、X座標が異なる
    expect(Math.abs(projectBox.y - budgetBox.y)).toBeLessThan(10)
    expect(projectBox.x).not.toBeCloseTo(budgetBox.x, 0)
  })

  test('メンバー別アサイン・アサイン充足率・スキルマップ概況は全幅のまま据え置かれる', async ({
    page,
  }) => {
    await seedAndNavigateToDashboard(page, buildEvmDashboardSeedData())

    const memberChartCard = page.locator('[data-tour="dashboard-member-chart"]')
    const utilizationChartCard = page.locator(
      '[data-tour="dashboard-utilization-chart"]',
    )
    const memberBox = await memberChartCard.boundingBox()
    const utilizationBox = await utilizationChartCard.boundingBox()
    if (!memberBox || !utilizationBox) throw new Error('bounding box not found')

    // 全幅カードは横並びにならず縦積み（Y座標が異なる）になる
    expect(memberBox.y).not.toBeCloseTo(utilizationBox.y, 0)
  })
})

test.describe('ダッシュボードのEVMパネル（FR-002、T27）', () => {
  test('EVMパネルが表示され、PV/EV/ACグラフが描画される', async ({ page }) => {
    await seedAndNavigateToDashboard(page, buildEvmDashboardSeedData())

    const evmCard = page.locator('[data-tour="dashboard-evm"]')
    await expect(evmCard).toBeVisible()
    await expect(
      evmCard.getByText('EVM（計画・出来高・実コスト）').first(),
    ).toBeVisible()
    await expect(
      evmCard.locator('.recharts-responsive-container'),
    ).toBeVisible()
  })

  test('EVMパネルはダークモードでもPV/EV/ACの線が視認できる', async ({
    page,
  }) => {
    await seedAndNavigateToDashboard(page, buildEvmDashboardSeedData())

    const evmCard = page.locator('[data-tour="dashboard-evm"]')
    await expect(
      evmCard.locator('.recharts-responsive-container'),
    ).toBeVisible()

    await page.getByRole('button', { name: 'ダーク' }).click()
    const rootIsDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    )
    expect(rootIsDark).toBe(true)

    const lines = evmCard.locator('.recharts-line-curve')
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
