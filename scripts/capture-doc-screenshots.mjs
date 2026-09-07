/**
 * 利用ガイド（docs/guide/）・設計書（非公開の設計文書）用の
 * スクリーンショット一括撮影スクリプト。
 *
 * 使い方: node scripts/capture-doc-screenshots.mjs
 *
 * - Vite devサーバーをポート5273（DOC_SHOT_PORT環境変数で変更可・strictPort）で起動し、
 *   空のlocalStorageから初期設定ウィザード経由でデモデータを投入して各画面を撮影する
 * - 出力先: docs/guide/images/*.png（GitHub Pagesでもそのまま配信される）
 * - E2Eテストとは独立（playwright.config.tsを使わない）。@playwright/testの
 *   ライブラリAPIのみ使用する
 */
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const PORT = Number(process.env.DOC_SHOT_PORT ?? 5273)
const BASE = `http://localhost:${PORT}`
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = fileURLToPath(new URL('../docs/guide/images/', import.meta.url))

async function waitForServer(url, timeoutMs = 90000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // 起動待ち
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`dev server did not become ready at ${url}`)
}

/** cmdk Comboboxの先頭候補を選択する（detach誤判定対策でdispatchEventを使う） */
async function selectFirstComboboxOption(page) {
  try {
    await page
      .locator('button[role="combobox"]')
      .first()
      .click({ timeout: 8000 })
    await page.locator('[cmdk-item]').first().waitFor({ timeout: 5000 })
    await page.locator('[cmdk-item]').first().dispatchEvent('click')
    await page.waitForTimeout(500)
  } catch (e) {
    console.warn(
      '  (combobox selection skipped:',
      e.message.split('\n')[0],
      ')',
    )
  }
}

async function clickTab(page, name) {
  try {
    await page.getByRole('tab', { name }).click({ timeout: 8000 })
    await page.waitForTimeout(400)
  } catch (e) {
    console.warn('  (tab click skipped:', e.message.split('\n')[0], ')')
  }
}

/** BudgetPageのタブはRadix Tabsではなく素の<button>実装のためrole=buttonで探す */
async function clickBudgetTab(page, label) {
  try {
    await page.getByRole('button', { name: label, exact: true }).click({
      timeout: 8000,
    })
    await page.waitForTimeout(400)
  } catch (e) {
    console.warn('  (budget tab click skipped:', e.message.split('\n')[0], ')')
  }
}

async function main() {
  await mkdir(OUT, { recursive: true })

  console.log(`starting dev server on :${PORT} ...`)
  const server = spawn(
    'npm',
    ['run', 'dev', '--', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: 'ignore' },
  )
  const stopServer = () => {
    if (!server.killed) server.kill('SIGTERM')
  }
  process.on('exit', stopServer)

  try {
    await waitForServer(BASE)
    console.log('dev server ready')

    const browser = await chromium.launch()
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: 'light',
      locale: 'ja-JP',
    })
    const page = await context.newPage()

    const shot = async (name, { delay = 1000, fullPage = true } = {}) => {
      await page.waitForTimeout(delay)
      await page.screenshot({ path: `${OUT}${name}.png`, fullPage })
      console.log(`captured ${name}.png`)
    }
    const goto = async (path) => {
      await page.goto(`${BASE}${path}`)
      await page.waitForLoadState('networkidle').catch(() => {})
    }

    // --- ランディングページ ---
    await goto('/')
    await shot('landing', { fullPage: false })

    // --- 空のダッシュボード（「はじめに」カード） ---
    await goto('/dashboard')
    await page
      .getByText('ようこそ！まずは初期設定から')
      .waitFor({ timeout: 15000 })
    await shot('getting-started-card', { fullPage: false })

    // --- 初期設定ウィザード（ようこそステップ） ---
    await page.getByRole('button', { name: '初期設定ウィザードを開始' }).click()
    await page.getByText('デモデータで試す', { exact: true }).waitFor()
    await shot('setup-wizard', { fullPage: false, delay: 500 })

    // --- デモデータ投入 ---
    await page.getByText('デモデータで試す', { exact: true }).click()
    await page.getByText('デモデータで試用中です').waitFor({ timeout: 20000 })
    await page.waitForTimeout(1500)
    await page.reload()
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.getByText('デモデータで試用中です').waitFor({ timeout: 15000 })

    // --- ダッシュボード（アラートセンター・チャート・EVMパネル） ---
    await shot('dashboard', { delay: 2500 })

    // --- チーム / プロジェクト ---
    await goto('/team')
    await shot('team')
    await goto('/projects')
    await shot('projects')

    // --- WBS / スケジュール / アサイン（先頭プロジェクトを選択） ---
    await goto('/wbs')
    await selectFirstComboboxOption(page)
    await shot('wbs', { delay: 1500 })

    await goto('/schedule')
    await selectFirstComboboxOption(page)
    await shot('schedule', { delay: 1500 })

    await goto('/assignment')
    await selectFirstComboboxOption(page)
    await shot('assignment', { delay: 1500 })

    // --- 月次実績（既定は前月） ---
    await goto('/monthly-actuals')
    await shot('monthly-actuals', { delay: 1500 })

    // --- 予算管理（主要タブ別） ---
    await goto('/budget')
    await shot('budget-dashboard', { delay: 2000 })
    await clickBudgetTab(page, '部門予算一覧')
    await shot('budget-division')
    await clickBudgetTab(page, 'プロジェクト')
    await shot('budget-project')
    await clickBudgetTab(page, 'AI利用費')
    await shot('budget-ai')
    await clickBudgetTab(page, '人員計画')
    await shot('budget-personnel')

    // --- 月次明細（2タブ） ---
    await goto('/statements')
    await shot('statements-partner', { delay: 1500 })
    await clickTab(page, /発注元向け/)
    await shot('statements-client')

    // --- レポート / マスタ系 ---
    await goto('/reports')
    await shot('reports')
    await goto('/tech-tags')
    await shot('tech-tags')
    await goto('/companies')
    await shot('companies')
    await goto('/wbs-templates')
    await shot('wbs-templates', { delay: 1500 })
    await goto('/document-templates')
    await shot('document-templates', { delay: 1500 })

    // --- システム設定ポップオーバー ---
    await goto('/dashboard')
    await page.locator('button[title="システム設定"]').click()
    await shot('settings-popover', { fullPage: false, delay: 700 })

    await browser.close()
    console.log('all screenshots captured')
  } finally {
    stopServer()
  }
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
