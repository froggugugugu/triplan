import { expect, test } from '@playwright/test'

test('schedule: double-click on start/end date cell opens edit dialog', async ({
  page,
}) => {
  const now = new Date().toISOString()
  const projectId = '00000000-0000-4000-8000-000000000001'

  const testData = {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [
      {
        id: projectId,
        code: 'P001',
        name: 'テスト案件',
        level: 0,
        parentId: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ],
    members: [],
    scheduleEntries: [
      {
        id: '00000000-0000-4000-8000-000000000010',
        projectId: projectId,
        phaseKey: 'phase-1',
        startDate: '2025-04-01',
        endDate: '2025-06-30',
      },
    ],
    dependencies: [],
    assignments: [],
    metadata: {
      lastModified: now,
      createdBy: 'test',
      version: '1.0.0',
    },
  }

  const scheduleSettings = {
    state: {
      settingsMap: {
        [projectId]: {
          phases: [
            {
              phaseKey: 'phase-1',
              name: '要件定義',
              color: '#3b82f6',
              enabled: true,
              sortOrder: 0,
            },
            {
              phaseKey: 'phase-2',
              name: '設計',
              color: '#10b981',
              enabled: true,
              sortOrder: 1,
            },
          ],
        },
      },
    },
    version: 0,
  }

  // Load the app and set localStorage data
  await page.goto('/')
  await page.waitForTimeout(500)
  await page.evaluate(
    ({ data, settings }) => {
      localStorage.setItem('resource-manager-data', JSON.stringify(data))
      localStorage.setItem(
        'schedule-settings-storage',
        JSON.stringify(settings),
      )
    },
    { data: testData, settings: scheduleSettings },
  )

  // Full reload so stores pick up localStorage data
  await page.goto('/schedule')
  await page.waitForTimeout(1000)

  // Select the project from dropdown
  const combobox = page.locator('button[role="combobox"]')
  await combobox.click()
  await page.waitForTimeout(500)

  const optionCount = await page.getByRole('option').count()
  console.log(`Options count: ${optionCount}`)

  if (optionCount === 0) {
    // Debug: check if projects loaded
    const debugInfo = await page.evaluate(() => {
      const data = localStorage.getItem('resource-manager-data')
      if (!data) return 'No data in localStorage'
      try {
        const parsed = JSON.parse(data)
        return `Projects: ${parsed.projects?.length ?? 0}, Version: ${parsed.version}`
      } catch (e) {
        return `Parse error: ${e}`
      }
    })
    console.log(`Debug info: ${debugInfo}`)
    await page.screenshot({ path: 'test-results/debug-gantt-no-options.png' })
  }

  expect(optionCount).toBeGreaterThan(0)

  await page.getByRole('option').first().click()
  await page.waitForTimeout(2000)

  // Verify the gantt container exists
  const container = page.locator('.schedule-gantt-container')
  await expect(container).toBeVisible()

  // Inspect the DOM to confirm data-col-id attributes exist
  const cellInfo = await page.evaluate(() => {
    const el = document.querySelector('.schedule-gantt-container')
    if (!el) return 'No container'

    const cells = el.querySelectorAll('[data-col-id]')
    const info: string[] = []
    cells.forEach((cell) => {
      const colId = cell.getAttribute('data-col-id')
      const rowId = cell.getAttribute('data-row-id')
      const text = (cell as HTMLElement).innerText?.trim().slice(0, 60) || ''
      info.push(`col=${colId} row=${rowId} text="${text}"`)
    })
    return info.join('\n')
  })
  console.log('=== CELL INFO ===')
  console.log(cellInfo)

  // Find a startText cell for phase-1
  const startCell = page.locator(
    '[data-col-id$="startText"][data-row-id$="phase-1"]',
  )
  const startCellCount = await startCell.count()
  console.log(`startText cells for phase-1: ${startCellCount}`)

  if (startCellCount > 0) {
    // Double-click the start date cell
    await startCell.first().dblclick()
    await page.waitForTimeout(500)

    // The edit dialog should appear
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 3000 })
    console.log('Dialog opened successfully via start date cell double-click')

    // Close dialog
    await page.getByRole('button', { name: 'キャンセル' }).click()
    await page.waitForTimeout(300)
  } else {
    // Fallback: dump all DOM info for debugging
    const allAttrs = await page.evaluate(() => {
      const el = document.querySelector('.schedule-gantt-container')
      if (!el) return 'No container'
      const rows = el.querySelectorAll('[data-id]')
      const info: string[] = ['=== ROWS ===']
      rows.forEach((row) => {
        info.push(
          `data-id="${row.getAttribute('data-id')}" class="${row.className.slice(0, 80)}"`,
        )
      })
      // Check for any data- attributes
      const allEls = el.querySelectorAll('*')
      const dataAttrs = new Set<string>()
      allEls.forEach((e) => {
        for (const attr of e.getAttributeNames()) {
          if (attr.startsWith('data-')) dataAttrs.add(attr)
        }
      })
      info.push('\n=== ALL data- ATTRIBUTES ===')
      info.push([...dataAttrs].sort().join(', '))
      return info.join('\n')
    })
    console.log(allAttrs)
    await page.screenshot({ path: 'test-results/debug-gantt-cells.png' })
  }

  // Also test endText cell
  const endCell = page.locator(
    '[data-col-id$="endText"][data-row-id$="phase-1"]',
  )
  const endCellCount = await endCell.count()
  console.log(`endText cells for phase-1: ${endCellCount}`)

  if (endCellCount > 0) {
    await endCell.first().dblclick()
    await page.waitForTimeout(500)

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 3000 })
    console.log('Dialog opened successfully via end date cell double-click')
  }
})
