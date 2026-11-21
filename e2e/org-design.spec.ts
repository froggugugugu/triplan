import { expect, type Page, test } from '@playwright/test'

/**
 * 組織設計の試算（/org-design）。
 *
 * - 案を現組織から作成 → 担当者を D&D で別の課へ → 課の指標（人数・稼働率）が即時に変わる
 * - 保存 → リロード後も案の配置が残る
 * - 反証: 本番の /team の所属は変わらない（案の操作は本番に書き戻さない）
 * - キーボード（移動先メニュー）でも動かせる（D&D のみにしない）
 */

const NOW = '2026-04-01T00:00:00.000Z'
const DIV = '00000000-0000-4000-8000-0000000000d1'
const SEC1 = '00000000-0000-4000-8000-0000000000e1'
const SEC2 = '00000000-0000-4000-8000-0000000000e2'
const MEM_A = '00000000-0000-4000-8000-0000000000a1'
const MEM_B = '00000000-0000-4000-8000-0000000000b1'
const PROJ = '00000000-0000-4000-8000-0000000000c1'

function member(id: string, name: string, sectionId: string) {
  return {
    id,
    name,
    sectionId,
    role: '開発',
    isActive: true,
    startDate: null,
    endDate: null,
    unitPriceHistory: [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function buildSeedData() {
  return {
    version: '1.0.0',
    fiscalYear: 2026,
    divisions: [
      {
        id: DIV,
        name: '開発本部',
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    sections: [
      {
        id: SEC1,
        divisionId: DIV,
        name: '第1課',
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: SEC2,
        divisionId: DIV,
        name: '第2課',
        sortOrder: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    projects: [
      {
        id: PROJ,
        code: 'P001',
        name: '基幹',
        description: '',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: 'S',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    members: [member(MEM_A, '青木', SEC1), member(MEM_B, '馬場', SEC2)],
    assignments: [
      {
        id: '00000000-0000-4000-8000-000000000301',
        projectId: PROJ,
        taskId: PROJ,
        memberId: MEM_A,
        monthlyValues: { '2026-05': 1 },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    metadata: { lastModified: NOW, createdBy: 'test', version: '1.0.0' },
  }
}

async function seedAndOpen(page: Page) {
  await page.goto('/')
  await page.evaluate((d) => {
    localStorage.setItem('resource-manager-data', JSON.stringify(d))
  }, buildSeedData())
  await page.goto('/org-design')
  await page
    .getByRole('heading', { name: '組織設計の試算' })
    .waitFor({ state: 'visible', timeout: 10000 })
}

async function createDraft(page: Page) {
  await page.getByRole('button', { name: /現組織から案を作成/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('名称').fill('E2E案')
  await dialog.getByRole('button', { name: '更新' }).click()
  await expect(page.getByRole('combobox', { name: '案の選択' })).toContainText(
    'E2E案',
  )
}

/** 課の列（見出し名で特定）。案内のチームIDはクライアント採番のため名前で辿る */
function teamLane(page: Page, name: string) {
  return page
    .locator('section[data-testid^="org-team-"]')
    .filter({ has: page.getByRole('heading', { name, exact: true }) })
}

test.describe('組織設計の試算（/org-design）', () => {
  test('D&Dで課を移すと指標が変わり、保存後リロードしても残る。本番の所属は変わらない', async ({
    page,
  }) => {
    await seedAndOpen(page)
    await createDraft(page)

    const lane1 = teamLane(page, '第1課')
    const lane2 = teamLane(page, '第2課')
    // 青木の5月1.0のみ → 第1課 1/12≈8%、第2課 0%
    await expect(lane1.locator('dl')).toContainText('8%')
    await expect(lane2.locator('dl')).toContainText('0%')

    await page.getByTestId(`org-member-${MEM_A}`).dragTo(lane2.locator('ul'))

    await expect(lane2.getByText('青木')).toBeVisible()
    await expect(lane1.getByText('担当者がいません')).toBeVisible()
    // 第2課: 1/24≈4%（2名分の供給）
    await expect(lane2.locator('dl')).toContainText('2名')
    await expect(lane2.locator('dl')).toContainText('4%')
    await expect(page.getByRole('status')).toHaveText('未保存の変更があります')

    await page.getByRole('button', { name: /案を保存/ }).click()
    await expect(page.getByRole('status')).toHaveCount(0)

    await page.reload()
    await page
      .getByRole('heading', { name: '組織設計の試算' })
      .waitFor({ state: 'visible' })
    await expect(teamLane(page, '第2課').getByText('青木')).toBeVisible()

    // 反証: 本番の所属（members.sectionId）は第1課のまま
    const sectionId = await page.evaluate((id) => {
      const db = JSON.parse(
        localStorage.getItem('resource-manager-data') ?? '{}',
      )
      return db.members.find((m: { id: string }) => m.id === id)?.sectionId
    }, MEM_A)
    expect(sectionId).toBe(SEC1)
  })

  test('キーボードの移動先メニューで未配置へ移せる', async ({ page }) => {
    await seedAndOpen(page)
    await createDraft(page)

    const trigger = page.getByRole('combobox', { name: '馬場の移動先' })
    await trigger.focus()
    await page.keyboard.press('Enter')
    await page.getByRole('option', { name: '未配置' }).press('Enter')

    await expect(page.getByTestId('org-team-unplaced')).toContainText('馬場')
    await expect(page.getByTestId('org-team-unplaced')).toContainText(
      '未配置（1名）',
    )
  })

  test('現組織との比較タブに人数の差分が▲▼で出る', async ({ page }) => {
    await seedAndOpen(page)
    await createDraft(page)
    await page
      .getByTestId(`org-member-${MEM_A}`)
      .dragTo(teamLane(page, '第2課').locator('ul'))

    await page.getByRole('tab', { name: '現組織と比較' }).click()
    const table = page.getByRole('table', { name: '現組織と案の比較' })
    await expect(table.getByTestId(`org-compare-${SEC1}`)).toContainText(
      '1名 → 0名',
    )
    await expect(table.getByTestId(`org-compare-${SEC2}`)).toContainText('▲1')
  })

  test('チーム画面で本人了解済みの希望を登録すると、試算画面の担当者カードに充足が出る', async ({
    page,
  }) => {
    await seedAndOpen(page)
    await createDraft(page)
    // 試算の受け持ちを設定（第1課＝基幹）。希望の判定は受け持ちに対して行う
    await page
      .getByRole('combobox', { name: '第1課の受け持ちプロダクト' })
      .click()
    await page.getByRole('option', { name: '基幹' }).click()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: /案を保存/ }).click()
    await expect(page.getByRole('status')).toHaveCount(0)

    // /team で青木の希望を登録（了解日は必須）
    await page.getByRole('link', { name: 'チーム' }).click()
    const row = page.locator('.group').filter({ hasText: '青木' }).first()
    await row.hover()
    await row.locator('button[title="編集"]').click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('tab', { name: '希望（本人了解済み）' }).click()
    const save = dialog.getByRole('button', { name: '希望を保存' })
    await dialog.getByRole('combobox', { name: 'やりたいプロダクト' }).click()
    await page.getByRole('option', { name: '基幹' }).click()
    await page.keyboard.press('Escape')
    await expect(save).toBeDisabled()
    await dialog.getByLabel('本人の了解を得た日').fill('2025-04-10')
    await save.click()
    await expect(
      dialog.getByRole('button', { name: /了解の取り下げ/ }),
    ).toBeVisible()
    // 希望はパネル内で保存済み。基本情報は変えていないのでキャンセルで閉じる
    await dialog.getByRole('button', { name: 'キャンセル' }).click()
    await expect(dialog).toHaveCount(0)

    await page.getByRole('link', { name: '組織設計の試算' }).click()
    await expect(page.getByTestId(`org-member-preference-${MEM_A}`)).toHaveText(
      /希望満たす 1\/1/,
    )
    await expect(page.getByTestId('org-preference-overall')).toContainText(
      '100%',
    )
  })
})
