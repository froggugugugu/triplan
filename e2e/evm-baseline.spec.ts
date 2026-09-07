import { expect, type Page, test } from '@playwright/test'

/**
 * /wbs画面の「計画を凍結」（project-baseline-storeのfreezeBaseline）が実localStorage
 * （DataAdapter経由）へ正しく永続化されることを検証する（非公開の設計文書・§8 S2/S4）。
 *
 * ベースラインはEVMのPV（計画値）の基準線であり、PMがEVMのために行う唯一の操作。
 * ユニットテストはモック化したDataAdapterに対して行っているため、実ブラウザ・実localStorageでの
 * 反証はこのE2Eが唯一の経路になる（新規凍結→リロード後の残存→再凍結でversionが増えることを確認）。
 */

const NOW = '2025-10-01T00:00:00.000Z'

const PROJECT_ID = '00000000-0000-4000-8000-00000000fb01'
const TASK_ID = '00000000-0000-4000-8000-00000000fb02'
const MEMBER_ID = '00000000-0000-4000-8000-00000000fb03'
const SECTION_ID = '00000000-0000-4000-8000-00000000fb04'
const DIVISION_ID = '00000000-0000-4000-8000-00000000fb05'

function buildSeedData() {
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [
      {
        id: PROJECT_ID,
        code: 'P910',
        name: 'ベースラインテスト案件',
        description: '',
        background: '',
        purpose: '',
        parentId: null,
        level: 0,
        status: 'active' as const,
        confidence: null,
        completed: false,
        divisionId: DIVISION_ID,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: TASK_ID,
        code: 'P910-01',
        name: '設計タスク',
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
    members: [
      {
        id: MEMBER_ID,
        name: 'テスト太郎',
        sectionId: SECTION_ID,
        companyId: null,
        role: 'SE',
        isActive: true,
        techTagIds: [],
        startDate: '2025-04-01',
        endDate: null,
        unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
        contractUnitPriceHistory: [],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    // 凍結対象のアサイン計画（PV曲線の源）。2ヶ月にまたがる配分にして山の形を作る
    assignments: [
      {
        id: '00000000-0000-4000-8000-00000000fb06',
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 1.0, '2025-05': 0.5 },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    // BAC（WBS工数×概算単価×係数）の源
    efforts: [
      {
        id: '00000000-0000-4000-8000-00000000fb07',
        projectId: TASK_ID,
        columnId: 'effort-1',
        value: 20,
      },
    ],
    divisions: [
      {
        id: DIVISION_ID,
        name: '開発部',
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    sections: [
      {
        id: SECTION_ID,
        divisionId: DIVISION_ID,
        name: '第一課',
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    scheduleEntries: [
      {
        id: '00000000-0000-4000-8000-00000000fb08',
        projectId: PROJECT_ID,
        phaseKey: 'phase-1',
        startDate: '2025-04-01',
        endDate: '2025-05-31',
      },
    ],
    projectProgressEntries: [],
    projectBaselines: [],
    estimatedUnitPrice: 100,
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
  await page.getByRole('option', { name: /P910/ }).click()
}

async function getStoredBaselines(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('resource-manager-data')
    const data = raw ? JSON.parse(raw) : null
    return data?.projectBaselines ?? []
  })
}

test.describe('EVMベースラインの凍結（/wbs）', () => {
  test('「計画を凍結」で実localStorageへ永続化され、リロード後も残る', async ({
    page,
  }) => {
    await seedAndNavigate(page)
    await selectProject(page)

    // 凍結前は未凍結と表示される
    await expect(page.getByText('未凍結')).toBeVisible()

    await page.getByRole('button', { name: '計画を凍結' }).click()
    // v1は理由の初期値が「当初計画」で入っている
    await expect(page.getByLabel('凍結理由')).toHaveValue('当初計画')
    await page.getByRole('button', { name: '凍結する' }).click()

    await expect
      .poll(async () => (await getStoredBaselines(page)).length)
      .toBe(1)
    const [stored] = await getStoredBaselines(page)
    expect(stored.projectId).toBe(PROJECT_ID)
    expect(stored.version).toBe(1)
    expect(stored.reason).toBe('当初計画')
    // アサイン計画（1.0人月×単価100 / 0.5人月×単価100）が月次計画コストとして凍結される
    expect(stored.monthlyPlannedCost['2025-04']).toBe(100)
    expect(stored.monthlyPlannedCost['2025-05']).toBe(50)
    // 単価モードlatest用の配分率スナップショットも保持される
    expect(stored.plannedAllocations).toHaveLength(1)
    expect(stored.plannedAllocations[0].memberId).toBe(MEMBER_ID)
    // BAC（20人日 ÷ 20 × 概算単価100 × 係数1 = 100万円）
    expect(stored.bacAmount).toBeGreaterThan(0)

    await page.reload()
    await page
      .getByRole('heading', { name: 'WBS' })
      .waitFor({ state: 'visible' })
    await selectProject(page)
    await expect(page.getByText(/v1（.*当初計画）/)).toBeVisible()

    const afterReload = await getStoredBaselines(page)
    expect(afterReload).toHaveLength(1)
    expect(afterReload[0].id).toBe(stored.id)
  })

  test('再凍結するとversionが増え、当初版は履歴として残る（追記専用）', async ({
    page,
  }) => {
    await seedAndNavigate(page)
    await selectProject(page)

    await page.getByRole('button', { name: '計画を凍結' }).click()
    await page.getByRole('button', { name: '凍結する' }).click()
    await expect
      .poll(async () => (await getStoredBaselines(page)).length)
      .toBe(1)

    // 2回目はボタン文言が「計画を再凍結」に変わり、理由の初期値は空になる
    const refreezeButton = page.getByRole('button', { name: '計画を再凍結' })
    await expect(refreezeButton).toBeVisible()
    await refreezeButton.click()
    await expect(page.getByLabel('凍結理由')).toHaveValue('')
    // 理由が空のままでは凍結できない（履歴で「なぜ再凍結したか」を追えなくなるため）
    await expect(page.getByRole('button', { name: '凍結する' })).toBeDisabled()

    await page.getByLabel('凍結理由').fill('CR#1 追加開発分')
    await page.getByRole('button', { name: '凍結する' }).click()

    await expect
      .poll(async () => (await getStoredBaselines(page)).length)
      .toBe(2)
    const stored = await getStoredBaselines(page)
    const versions = stored.map((b: { version: number }) => b.version).sort()
    expect(versions).toEqual([1, 2])
    // 当初版（v1）は上書きされず残る
    expect(
      stored.find((b: { version: number }) => b.version === 1).reason,
    ).toBe('当初計画')
    await expect(page.getByText(/v2（.*CR#1 追加開発分）/)).toBeVisible()
  })
})
