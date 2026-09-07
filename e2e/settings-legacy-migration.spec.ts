import { expect, type Page, test } from '@playwright/test'

/**
 * schedule-settings-store/wbs-settings-store（17ストアのDataAdapter配線・第11弾）が
 * 旧Zustand persistの独立localStorageキー（schedule-settings-storage/wbs-settings-storage）
 * からDataAdapter永続化（resource-manager-data.scheduleSettingsEntries/wbsColumnSettingsEntries）
 * へ、既存ユーザーのデータを失わず1回限り移行することを実ブラウザ・実localStorageで検証する。
 * ユニットテストはモック化したDataAdapterに対して行っているため、実際のlocalStorage往復は
 * このE2Eが唯一の経路になる（schedule-entries.spec.ts等と同じ位置づけ）。
 */

const NOW = '2026-08-14T00:00:00.000Z'
// idはZodのuuidバリデーション対象（DatabaseSchema.parse()）のため0-9a-fのみで構成する。
// 16進数以外の文字（例: 旧"se01"のs）を含めるとparse失敗でjsonStorage.load()が空DBへ
// 静かにフォールバックし、シードが一切反映されない（既知の落とし穴、development-patterns.md参照）
const PROJECT_ID = '00000000-0000-4000-8000-0000000005e1'

function buildSeedData() {
  return {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [
      {
        id: PROJECT_ID,
        code: 'P910',
        name: '設定移行テスト案件',
        level: 0,
        parentId: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    members: [],
    metadata: {
      lastModified: NOW,
      createdBy: 'e2e-test',
      version: '1.0.0',
    },
  }
}

function buildLegacyScheduleSettings() {
  return {
    state: {
      settingsMap: {
        [PROJECT_ID]: {
          phases: [
            {
              phaseKey: 'phase-1',
              name: 'レガシー要件定義',
              color: '#3b82f6',
              enabled: true,
              sortOrder: 0,
            },
            {
              phaseKey: 'phase-2',
              name: 'レガシー設計',
              color: '#22c55e',
              enabled: true,
              sortOrder: 1,
            },
          ],
          lastModified: '2025-01-01T00:00:00.000Z',
        },
      },
    },
    version: 0,
  }
}

function buildLegacyWbsSettings() {
  return {
    state: {
      settingsMap: {
        [PROJECT_ID]: {
          effortColumns: [
            {
              id: 'effort-1',
              displayName: 'レガシー要件工数',
              enabled: true,
              order: 0,
            },
          ],
          lastModified: '2025-01-01T00:00:00.000Z',
        },
      },
    },
    version: 0,
  }
}

async function getResourceManagerData(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('resource-manager-data')
    return raw ? JSON.parse(raw) : null
  })
}

// PhaseSettingsPage/WbsSettingsPageの表・行はphaseKey/columnId（phase-1/effort-1等）を
// セル表示するため、行を特定してからその行内のInputを取得する
// （page.getByDisplayValueはPlaywrightに存在しないTesting Library専用APIのため使えない）
function phaseNameInput(page: Page, phaseKey: string) {
  return page
    .locator('tbody tr', { hasText: phaseKey })
    .locator('input')
    .first()
}

function columnNameInput(page: Page, columnId: string) {
  return page
    .locator('tbody tr', { hasText: columnId })
    .locator('input')
    .first()
}

test.describe('工程設定・WBS列設定のレガシーpersistキーからの移行', () => {
  test('工程設定: レガシーキーのみ存在する状態で開くと内容が移行され、resource-manager-dataへ永続化される', async ({
    page,
  }) => {
    await page.goto('/')
    await page.evaluate(
      ({ data, legacy }) => {
        localStorage.setItem('resource-manager-data', JSON.stringify(data))
        localStorage.setItem(
          'schedule-settings-storage',
          JSON.stringify(legacy),
        )
      },
      { data: buildSeedData(), legacy: buildLegacyScheduleSettings() },
    )

    await page.goto(`/schedule-settings/${PROJECT_ID}`)
    await expect(phaseNameInput(page, 'phase-1')).toHaveValue(
      'レガシー要件定義',
    )
    await expect(phaseNameInput(page, 'phase-2')).toHaveValue('レガシー設計')

    // DataAdapter経由でresource-manager-dataへ非同期に永続化されるまで待つ
    await expect
      .poll(async () => {
        const d = await getResourceManagerData(page)
        return d?.scheduleSettingsEntries?.length ?? 0
      })
      .toBe(1)

    const migrated = await getResourceManagerData(page)
    expect(migrated.scheduleSettingsEntries[0].projectId).toBe(PROJECT_ID)
    expect(migrated.scheduleSettingsEntries[0].phases).toHaveLength(2)

    // リロード後もDataAdapter側のデータがそのまま表示され、重複移行も起きない
    await page.reload()
    await expect(phaseNameInput(page, 'phase-1')).toHaveValue(
      'レガシー要件定義',
    )
    const afterReload = await getResourceManagerData(page)
    expect(afterReload.scheduleSettingsEntries).toHaveLength(1)
  })

  test('WBS列設定: レガシーキーのみ存在する状態で開くと内容が移行され、resource-manager-dataへ永続化される', async ({
    page,
  }) => {
    await page.goto('/')
    await page.evaluate(
      ({ data, legacy }) => {
        localStorage.setItem('resource-manager-data', JSON.stringify(data))
        localStorage.setItem('wbs-settings-storage', JSON.stringify(legacy))
      },
      { data: buildSeedData(), legacy: buildLegacyWbsSettings() },
    )

    await page.goto(`/wbs-settings/${PROJECT_ID}`)
    await expect(columnNameInput(page, 'effort-1')).toHaveValue(
      'レガシー要件工数',
    )

    await expect
      .poll(async () => {
        const d = await getResourceManagerData(page)
        return d?.wbsColumnSettingsEntries?.length ?? 0
      })
      .toBe(1)

    const migrated = await getResourceManagerData(page)
    expect(migrated.wbsColumnSettingsEntries[0].projectId).toBe(PROJECT_ID)
    expect(
      migrated.wbsColumnSettingsEntries[0].effortColumns[0].displayName,
    ).toBe('レガシー要件工数')

    await page.reload()
    await expect(columnNameInput(page, 'effort-1')).toHaveValue(
      'レガシー要件工数',
    )
    const afterReload = await getResourceManagerData(page)
    expect(afterReload.wbsColumnSettingsEntries).toHaveLength(1)
  })

  test('工程設定: 移行後に工程名を編集すると実localStorageへ反映される', async ({
    page,
  }) => {
    await page.goto('/')
    await page.evaluate(
      ({ data, legacy }) => {
        localStorage.setItem('resource-manager-data', JSON.stringify(data))
        localStorage.setItem(
          'schedule-settings-storage',
          JSON.stringify(legacy),
        )
      },
      { data: buildSeedData(), legacy: buildLegacyScheduleSettings() },
    )

    await page.goto(`/schedule-settings/${PROJECT_ID}`)
    const nameInput = phaseNameInput(page, 'phase-1')
    await expect(nameInput).toHaveValue('レガシー要件定義')

    // 移行が完了する（DataAdapter側に1件persistされる）まで待ってから編集する
    await expect
      .poll(async () => {
        const d = await getResourceManagerData(page)
        return d?.scheduleSettingsEntries?.length ?? 0
      })
      .toBe(1)

    await nameInput.fill('編集後の工程名')

    await expect
      .poll(async () => {
        const d = await getResourceManagerData(page)
        return d?.scheduleSettingsEntries?.[0]?.phases?.find(
          // biome-ignore lint/suspicious/noExplicitAny: シードデータの緩い型のため
          (p: any) => p.phaseKey === 'phase-1',
        )?.name
      })
      .toBe('編集後の工程名')

    await page.reload()
    await expect(phaseNameInput(page, 'phase-1')).toHaveValue('編集後の工程名')
  })

  test('反証: DataAdapter側に既にデータがある場合はレガシーキーが残っていても再移行・重複作成しない', async ({
    page,
  }) => {
    const seedWithExisting = {
      ...buildSeedData(),
      scheduleSettingsEntries: [
        {
          id: '00000000-0000-4000-8000-000000005e99',
          projectId: PROJECT_ID,
          phases: [
            {
              phaseKey: 'phase-1',
              name: '既存の工程名',
              color: '#000000',
              enabled: true,
              sortOrder: 0,
            },
          ],
          lastModified: NOW,
        },
      ],
    }
    await page.goto('/')
    await page.evaluate(
      ({ data, legacy }) => {
        localStorage.setItem('resource-manager-data', JSON.stringify(data))
        localStorage.setItem(
          'schedule-settings-storage',
          JSON.stringify(legacy),
        )
      },
      { data: seedWithExisting, legacy: buildLegacyScheduleSettings() },
    )

    await page.goto(`/schedule-settings/${PROJECT_ID}`)
    // レガシーキーの内容ではなく、DataAdapter側の既存データが優先表示される
    await expect(phaseNameInput(page, 'phase-1')).toHaveValue('既存の工程名')

    const data = await getResourceManagerData(page)
    expect(data.scheduleSettingsEntries).toHaveLength(1)
  })
})
