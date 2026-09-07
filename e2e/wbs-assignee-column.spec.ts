import { expect, type Page, test } from '@playwright/test'

/**
 * /wbs の「担当者」列。
 *
 * タスク自身は担当者フィールドを持たず、表示年度のアサイン配分から
 * 主担当を導出する派生表示のため、実データ（実localStorage）を通した表示が
 * 意図どおりかはこのE2Eでしか確認できない。
 * 併せて、AG Gridの列仮想化に埋もれず初期表示で見えることも担保する
 * （左固定にしている理由。「連携」列で踏んだのと同じ落とし穴）。
 */

const NOW = '2025-10-01T00:00:00.000Z'
const PROJECT_ID = '00000000-0000-4000-8000-0000000000a1'
const TASK_SOLO = '00000000-0000-4000-8000-0000000000a2'
const TASK_SHARED = '00000000-0000-4000-8000-0000000000a3'
const TASK_NONE = '00000000-0000-4000-8000-0000000000a4'
const MEMBER_MAIN = '00000000-0000-4000-8000-0000000000b1'
const MEMBER_SUB = '00000000-0000-4000-8000-0000000000b2'

function project(
  id: string,
  code: string,
  name: string,
  parentId: string | null,
  level: number,
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

function member(id: string, name: string) {
  return {
    id,
    name,
    sectionId: null,
    role: 'エンジニア',
    isActive: true,
    startDate: null,
    endDate: null,
    unitPriceHistory: [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function assignment(
  id: string,
  taskId: string,
  memberId: string,
  value: number,
) {
  return {
    id,
    projectId: PROJECT_ID,
    taskId,
    memberId,
    // 表示年度（2025年度）内の月に配分を置く
    monthlyValues: { '2025-10': value },
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function buildSeedData() {
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [
      project(PROJECT_ID, 'P950', '担当者列テスト案件', null, 0),
      project(TASK_SOLO, 'P950-01', '単独担当タスク', PROJECT_ID, 1),
      project(TASK_SHARED, 'P950-02', '複数担当タスク', PROJECT_ID, 1),
      project(TASK_NONE, 'P950-03', '担当なしタスク', PROJECT_ID, 1),
    ],
    members: [
      member(MEMBER_MAIN, '主担当太郎'),
      member(MEMBER_SUB, '副担当次郎'),
    ],
    assignments: [
      assignment(
        '00000000-0000-4000-8000-0000000000c1',
        TASK_SOLO,
        MEMBER_MAIN,
        0.5,
      ),
      // 複数担当: 配分の多い方が主担当になる
      assignment(
        '00000000-0000-4000-8000-0000000000c2',
        TASK_SHARED,
        MEMBER_SUB,
        0.2,
      ),
      assignment(
        '00000000-0000-4000-8000-0000000000c3',
        TASK_SHARED,
        MEMBER_MAIN,
        0.7,
      ),
    ],
    divisions: [],
    sections: [],
    efforts: [],
    metadata: { lastModified: NOW, createdBy: 'system', version: '1.0.0' },
  }
}

async function seedAndOpen(page: Page) {
  await page.goto('/')
  await page.evaluate((d) => {
    localStorage.setItem('resource-manager-data', JSON.stringify(d))
  }, buildSeedData())
  // 表示年度をシードに合わせる（年度は実行時の現在日時から算出されるため固定する）
  await page.clock.setFixedTime(new Date('2025-10-01T09:00:00'))
  await page.goto('/wbs')
  await page.getByRole('combobox').first().click()
  await page.getByRole('option', { name: /担当者列テスト案件/ }).click()
  await expect(page.getByText('単独担当タスク')).toBeVisible({ timeout: 10000 })
}

/** 担当者列は左固定。pinned-leftコンテナから取る（bodyと行DOMが重複するため） */
function assigneeCell(page: Page, rowId: string) {
  return page.locator(
    `.ag-pinned-left-cols-container .ag-row[row-id="${rowId}"] .ag-cell[col-id="assignee"]`,
  )
}

test.describe('WBS 担当者列', () => {
  test('アサインの配分から主担当が表示され、複数担当は「他N名」が付く', async ({
    page,
  }) => {
    await seedAndOpen(page)

    // 単独担当は氏名のみ
    await expect(assigneeCell(page, TASK_SOLO)).toHaveText('主担当太郎')

    // 反証: 配分が最大のメンバーが主担当になる（副担当次郎ではない）
    await expect(assigneeCell(page, TASK_SHARED)).toHaveText('主担当太郎 他1名')

    // 反証: アサインが無いタスクは氏名を出さない
    await expect(assigneeCell(page, TASK_NONE)).toHaveText('—')
  })

  test('反証: 横スクロールなしで初期表示から担当者列が見える（列仮想化に埋もれない）', async ({
    page,
  }) => {
    await seedAndOpen(page)
    await expect(
      page.locator('.ag-pinned-left-header .ag-header-cell', {
        hasText: '担当者',
      }),
    ).toBeVisible()
    await expect(assigneeCell(page, TASK_SOLO)).toBeInViewport()
  })
})
