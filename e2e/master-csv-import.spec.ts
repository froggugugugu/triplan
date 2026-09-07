import { expect, type Page, test } from '@playwright/test'

/**
 * マスタCSV一括登録。
 *
 * 現行CSVからの移行動線。**選んだCSVが実localStorageのデータになり、
 * リロード後も残る**ところまでを実ブラウザで確認する。
 * テンプレートについてはBOM付きの実バイトを検証する（Excelの文字化け防止は
 * ダウンロードしたファイルでしか確かめられない）。
 */

const STORAGE_KEY = 'resource-manager-data'

async function readDb(page: Page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw
      ? (JSON.parse(raw) as {
          members?: Array<{
            name: string
            email?: string | null
            sectionId: string | null
            companyId?: string | null
            unitPriceHistory: Array<{ effectiveFrom: string; amount: number }>
          }>
          projects?: Array<{
            code: string
            name: string
            parentId: string | null
            level: number
            id: string
          }>
          assignments?: Array<{
            taskId: string
            memberId: string
            monthlyValues: Record<string, number>
          }>
          divisions?: Array<{ id: string; name: string }>
          sections?: Array<{ id: string; divisionId: string; name: string }>
          companies?: Array<{ id: string; name: string }>
        })
      : null
  }, STORAGE_KEY)
}

/** 種別セクション内の操作（見出しのすぐ隣にボタンがある） */
function section(page: Page, title: string) {
  return page.locator('section').filter({ hasText: title }).first()
}

async function selectCsv(page: Page, title: string, content: string) {
  await section(page, title)
    .getByRole('button', { name: 'CSVを取り込む' })
    .click()

  const dialog = page.getByRole('dialog')
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'import.csv',
    mimeType: 'text/csv',
    // 現行のExcel由来CSVを想定してBOM付きで渡す
    buffer: Buffer.from(`﻿${content}`, 'utf-8'),
  })
  await expect(dialog.getByText(/件・.*列を読み込みました/)).toBeVisible()
  return dialog
}

async function importCsv(page: Page, title: string, content: string) {
  const dialog = await selectCsv(page, title, content)
  await dialog.getByRole('button', { name: '内容を確認' }).click()
  return dialog
}

test.describe('マスタCSV一括登録', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/data')
    await expect(
      page.getByRole('heading', { name: 'データ管理', level: 1 }),
    ).toBeVisible()
  })

  test('メンバーCSVを取り込むと、部門・課・所属会社ごと実localStorageへ保存される', async ({
    page,
  }) => {
    const dialog = await importCsv(
      page,
      'チームメンバー',
      [
        '氏名*,メール,部門,課,所属会社,役割,単価',
        '山田太郎,yamada@example.com,開発部,第1課,株式会社ABC,PL,100',
        '佐藤花子,sato@example.com,開発部,第1課,,PG,90',
      ].join('\n'),
    )

    await expect(dialog.getByText('登録 2 件')).toBeVisible()
    await expect(dialog.getByText('部門: 開発部')).toBeVisible()
    await dialog.getByRole('button', { name: /2 件を登録/ }).click()

    await expect
      .poll(async () => (await readDb(page))?.members?.length ?? 0)
      .toBe(2)

    await page.reload()
    const db = await readDb(page)
    const yamada = db?.members?.find((m) => m.name === '山田太郎')
    const division = db?.divisions?.find((d) => d.name === '開発部')
    const sec = db?.sections?.find((s) => s.name === '第1課')
    const company = db?.companies?.find((c) => c.name === '株式会社ABC')

    expect(yamada?.sectionId).toBe(sec?.id)
    expect(yamada?.companyId).toBe(company?.id)
    expect(sec?.divisionId).toBe(division?.id)
    expect(yamada?.unitPriceHistory[0]?.amount).toBe(100)
    // 反証: 同じ部門・課を参照する2行から、マスタは1つずつしか作られない
    expect(db?.divisions).toHaveLength(1)
    expect(db?.sections).toHaveLength(1)
  })

  test('プロジェクトCSVは親コードで階層になる（子が先に書かれていても繋がる）', async ({
    page,
  }) => {
    const dialog = await importCsv(
      page,
      'プロジェクト・タスク',
      [
        'コード*,名前*,親コード',
        'P100-01-01,画面設計,P100-01',
        'P100-01,基本設計,P100',
        'P100,新規案件,',
      ].join('\n'),
    )

    await expect(dialog.getByText('登録 3 件')).toBeVisible()
    await dialog.getByRole('button', { name: /3 件を登録/ }).click()

    await expect
      .poll(async () => (await readDb(page))?.projects?.length ?? 0)
      .toBe(3)

    await page.reload()
    const projects = (await readDb(page))?.projects ?? []
    const root = projects.find((p) => p.code === 'P100')
    const phase = projects.find((p) => p.code === 'P100-01')
    const task = projects.find((p) => p.code === 'P100-01-01')

    expect(root?.level).toBe(0)
    expect(phase?.parentId).toBe(root?.id)
    expect(task?.parentId).toBe(phase?.id)
  })

  test('アサインCSVは月の列から配分を作る', async ({ page }) => {
    await importCsv(
      page,
      'プロジェクト・タスク',
      ['コード*,名前*,親コード', 'P200,案件,', 'P200-01,タスク,P200'].join(
        '\n',
      ),
    )
    await page.getByRole('dialog').getByRole('button', { name: /登録/ }).click()

    await importCsv(page, 'チームメンバー', ['氏名*', '田中一郎'].join('\n'))
    await page.getByRole('dialog').getByRole('button', { name: /登録/ }).click()
    await expect
      .poll(async () => (await readDb(page))?.members?.length ?? 0)
      .toBe(1)

    const dialog = await importCsv(
      page,
      'アサイン',
      [
        'タスクコード*,担当者*,2026-04,2026-05',
        'P200-01,田中一郎,0.5,0.3',
      ].join('\n'),
    )
    await expect(dialog.getByText('登録 1 件')).toBeVisible()
    await dialog.getByRole('button', { name: /1 件を登録/ }).click()

    await expect
      .poll(async () => (await readDb(page))?.assignments?.length ?? 0)
      .toBe(1)

    await page.reload()
    const db = await readDb(page)
    const task = db?.projects?.find((p) => p.code === 'P200-01')
    expect(db?.assignments?.[0]?.taskId).toBe(task?.id)
    expect(db?.assignments?.[0]?.monthlyValues).toEqual({
      '2026-04': 0.5,
      '2026-05': 0.3,
    })
  })

  test('反証: 取り込めない行は理由が出て、取り込める行だけが登録される', async ({
    page,
  }) => {
    const dialog = await importCsv(
      page,
      'チームメンバー',
      [
        '氏名*,メール,稼働率上限',
        '正常太郎,ok@example.com,0.5',
        ',メールだけ@example.com,',
        '不正次郎,bad-email,',
        '超過三郎,over@example.com,1.5',
      ].join('\n'),
    )

    await expect(dialog.getByText('登録 1 件')).toBeVisible()
    await expect(dialog.getByText('取り込まない 3 件')).toBeVisible()
    await expect(dialog.getByText(/3行目.*メールの形式/)).toBeVisible()
    await expect(dialog.getByText(/5行目.*稼働率上限/)).toBeVisible()

    await dialog.getByRole('button', { name: /1 件を登録/ }).click()
    await expect
      .poll(async () => (await readDb(page))?.members?.length ?? 0)
      .toBe(1)
    expect((await readDb(page))?.members?.[0]?.name).toBe('正常太郎')
  })

  test('反証: 確認画面を閉じただけではデータが作られない', async ({ page }) => {
    const dialog = await importCsv(
      page,
      'チームメンバー',
      ['氏名*', '山田太郎'].join('\n'),
    )
    await expect(dialog.getByText('登録 1 件')).toBeVisible()

    await dialog.getByRole('button', { name: '戻る' }).click()
    await dialog.getByRole('button', { name: 'キャンセル' }).click()

    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect((await readDb(page))?.members ?? []).toHaveLength(0)
  })

  test('取り込む前に、解釈前のCSVと登録される内容の両方を確認できる', async ({
    page,
  }) => {
    const dialog = await selectCsv(
      page,
      'チームメンバー',
      [
        '氏名*,部門,課,所属会社,稼働率上限,単価',
        '山田太郎,開発部,第1課,株式会社ABC,0.5,100',
      ].join('\n'),
    )

    // ステップ1: 書いたままのCSV（列がずれていないか・文字化けしていないか）
    await expect(dialog.getByText('氏名*')).toBeVisible()
    await expect(dialog.getByRole('cell', { name: '山田太郎' })).toBeVisible()

    await dialog.getByRole('button', { name: '内容を確認' }).click()

    // ステップ2: 解釈後の「登録される内容」
    await expect(dialog.getByText('登録される内容')).toBeVisible()
    await expect(
      dialog.getByRole('cell', { name: '開発部 / 第1課（新規）' }),
    ).toBeVisible()
    await expect(
      dialog.getByRole('cell', { name: '株式会社ABC（新規）' }),
    ).toBeVisible()
    await expect(
      dialog.getByRole('cell', { name: '100万円（2026-04〜）' }),
    ).toBeVisible()
    // 稼働率上限は入力どおり
    await expect(dialog.getByRole('cell', { name: '0.50' })).toBeVisible()

    // 反証: プレビューを見ただけでは何も登録されない
    expect((await readDb(page))?.members ?? []).toHaveLength(0)
  })

  test('反証: 取り込まない行は「登録される内容」に出ない', async ({ page }) => {
    const dialog = await importCsv(
      page,
      'チームメンバー',
      ['氏名*,メール', '正常太郎,ok@example.com', '不正次郎,bad-email'].join(
        '\n',
      ),
    )

    await expect(dialog.getByRole('cell', { name: '正常太郎' })).toBeVisible()
    await expect(dialog.getByRole('cell', { name: '不正次郎' })).toHaveCount(0)
    // 理由の側には出る
    await expect(dialog.getByText(/3行目.*メールの形式/)).toBeVisible()
  })

  test('テンプレートはBOM付きで、必須列に*が付いている', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      section(page, 'チームメンバー')
        .getByRole('button', { name: 'テンプレート' })
        .click(),
    ])

    expect(download.suggestedFilename()).toBe('import-template_members.csv')
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    const content = Buffer.concat(chunks).toString('utf-8')

    // Excelでそのまま開けるようBOM付き
    expect(content.charCodeAt(0)).toBe(0xfeff)
    expect(content).toContain('氏名*')
    // 任意列に*は付かない
    expect(content).toContain('メール')
    expect(content).not.toContain('メール*')
    // 記入例の行は入れない（消し忘れでサンプルが登録される事故を防ぐ）
    expect(content.trim().split(/\r?\n/)).toHaveLength(1)
  })

  test('アサインのテンプレートには対象年度の月が列として並ぶ', async ({
    page,
  }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      section(page, 'アサイン')
        .getByRole('button', { name: 'テンプレート' })
        .click(),
    ])

    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    const header = Buffer.concat(chunks).toString('utf-8').split(/\r?\n/)[0]

    expect(header).toContain('タスクコード*')
    // 12ヶ月ぶんの列（YYYY-MM）が並ぶ
    const months = (header ?? '').match(/\d{4}-\d{2}/g) ?? []
    expect(months).toHaveLength(12)
  })
})
