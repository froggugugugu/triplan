import { expect, type Page, test } from '@playwright/test'

// ─── Seed Data Constants ───────────────────────────────────────────────────────

const NOW = '2025-10-01T00:00:00.000Z'

const DIV_DEV_ID = '00000000-0000-4000-8000-00000000dd01'
const _DIV_SALES_ID = '00000000-0000-4000-8000-00000000dd02'
const SEC_1_ID = '00000000-0000-4000-8000-0000000000c1'
const SEC_2_ID = '00000000-0000-4000-8000-0000000000c2'
const _SEC_SALES_ID = '00000000-0000-4000-8000-0000000000c3'

const MEMBER_A_ID = '00000000-0000-4000-8000-0000000000a1'
const MEMBER_B_ID = '00000000-0000-4000-8000-0000000000a2'
const _MEMBER_C_ID = '00000000-0000-4000-8000-0000000000a3'

const PROJECT_X_ID = '00000000-0000-4000-8000-000000000001'
const PROJECT_X_TASK1_ID = '00000000-0000-4000-8000-000000000011'

const COMPANY_A_ID = '00000000-0000-4000-8000-0000000000e1'
const COMPANY_B_ID = '00000000-0000-4000-8000-0000000000e2'
const TAG_CATEGORY_ID = '00000000-0000-4000-8000-0000000000f0'
const TAG_1_ID = '00000000-0000-4000-8000-0000000000f1'
const TAG_2_ID = '00000000-0000-4000-8000-0000000000f2'

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
    companyId?: string | null
    techTagIds?: string[]
    contractUnitPriceHistory?: { effectiveFrom: string; amount: number }[]
  },
) {
  return {
    id,
    name,
    sectionId,
    companyId: options?.companyId ?? null,
    role: options?.role ?? '',
    isActive: true,
    techTagIds: options?.techTagIds ?? [],
    startDate: options?.startDate ?? null,
    endDate: options?.endDate ?? null,
    unitPriceHistory: options?.unitPriceHistory ?? [],
    contractUnitPriceHistory: options?.contractUnitPriceHistory ?? [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function makeCompany(
  id: string,
  name: string,
  sortOrder: number,
  isInternal: boolean,
) {
  return { id, name, sortOrder, isInternal, createdAt: NOW, updatedAt: NOW }
}

function makeTechTag(id: string, name: string, color: string) {
  return {
    id,
    name,
    color,
    categoryId: TAG_CATEGORY_ID,
    subCategoryId: null,
    note: null,
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
  assignments?: ReturnType<typeof makeAssignment>[]
  projects?: ReturnType<typeof makeProject>[]
  companies?: ReturnType<typeof makeCompany>[]
  techTags?: ReturnType<typeof makeTechTag>[]
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
    companies: options?.companies ?? [],
    techTags: options?.techTags ?? [],
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
) {
  await page.goto('/')
  await page.evaluate((d) => {
    localStorage.setItem('resource-manager-data', JSON.stringify(d))
  }, data)
  await page.goto('/team')
  await page
    .getByRole('heading', { name: 'チーム' })
    .waitFor({ state: 'visible', timeout: 10000 })
}

/** Get the localStorage DB data */
async function getStoredData(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('resource-manager-data')
    return raw ? JSON.parse(raw) : null
  })
}

/** Click a hover-revealed button on a row by its title attribute */
async function clickHoverButton(
  page: Page,
  rowText: string,
  buttonTitle: string,
) {
  const row = page.locator('.group').filter({ hasText: rowText }).first()
  await row.hover()
  const btn = row.locator(`button[title="${buttonTitle}"]`)
  await expect(btn).toBeVisible({ timeout: 3000 })
  await btn.click()
}

/** Submit the NameInputDialog with a given name */
async function submitNameDialog(page: Page, name: string, isEdit = false) {
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const input = dialog.locator('#org-name')
  await input.clear()
  await input.fill(name)
  await dialog.getByRole('button', { name: isEdit ? '更新' : '追加' }).click()
  await expect(dialog).not.toBeVisible({ timeout: 5000 })
}

/** Confirm the delete dialog */
async function confirmDelete(page: Page) {
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('削除の確認')).toBeVisible()
  await dialog.getByRole('button', { name: '削除' }).click()
  await expect(dialog).not.toBeVisible({ timeout: 5000 })
}

/** Select a fiscal year from the dropdown */
async function selectFiscalYear(page: Page, year: number) {
  const select = page.locator('select').filter({ hasText: '年度' })
  await select.selectOption(String(year))
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Team Management - Organization Structure CRUD', () => {
  test('Test 1: Add a division', async ({ page }) => {
    await seedAndNavigate(page, buildSeedData())

    // Click "部追加" button
    await page.getByRole('button', { name: '部追加' }).click()

    // Fill in the name dialog
    await submitNameDialog(page, '開発部')

    // Verify division appears
    await expect(page.getByText('開発部')).toBeVisible()

    // Verify persistence
    const stored = await getStoredData(page)
    expect(stored.divisions.length).toBe(1)
    expect(stored.divisions[0].name).toBe('開発部')
  })

  test('Test 2: Edit a division name', async ({ page }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
    })
    await seedAndNavigate(page, data)

    await expect(page.getByText('開発部')).toBeVisible()

    // Hover to reveal edit button and click
    await clickHoverButton(page, '開発部', '部名を編集')

    // Edit name in dialog
    await submitNameDialog(page, '技術部', true)

    // Verify new name appears and old name is gone
    await expect(page.getByText('技術部')).toBeVisible()

    // Verify persistence
    const stored = await getStoredData(page)
    expect(stored.divisions[0].name).toBe('技術部')
  })

  test('Test 3: Delete a division', async ({ page }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      sections: [makeSection(SEC_1_ID, DIV_DEV_ID, '第1課', 0)],
    })
    await seedAndNavigate(page, data)

    await expect(page.getByText('開発部')).toBeVisible()

    // Hover to reveal delete button and click
    await clickHoverButton(page, '開発部', '部を削除')

    // Confirm deletion
    await confirmDelete(page)

    // Verify division is gone
    await expect(page.getByText('開発部')).not.toBeVisible()

    // Verify persistence
    const stored = await getStoredData(page)
    expect(stored.divisions.length).toBe(0)
    expect(stored.sections.length).toBe(0)
  })

  test('Test 4: Add a section to a division', async ({ page }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
    })
    await seedAndNavigate(page, data)

    // Click "課を追加" button within the expanded division
    await page.getByRole('button', { name: '課を追加' }).click()

    // Fill in the name
    await submitNameDialog(page, '第1課')

    // Verify section appears
    await expect(page.getByText('第1課')).toBeVisible()

    // Verify persistence
    const stored = await getStoredData(page)
    expect(stored.sections.length).toBe(1)
    expect(stored.sections[0].name).toBe('第1課')
    expect(stored.sections[0].divisionId).toBe(DIV_DEV_ID)
  })

  test('Test 5: Edit a section name', async ({ page }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      sections: [makeSection(SEC_1_ID, DIV_DEV_ID, '第1課', 0)],
    })
    await seedAndNavigate(page, data)

    await expect(page.getByText('第1課')).toBeVisible()

    // Hover section row and click edit
    await clickHoverButton(page, '第1課', '課名を編集')

    // Edit name
    await submitNameDialog(page, '企画課', true)

    // Verify new name
    await expect(page.getByText('企画課')).toBeVisible()

    // Verify persistence
    const stored = await getStoredData(page)
    expect(stored.sections[0].name).toBe('企画課')
  })

  test('Test 6: Delete a section', async ({ page }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      sections: [makeSection(SEC_1_ID, DIV_DEV_ID, '第1課', 0)],
    })
    await seedAndNavigate(page, data)

    await expect(page.getByText('第1課')).toBeVisible()

    // Hover section row and click delete
    await clickHoverButton(page, '第1課', '課を削除')

    // Confirm deletion
    await confirmDelete(page)

    // Verify section is gone
    await expect(page.getByText('第1課')).not.toBeVisible()

    // Verify persistence
    const stored = await getStoredData(page)
    expect(stored.sections.length).toBe(0)
  })
})

test.describe('Team Management - Member Management', () => {
  test('Test 7: Add a member from a section node', async ({ page }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      sections: [makeSection(SEC_1_ID, DIV_DEV_ID, '第1課', 0)],
    })
    await seedAndNavigate(page, data)

    // Click "メンバー追加" button under the section
    await page.getByRole('button', { name: 'メンバー追加' }).click()

    // Fill TeamMemberDialog
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('新規担当者')).toBeVisible()

    // Name
    await dialog.locator('#member-name').fill('田中太郎')

    // Start date
    await dialog.locator('#member-start-date').fill('2025-04-01')

    // Unit price (first entry auto-created when start date is set)
    // NumericInputはtype="text"のためplaceholderで特定する
    const priceInput = dialog.getByPlaceholder('万円').first()
    await priceInput.clear()
    await priceInput.fill('100')

    // Submit
    await dialog.getByRole('button', { name: '追加', exact: true }).click()
    await expect(dialog).not.toBeVisible({ timeout: 5000 })

    // Verify member appears in the section
    await expect(page.getByText('田中太郎')).toBeVisible()
    await expect(page.getByText('100万円/月')).toBeVisible()

    // Verify persistence
    const stored = await getStoredData(page)
    const newMember = stored.members.find(
      (m: { name: string }) => m.name === '田中太郎',
    )
    expect(newMember).toBeTruthy()
    expect(newMember.sectionId).toBe(SEC_1_ID)
    expect(newMember.startDate).toBe('2025-04-01')
    expect(newMember.unitPriceHistory[0].amount).toBe(100)
  })

  test('Test 8: Edit a member (change section, unit price)', async ({
    page,
  }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      sections: [
        makeSection(SEC_1_ID, DIV_DEV_ID, '第1課', 0),
        makeSection(SEC_2_ID, DIV_DEV_ID, '第2課', 1),
      ],
      members: [
        makeMember(MEMBER_A_ID, '田中太郎', SEC_1_ID, {
          role: 'Developer',
          startDate: '2025-04-01',
          unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
        }),
      ],
    })
    await seedAndNavigate(page, data)

    // Verify member is in Section 1
    await expect(page.getByText('田中太郎')).toBeVisible()

    // Hover over member and click edit
    await clickHoverButton(page, '田中太郎', '編集')

    // Edit in dialog
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('担当者を編集')).toBeVisible()

    // Change section to 第2課（所属コンボボックスは所属会社コンボボックスより先に表示される）
    await dialog.locator('button[role="combobox"]').first().click()
    await page.getByRole('option', { name: /第2課/ }).click()

    // Change unit price（NumericInputはtype="text"のためplaceholderで特定する）
    const priceInput = dialog.getByPlaceholder('万円').first()
    await priceInput.clear()
    await priceInput.fill('120')

    // Submit
    await dialog.getByRole('button', { name: '更新' }).click()
    await expect(dialog).not.toBeVisible({ timeout: 5000 })

    // Verify persistence: member now in Section 2 with updated price
    const stored = await getStoredData(page)
    const updatedMember = stored.members.find(
      (m: { id: string }) => m.id === MEMBER_A_ID,
    )
    expect(updatedMember.sectionId).toBe(SEC_2_ID)
    expect(updatedMember.unitPriceHistory[0].amount).toBe(120)
  })

  test('Test 8b: Editing endDate to exclude an existing assignment month shows a confirmation dialog and clears it on confirm', async ({
    page,
  }) => {
    const assignment = makeAssignment(
      PROJECT_X_ID,
      PROJECT_X_TASK1_ID,
      MEMBER_A_ID,
      {
        '2025-09': 0.5,
      },
    )
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      sections: [makeSection(SEC_1_ID, DIV_DEV_ID, '第1課', 0)],
      companies: [makeCompany(COMPANY_A_ID, '協力会社A', 0, false)],
      members: [
        makeMember(MEMBER_A_ID, '田中太郎', SEC_1_ID, {
          startDate: '2025-04-01',
          companyId: COMPANY_A_ID,
          contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
        }),
      ],
      projects: [
        makeProject(PROJECT_X_ID, 'P001', 'Project X', 0, null),
        makeProject(PROJECT_X_TASK1_ID, 'P001-01', 'Task X-1', 1, PROJECT_X_ID),
      ],
      assignments: [assignment],
    })
    await seedAndNavigate(page, data)

    await clickHoverButton(page, '田中太郎', '編集')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // 終了日を2025-09より前に変更（既存アサイン2025-09が契約対象範囲外になる）
    const endDateInput = dialog.locator('#member-end-date')
    await endDateInput.fill('2025-06-30')
    await dialog.getByRole('button', { name: '更新' }).click()

    // 確認ダイアログが表示される
    const confirmDialog = page.getByRole('dialog').filter({
      hasText: '契約対象範囲外のアサインがあります',
    })
    await expect(confirmDialog).toBeVisible()
    await expect(confirmDialog).toContainText('2025-09')

    await confirmDialog.getByRole('button', { name: '解除して保存' }).click()
    await expect(confirmDialog).not.toBeVisible({ timeout: 5000 })

    const stored = await getStoredData(page)
    const updatedMember = stored.members.find(
      (m: { id: string }) => m.id === MEMBER_A_ID,
    )
    expect(updatedMember.endDate).toBe('2025-06-30')
    const updatedAssignment = stored.assignments.find(
      (a: { id: string }) => a.id === assignment.id,
    )
    expect(updatedAssignment.monthlyValues['2025-09']).toBeUndefined()
  })

  test('Test 9: Delete a member with confirmation', async ({ page }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      sections: [makeSection(SEC_1_ID, DIV_DEV_ID, '第1課', 0)],
      members: [
        makeMember(MEMBER_A_ID, '田中太郎', SEC_1_ID, {
          startDate: '2025-04-01',
          unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
        }),
      ],
    })
    await seedAndNavigate(page, data)

    await expect(page.getByText('田中太郎')).toBeVisible()

    // Hover and click delete
    await clickHoverButton(page, '田中太郎', '削除')

    // Confirm deletion
    await confirmDelete(page)

    // Verify member is gone
    await expect(page.getByText('田中太郎')).not.toBeVisible()

    // Verify persistence
    const stored = await getStoredData(page)
    expect(stored.members.length).toBe(0)
  })
})

test.describe('Team Management - Organization Deletion Cascade', () => {
  test('Test 10: Delete a section -> members move to Unaffiliated', async ({
    page,
  }) => {
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
          unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 90 }],
        }),
      ],
    })
    await seedAndNavigate(page, data)

    // Verify members are under 第1課
    await expect(page.getByText('田中太郎')).toBeVisible()
    await expect(page.getByText('佐藤花子')).toBeVisible()

    // Delete the section
    await clickHoverButton(page, '第1課', '課を削除')
    await confirmDelete(page)

    // Verify "未所属" section appears with the members
    await expect(page.getByText('未所属')).toBeVisible()
    await expect(page.getByText('(2名)')).toBeVisible()
    await expect(page.getByText('田中太郎')).toBeVisible()
    await expect(page.getByText('佐藤花子')).toBeVisible()

    // Verify persistence: members have sectionId = null
    const stored = await getStoredData(page)
    for (const member of stored.members as { sectionId: string | null }[]) {
      expect(member.sectionId).toBeNull()
    }
    expect(stored.sections.length).toBe(0)
  })

  test('Test 11: Delete a division -> child sections removed, members become unaffiliated', async ({
    page,
  }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      sections: [
        makeSection(SEC_1_ID, DIV_DEV_ID, '第1課', 0),
        makeSection(SEC_2_ID, DIV_DEV_ID, '第2課', 1),
      ],
      members: [
        makeMember(MEMBER_A_ID, '田中太郎', SEC_1_ID, {
          startDate: '2025-04-01',
          unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
        }),
        makeMember(MEMBER_B_ID, '佐藤花子', SEC_2_ID, {
          startDate: '2025-04-01',
          unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 90 }],
        }),
      ],
    })
    await seedAndNavigate(page, data)

    // Verify initial state
    await expect(page.getByText('開発部')).toBeVisible()
    await expect(page.getByText('田中太郎')).toBeVisible()
    await expect(page.getByText('佐藤花子')).toBeVisible()

    // Delete the division
    await clickHoverButton(page, '開発部', '部を削除')
    await confirmDelete(page)

    // Verify division is gone
    await expect(page.getByText('開発部')).not.toBeVisible()

    // Verify "未所属" section appears with both members
    await expect(page.getByText('未所属')).toBeVisible()
    await expect(page.getByText('田中太郎')).toBeVisible()
    await expect(page.getByText('佐藤花子')).toBeVisible()

    // Verify persistence
    const stored = await getStoredData(page)
    expect(stored.divisions.length).toBe(0)
    expect(stored.sections.length).toBe(0)
    for (const member of stored.members as { sectionId: string | null }[]) {
      expect(member.sectionId).toBeNull()
    }
  })
})

test.describe('Team Management - Revenue Display', () => {
  test('Test 12: Revenue Budget displays correctly for section and division', async ({
    page,
  }) => {
    // Member A: 100万/月, full year active in FY2025
    // Member B: 80万/月, full year active in FY2025
    // Section budget = (100 * 12) + (80 * 12) = 2,160万
    // Division budget = 2,160万
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
    })
    await seedAndNavigate(page, data)
    await selectFiscalYear(page, 2025)

    // Verify budget values appear: 2,160万円
    // Both section and division should show this amount
    const budgetTexts = page.getByText('2,160万円')
    await expect(budgetTexts.first()).toBeVisible()
  })

  test('Test 13: Switch fiscal year -> Revenue Budget recalculates', async ({
    page,
  }) => {
    // Member A starts 2025-07-01 with 100万/月
    // FY2025 (Apr 2025 - Mar 2026): active Jul-Mar = 9 months = 900万
    // FY2024 (Apr 2024 - Mar 2025): active 0 months = 0万
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      sections: [makeSection(SEC_1_ID, DIV_DEV_ID, '第1課', 0)],
      members: [
        makeMember(MEMBER_A_ID, '田中太郎', SEC_1_ID, {
          startDate: '2025-07-01',
          unitPriceHistory: [{ effectiveFrom: '2025-07', amount: 100 }],
        }),
      ],
    })
    await seedAndNavigate(page, data)

    // Select FY2025 and verify budget
    await selectFiscalYear(page, 2025)
    await expect(page.getByText('900万円').first()).toBeVisible()

    // Switch to FY2024 and verify budget changes to 0
    await selectFiscalYear(page, 2024)
    await expect(page.getByText('0万円').first()).toBeVisible()
  })

  test('Test 14: Expected Revenue reflects assignment data', async ({
    page,
  }) => {
    // Member A: 100万/月, start 2025-04-01, full year active in FY2025
    // Assignments: 0.5 rate for every month Apr 2025 - Mar 2026
    // Expected revenue = 100 * 0.5 * 12 = 600万
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
    await seedAndNavigate(page, data)
    await selectFiscalYear(page, 2025)

    // Budget = 100 * 12 = 1,200万
    await expect(page.getByText('1,200万円').first()).toBeVisible()

    // Expected revenue = 100 * 0.5 * 12 = 600万
    await expect(page.getByText('600万円').first()).toBeVisible()
  })

  test('Test 15: Revenue aggregation at section and division levels', async ({
    page,
  }) => {
    // Division with 2 sections
    // Section 1: Member A (100万/月, 12 months active) = 1,200万
    // Section 2: Member B (80万/月, 12 months active) = 960万
    // Division budget = 2,160万
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      sections: [
        makeSection(SEC_1_ID, DIV_DEV_ID, '第1課', 0),
        makeSection(SEC_2_ID, DIV_DEV_ID, '第2課', 1),
      ],
      members: [
        makeMember(MEMBER_A_ID, '田中太郎', SEC_1_ID, {
          startDate: '2025-04-01',
          unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
        }),
        makeMember(MEMBER_B_ID, '佐藤花子', SEC_2_ID, {
          startDate: '2025-04-01',
          unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 80 }],
        }),
      ],
    })
    await seedAndNavigate(page, data)
    await selectFiscalYear(page, 2025)

    // Verify Section 1 budget: 1,200万円
    const sec1Row = page.locator('.group').filter({ hasText: '第1課' }).first()
    await expect(sec1Row.getByText('1,200万円').first()).toBeVisible()

    // Verify Section 2 budget: 960万円
    const sec2Row = page.locator('.group').filter({ hasText: '第2課' }).first()
    await expect(sec2Row.getByText('960万円').first()).toBeVisible()

    // Verify Division budget: 2,160万円
    const divRow = page.locator('.group').filter({ hasText: '開発部' }).first()
    await expect(divRow.getByText('2,160万円').first()).toBeVisible()
  })
})

test.describe('Team Management - Skill Tags, Company Display & Filters', () => {
  function buildFilterTestSeed() {
    return buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      sections: [
        makeSection(SEC_1_ID, DIV_DEV_ID, '第1課', 0),
        makeSection(SEC_2_ID, DIV_DEV_ID, '第2課', 1),
      ],
      companies: [
        makeCompany(COMPANY_A_ID, 'A社', 0, true),
        makeCompany(COMPANY_B_ID, 'B社', 1, false),
      ],
      techTags: [
        makeTechTag(TAG_1_ID, 'React', '#3b82f6'),
        makeTechTag(TAG_2_ID, 'TypeScript', '#2563eb'),
      ],
      members: [
        makeMember(MEMBER_A_ID, '田中太郎', SEC_1_ID, {
          startDate: '2025-04-01',
          unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
          companyId: COMPANY_A_ID,
          techTagIds: [TAG_1_ID, TAG_2_ID],
        }),
        makeMember(MEMBER_B_ID, '佐藤花子', SEC_2_ID, {
          startDate: '2025-04-01',
          unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 90 }],
          companyId: COMPANY_B_ID,
        }),
      ],
    })
  }

  test('Test 16: メンバー行に保有スキルタグがバッジで全件表示される', async ({
    page,
  }) => {
    await seedAndNavigate(page, buildFilterTestSeed())

    const memberRow = page.locator('.group').filter({ hasText: '田中太郎' })
    await expect(memberRow.getByText('React')).toBeVisible()
    await expect(memberRow.getByText('TypeScript')).toBeVisible()
  })

  test('Test 17: メンバー行に所属会社名が表示される', async ({ page }) => {
    await seedAndNavigate(page, buildFilterTestSeed())

    const memberRowA = page.locator('.group').filter({ hasText: '田中太郎' })
    await expect(memberRowA.getByText('A社')).toBeVisible()

    const memberRowB = page.locator('.group').filter({ hasText: '佐藤花子' })
    await expect(memberRowB.getByText('B社')).toBeVisible()
  })

  test('Test 18: 所属会社フィルタ(複数選択)で部門・課グルーピングを維持したまま横断的に絞り込む', async ({
    page,
  }) => {
    await seedAndNavigate(page, buildFilterTestSeed())

    // フィルタ適用前: 両部門・課ともメンバーが表示されている
    await expect(page.getByText('田中太郎')).toBeVisible()
    await expect(page.getByText('佐藤花子')).toBeVisible()
    const divRowBefore = page
      .locator('.group')
      .filter({ hasText: '開発部' })
      .first()
    await expect(divRowBefore.getByText('(2名)')).toBeVisible()

    // 所属会社フィルタでA社のみを選択
    await page.getByRole('combobox', { name: '所属会社で絞り込み' }).click()
    await page.getByRole('option', { name: 'A社' }).click()
    await page.keyboard.press('Escape')

    // A社所属の田中太郎のみ表示され、既存の部門・課ツリー構造は維持される
    await expect(page.getByText('田中太郎')).toBeVisible()
    await expect(page.getByText('佐藤花子')).not.toBeVisible()
    await expect(page.getByText('開発部')).toBeVisible()
    await expect(page.getByText('第1課')).toBeVisible()
    await expect(page.getByText('第2課')).toBeVisible()

    // 人数表記が絞り込み後の人数(1名)に更新される
    const divRowAfter = page
      .locator('.group')
      .filter({ hasText: '開発部' })
      .first()
    await expect(divRowAfter.getByText('(1名)')).toBeVisible()
    const sec1Row = page.locator('.group').filter({ hasText: '第1課' }).first()
    await expect(sec1Row.getByText('(1名)')).toBeVisible()
    const sec2Row = page.locator('.group').filter({ hasText: '第2課' }).first()
    await expect(sec2Row.getByText('(0名)')).toBeVisible()
  })

  test('Test 19: 内部/外部リソースフィルタは所属会社フィルタとAND条件で絞り込む', async ({
    page,
  }) => {
    await seedAndNavigate(page, buildFilterTestSeed())

    // 所属会社フィルタでB社(外部リソース)のみを選択 -> 佐藤花子のみ表示
    await page.getByRole('combobox', { name: '所属会社で絞り込み' }).click()
    await page.getByRole('option', { name: 'B社' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByText('佐藤花子')).toBeVisible()

    // さらに内部リソースのみフィルタを適用 -> B社は外部リソースのためAND条件で除外される
    await page
      .locator('select[aria-label="内部/外部リソース"]')
      .selectOption('internal')
    await expect(page.getByText('佐藤花子')).not.toBeVisible()
    await expect(page.getByText('田中太郎')).not.toBeVisible()
  })

  test('Test 20: 部門名横のアイコンをホバーすると所属会社別内訳が表示され、内訳合計が人数表記と一致する', async ({
    page,
  }) => {
    await seedAndNavigate(page, buildFilterTestSeed())

    await page.getByRole('button', { name: '開発部の所属会社別内訳' }).hover()

    const popup = page.getByText('開発部の所属会社別内訳').locator('..')
    await expect(popup.getByText('A社')).toBeVisible()
    await expect(popup.getByText('B社')).toBeVisible()
    await expect(popup.getByText('1名').first()).toBeVisible()

    // 内訳合計(1+1=2名)が部門ヘッダーの人数表記と一致する
    const divRow = page.locator('.group').filter({ hasText: '開発部' }).first()
    await expect(divRow.getByText('(2名)')).toBeVisible()
  })

  test('Test 21: 課名横のアイコンをホバーすると所属会社別内訳が表示される', async ({
    page,
  }) => {
    await seedAndNavigate(page, buildFilterTestSeed())

    await page.getByRole('button', { name: '第1課の所属会社別内訳' }).hover()

    const popup = page.getByText('第1課の所属会社別内訳').locator('..')
    await expect(popup.getByText('A社')).toBeVisible()
    await expect(popup.getByText('1名')).toBeVisible()
  })

  test('Test 22: ダークモード切り替え後もスキルタグバッジ・内訳ポップアップが視認できる', async ({
    page,
  }) => {
    await seedAndNavigate(page, buildFilterTestSeed())

    // ダークモードに切り替え
    await page.getByRole('button', { name: 'ダーク' }).click()
    const rootClassDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    )
    expect(rootClassDark).toBe(true)

    // スキルタグバッジが視認できる
    const memberRow = page.locator('.group').filter({ hasText: '田中太郎' })
    await expect(memberRow.getByText('React')).toBeVisible()

    // 内訳ポップアップの背景色が透明・未解決トークンにならず視認できる
    await page.getByRole('button', { name: '開発部の所属会社別内訳' }).hover()
    const popup = page.getByText('開発部の所属会社別内訳').locator('..')
    await expect(popup).toBeVisible()
    const backgroundColor = await popup.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    )
    expect(backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    expect(backgroundColor).not.toBe('')
  })
})
