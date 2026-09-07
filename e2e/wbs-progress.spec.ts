import { expect, type Page, test } from '@playwright/test'

// ─── Seed Data Constants ───────────────────────────────────────────────────────

const NOW = '2025-10-01T00:00:00.000Z'

const PROJECT_X_ID = '00000000-0000-4000-8000-00000000ee01'
const TASK_A_ID = '00000000-0000-4000-8000-00000000ee02'
const TASK_A1_ID = '00000000-0000-4000-8000-00000000ee03'
const TASK_B_ID = '00000000-0000-4000-8000-00000000ee04'
const TASK_B1_ID = '00000000-0000-4000-8000-00000000ee05'

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
    parentId,
    level,
    status: 'active' as const,
    confidence: null,
    completed: false,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function buildSeedData() {
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [
      makeProject(PROJECT_X_ID, 'P001', 'Project X', 0, null),
      makeProject(TASK_A_ID, 'P001-01', 'Task A', 1, PROJECT_X_ID),
      makeProject(TASK_A1_ID, 'P001-01-01', 'SubTask A1', 2, TASK_A_ID),
      makeProject(TASK_B_ID, 'P001-02', 'Task B', 1, PROJECT_X_ID),
      makeProject(TASK_B1_ID, 'P001-02-01', 'SubTask B1', 2, TASK_B_ID),
    ],
    members: [],
    assignments: [],
    divisions: [],
    sections: [],
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
  await page.goto('/wbs')
  await page
    .getByRole('heading', { name: 'WBS' })
    .waitFor({ state: 'visible', timeout: 10000 })
}

async function selectProject(page: Page, optionText: string) {
  await page.getByRole('combobox').first().click()
  await page.getByRole('option', { name: new RegExp(optionText) }).click()
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

test.describe('WBS - 完了チェック操作とツリーアコーディオン開閉状態の独立性', () => {
  test('閉じているアコーディオンは、別ブランチの完了チェック操作後も閉じたままである', async ({
    page,
  }) => {
    await seedAndNavigate(page, buildSeedData())
    await selectProject(page, 'P001 - Project X')

    // デフォルトで全展開のため、両ブランチの最下層タスクが表示されている
    await expect(page.getByLabel('SubTask A1を完了にする')).toBeVisible()
    await expect(page.getByLabel('SubTask B1を完了にする')).toBeVisible()

    // Task Aのアコーディオンを折りたたむ
    const taskAExpandButton = page
      .locator(
        `.ag-pinned-left-cols-container .ag-row[row-id="${TASK_A_ID}"] .ag-cell[col-id="name"] button`,
      )
      .first()
    await taskAExpandButton.click()
    await expect(page.getByLabel('SubTask A1を完了にする')).not.toBeVisible()

    // 別ブランチ（Task B配下のSubTask B1）の完了チェックボックスを操作する
    const checkboxB1 = page.getByLabel('SubTask B1を完了にする')
    await checkboxB1.check()
    await expect(checkboxB1).toBeChecked()

    // Task Aのアコーディオンは閉じたままであること（誤って再展開されないことの反証）
    await expect(page.getByLabel('SubTask A1を完了にする')).not.toBeVisible()

    // ストアにも完了状態が正しく反映されていること
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('resource-manager-data')
      return raw ? JSON.parse(raw) : null
    })
    const updatedTaskB1 = (
      stored.projects as Array<{ id: string; completed: boolean }>
    ).find((p) => p.id === TASK_B1_ID)
    expect(updatedTaskB1?.completed).toBe(true)
  })

  test('自分自身が属するブランチの完了チェック操作では、他の閉じたアコーディオンの開閉に影響しない', async ({
    page,
  }) => {
    await seedAndNavigate(page, buildSeedData())
    await selectProject(page, 'P001 - Project X')

    // Task A・Task Bの両方を折りたたむ
    const taskAExpandButton = page
      .locator(
        `.ag-pinned-left-cols-container .ag-row[row-id="${TASK_A_ID}"] .ag-cell[col-id="name"] button`,
      )
      .first()
    await taskAExpandButton.click()
    const taskBExpandButton = page
      .locator(
        `.ag-pinned-left-cols-container .ag-row[row-id="${TASK_B_ID}"] .ag-cell[col-id="name"] button`,
      )
      .first()
    await taskBExpandButton.click()
    await expect(page.getByLabel('SubTask A1を完了にする')).not.toBeVisible()
    await expect(page.getByLabel('SubTask B1を完了にする')).not.toBeVisible()

    // Task Aを再展開してSubTask A1を完了にする
    await taskAExpandButton.click()
    const checkboxA1 = page.getByLabel('SubTask A1を完了にする')
    await expect(checkboxA1).toBeVisible()
    await checkboxA1.check()

    // Task Bは折りたたまれたままであること
    await expect(page.getByLabel('SubTask B1を完了にする')).not.toBeVisible()
  })
})
