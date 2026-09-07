import { expect, type Page, test } from '@playwright/test'

/**
 * 外部実行管理ツールとの完了同期（Phase 1）のE2E。
 *
 * 核心の反証:
 * - 連携用CSVエクスポートの件名に`[コード]`（帰りの突合キー）が埋まる
 * - 完了CSV取込で`completed`/`completedAt`が実localStorageへ永続化され、
 *   外部ID（externalSource/externalTaskId）が学習保存される
 * - スキップ行があっても適用可能な行は適用される（per-row skip）
 * - 完了同期がEV基盤（既存の完了チェック機構）と同じフィールドへ書くだけで、
 *   工数・計画には一切書き込まない
 */

const FIXED_NOW = new Date('2025-10-01T12:00:00')

const ROOT_ID = '00000000-0000-4000-8000-00000000ab01'
const TASK_DESIGN_ID = '00000000-0000-4000-8000-00000000ab02'
const TASK_IMPL_ID = '00000000-0000-4000-8000-00000000ab03'
const NOW = '2025-09-01T00:00:00.000Z'

function buildSeedData() {
  const projectBase = {
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
        ...projectBase,
        id: ROOT_ID,
        code: 'P700',
        name: '完了同期テスト案件',
        parentId: null,
        level: 0,
      },
      {
        ...projectBase,
        id: TASK_DESIGN_ID,
        code: 'P700-01',
        name: '設計タスク',
        parentId: ROOT_ID,
        level: 1,
        completionCriteria: 'レビュー承認',
      },
      {
        ...projectBase,
        id: TASK_IMPL_ID,
        code: 'P700-02',
        name: '実装タスク',
        parentId: ROOT_ID,
        level: 1,
      },
    ],
    members: [],
    assignments: [],
    metadata: {
      lastModified: NOW,
      createdBy: 'system',
      version: '1.0.0',
    },
  }
}

async function seedAndNavigate(page: Page) {
  await page.clock.setFixedTime(FIXED_NOW)
  await page.goto('/')
  await page.evaluate((d) => {
    localStorage.setItem('resource-manager-data', JSON.stringify(d))
  }, buildSeedData())
  await page.goto('/wbs')
  await page
    .getByRole('heading', { name: 'WBS' })
    .waitFor({ state: 'visible', timeout: 10000 })
  // 初期ロード（複数ストアの非同期解決）の静定を待つ（monthly-actualsと同じflake対策）
  await page.waitForTimeout(400)
}

async function selectProject(page: Page) {
  await page.getByRole('combobox').first().click()
  await page
    .locator('[cmdk-list] [role="option"]')
    .filter({ hasText: 'P700' })
    .first()
    .dispatchEvent('click')
  await expect(page.getByRole('combobox').first()).toContainText('P700')
}

async function getStoredProjects(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('resource-manager-data')
    return JSON.parse(raw ?? '{}').projects ?? []
  })
}

/**
 * 「連携」列のセル。右端固定列（pinned: 'right'）に置いているため
 * `.ag-pinned-right-cols-container` で特定する（AG Gridはpinned/bodyで行DOMが重複する）
 */
function linkCell(page: Page, rowId: string) {
  return page.locator(
    `.ag-pinned-right-cols-container .ag-row[row-id="${rowId}"] .ag-cell[col-id="externalTaskId"]`,
  )
}

test.describe('外部完了同期（/wbs、Phase 1）', () => {
  test('連携用CSVエクスポート: 件名に[コード]・グループ列に直近親が埋まりBOM付きで出力される', async ({
    page,
  }) => {
    await seedAndNavigate(page)
    await selectProject(page)

    await page.getByRole('button', { name: '連携CSV出力' }).click()
    await expect(
      page.getByText(
        'リーフタスク2件を、外部ツールのインポート形式で出力します',
        {
          exact: false,
        },
      ),
    ).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'ダウンロード' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('wbs-P700-generic.csv')

    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer)
    }
    const buffer = Buffer.concat(chunks)
    // UTF-8 BOM（Excel/外部ツールの文字化け防止）
    expect(buffer[0]).toBe(0xef)
    expect(buffer[1]).toBe(0xbb)
    expect(buffer[2]).toBe(0xbf)
    const content = buffer.toString('utf-8')
    expect(content).toContain('[P700-01] 設計タスク')
    expect(content).toContain('[P700] 完了同期テスト案件') // グループ列（直近親）
    expect(content).toContain('レビュー承認') // completionCriteria→説明列
    // 反証: 中間ノードでないリーフのみ（ルート自身は子があるため行にならない）
    expect(content).not.toMatch(/^"?\[P700\] 完了同期テスト案件"?,/m)
  })

  test('完了CSV取込: ドライラン→適用でcompleted/completedAt/外部IDが永続化され、スキップ行は適用されない', async ({
    page,
  }) => {
    await seedAndNavigate(page)

    await page.getByRole('button', { name: '完了CSV取込' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Backlog風のエクスポートCSV（ヘッダはgenericプリセットの自動推定が効く名前）。
    // 行構成: 完了へ変わる／未完了のまま（変化なし）／解決不能（スキップ）
    const csv = [
      'キー,件名,状態,完了日',
      'PORTAL-101,"[P700-01] 設計タスク",完了,2025/09/20',
      'PORTAL-102,"[P700-02] 実装タスク",処理中,',
      'PORTAL-999,"存在しないタスク",完了,',
    ].join('\r\n')
    await page.locator('input[type="file"]').setInputFiles({
      name: 'portal-issues.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(`﻿${csv}`, 'utf-8'),
    })
    await expect(dialog.getByText('3行のデータ・4列を検出')).toBeVisible()
    await dialog.getByRole('button', { name: '次へ' }).click()

    // 列マッピングは自動推定済みのまま突合へ
    await dialog.getByRole('button', { name: '突合を確認' }).click()
    await expect(
      dialog.getByText('完了へ変わる 1件／未完了へ戻る 0件／変化なし 1件'),
    ).toBeVisible()
    await expect(
      dialog.getByText(/4行目: タスクを特定できません/),
    ).toBeVisible()

    await dialog.getByRole('button', { name: '適用（1件）' }).click()
    await expect(
      page.getByText('完了状態を1件同期しました', { exact: true }),
    ).toBeVisible()

    // 実localStorageへの永続化（完了・完了日・外部IDの学習）
    await expect
      .poll(async () => {
        const projects = await getStoredProjects(page)
        return projects.find((p: { id: string }) => p.id === TASK_DESIGN_ID)
          ?.completed
      })
      .toBe(true)
    const projects = await getStoredProjects(page)
    const design = projects.find((p: { id: string }) => p.id === TASK_DESIGN_ID)
    expect(design.completedAt).toBe('2025-09-20')
    expect(design.externalSource).toBe('generic')
    expect(design.externalTaskId).toBe('PORTAL-101')
    // 反証: スキップ行・変化なし行は書き込まれない
    const impl = projects.find((p: { id: string }) => p.id === TASK_IMPL_ID)
    expect(impl.completed).toBe(false)

    // 同期ログの永続化と履歴表示
    const logs = await page.evaluate(() => {
      const raw = localStorage.getItem('resource-manager-data')
      return JSON.parse(raw ?? '{}').taskSyncLogs ?? []
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      channel: 'csv',
      fileName: 'portal-issues.csv',
      completedCount: 1,
      reopenedCount: 0,
      unchangedCount: 1,
      skippedCount: 1,
    })
    await expect(page.getByText('完了同期履歴（直近5件）')).toBeVisible()

    // リロード後も完了状態・履歴が残る
    await page.reload()
    await expect(page.getByText('完了同期履歴（直近5件）')).toBeVisible()
    const reloaded = await getStoredProjects(page)
    expect(
      reloaded.find((p: { id: string }) => p.id === TASK_DESIGN_ID)?.completed,
    ).toBe(true)
  })
})

/**
 * 外部タスクへのディープリンク・起票状態の可視化のE2E。
 *
 * 核心の反証: 「リンクを出せないときに、それでも出してしまわない」こと。
 * 誤ったスペース・リポジトリの同名課題へ飛ばす事故は、リンクが無いことより有害なため。
 * localモードは外部ツール接続を持たないため、baseUrlを必要とするツール
 * （backlog/jira）が必ずバッジ止まりになる状況をそのまま検証できる。
 */
const LINK_ROOT_ID = '00000000-0000-4000-8000-00000000ac01'
const LINK_GITHUB_ID = '00000000-0000-4000-8000-00000000ac02'
const LINK_BACKLOG_ID = '00000000-0000-4000-8000-00000000ac03'
const LINK_NONE_ID = '00000000-0000-4000-8000-00000000ac04'
const LINK_BROKEN_ID = '00000000-0000-4000-8000-00000000ac05'

function buildLinkSeedData() {
  const projectBase = {
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
        ...projectBase,
        id: LINK_ROOT_ID,
        code: 'P710',
        name: '外部リンクテスト案件',
        parentId: null,
        level: 0,
      },
      {
        ...projectBase,
        id: LINK_GITHUB_ID,
        code: 'P710-01',
        name: 'GitHub起票済みタスク',
        parentId: LINK_ROOT_ID,
        level: 1,
        externalSource: 'github',
        externalTaskId: 'acme/webapp#42',
      },
      {
        ...projectBase,
        id: LINK_BACKLOG_ID,
        code: 'P710-02',
        name: 'Backlog起票済みタスク',
        parentId: LINK_ROOT_ID,
        level: 1,
        externalSource: 'backlog',
        externalTaskId: 'PROJ-9',
      },
      {
        ...projectBase,
        id: LINK_NONE_ID,
        code: 'P710-03',
        name: '未起票タスク',
        parentId: LINK_ROOT_ID,
        level: 1,
      },
      {
        ...projectBase,
        id: LINK_BROKEN_ID,
        code: 'P710-04',
        name: '外部IDが壊れたタスク',
        parentId: LINK_ROOT_ID,
        level: 1,
        externalSource: 'github',
        // owner/repo#番号 形式ではない（CSV経路が誤学習した場合を想定）
        externalTaskId: '123',
      },
    ],
    members: [],
    assignments: [],
    metadata: {
      lastModified: NOW,
      createdBy: 'system',
      version: '1.0.0',
    },
  }
}

test.describe('外部タスクリンク（/wbs の「連携」列）', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FIXED_NOW)
    await page.goto('/')
    await page.evaluate((d) => {
      localStorage.setItem('resource-manager-data', JSON.stringify(d))
    }, buildLinkSeedData())
    await page.goto('/wbs')
    await page
      .getByRole('heading', { name: 'WBS' })
      .waitFor({ state: 'visible', timeout: 10000 })
    await page.waitForTimeout(400)
    await page.getByRole('combobox').first().click()
    await page
      .locator('[cmdk-list] [role="option"]')
      .filter({ hasText: 'P710' })
      .first()
      .dispatchEvent('click')
    await expect(page.getByRole('combobox').first()).toContainText('P710')
    // プロジェクトを選んだ直後はAG Gridがまだ行を描いていないことがあり、
    // 並列実行の負荷が高いと各testの既定タイムアウト内に間に合わず落ちる（実際にflakeを観測）。
    // 「連携」列は右端固定コンテナに描かれるため、そこに行が出るまで待ってから検証に入る
    await expect(
      page.locator('.ag-pinned-right-cols-container .ag-row').first(),
    ).toBeVisible({ timeout: 15000 })
  })

  test('GitHub起票済みタスクは新しいタブで開くIssueリンクになる', async ({
    page,
  }) => {
    const cell = linkCell(page, LINK_GITHUB_ID)
    const link = cell.getByRole('link')
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute(
      'href',
      'https://github.com/acme/webapp/issues/42',
    )
    await expect(link).toHaveAttribute('target', '_blank')
    // タブナビング対策（新規タブへwindow.openerを渡さない）
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(link).toContainText('acme/webapp#42')
  })

  test('反証: baseUrlが分からないBacklogはリンクにせずバッジのみ（誤ったスペースへ飛ばさない）', async ({
    page,
  }) => {
    const cell = linkCell(page, LINK_BACKLOG_ID)
    // 外部IDは見える（起票済みであることは分かる）
    await expect(cell).toContainText('PROJ-9')
    // だがリンクにはしない
    await expect(cell.getByRole('link')).toHaveCount(0)
  })

  test('反証: 未起票タスクはリンクもバッジも出さない', async ({ page }) => {
    const cell = linkCell(page, LINK_NONE_ID)
    await expect(cell).toContainText('—')
    await expect(cell.getByRole('link')).toHaveCount(0)
  })

  test('反証: 外部IDが owner/repo#番号 形式でなければリンクを作らない', async ({
    page,
  }) => {
    const cell = linkCell(page, LINK_BROKEN_ID)
    await expect(cell).toContainText('123')
    await expect(cell.getByRole('link')).toHaveCount(0)
  })
})
