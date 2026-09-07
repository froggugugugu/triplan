import { readFileSync } from 'node:fs'
import { DatabaseSchema } from '@/shared/types'
import { closeDb } from '../db/client.js'
import { importDatabaseData } from '../db/import-database.js'

/**
 * localStorageモードからの一度限りの移行CLI（非公開の設計文書
 * 「one-shot cutover」方針）。入力は`DataExport.tsx`の「JSONエクスポート」ボタンで
 * ダウンロードしたファイル（`jsonStorage.export()`の出力、Database型そのもの）。
 *
 * 使い方:
 *   npm --prefix server run db:migrate-from-json -- --file=./export.json
 *   npm --prefix server run db:migrate-from-json -- --file=./export.json --dry-run
 *
 * --dry-runはZod検証と件数サマリー表示のみ行い、DBへは書き込まない。
 * 本番投入はimportDatabaseData()内のトランザクション（TRUNCATE→再投入）に委ねる
 * （routes/database.tsのPOST /api/database/importと同じ実装を共有）。
 */

function parseArgs(): { file: string; dryRun: boolean } {
  const args = new Map<string, string>()
  let dryRun = false
  for (const arg of process.argv.slice(2)) {
    if (arg === '--dry-run') {
      dryRun = true
      continue
    }
    const match = /^--([^=]+)=(.*)$/.exec(arg)
    if (match?.[1] && match[2] !== undefined) {
      args.set(match[1], match[2])
    }
  }
  const file = args.get('file')
  if (!file) {
    console.error(
      '使い方: --file=<jsonStorage.export()の出力ファイル> [--dry-run]',
    )
    process.exit(1)
  }
  return { file, dryRun }
}

function printSummary(data: Record<string, unknown>) {
  const entityKeys = [
    'projects',
    'members',
    'efforts',
    'scheduleEntries',
    'dependencies',
    'assignments',
    'techTags',
    'techTagCategories',
    'techTagSubCategories',
    'divisions',
    'sections',
    'companies',
    'divisionBudgets',
    'budgetAdjustments',
    'budgetBreakdowns',
    'aiUsageEntries',
    'aiUsageMemberAllocations',
    'aiUsageProviders',
    'saasContracts',
    'personnelPlans',
    'skillEvaluations',
    'skillRoadmapGoals',
    'projectProgressEntries',
    'wbsTemplates',
  ] as const

  console.log('--- 移行対象データ件数 ---')
  for (const key of entityKeys) {
    const value = data[key]
    const count = Array.isArray(value) ? value.length : 0
    console.log(`  ${key}: ${count}件`)
  }
  console.log('--------------------------')
}

async function main() {
  const { file, dryRun } = parseArgs()

  console.log(`ファイルを読み込んでいます: ${file}`)
  const raw = readFileSync(file, 'utf-8')
  const json = JSON.parse(raw)

  const parsed = DatabaseSchema.safeParse(json)
  if (!parsed.success) {
    console.error('入力ファイルのバリデーションに失敗しました:')
    console.error(JSON.stringify(parsed.error.issues, null, 2))
    process.exit(1)
  }

  printSummary(parsed.data as unknown as Record<string, unknown>)

  if (dryRun) {
    console.log(
      '--dry-run指定のためDBへは書き込みませんでした。上記の件数を確認してください。',
    )
    return
  }

  console.log(
    '⚠️  この操作はPostgres側の全business-dataを一括置換します（TRUNCATE→再投入）。',
  )
  console.log('移行を実行しています...')
  await importDatabaseData(parsed.data)
  console.log('移行が完了しました')
}

main()
  .catch((error) => {
    console.error('移行に失敗しました:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDb()
  })
