import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

/**
 * /reports画面のCSVレポート出力（非公開の設計文書）。
 * 実ブラウザでダウンロードが発火し、UTF-8 BOM付き・シードした案件の行を含むCSVが
 * 生成されることを検証する（Excelでの文字化け防止＝BOMの付与が唯一ここでしか
 * 反証できないため、E2Eで実ファイルの先頭バイトまで確認する）。
 */

const NOW = '2025-10-01T00:00:00.000Z'

// 表示年度はシードデータではなく実行時の現在日時から算出されるため（development-patterns.md
// 「E2E: シードしたfiscalYearと表示中の年度がずれる」）、期待値・アサイン月キーは動的に組む
function getCurrentFiscalYear(): number {
  const now = new Date()
  return now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1
}
const FISCAL_YEAR = getCurrentFiscalYear()
const APRIL_KEY = `${FISCAL_YEAR}-04`

const PROJECT_ID = '00000000-0000-4000-8000-00000000cc01'
const TASK_ID = '00000000-0000-4000-8000-00000000cc02'
const MEMBER_ID = '00000000-0000-4000-8000-00000000cc03'
const DIVISION_ID = '00000000-0000-4000-8000-00000000cc04'

function buildSeedData() {
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [
      {
        id: PROJECT_ID,
        code: 'P920',
        name: 'CSV出力テスト案件',
        parentId: null,
        level: 0,
        status: 'active' as const,
        confidence: null,
        completed: false,
        divisionId: DIVISION_ID,
        contractAmount: 500,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: TASK_ID,
        code: 'P920-01',
        name: '実装タスク',
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
        name: 'CSV花子',
        sectionId: null,
        companyId: null,
        role: 'PG',
        isActive: true,
        techTagIds: [],
        startDate: '2025-04-01',
        endDate: null,
        unitPriceHistory: [{ effectiveFrom: '2020-04', amount: 80 }],
        contractUnitPriceHistory: [],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    assignments: [
      {
        id: '00000000-0000-4000-8000-00000000cc05',
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { [APRIL_KEY]: 0.5 },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    efforts: [
      {
        id: '00000000-0000-4000-8000-00000000cc06',
        projectId: TASK_ID,
        columnId: 'effort-1',
        value: 10,
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
    sections: [],
    estimatedUnitPrice: 100,
    metadata: { lastModified: NOW, createdBy: 'system', version: '1.0.0' },
  }
}

test.describe('CSVレポート出力（/reports）', () => {
  test('案件別収支表がBOM付きUTF-8でダウンロードされ、シードした案件の行を含む', async ({
    page,
  }) => {
    await page.goto('/')
    await page.evaluate((d) => {
      localStorage.setItem('resource-manager-data', JSON.stringify(d))
    }, buildSeedData())
    await page.goto('/reports')
    await page
      .getByRole('heading', { name: 'レポート', exact: true })
      .waitFor({ state: 'visible' })

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '案件別収支表' }).click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toBe(
      `案件別収支_${FISCAL_YEAR}年度.csv`,
    )
    const path = await download.path()
    const content = readFileSync(path, 'utf-8')
    // 先頭にBOM（U+FEFF）が付与されている（Excelの文字化け防止）
    expect(content.charCodeAt(0)).toBe(0xfeff)
    expect(content).toContain('コード,プロジェクト名')
    expect(content).toContain('P920,CSV出力テスト案件,開発部')
    // 受注金額500・概算予算（10人日÷20×100万円=50万円）が出力される
    expect(content).toContain('500,50')
  })

  test('要員別稼働表にメンバー×プロジェクトの計画行が出力される', async ({
    page,
  }) => {
    await page.goto('/')
    await page.evaluate((d) => {
      localStorage.setItem('resource-manager-data', JSON.stringify(d))
    }, buildSeedData())
    await page.goto('/reports')
    await page
      .getByRole('heading', { name: 'レポート', exact: true })
      .waitFor({ state: 'visible' })

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '要員別稼働表' }).click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toBe(
      `要員別稼働_${FISCAL_YEAR}年度.csv`,
    )
    const content = readFileSync(await download.path(), 'utf-8')
    expect(content).toContain('CSV花子,PG,CSV出力テスト案件,計画')
    expect(content).toContain('0.5')
  })

  test('カスタムマッピングCSV: 列の無効化・ヘッダ改名・プロファイル保存がダウンロード実バイトへ反映される（Phase B）', async ({
    page,
  }) => {
    await page.goto('/')
    await page.evaluate((d) => {
      localStorage.setItem('resource-manager-data', JSON.stringify(d))
    }, buildSeedData())
    await page.goto('/reports')
    await page
      .getByRole('heading', { name: 'レポート', exact: true })
      .waitFor({ state: 'visible' })

    await page.getByRole('button', { name: '案件別収支（カスタム）' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('CSVエクスポート: 案件別収支')).toBeVisible()

    // 進捗率列を無効化・コード列を「伝票番号」へ改名
    await dialog.getByRole('checkbox', { name: '進捗率(%)を出力する' }).click()
    const headerInput = dialog.getByRole('textbox', {
      name: 'コードのヘッダ名',
    })
    await headerInput.fill('伝票番号')

    // プロファイル保存が実localStorageへ永続化される
    await dialog
      .getByRole('textbox', { name: 'プロファイル名' })
      .fill('会計ソフトA向け')
    await dialog.getByRole('button', { name: '保存' }).click()
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem('resource-manager-data')
          return raw ? (JSON.parse(raw).csvMappingProfiles?.length ?? 0) : 0
        }),
      )
      .toBe(1)

    const downloadPromise = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'CSVをダウンロード' }).click()
    const download = await downloadPromise
    const path = await download.path()
    const content = readFileSync(path, 'utf-8')
    // BOM付き・改名ヘッダで始まり・無効化した列は出力されない
    expect(content.charCodeAt(0)).toBe(0xfeff)
    expect(content.slice(1).startsWith('伝票番号,')).toBe(true)
    expect(content).toContain('P920')
    expect(content).not.toContain('進捗率')
  })
})
