import { expect, type Page, test } from '@playwright/test'

// ─── Seed Data Constants ───────────────────────────────────────────────────────

const NOW = '2025-10-01T00:00:00.000Z'

const DIV_DEV_ID = '00000000-0000-4000-8000-00000000dd01'
const SEC_1_ID = '00000000-0000-4000-8000-0000000000c1'

const MEMBER_A_ID = '00000000-0000-4000-8000-0000000000a1'
const MEMBER_B_ID = '00000000-0000-4000-8000-0000000000a2'

const PROJECT_X_ID = '00000000-0000-4000-8000-000000000001'
const PROJECT_X_TASK1_ID = '00000000-0000-4000-8000-000000000011'

// ─── Seed Data Helpers ─────────────────────────────────────────────────────────

function makeDivision(id: string, name: string, sortOrder: number) {
  return { id, name, sortOrder, createdAt: NOW, updatedAt: NOW }
}

function makeSection(
  id: string,
  divisionId: string,
  name: string,
  sortOrder: number,
) {
  return { id, divisionId, name, sortOrder, createdAt: NOW, updatedAt: NOW }
}

function makeMember(
  id: string,
  name: string,
  sectionId: string | null,
  options?: {
    role?: string
    startDate?: string | null
    endDate?: string | null
    unitPriceHistory?: { effectiveFrom: string; amount: number }[]
  },
) {
  return {
    id,
    name,
    sectionId,
    role: options?.role ?? '',
    isActive: true,
    techTagIds: [],
    startDate: options?.startDate ?? null,
    endDate: options?.endDate ?? null,
    unitPriceHistory: options?.unitPriceHistory ?? [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}

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

interface SeedOptions {
  divisions?: ReturnType<typeof makeDivision>[]
  sections?: ReturnType<typeof makeSection>[]
  members?: ReturnType<typeof makeMember>[]
  projects?: ReturnType<typeof makeProject>[]
  assignments?: ReturnType<typeof makeAssignment>[]
}

function buildSeedData(options?: SeedOptions) {
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: options?.projects ?? [],
    members: options?.members ?? [],
    divisions: options?.divisions ?? [],
    sections: options?.sections ?? [],
    assignments: options?.assignments ?? [],
    metadata: {
      lastModified: NOW,
      createdBy: 'system',
      version: '1.0.0',
    },
  }
}

// ─── Page Helpers ──────────────────────────────────────────────────────────────

async function seedAndNavigate(
  page: Page,
  data: ReturnType<typeof buildSeedData>,
  path: string,
) {
  await page.goto('/')
  await page.evaluate((d) => {
    localStorage.setItem('resource-manager-data', JSON.stringify(d))
  }, data)
  await page.goto(path)
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Cross-feature Navigation', () => {
  test('/members から /team にリダイレクトされる', async ({ page }) => {
    await page.goto('/members')
    await page.waitForURL('**/team')
    expect(page.url()).toContain('/team')
    await expect(page.getByRole('heading', { name: 'チーム' })).toBeVisible({
      timeout: 10000,
    })
  })

  // LandingPage導入（`/`はランディングページ表示、自動リダイレクトなし）に追随して刷新（P0-c）
  test('/ はランディングページを表示し、「アプリを開く」で /dashboard へ入れる', async ({
    page,
  }) => {
    await page.goto('/')
    expect(page.url()).not.toContain('/dashboard')
    await page.getByRole('button', { name: 'アプリを開く' }).click()
    await page.waitForURL('**/dashboard')
    await expect(
      page.getByRole('heading', { name: 'ダッシュボード' }),
    ).toBeVisible({ timeout: 10000 })
  })

  test('サイドバーから各ページに遷移できる', async ({ page }) => {
    const data = buildSeedData()
    await seedAndNavigate(page, data, '/dashboard')
    await expect(
      page.getByRole('heading', { name: 'ダッシュボード' }),
    ).toBeVisible({ timeout: 10000 })

    // Navigate to each page via sidebar links and verify heading
    const pages = [
      { href: '/team', heading: 'チーム', level: undefined },
      { href: '/projects', heading: 'プロジェクト', level: undefined },
      { href: '/wbs', heading: 'WBS', level: undefined },
      { href: '/schedule', heading: 'スケジュール', level: undefined },
      { href: '/assignment', heading: 'アサイン', level: 1 }, // Use level 1 to avoid matching h2
      { href: '/dashboard', heading: 'ダッシュボード', level: undefined },
    ]

    for (const { href, heading, level } of pages) {
      await page.click(`a[href="${href}"]`)
      const headingLocator = level
        ? page.getByRole('heading', { name: heading, exact: true, level })
        : page.getByRole('heading', { name: heading })
      await expect(headingLocator).toBeVisible({
        timeout: 10000,
      })
      expect(page.url()).toContain(href)
    }
  })

  test('ダッシュボードとチーム管理でデータが共有される', async ({ page }) => {
    const monthlyValues: Record<string, number> = {}
    for (let m = 4; m <= 12; m++) {
      monthlyValues[`2025-${String(m).padStart(2, '0')}`] = 0.5
    }
    for (let m = 1; m <= 3; m++) {
      monthlyValues[`2026-${String(m).padStart(2, '0')}`] = 0.5
    }

    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      sections: [makeSection(SEC_1_ID, DIV_DEV_ID, '第1課', 0)],
      members: [
        makeMember(MEMBER_A_ID, '田中太郎', SEC_1_ID, {
          startDate: '2025-04-01',
          unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
        }),
        makeMember(MEMBER_B_ID, '佐藤花子', SEC_1_ID, {
          startDate: '2025-04-01',
          unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 80 }],
        }),
      ],
      projects: [
        makeProject(PROJECT_X_ID, 'P001', 'Project X', 0, null),
        makeProject(PROJECT_X_TASK1_ID, 'P001-01', 'Task X-1', 1, PROJECT_X_ID),
      ],
      assignments: [
        makeAssignment(
          PROJECT_X_ID,
          PROJECT_X_TASK1_ID,
          MEMBER_A_ID,
          monthlyValues,
        ),
      ],
    })

    // Go to /team, verify members appear
    await seedAndNavigate(page, data, '/team')
    await expect(page.getByRole('heading', { name: 'チーム' })).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByText('田中太郎')).toBeVisible()
    await expect(page.getByText('佐藤花子')).toBeVisible()
    await expect(page.getByText('開発部')).toBeVisible()

    // Navigate to /dashboard via sidebar
    await page.click('a[href="/dashboard"]')
    await expect(
      page.getByRole('heading', { name: 'ダッシュボード' }),
    ).toBeVisible({ timeout: 10000 })

    // Verify dashboard shows chart sections
    await expect(page.getByText('プロジェクト別アサイン')).toBeVisible()
    await expect(page.getByText('メンバー別アサイン')).toBeVisible()
  })

  test('チームページで追加したメンバーがダッシュボードに反映される', async ({
    page,
  }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      sections: [makeSection(SEC_1_ID, DIV_DEV_ID, '第1課', 0)],
      members: [],
      projects: [
        makeProject(PROJECT_X_ID, 'P001', 'Project X', 0, null),
        makeProject(PROJECT_X_TASK1_ID, 'P001-01', 'Task X-1', 1, PROJECT_X_ID),
      ],
    })

    // Go to /team
    await seedAndNavigate(page, data, '/team')
    await expect(page.getByRole('heading', { name: 'チーム' })).toBeVisible({
      timeout: 10000,
    })

    // Add a member via TeamMemberDialog
    await page.getByRole('button', { name: 'メンバー追加' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('#member-name').fill('新規メンバー')
    await dialog.locator('#member-start-date').fill('2025-04-01')
    // NumericInputはtype="text"のためplaceholderで特定する
    const priceInput = dialog.getByPlaceholder('万円').first()
    await priceInput.clear()
    await priceInput.fill('100')
    await dialog.getByRole('button', { name: '追加', exact: true }).click()
    await expect(dialog).not.toBeVisible({ timeout: 5000 })

    // Verify member appears on team page
    await expect(page.getByText('新規メンバー')).toBeVisible()

    // Navigate to /dashboard
    await page.click('a[href="/dashboard"]')
    await expect(
      page.getByRole('heading', { name: 'ダッシュボード' }),
    ).toBeVisible({ timeout: 10000 })

    // Verify dashboard renders correctly with the chart sections
    await expect(page.getByText('プロジェクト別アサイン')).toBeVisible()
    await expect(page.getByText('メンバー別アサイン')).toBeVisible()
  })
})
