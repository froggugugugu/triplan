import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { closeDb, db } from './client.js'

async function main() {
  console.log('マイグレーションを適用しています...')
  await migrate(db, { migrationsFolder: './drizzle/migrations' })
  console.log('マイグレーションが完了しました')
  await closeDb()
}

main().catch((error) => {
  console.error('マイグレーションに失敗しました:', error)
  process.exit(1)
})
