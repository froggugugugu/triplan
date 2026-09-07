import { expect, type Page, test } from '@playwright/test'

// ─── Seed Data Constants ───────────────────────────────────────────────────────

const NOW = '2025-10-01T00:00:00.000Z'

const DIV_DEV_ID = '00000000-0000-4000-8000-00000000dd01'
const SECTION_DEV_ID = '00000000-0000-4000-8000-00000000ec01'
const MEMBER_TANAKA_ID = '00000000-0000-4000-8000-00000000be01'
const CATEGORY_ID = '00000000-0000-4000-8000-00000000ca01'
const TAG_REACT_ID = '00000000-0000-4000-8000-00000000fa01'
const TAG_TS_ID = '00000000-0000-4000-8000-00000000fa02'

// ─── Seed Data Helpers ─────────────────────────────────────────────────────────

function makeDivision(id: string, name: string, sortOrder: number) {
  return { id, name, sortOrder, createdAt: NOW, updatedAt: NOW }
}

function makeSection(id: string, divisionId: string, name: string) {
  return {
    id,
    divisionId,
    name,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function makeMember(
  id: string,
  sectionId: string,
  name: string,
  techTagIds: string[] = [],
) {
  return {
    id,
    name,
    sectionId,
    companyId: null,
    role: 'エンジニア',
    isActive: true,
    techTagIds,
    startDate: '2025-04-01',
    endDate: null,
    unitPriceHistory: [],
    contractUnitPriceHistory: [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function makeTechTagCategory(id: string, name: string, sortOrder: number) {
  return { id, name, sortOrder, createdAt: NOW, updatedAt: NOW }
}

function makeTechTag(id: string, name: string, categoryId: string) {
  return {
    id,
    name,
    color: '#3b82f6',
    categoryId,
    subCategoryId: null,
    note: null,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

interface SeedOptions {
  divisions?: ReturnType<typeof makeDivision>[]
  sections?: ReturnType<typeof makeSection>[]
  members?: ReturnType<typeof makeMember>[]
  techTagCategories?: ReturnType<typeof makeTechTagCategory>[]
  techTags?: ReturnType<typeof makeTechTag>[]
  // biome-ignore lint/suspicious/noExplicitAny: E2Eシード用の簡易型
  skillEvaluations?: any[]
  // biome-ignore lint/suspicious/noExplicitAny: E2Eシード用の簡易型
  skillRoadmapGoals?: any[]
}

function buildSeedData(options?: SeedOptions) {
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [],
    members: options?.members ?? [],
    divisions: options?.divisions ?? [],
    sections: options?.sections ?? [],
    assignments: [],
    techTags: options?.techTags ?? [],
    techTagCategories: options?.techTagCategories ?? [],
    techTagSubCategories: [],
    skillEvaluations: options?.skillEvaluations ?? [],
    skillRoadmapGoals: options?.skillRoadmapGoals ?? [],
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

/** Click a hover-revealed button on a row by its title attribute（team.spec.tsと同じパターン） */
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

async function openMemberEditDialog(page: Page, memberName: string) {
  await clickHoverButton(page, memberName, '編集')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('担当者を編集')).toBeVisible()
  return dialog
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

test.describe('スキル・成長記録', () => {
  test('自己評価・上長評価を記録するとレベルバッジが更新され、レベルアップ時にトースト表示される', async ({
    page,
  }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      sections: [makeSection(SECTION_DEV_ID, DIV_DEV_ID, '第1課')],
      members: [
        makeMember(MEMBER_TANAKA_ID, SECTION_DEV_ID, '田中太郎', [
          TAG_REACT_ID,
        ]),
      ],
      techTagCategories: [
        makeTechTagCategory(CATEGORY_ID, 'フロントエンド', 0),
      ],
      techTags: [makeTechTag(TAG_REACT_ID, 'React', CATEGORY_ID)],
    })
    await seedAndNavigate(page, data)

    const dialog = await openMemberEditDialog(page, '田中太郎')
    await dialog.getByRole('tab', { name: /スキル・成長記録/ }).click()

    // 自己評価を記録
    await dialog.locator('#skill-eval-tag').selectOption({ label: 'React' })
    await dialog
      .locator('#skill-eval-evaluator')
      .selectOption({ label: '本人として記録' })
    await dialog.locator('#skill-eval-level').selectOption({ label: '初級' })
    await dialog.getByRole('button', { name: '評価を記録' }).click()

    // レベルアップ通知（未経験→初級）
    await expect(
      page.getByText(/Reactのレベルが初級に上がりました/).first(),
    ).toBeVisible()

    // 一覧に自己評価バッジが反映される
    const row = dialog.locator('tr', { hasText: 'React' })
    await expect(row.getByText('初級')).toBeVisible()

    // 上長評価を記録
    await dialog.locator('#skill-eval-tag').selectOption({ label: 'React' })
    await dialog
      .locator('#skill-eval-evaluator')
      .selectOption({ label: '上長として記録' })
    await dialog.locator('#skill-eval-level').selectOption({ label: '上級' })
    await dialog.getByRole('button', { name: '評価を記録' }).click()
    await expect(
      page.getByText(/Reactのレベルが上級に上がりました/).first(),
    ).toBeVisible()

    // 成長タイムラインに両方の記録が反映される（テーブルヘッダーの「本人評価」列見出しと
    // 区別するため、タイムライン特有の文言「React ・ ○○評価」を含むテキストで照合する）
    await expect(dialog.getByText(/React\s*・\s*本人評価/)).toBeVisible()
    await expect(dialog.getByText(/React\s*・\s*上長評価/)).toBeVisible()

    // skill-storeのDataAdapter配線（17ストアのDataAdapter配線）が
    // 実localStorageへ正しく永続化していることを確認する（楽観的更新のUI状態だけでなく実データ）
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem('resource-manager-data')
          const parsed = raw ? JSON.parse(raw) : null
          return parsed?.skillEvaluations?.length ?? 0
        }),
      )
      .toBe(2)
  })

  test('成長ロードマップの目標を設定すると進捗バーが表示され、目標変更後も過去の目標がアーカイブとして残る', async ({
    page,
  }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      sections: [makeSection(SECTION_DEV_ID, DIV_DEV_ID, '第1課')],
      members: [
        makeMember(MEMBER_TANAKA_ID, SECTION_DEV_ID, '田中太郎', [
          TAG_REACT_ID,
        ]),
      ],
      techTagCategories: [
        makeTechTagCategory(CATEGORY_ID, 'フロントエンド', 0),
      ],
      techTags: [makeTechTag(TAG_REACT_ID, 'React', CATEGORY_ID)],
      skillEvaluations: [
        {
          id: crypto.randomUUID(),
          memberId: MEMBER_TANAKA_ID,
          techTagId: TAG_REACT_ID,
          evaluatorType: 'manager',
          beforeLevel: 'none',
          afterLevel: 'intermediate',
          evaluatedAt: '2025-06-01',
          createdAt: '2025-06-01T00:00:00.000Z',
        },
      ],
    })
    await seedAndNavigate(page, data)

    const dialog = await openMemberEditDialog(page, '田中太郎')
    await dialog.getByRole('tab', { name: /スキル・成長記録/ }).click()

    // 目標: 上級（intermediate=2 / advanced=3 = 67%）
    await dialog.locator('#skill-goal-tag').selectOption({ label: 'React' })
    await dialog.locator('#skill-goal-level').selectOption({ label: '上級' })
    await dialog.getByRole('button', { name: '目標を更新' }).click()
    await expect(dialog.getByText(/進捗\s*67%/)).toBeVisible()

    // 目標を変更（エキスパートへ）
    await dialog.locator('#skill-goal-tag').selectOption({ label: 'React' })
    await dialog
      .locator('#skill-goal-level')
      .selectOption({ label: 'エキスパート' })
    await dialog.getByRole('button', { name: '目標を更新' }).click()

    // 過去の目標（上級）がアーカイブとして参照できる
    await dialog.getByRole('button', { name: /過去の目標を見る/ }).click()
    await expect(dialog.getByText(/React: 上級/)).toBeVisible()

    // skill-storeのDataAdapter配線が実localStorageへ両方の目標を永続化していることを確認する
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem('resource-manager-data')
          const parsed = raw ? JSON.parse(raw) : null
          return parsed?.skillRoadmapGoals?.length ?? 0
        }),
      )
      .toBe(2)
  })

  test('ダッシュボードにレベル別スキル分布と四半期レビュー未実施件数が表示される', async ({
    page,
  }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      sections: [makeSection(SECTION_DEV_ID, DIV_DEV_ID, '第1課')],
      members: [
        makeMember(MEMBER_TANAKA_ID, SECTION_DEV_ID, '田中太郎', [
          TAG_REACT_ID,
          TAG_TS_ID,
        ]),
      ],
      techTagCategories: [
        makeTechTagCategory(CATEGORY_ID, 'フロントエンド', 0),
      ],
      techTags: [
        makeTechTag(TAG_REACT_ID, 'React', CATEGORY_ID),
        makeTechTag(TAG_TS_ID, 'TypeScript', CATEGORY_ID),
      ],
      skillEvaluations: [
        {
          id: crypto.randomUUID(),
          memberId: MEMBER_TANAKA_ID,
          techTagId: TAG_REACT_ID,
          evaluatorType: 'manager',
          beforeLevel: 'none',
          afterLevel: 'advanced',
          evaluatedAt: '2025-09-01',
          createdAt: '2025-09-01T00:00:00.000Z',
        },
      ],
    })
    await seedAndNavigate(page, data)

    await page.goto('/dashboard')
    await expect(page.getByText('スキルマップ概況')).toBeVisible()
    // React(評価あり)・TypeScript(未評価)の2タグ保有 → 四半期レビュー未実施が1件以上
    await expect(
      page.getByText(/四半期レビュー未実施: [1-9]\d*件/),
    ).toBeVisible()
  })

  test('ダークモードでもスキルパネル・レベルバッジの視認性が保たれる', async ({
    page,
  }) => {
    const data = buildSeedData({
      divisions: [makeDivision(DIV_DEV_ID, '開発部', 0)],
      sections: [makeSection(SECTION_DEV_ID, DIV_DEV_ID, '第1課')],
      members: [
        makeMember(MEMBER_TANAKA_ID, SECTION_DEV_ID, '田中太郎', [
          TAG_REACT_ID,
        ]),
      ],
      techTagCategories: [
        makeTechTagCategory(CATEGORY_ID, 'フロントエンド', 0),
      ],
      techTags: [makeTechTag(TAG_REACT_ID, 'React', CATEGORY_ID)],
      skillEvaluations: [
        {
          id: crypto.randomUUID(),
          memberId: MEMBER_TANAKA_ID,
          techTagId: TAG_REACT_ID,
          evaluatorType: 'self',
          beforeLevel: 'none',
          afterLevel: 'intermediate',
          evaluatedAt: '2025-09-01',
          createdAt: '2025-09-01T00:00:00.000Z',
        },
      ],
    })
    await seedAndNavigate(page, data)

    // システム設定からダークモードに切り替え
    await page.getByRole('button', { name: 'ダーク' }).click()
    const rootIsDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    )
    expect(rootIsDark).toBe(true)

    const dialog = await openMemberEditDialog(page, '田中太郎')
    await dialog.getByRole('tab', { name: /スキル・成長記録/ }).click()
    const badge = dialog.locator('tr', { hasText: 'React' }).getByText('中級')
    await expect(badge).toBeVisible()
    const bg = await badge.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    )
    expect(bg).not.toBe('rgba(0, 0, 0, 0)')
    expect(bg).not.toBe('transparent')
  })
})
