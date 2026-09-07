import { expect, test } from '@playwright/test'

/**
 * /statements（月次明細）ページ。単価の二重管理が2方向の帳票に正しく写ることを
 * 実ブラウザで検証する:
 * - 協力会社への支払タブ = 契約単価ベース（80万円）
 * - 発注元向けタブ = 見積単価ベース（100万円）
 * 同じアサイン（0.5人月）から異なる金額（40万円/50万円）が出ることが核心の反証。
 */

const NOW = '2025-10-01T00:00:00.000Z'

function getCurrentFiscalYear(): number {
  const now = new Date()
  return now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1
}
const FISCAL_YEAR = getCurrentFiscalYear()
const APRIL_KEY = `${FISCAL_YEAR}-04`

const PROJECT_ID = '00000000-0000-4000-8000-00000000dd01'
const TASK_ID = '00000000-0000-4000-8000-00000000dd02'
const BP_MEMBER_ID = '00000000-0000-4000-8000-00000000dd03'
const PARTNER_COMPANY_ID = '00000000-0000-4000-8000-00000000dd04'

function buildSeedData() {
  return {
    version: '1.0.0',
    fiscalYear: FISCAL_YEAR,
    projects: [
      {
        id: PROJECT_ID,
        code: 'P930',
        name: '明細テスト案件',
        parentId: null,
        level: 0,
        status: 'active' as const,
        confidence: null,
        completed: false,
        clientName: '株式会社発注元',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: TASK_ID,
        code: 'P930-01',
        name: '開発タスク',
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
        id: BP_MEMBER_ID,
        name: '明細BP太郎',
        sectionId: null,
        companyId: PARTNER_COMPANY_ID,
        role: 'PG',
        isActive: true,
        techTagIds: [],
        startDate: '2020-04-01',
        endDate: null,
        unitPriceHistory: [{ effectiveFrom: '2020-04', amount: 100 }],
        contractUnitPriceHistory: [{ effectiveFrom: '2020-04', amount: 80 }],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    companies: [
      {
        id: PARTNER_COMPANY_ID,
        name: '明細パートナーズ',
        sortOrder: 0,
        isInternal: false,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    assignments: [
      {
        id: '00000000-0000-4000-8000-00000000dd05',
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: BP_MEMBER_ID,
        monthlyValues: { [APRIL_KEY]: 0.5 },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    metadata: { lastModified: NOW, createdBy: 'system', version: '1.0.0' },
  }
}

test.describe('月次明細（/statements）', () => {
  test('協力会社タブは契約単価、発注元タブは見積単価で同一アサインから異なる金額が出る', async ({
    page,
  }) => {
    await page.goto('/')
    await page.evaluate((d) => {
      localStorage.setItem('resource-manager-data', JSON.stringify(d))
    }, buildSeedData())
    await page.goto('/statements')
    await page
      .getByRole('heading', { name: '月次明細' })
      .waitFor({ state: 'visible', timeout: 10000 })

    // 対象月を年度4月へ（現在月に配分が無い場合に備えて明示選択）
    await page.locator('#statement-month').selectOption(APRIL_KEY)

    // 協力会社タブ: 契約単価80 × 0.5 = 40万円
    await expect(page.getByText('明細パートナーズ')).toBeVisible()
    await expect(page.getByText('明細BP太郎')).toBeVisible()
    const partnerTable = page.locator('table').first()
    await expect(partnerTable).toContainText('P930')
    await expect(partnerTable).toContainText('80.00')
    await expect(partnerTable).toContainText('40.00')
    // 反証: 見積単価100がこのタブに現れない
    await expect(partnerTable).not.toContainText('100.00')

    // 発注元タブ: 見積単価100 × 0.5 = 50万円
    await page.getByRole('tab', { name: '発注元向け（案件別）' }).click()
    const clientTable = page.locator('table').first()
    await expect(clientTable).toContainText('明細テスト案件')
    await expect(page.getByText('発注元: 株式会社発注元')).toBeVisible()
    await expect(clientTable).toContainText('100.00')
    await expect(clientTable).toContainText('50.00')
  })
})
