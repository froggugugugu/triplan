import { expect, type Page, test } from '@playwright/test'

/**
 * WBSタスクと工程（スケジュール）の紐づけのE2E。
 *
 * 本ツールは長らく「工程」を2箇所（WBSツリーの上位ノード／スケジュールのphase-1〜15）に
 * 分けて持ち、両者が繋がっていなかった。`Project.phaseKey`がその接続点で、
 * ここでは**接続が実localStorageへ永続化され、ガントの進捗表示まで届く**ことを確認する。
 */

const FIXED_NOW = new Date('2025-10-01T12:00:00')
const NOW = '2025-09-01T00:00:00.000Z'

const ROOT_ID = '00000000-0000-4000-8000-00000000ad01'
const PHASE_NODE_ID = '00000000-0000-4000-8000-00000000ad02'
const TASK_DONE_ID = '00000000-0000-4000-8000-00000000ad03'
const TASK_TODO_ID = '00000000-0000-4000-8000-00000000ad04'

function buildSeedData() {
  const projectBase = {
    description: '',
    background: '',
    purpose: '',
    status: 'active' as const,
    confidence: null,
    createdAt: NOW,
    updatedAt: NOW,
  }
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [
      {
        ...projectBase,
        id: ROOT_ID,
        code: 'P800',
        name: '工程紐づけテスト案件',
        parentId: null,
        level: 0,
        completed: false,
      },
      {
        ...projectBase,
        id: PHASE_NODE_ID,
        code: 'P800-01',
        name: '設計工程',
        parentId: ROOT_ID,
        level: 1,
        completed: false,
      },
      // 工数1・完了 → 工程進捗は 1/(1+1) = 50%
      {
        ...projectBase,
        id: TASK_DONE_ID,
        code: 'P800-01-01',
        name: '完了済みタスク',
        parentId: PHASE_NODE_ID,
        level: 2,
        completed: true,
        completedAt: '2025-09-20',
      },
      {
        ...projectBase,
        id: TASK_TODO_ID,
        code: 'P800-01-02',
        name: '未完了タスク',
        parentId: PHASE_NODE_ID,
        level: 2,
        completed: false,
      },
    ],
    members: [],
    assignments: [],
    efforts: [
      {
        id: '00000000-0000-4000-8000-00000000ae01',
        projectId: TASK_DONE_ID,
        columnId: 'effort-1',
        value: 1,
      },
      {
        id: '00000000-0000-4000-8000-00000000ae02',
        projectId: TASK_TODO_ID,
        columnId: 'effort-1',
        value: 1,
      },
    ],
    // 工程「要件定義」（phase-1、デフォルト設定で有効）に期間を引いておく
    scheduleEntries: [
      {
        id: '00000000-0000-4000-8000-00000000af01',
        projectId: ROOT_ID,
        phaseKey: 'phase-1',
        startDate: '2025-10-01',
        endDate: '2025-12-31',
      },
    ],
    metadata: {
      lastModified: NOW,
      createdBy: 'test',
      version: '1.0.0',
    },
  }
}

async function seedAndOpenWbs(page: Page) {
  await page.clock.setFixedTime(FIXED_NOW)
  await page.goto('/')
  await page.evaluate((d) => {
    localStorage.setItem('resource-manager-data', JSON.stringify(d))
  }, buildSeedData())
  await page.goto('/wbs')
  await page
    .getByRole('heading', { name: 'WBS' })
    .waitFor({ state: 'visible', timeout: 10000 })
  // 初期ロード（複数ストアの非同期解決）の静定を待つ
  await page.waitForTimeout(400)
  await page.getByRole('combobox').first().click()
  await page
    .locator('[cmdk-list] [role="option"]')
    .filter({ hasText: 'P800' })
    .first()
    .dispatchEvent('click')
  await expect(page.getByRole('combobox').first()).toContainText('P800')
}

async function getStoredProject(page: Page, id: string) {
  return page.evaluate((projectId) => {
    const raw = localStorage.getItem('resource-manager-data')
    const projects = JSON.parse(raw ?? '{}').projects ?? []
    return projects.find((p: { id: string }) => p.id === projectId) ?? null
  }, id)
}

test.describe('WBSタスクと工程の紐づけ（/wbs → /schedule）', () => {
  test('工程ノードへ所属工程を設定すると実localStorageへ永続化され、リロード後も残る', async ({
    page,
  }) => {
    await seedAndOpenWbs(page)

    // 工程ノード（P800-01）の編集ダイアログを開く
    await page
      .locator(
        `.ag-pinned-left-cols-container .ag-row[row-id="${PHASE_NODE_ID}"] [title="編集"]`,
      )
      .click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('所属工程')).toBeVisible()

    // 既定は「未設定（上位から継承）」
    await expect(dialog.getByText('未設定（上位から継承）')).toBeVisible()
    await dialog.getByText('未設定（上位から継承）').click()
    await page
      .locator('[cmdk-list] [role="option"]')
      .filter({ hasText: '要件定義' })
      .first()
      .dispatchEvent('click')

    await dialog.getByRole('button', { name: '更新' }).click()
    await expect(dialog).toBeHidden()

    await expect
      .poll(async () => (await getStoredProject(page, PHASE_NODE_ID))?.phaseKey)
      .toBe('phase-1')

    // リロード後も残る
    await page.reload()
    await page
      .getByRole('heading', { name: 'WBS' })
      .waitFor({ state: 'visible', timeout: 10000 })
    expect((await getStoredProject(page, PHASE_NODE_ID))?.phaseKey).toBe(
      'phase-1',
    )
  })

  test('反証: 工程を設定していないタスクにはphaseKeyが書き込まれない（継承のまま）', async ({
    page,
  }) => {
    await seedAndOpenWbs(page)

    // 配下のタスクを工程未指定のまま編集・保存する
    await page
      .locator(
        `.ag-pinned-left-cols-container .ag-row[row-id="${TASK_TODO_ID}"] [title="編集"]`,
      )
      .click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: '更新' }).click()
    await expect(dialog).toBeHidden()

    await page.waitForTimeout(300)
    const stored = await getStoredProject(page, TASK_TODO_ID)
    // 「未設定＝上位から継承」の意味を保つため、勝手に値を埋めない
    expect(stored?.phaseKey ?? null).toBeNull()
  })

  test('工程に紐づけたWBSの完了状況がガントバーの進捗として表示される', async ({
    page,
  }) => {
    // 工程ノードへphase-1を紐づけた状態を直接シードする（UI操作は上のテストで検証済み）
    await page.clock.setFixedTime(FIXED_NOW)
    await page.goto('/')
    await page.evaluate((d) => {
      const seed = d as { projects: Array<{ id: string; phaseKey?: string }> }
      const phaseNode = seed.projects.find(
        (p) => p.id === '00000000-0000-4000-8000-00000000ad02',
      )
      if (phaseNode) phaseNode.phaseKey = 'phase-1'
      localStorage.setItem('resource-manager-data', JSON.stringify(seed))
    }, buildSeedData())

    await page.goto('/schedule')
    await page.waitForTimeout(600)
    await page.getByRole('combobox').first().click()
    await page
      .locator('[cmdk-list] [role="option"]')
      .filter({ hasText: 'P800' })
      .first()
      .dispatchEvent('click')
    await expect(page.getByRole('combobox').first()).toContainText('P800')
    await page.waitForTimeout(600)

    // 工数1完了 / 工数2合計 = 50%。SVAR Ganttは進捗を専用要素として描く
    const progress = page.locator('.wx-progress-percent').first()
    await expect(progress).toBeVisible({ timeout: 10000 })
  })

  test('反証: 工程にタスクを紐づけていなければガントに進捗を描かない（0%として描かない）', async ({
    page,
  }) => {
    // 上のテストとの違いはphaseKeyを設定しないことだけ。
    // 「まだ紐づけていない」を0%と描くと未着手と誤読されるため、要素自体を出さない
    await page.clock.setFixedTime(FIXED_NOW)
    await page.goto('/')
    await page.evaluate((d) => {
      localStorage.setItem('resource-manager-data', JSON.stringify(d))
    }, buildSeedData())

    await page.goto('/schedule')
    await page.waitForTimeout(600)
    await page.getByRole('combobox').first().click()
    await page
      .locator('[cmdk-list] [role="option"]')
      .filter({ hasText: 'P800' })
      .first()
      .dispatchEvent('click')
    await expect(page.getByRole('combobox').first()).toContainText('P800')
    // ガントの描画完了を待つ（バーは出るが進捗要素は出ない、という状態を確認する）
    await expect(page.locator('.wx-gantt, .wx-timeline').first()).toBeVisible({
      timeout: 10000,
    })
    await page.waitForTimeout(600)

    await expect(page.locator('.wx-progress-percent')).toHaveCount(0)
  })
})
