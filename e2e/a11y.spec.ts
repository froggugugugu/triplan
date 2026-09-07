import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'

/**
 * アクセシビリティの回帰テスト。
 *
 * axe-core で WCAG 2.1 A/AA の自動検出可能な違反を全主要画面・主要ダイアログで
 * チェックし、**0件であること**を固定する。導入時の実測は194件（button-name 25／
 * select-name 4／color-contrast 166）で、内訳は
 * ①アイコンのみのボタン・選択値が空になり得るComboboxにアクセシブルネームが無い
 * ②native selectがラベルと紐づいていない（視覚的に隣接する「部門:」等のテキストは
 *   selectに関連付かない）
 * ③ユーザー指定色のタグに文字色`#fff`を固定していてコントラストが足りない
 * だった。③は`pickReadableTextColor`（背景輝度から白/黒を選ぶ純関数）で解消している。
 *
 * **axeは自動検出できる範囲しか見ない**（キーボード操作の順序・スクリーンリーダーでの
 * 読み上げの自然さ・フォーカス管理の妥当性などは対象外）。0件は「WCAG準拠」ではなく
 * 「機械的に検出できる違反が無い」ことを意味する。
 */

const NOW = '2025-10-01T00:00:00.000Z'
const DIV = '00000000-0000-4000-8000-00000000d001'
const SEC = '00000000-0000-4000-8000-00000000d002'
const PRJ = '00000000-0000-4000-8000-00000000d003'
const TSK = '00000000-0000-4000-8000-00000000d004'
const MEM = '00000000-0000-4000-8000-00000000d005'

/** 空状態だと検査対象が少なく過小評価になるため、各画面に表示物が出る程度のデータを入れる */
function seed() {
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    divisions: [
      { id: DIV, name: '開発部', sortOrder: 0, createdAt: NOW, updatedAt: NOW },
    ],
    sections: [
      {
        id: SEC,
        divisionId: DIV,
        name: '第一課',
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    members: [
      {
        id: MEM,
        name: '山田太郎',
        sectionId: SEC,
        role: 'エンジニア',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 80 }],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    projects: [
      {
        id: PRJ,
        code: 'P001',
        name: 'a11y検証案件',
        description: '',
        background: '',
        purpose: '',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: 'A',
        completed: false,
        divisionId: DIV,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: TSK,
        code: 'P001-01',
        name: '設計タスク',
        description: '',
        background: '',
        purpose: '',
        parentId: PRJ,
        level: 1,
        status: 'active',
        confidence: null,
        completed: false,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    assignments: [
      {
        id: '00000000-0000-4000-8000-00000000d006',
        projectId: PRJ,
        taskId: TSK,
        memberId: MEM,
        monthlyValues: { '2025-10': 0.5 },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    efforts: [
      {
        id: '00000000-0000-4000-8000-00000000d007',
        projectId: TSK,
        columnId: 'effort-1',
        value: 10,
      },
    ],
    metadata: { lastModified: NOW, createdBy: 'system', version: '1.0.0' },
  }
}

async function setup(page: Page, path: string) {
  await page.goto('/')
  await page.evaluate(
    (d) => localStorage.setItem('resource-manager-data', JSON.stringify(d)),
    seed(),
  )
  // 表示年度は実行時の現在日時から算出されるため固定する（シードの月キーと一致させる）
  await page.clock.setFixedTime(new Date('2025-10-01T09:00:00'))
  await page.goto(path)
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await page.waitForTimeout(700)
}

function analyze(page: Page) {
  return new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
  ])
}

/** 失敗時に「どのルールがどの要素で落ちたか」まで出す */
function describeViolations(
  violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations'],
): string {
  return violations
    .map(
      (v) =>
        `[${v.impact}] ${v.id} (${v.nodes.length}件): ${v.help}\n` +
        v.nodes
          .slice(0, 3)
          .map((n) => `    ${n.target.join(' ')} :: ${n.html.slice(0, 120)}`)
          .join('\n'),
    )
    .join('\n')
}

const PAGES: Array<[string, string]> = [
  ['ダッシュボード', '/dashboard'],
  ['チーム', '/team'],
  ['プロジェクト', '/projects'],
  ['WBS', '/wbs'],
  ['スケジュール', '/schedule'],
  ['アサイン', '/assignment'],
  ['予算管理', '/budget'],
  ['月次実績', '/monthly-actuals'],
  ['月次明細', '/statements'],
  ['レポート', '/reports'],
  ['プロジェクトサマリー', '/project-summary'],
  ['ポートフォリオ', '/portfolio'],
  // 見積。1案件フォーカスのため対象案件を指定して開く
  ['見積', `/estimates?projectId=${PRJ}`],
  ['技術タグ', '/admin/tech-tags'],
  ['所属会社', '/admin/companies'],
  // 管理画面。入力欄が集中するため検査対象に入れる
  ['全社設定', '/admin/settings'],
  ['データ管理', '/admin/data'],
]

/** ダイアログはフォーム要素が集中するため、開いた状態でも検査する */
const DIALOGS: Array<[string, string, string]> = [
  ['プロジェクト追加', '/projects', '新規プロジェクト'],
  ['リスク登録簿', '/projects', 'リスク登録簿（識別・評価・対応・監視）'],
  ['見積を記録', `/estimates?projectId=${PRJ}`, '見積を記録'],
  ['担当者追加', '/team', 'メンバー追加'],
  ['所属会社追加', '/admin/companies', '所属会社を追加'],
  ['技術タグ追加', '/admin/tech-tags', '新規タグ'],
]

test.describe.configure({ timeout: 60000 })

test.describe('アクセシビリティ（axe / WCAG 2.1 AA）', () => {
  for (const [label, path] of PAGES) {
    test(`${label}に検出可能な違反が無い`, async ({ page }) => {
      await setup(page, path)
      const { violations } = await analyze(page).analyze()
      expect(violations.length, describeViolations(violations)).toBe(0)
    })
  }

  /**
   * 配色トークンはライト/ダークで別系統のため、片方だけの検査では
   * もう一方のコントラスト不足を見逃す（テーマ解決バグを直してライトが
   * 既定になった際、実際にライト側の違反が4件出た）。
   * 全画面×2テーマは実行時間が倍になるので、色の種類が多い代表画面に絞る。
   */
  const DARK_TARGETS: Array<[string, string]> = [
    ['ダッシュボード', '/dashboard'],
    ['予算管理', '/budget'],
    ['WBS', '/wbs'],
    ['技術タグ', '/admin/tech-tags'],
    ['全社設定', '/admin/settings'],
  ]

  for (const [label, path] of DARK_TARGETS) {
    test(`${label}（ダークモード）に検出可能な違反が無い`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' })
      await setup(page, path)
      const { violations } = await analyze(page).analyze()
      expect(violations.length, describeViolations(violations)).toBe(0)
    })
  }

  for (const [label, path, buttonName] of DIALOGS) {
    test(`${label}ダイアログに検出可能な違反が無い`, async ({ page }) => {
      await setup(page, path)
      await page.getByRole('button', { name: buttonName }).first().click()
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 })
      const { violations } = await analyze(page)
        .include('[role="dialog"]')
        .analyze()
      expect(violations.length, describeViolations(violations)).toBe(0)
    })
  }
})
