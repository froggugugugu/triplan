import { expect, type Page, test } from '@playwright/test'

/**
 * /document-templates画面（DocumentTemplatesPage）のシード・CRUDが
 * 実localStorage（DataAdapter経由）へ正しく永続化されることを検証する。
 *
 * 核心の反証: seedStandardDocumentTemplatesはマウント時のuseEffectから実ユーザー操作を
 * 挟まず即座に発火するシード系アクションのため、React StrictModeの二重発火・リロードで
 * マスタ件数を超えて重複しないこと（tech-tags-storeのseedFromMasterで実際に発生した
 * 398件重複バグと同型の回帰テスト、docs/development-patterns.md §10）。
 * 加えて、標準WBSテンプレートのdocumentTemplateIds（固定UUID参照）が
 * シード後のドキュメントテンプレートidと一致すること（参照切れなし）も実ブラウザで確認する。
 */

const NOW = '2025-10-01T00:00:00.000Z'

// document-template-master.tsのマスタ件数（変更時はこの定数も更新する）
const MASTER_COUNT = 33

function buildSeedData() {
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [],
    members: [],
    wbsTemplates: [],
    documentTemplates: [],
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
  await page.goto('/document-templates')
  await page
    .getByRole('heading', { name: 'ドキュメントテンプレート' })
    .waitFor({ state: 'visible', timeout: 10000 })
}

async function getStoredDocumentTemplates(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('resource-manager-data')
    const data = raw ? JSON.parse(raw) : null
    return data?.documentTemplates ?? []
  })
}

test.describe('ドキュメントテンプレート管理（/document-templates）', () => {
  test('マウント時に標準テンプレートがマスタ件数ちょうどシードされ、リロードしても重複しない（反証）', async ({
    page,
  }) => {
    await seedAndNavigate(page)
    await expect
      .poll(async () => (await getStoredDocumentTemplates(page)).length)
      .toBe(MASTER_COUNT)

    // 反証: リロード（seedStandardDocumentTemplatesの再発火）でも重複シードされない
    await page.reload()
    await page
      .getByRole('heading', { name: 'ドキュメントテンプレート' })
      .waitFor({ state: 'visible' })
    // シードが誤って走った場合に永続化が完了する猶予を与えてから件数を確認する
    await page.waitForTimeout(1000)
    expect(await getStoredDocumentTemplates(page)).toHaveLength(MASTER_COUNT)
  })

  test('本文（マークダウン）の編集がフォーカスアウトで実localStorageへ永続化され、リロード後も残る', async ({
    page,
  }) => {
    await seedAndNavigate(page)
    await expect
      .poll(async () => (await getStoredDocumentTemplates(page)).length)
      .toBe(MASTER_COUNT)

    const contentArea = page.getByLabel('本文（マークダウン・OKF準拠）')
    await expect(contentArea).not.toHaveValue('')
    await contentArea.fill(
      '---\ntype: document\ntitle: 編集済み\n---\n\n## E2Eで編集した本文\n',
    )
    await contentArea.blur()

    await expect
      .poll(async () =>
        (await getStoredDocumentTemplates(page)).some(
          (t: { content: string }) =>
            t.content.includes('## E2Eで編集した本文'),
        ),
      )
      .toBe(true)

    await page.reload()
    await page
      .getByRole('heading', { name: 'ドキュメントテンプレート' })
      .waitFor({ state: 'visible' })
    expect(
      (await getStoredDocumentTemplates(page)).some((t: { content: string }) =>
        t.content.includes('## E2Eで編集した本文'),
      ),
    ).toBe(true)
  })

  test('WBSテンプレート管理画面で標準テンプレートの紐づけが解決される（参照切れなし）', async ({
    page,
  }) => {
    await seedAndNavigate(page)
    await expect
      .poll(async () => (await getStoredDocumentTemplates(page)).length)
      .toBe(MASTER_COUNT)

    // WBSテンプレート管理へ遷移（標準WBSテンプレートもここでシードされる）
    await page.goto('/wbs-templates')
    await page
      .getByRole('heading', { name: 'WBSテンプレート' })
      .waitFor({ state: 'visible' })

    // 標準WBSテンプレートのノードとシード済みドキュメントテンプレートのid整合を
    // 実localStorage上で検証する（表示上のバッジ数ではなくデータで反証）
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem('resource-manager-data')
          const data = raw ? JSON.parse(raw) : null
          const wbsTemplates = data?.wbsTemplates ?? []
          if (wbsTemplates.length === 0) return 'wbs-not-seeded'
          const docIds = new Set(
            (data?.documentTemplates ?? []).map((t: { id: string }) => t.id),
          )
          interface Node {
            documentTemplateIds?: string[]
            children?: Node[]
          }
          const collect = (nodes: Node[]): string[] =>
            nodes.flatMap((n) => [
              ...(n.documentTemplateIds ?? []),
              ...collect(n.children ?? []),
            ])
          const referenced = collect(wbsTemplates[0].nodes as Node[])
          if (referenced.length === 0) return 'no-links'
          return referenced.every((id) => docIds.has(id))
            ? 'all-resolved'
            : 'dangling'
        }),
      )
      .toBe('all-resolved')

    // 「ドキュメント」列の紐づけボタンから選択ダイアログが開ける
    await page
      .locator(
        '.ag-center-cols-container [title="ドキュメントテンプレートを紐づけ"]',
      )
      .first()
      .click()
    await expect(
      page.getByRole('dialog').filter({
        hasText: 'ドキュメントテンプレートの紐づけ',
      }),
    ).toBeVisible()
  })
})
