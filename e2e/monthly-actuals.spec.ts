import { expect, type Page, test } from '@playwright/test'

/**
 * /monthly-actuals（月次実績メンテナンス画面、P1-a）のE2E。
 *
 * 核心の反証:
 * - 実績セルの明示入力が`AssignmentEntry.actualMonthlyValues`へ永続化され、
 *   未入力の行はキー自体が書き込まれない（キー欠落=計画どおりのセマンティクス。
 *   確定操作でも一括書込みされない）
 * - 「計画どおりに戻す」でキーが削除される
 * - 実績は1.0人月超でもブロックされない（事実の記録）＋担当者行に超過警告
 * - 確定マークが`monthlyActualsConfirmations`へ永続化されリロード後も残る
 */

// 表示年度ズレを避けるため固定時刻で実行（P0-cで確立したパターン）。
// 既定の対象月は「前月」= 2025-09
const FIXED_NOW = new Date('2025-10-01T12:00:00')
const TARGET_MONTH = '2025-09'

const MEMBER_ID = '00000000-0000-4000-8000-00000000aa01'
const ROOT_ID = '00000000-0000-4000-8000-00000000bb01'
const TASK_ID = '00000000-0000-4000-8000-00000000bb02'
const TASK2_ID = '00000000-0000-4000-8000-00000000bb03'
const ASSIGNMENT_ID = '00000000-0000-4000-8000-00000000cc01'
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
        code: 'P800',
        name: '月次実績テスト案件',
        parentId: null,
        level: 0,
      },
      {
        ...projectBase,
        id: TASK_ID,
        code: 'P800-01',
        name: '設計タスク',
        parentId: ROOT_ID,
        level: 1,
      },
      {
        ...projectBase,
        id: TASK2_ID,
        code: 'P800-02',
        name: '実装タスク',
        parentId: ROOT_ID,
        level: 1,
      },
    ],
    members: [
      {
        id: MEMBER_ID,
        name: '実績テスト太郎',
        sectionId: null,
        role: 'エンジニア',
        isActive: true,
        techTagIds: [],
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    assignments: [
      {
        id: ASSIGNMENT_ID,
        projectId: ROOT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { [TARGET_MONTH]: 0.5 },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    // アサイン画面のグリッド表示にはScheduleEntryが必要（月次締めE2Eの🔒ヘッダ確認用）
    scheduleEntries: [
      {
        id: '00000000-0000-4000-8000-00000000dd01',
        projectId: ROOT_ID,
        phaseKey: 'phase-1',
        startDate: '2025-09-01',
        endDate: '2025-10-31',
      },
    ],
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
  await page.goto('/monthly-actuals')
  await page
    .getByRole('heading', { name: '月次実績' })
    .waitFor({ state: 'visible', timeout: 10000 })
  // マウント時に4ストア（assignments/members/projects/actuals）のロードが非同期で
  // 順次解決し、そのたびに行モデルが再生成されてグリッドが再レンダーされる。
  // この静定前に操作を始めるとdetach誤判定系のflakeが並列実行の高負荷時に頻発する
  // ため、初期ロードの解決を待ち切ってから操作を始める
  await page.waitForTimeout(400)
}

async function getStoredAssignments(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('resource-manager-data')
    const data = raw ? JSON.parse(raw) : null
    return data?.assignments ?? []
  })
}

async function getStoredConfirmations(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('resource-manager-data')
    const data = raw ? JSON.parse(raw) : null
    return data?.monthlyActualsConfirmations ?? []
  })
}

/** AG Gridの実績セル（詳細行）。ピン留めなし構成のためcenter-cols指定 */
function actualCell(page: Page, rowId: string) {
  return page.locator(
    `.ag-center-cols-container .ag-row[row-id="${rowId}"] .ag-cell[col-id="actual"]`,
  )
}

test.describe('月次実績メンテナンス画面（/monthly-actuals）', () => {
  test('既定の対象月は前月で、未入力の行は計画値のゴースト表示になる', async ({
    page,
  }) => {
    await seedAndNavigate(page)

    await expect(page.getByLabel('対象月')).toHaveValue(TARGET_MONTH)
    await expect(page.getByText('対象 1行 ／ 計画どおり 1行')).toBeVisible()
    // ゴースト表示（括弧つき計画値）と状態列
    await expect(actualCell(page, ASSIGNMENT_ID)).toHaveText('(0.50)')
    await expect(page.getByText('計画どおり', { exact: true })).toBeVisible()
    await expect(page.getByText('未確定')).toBeVisible()
  })

  test('実績セルの明示入力がactualMonthlyValuesへ永続化され、リロード後も残る', async ({
    page,
  }) => {
    await seedAndNavigate(page)

    const cell = actualCell(page, ASSIGNMENT_ID)
    await cell.dblclick()
    await page.keyboard.type('0.8')
    await page.keyboard.press('Enter')

    await expect(cell).toHaveText('0.80')
    await expect(page.getByText('上書き', { exact: true })).toBeVisible()

    // 実localStorageへの永続化（対象月のキーのみが書き込まれる）
    await expect
      .poll(async () => {
        const stored = await getStoredAssignments(page)
        return stored[0]?.actualMonthlyValues
      })
      .toEqual({ [TARGET_MONTH]: 0.8 })
    // 反証: 計画値は変更されない（計画と実績の分離）
    const stored = await getStoredAssignments(page)
    expect(stored[0].monthlyValues).toEqual({ [TARGET_MONTH]: 0.5 })

    // リロード後も残る
    await page.reload()
    await expect(actualCell(page, ASSIGNMENT_ID)).toHaveText('0.80')
  })

  test('反証: 実績は1.0人月超でもブロックされず、担当者行に超過警告が出る', async ({
    page,
  }) => {
    await seedAndNavigate(page)

    const cell = actualCell(page, ASSIGNMENT_ID)
    await cell.dblclick()
    await page.keyboard.type('1.2')
    await page.keyboard.press('Enter')

    await expect(cell).toHaveText('1.20')
    await expect(page.getByText('⚠ 超過')).toBeVisible()
    await expect
      .poll(async () => {
        const stored = await getStoredAssignments(page)
        return stored[0]?.actualMonthlyValues?.[TARGET_MONTH]
      })
      .toBe(1.2)
  })

  test('「計画どおりに戻す」でキーが削除され、ゴースト表示へ戻る', async ({
    page,
  }) => {
    await seedAndNavigate(page)

    const cell = actualCell(page, ASSIGNMENT_ID)
    await cell.dblclick()
    await page.keyboard.type('0.8')
    await page.keyboard.press('Enter')
    await expect(cell).toHaveText('0.80')

    // 操作と結果確認を丸ごとリトライする: 行の再レンダー直前の旧要素へクリックが
    // 発火して空振りするflake（detach済みノードはReactのrootリスナーへ届かない）と、
    // 通常click()のdetach誤判定リトライ地獄の両方を避ける
    await expect(async () => {
      await page
        .getByTitle('計画どおりに戻す（明示入力をクリア）')
        .dispatchEvent('click')
      await expect(cell).toHaveText('(0.50)', { timeout: 1500 })
    }).toPass({ timeout: 15000 })
    // 反証: キー自体が削除される（0で上書きされるのではない）
    await expect
      .poll(async () => {
        const stored = await getStoredAssignments(page)
        return stored[0]?.actualMonthlyValues
      })
      .toEqual({})
  })

  test('月の確定がmonthlyActualsConfirmationsへ永続化され、リロード後も確定済みバッジが出る。実績キーは書き込まれない', async ({
    page,
  }) => {
    await seedAndNavigate(page)

    await page.getByRole('button', { name: 'この月を確定' }).click()
    await expect(
      page.getByText('2025年9月の実績を確定しますか？'),
    ).toBeVisible()
    await page.getByRole('button', { name: '確定する' }).click()

    await expect(page.getByText(/確定済み/)).toBeVisible()
    await expect
      .poll(async () => (await getStoredConfirmations(page)).length)
      .toBe(1)
    const confirmations = await getStoredConfirmations(page)
    expect(confirmations[0].month).toBe(TARGET_MONTH)

    // 核心の反証: 確定してもactualMonthlyValuesは書き込まれない（マークのみ）
    const stored = await getStoredAssignments(page)
    expect(stored[0].actualMonthlyValues ?? {}).toEqual({})

    await page.reload()
    await expect(page.getByText(/確定済み/)).toBeVisible()
  })

  test('計画外の実績追加で、計画空・実績のみの新規アサインレコードが作られる', async ({
    page,
  }) => {
    await seedAndNavigate(page)

    await page.getByRole('button', { name: '計画外の実績を追加' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // メンバー→プロジェクト→タスクの順に選択。検索入力で1件に絞り、Enterキーで確定する
    // （itemのclickは選択成功と同時にPopoverがunmountされ、Playwrightがdetachと
    // 誤判定してリトライ地獄になるflakeがあるため、クリックを使わない）
    // cmdkのitemは選択成功と同時にPopoverごとunmountされるため、通常のclick()は
    // actionabilityチェックが「detachされた」とみなして永遠にリトライする。
    // dispatchEvent('click')は解決した瞬間にイベントを発火し安定性チェックを行わない
    // ため、このunmount競合の影響を受けない。選択の成否はトリガー表示で別途検証する
    // 直前のPopoverのフォーカス戻し処理と競合して開き損ねることがあるため、
    // オプションが見えなければEscapeで仕切り直して開き直す
    const pickOption = async (triggerIndex: number, text: string) => {
      const trigger = dialog
        .locator('button[role="combobox"]')
        .nth(triggerIndex)
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          // 直前の選択でトリガーbutton自体が再マウント（placeholder変化）されるため、
          // トリガーclickもdetach誤判定でハングしうる。短いタイムアウトでやり直す
          await trigger.click({ timeout: 3000 })
        } catch {
          continue
        }
        const option = page
          .locator('[cmdk-list] [role="option"]')
          .filter({ hasText: text })
          .first()
        try {
          await expect(option).toBeVisible({ timeout: 2000 })
          // 可視確認とdispatchの間にPopoverが閉じて再解決できないケースもあるため、
          // dispatch自体も短いタイムアウトで失敗させてリトライへ回す
          await option.dispatchEvent('click', undefined, { timeout: 2000 })
        } catch {
          await page.keyboard.press('Escape')
          continue
        }
        await expect(page.locator('[cmdk-input]')).toBeHidden()
        await expect(trigger).toContainText(text)
        return
      }
      throw new Error(`Comboboxの選択に失敗しました: ${text}`)
    }
    await pickOption(0, '実績テスト太郎')
    await pickOption(1, '月次実績テスト案件')
    await pickOption(2, '実装タスク')
    await dialog.getByPlaceholder('0.50').fill('0.3')
    await dialog.getByRole('button', { name: '追加' }).click()

    // exact指定: トーストはaria-liveの通知要素（"Notification 〜"）にも同文言が
    // 複製されるため、完全一致でトースト本体のみに絞る
    await expect(
      page.getByText('計画外の実績を追加しました', { exact: true }),
    ).toBeVisible()
    await expect(page.getByText('実装タスク')).toBeVisible()

    await expect
      .poll(async () => (await getStoredAssignments(page)).length)
      .toBe(2)
    const stored = await getStoredAssignments(page)
    const added = stored.find((a: { taskId: string }) => a.taskId === TASK2_ID)
    expect(added.monthlyValues).toEqual({})
    expect(added.actualMonthlyValues).toEqual({ [TARGET_MONTH]: 0.3 })
  })

  test('CSV取込ウィザード: ドライラン→適用でスキップ行を除く実績が永続化され、取込ログが残る', async ({
    page,
  }) => {
    await seedAndNavigate(page)

    await page.getByRole('button', { name: 'CSV取込' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // ヘッダは自動推定が効く名前にする（Step2のSelect操作を不要にしflakeを避ける）。
    // 行構成: 既存アサインへの上書き0.8／未知メンバー（スキップ）／計画外の新規0.2
    const csv = [
      '担当者,プロジェクト,タスク,年月,工数',
      '実績テスト太郎,P800,設計タスク,2025-09,0.8',
      '存在しない人,P800,設計タスク,2025-09,0.5',
      '実績テスト太郎,P800,実装タスク,2025-09,0.2',
    ].join('\r\n')
    await page.locator('input[type="file"]').setInputFiles({
      name: 'timesheet-2025-09.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(`\ufeff${csv}`, 'utf-8'), // BOM付き（Excel出力想定）
    })

    // Step1: 行数・列数の検出プレビュー
    await expect(dialog.getByText('3行のデータ・5列を検出')).toBeVisible()
    await dialog.getByRole('button', { name: '次へ' }).click()

    // Step2: 自動推定済み（単位は既定の人月のまま）
    await dialog.getByRole('button', { name: '突合を確認' }).click()

    // Step3: ドライラン（適用前の突合結果）
    await expect(
      dialog.getByText(
        '適用予定 2件（既存アサインへの上書き 1件／計画外の新規 1件）',
      ),
    ).toBeVisible()
    await expect(
      dialog.getByText(/3行目: メンバーが見つかりません/),
    ).toBeVisible()

    await dialog.getByRole('button', { name: '適用（2件）' }).click()
    await expect(
      page.getByText('2件の実績を取り込みました', { exact: true }),
    ).toBeVisible()

    // 実績の永続化（上書き0.8＋計画外0.2。計画は不変）
    await expect
      .poll(async () => (await getStoredAssignments(page)).length)
      .toBe(2)
    const stored = await getStoredAssignments(page)
    const overridden = stored.find(
      (a: { id: string }) => a.id === ASSIGNMENT_ID,
    )
    expect(overridden.actualMonthlyValues).toEqual({ [TARGET_MONTH]: 0.8 })
    expect(overridden.monthlyValues).toEqual({ [TARGET_MONTH]: 0.5 })
    const unplanned = stored.find(
      (a: { taskId: string }) => a.taskId === TASK2_ID,
    )
    expect(unplanned.monthlyValues).toEqual({})
    expect(unplanned.actualMonthlyValues).toEqual({ [TARGET_MONTH]: 0.2 })

    // 取込ログの永続化（適用2件・スキップ1件・理由の行番号）
    await expect
      .poll(async () => {
        const logs = await page.evaluate(() => {
          const raw = localStorage.getItem('resource-manager-data')
          const data = raw ? JSON.parse(raw) : null
          return data?.actualsImportLogs ?? []
        })
        return logs.length
      })
      .toBe(1)
    const logs = await page.evaluate(() => {
      const raw = localStorage.getItem('resource-manager-data')
      return JSON.parse(raw ?? '{}').actualsImportLogs ?? []
    })
    expect(logs[0]).toMatchObject({
      fileName: 'timesheet-2025-09.csv',
      targetMonths: [TARGET_MONTH],
      appliedCount: 2,
      skippedCount: 1,
    })
    expect(logs[0].skippedReasons[0].row).toBe(3)

    // 画面反映: グリッドの上書き表示＋取込履歴の一覧
    await expect(actualCell(page, ASSIGNMENT_ID)).toHaveText('0.80')
    await expect(page.getByText('CSV取込履歴（直近5件）')).toBeVisible()
    await expect(
      page.getByText(
        /timesheet-2025-09\.csv — 対象月 2025-09 ／ 適用 2件 ／ スキップ 1件/,
      ),
    ).toBeVisible()

    // リロード後も履歴・実績が残る
    await page.reload()
    await expect(actualCell(page, ASSIGNMENT_ID)).toHaveText('0.80')
    await expect(page.getByText('CSV取込履歴（直近5件）')).toBeVisible()
  })

  test('月次締め: 締めで編集不可＋実データ不変、解除は理由必須、解除後は編集可・履歴が残る（P1-b）', async ({
    page,
  }) => {
    await seedAndNavigate(page)

    // 締め前は編集できる
    const cell = actualCell(page, ASSIGNMENT_ID)
    await cell.dblclick()
    await page.keyboard.type('0.8')
    await page.keyboard.press('Enter')
    await expect(cell).toHaveText('0.80')

    // 締める（localモードは権限ボタン常時表示。理由は任意なので空のまま）
    await page.getByRole('button', { name: 'この月を締める' }).click()
    await expect(page.getByText('2025年9月を締めますか？')).toBeVisible()
    await page.getByRole('button', { name: '締める', exact: true }).click()

    await expect(page.getByText(/締め済み/).first()).toBeVisible()
    await expect(
      page.getByText('この月は締め済みです', { exact: false }),
    ).toBeVisible()
    // 締めイベントの永続化
    await expect
      .poll(async () => {
        const events = await page.evaluate(() => {
          const raw = localStorage.getItem('resource-manager-data')
          return JSON.parse(raw ?? '{}').monthlyCloseEvents ?? []
        })
        return events.length
      })
      .toBe(1)

    // 反証: 締め済み月はセルが編集モードに入らず、実データも不変
    await cell.dblclick()
    await expect(page.locator('.ag-cell-inline-editing')).toHaveCount(0)
    const storedClosed = await getStoredAssignments(page)
    expect(storedClosed[0].actualMonthlyValues).toEqual({
      [TARGET_MONTH]: 0.8,
    })
    // 確定・計画外追加・Undoも操作不可
    await expect(
      page.getByRole('button', { name: 'この月を確定' }),
    ).toBeDisabled()
    await expect(
      page.getByRole('button', { name: '計画外の実績を追加' }),
    ).toBeDisabled()
    await expect(
      page.getByTitle('計画どおりに戻す（明示入力をクリア）'),
    ).toHaveCount(0)

    // アサイン画面でも締め月ヘッダに🔒が表示される（グリッド表示にはプロジェクト選択が必要）
    await page.getByRole('link', { name: 'アサイン' }).click()
    await page.locator('button[role="combobox"]').first().click()
    await page
      .locator('[cmdk-list] [role="option"]')
      .filter({ hasText: 'P800' })
      .first()
      .dispatchEvent('click')
    await expect(page.getByText('25/9月 🔒')).toBeVisible()
    await page.getByRole('link', { name: '月次実績' }).click()
    await expect(page.getByText(/締め済み/).first()).toBeVisible()

    // 反証: 解除は理由必須（空白のみでは解除ボタンが無効）
    await page.getByRole('button', { name: '締めを解除' }).click()
    await expect(
      page.getByText('2025年9月の締めを解除しますか？'),
    ).toBeVisible()
    const reopenButton = page.getByRole('button', { name: '解除する' })
    await expect(reopenButton).toBeDisabled()
    await page
      .getByPlaceholder('例: 検収差戻しに伴う再集計のため')
      .fill('検収差戻しのため再集計')
    await expect(reopenButton).toBeEnabled()
    await reopenButton.click()

    // 解除後は再び編集できる（永続ロックではない）
    await expect(page.getByText('未確定')).toBeVisible()
    await cell.dblclick()
    await page.keyboard.type('0.9')
    await page.keyboard.press('Enter')
    await expect(cell).toHaveText('0.90')

    // 履歴（締め＋解除の2イベント）が残り、リロード後も消えない（追記専用）
    await expect(page.getByText('締め・解除の履歴（直近5件）')).toBeVisible()
    await expect(page.getByText(/2025年9月を締め/)).toBeVisible()
    await expect(
      page.getByText(/2025年9月を解除 — 理由: 検収差戻しのため再集計/),
    ).toBeVisible()
    await page.reload()
    await expect(page.getByText('締め・解除の履歴（直近5件）')).toBeVisible()
    const events = await page.evaluate(() => {
      const raw = localStorage.getItem('resource-manager-data')
      return JSON.parse(raw ?? '{}').monthlyCloseEvents ?? []
    })
    expect(events).toHaveLength(2)
  })

  test('対象月を切り替えるとアサインの無い月は空状態になる', async ({
    page,
  }) => {
    await seedAndNavigate(page)

    await page.getByTitle('翌月').click()
    await expect(page.getByLabel('対象月')).toHaveValue('2025-10')
    await expect(
      page.getByText('この月のアサインがありません', { exact: false }),
    ).toBeVisible()
  })
})
