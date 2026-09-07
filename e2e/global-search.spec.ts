import { expect, type Page, test } from '@playwright/test'

/**
 * 横断検索のE2E。
 *
 * 標準WBSテンプレートは1案件で50〜100タスクを生成するため、数案件運用すると
 * 目視スクロールでは目的のタスクへ到達できない。到達手段が2つ入ったことを確認する:
 * - Cmd+K の横断検索パレット（画面をまたいで探す）
 * - WBSグリッドのツリー内絞り込み（開いている案件の中で探す）
 */

const NOW = '2025-09-01T00:00:00.000Z'
const ROOT_A = '00000000-0000-4000-8000-00000000ba01'
const PHASE_A = '00000000-0000-4000-8000-00000000ba02'
const TASK_HIT = '00000000-0000-4000-8000-00000000ba03'
const TASK_MISS = '00000000-0000-4000-8000-00000000ba04'
const ROOT_B = '00000000-0000-4000-8000-00000000ba05'
const MEMBER_ACTIVE = '00000000-0000-4000-8000-00000000bb01'
const MEMBER_RETIRED = '00000000-0000-4000-8000-00000000bb02'

function buildSeedData() {
  const base = {
    description: '',
    background: '',
    purpose: '',
    status: 'active' as const,
    confidence: null,
    completed: false,
    createdAt: NOW,
    updatedAt: NOW,
  }
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [
      {
        ...base,
        id: ROOT_A,
        code: 'P900',
        name: '会員基盤リプレース',
        parentId: null,
        level: 0,
      },
      {
        ...base,
        id: PHASE_A,
        code: 'P900-01',
        name: '基本設計',
        parentId: ROOT_A,
        level: 1,
      },
      {
        ...base,
        id: TASK_HIT,
        code: 'P900-01-01',
        name: '帳票レイアウト設計',
        parentId: PHASE_A,
        level: 2,
      },
      {
        ...base,
        id: TASK_MISS,
        code: 'P900-01-02',
        name: 'データベース設計',
        parentId: PHASE_A,
        level: 2,
      },
      {
        ...base,
        id: ROOT_B,
        code: 'P901',
        name: '在庫管理システム',
        parentId: null,
        level: 0,
      },
    ],
    members: [
      {
        id: MEMBER_ACTIVE,
        name: '検索太郎',
        sectionId: null,
        role: 'PM',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: MEMBER_RETIRED,
        name: '検索退職者',
        sectionId: null,
        role: 'PG',
        isActive: false,
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    assignments: [],
    metadata: { lastModified: NOW, createdBy: 'test', version: '1.0.0' },
  }
}

async function seedAndOpen(page: Page, path: string) {
  await page.goto('/')
  await page.evaluate((d) => {
    localStorage.setItem('resource-manager-data', JSON.stringify(d))
  }, buildSeedData())
  await page.goto(path)
  await page.waitForTimeout(500)
  // キーボードショートカットを受け取れるようページ本体へフォーカスを移す
  await page.locator('body').click({ position: { x: 5, y: 5 } })
}

test.describe('横断検索パレット（Cmd+K）', () => {
  test('タスク名で検索して該当案件のWBSへ遷移できる', async ({ page }) => {
    await seedAndOpen(page, '/dashboard')

    await page.keyboard.press('ControlOrMeta+k')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await dialog
      .getByPlaceholder('プロジェクト・タスク・担当者を検索')
      .fill('帳票')
    const hit = dialog.getByRole('option', { name: /帳票レイアウト設計/ })
    await expect(hit).toBeVisible()
    await hit.click()

    // 孫タスクでもルート案件のWBSが開く
    await expect(page).toHaveURL(new RegExp(`/wbs\\?projectId=${ROOT_A}`))
    await expect(page.getByRole('combobox').first()).toContainText('P900')
  })

  test('サイドバーの検索ボタンからも開ける（ショートカットを知らなくても辿り着ける）', async ({
    page,
  }) => {
    await seedAndOpen(page, '/dashboard')

    await page.getByRole('button', { name: '検索' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('反証: 空クエリでは候補を出さない（全件で画面を埋めない）', async ({
    page,
  }) => {
    await seedAndOpen(page, '/dashboard')

    await page.keyboard.press('ControlOrMeta+k')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByText('コード・名前の一部を入力してください'),
    ).toBeVisible()
    await expect(dialog.getByRole('option')).toHaveCount(0)
  })

  test('反証: 退職済みメンバーは検索結果に出ない（在籍者だけが体制の候補）', async ({
    page,
  }) => {
    await seedAndOpen(page, '/dashboard')

    await page.keyboard.press('ControlOrMeta+k')
    const dialog = page.getByRole('dialog')
    await dialog
      .getByPlaceholder('プロジェクト・タスク・担当者を検索')
      .fill('検索')

    // 在籍者は出る
    await expect(dialog.getByRole('option', { name: /検索太郎/ })).toBeVisible()
    // 退職者は出ない
    await expect(
      dialog.getByRole('option', { name: /検索退職者/ }),
    ).toHaveCount(0)
  })
})

test.describe('WBSグリッドのツリー内絞り込み', () => {
  async function openWbs(page: Page) {
    await seedAndOpen(page, '/wbs')
    await page
      .getByRole('heading', { name: 'WBS' })
      .waitFor({ state: 'visible', timeout: 10000 })
    await page.waitForTimeout(400)
    await page.getByRole('combobox').first().click()
    await page
      .locator('[cmdk-list] [role="option"]')
      .filter({ hasText: 'P900' })
      .first()
      .dispatchEvent('click')
    await expect(page.getByRole('combobox').first()).toContainText('P900')
    // 全階層を開いてから絞り込む（絞り込みの効果を行の増減で確認するため）
    await page.getByRole('button', { name: '3' }).first().click()
  }

  function row(page: Page, id: string) {
    return page.locator(
      `.ag-pinned-left-cols-container .ag-row[row-id="${id}"]`,
    )
  }

  test('一致したタスクとその祖先だけが残る（階層を壊さない）', async ({
    page,
  }) => {
    await openWbs(page)
    await expect(row(page, TASK_MISS)).toBeVisible()

    await page.getByLabel('タスク名・コードで絞り込み').fill('帳票')

    // 一致したタスクと、その祖先（工程・案件）は残る＝ツリーとして辿れる
    await expect(row(page, TASK_HIT)).toBeVisible()
    await expect(row(page, PHASE_A)).toBeVisible()
    await expect(row(page, ROOT_A)).toBeVisible()
    // 反証: 一致しない兄弟は消える
    await expect(row(page, TASK_MISS)).toHaveCount(0)
  })

  test('反証: 絞り込みを空にすると元の行が戻る（フィルタが状態を壊さない）', async ({
    page,
  }) => {
    await openWbs(page)
    const filter = page.getByLabel('タスク名・コードで絞り込み')
    await filter.fill('帳票')
    await expect(row(page, TASK_MISS)).toHaveCount(0)

    await filter.fill('')
    await expect(row(page, TASK_MISS)).toBeVisible()
  })

  test('コードでも絞り込める', async ({ page }) => {
    await openWbs(page)
    await page.getByLabel('タスク名・コードで絞り込み').fill('P900-01-02')

    await expect(row(page, TASK_MISS)).toBeVisible()
    await expect(row(page, TASK_HIT)).toHaveCount(0)
  })
})
