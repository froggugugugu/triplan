import { execSync } from 'node:child_process'

/**
 * postgresモードE2Eの前準備: 使い捨てDBの起動→マイグレーション→admin作成。
 * webServer（APIサーバー・Vite）はPlaywrightのwebServer設定が起動する（本セットアップの後）。
 */
export const E2E_PG_ENV = {
  DATABASE_URL: 'postgresql://e2e:e2e@localhost:55432/resource_planner_e2e',
  NODE_ENV: 'test',
  JWT_ACCESS_SECRET: 'e2e-postgres-access-secret-1234567890',
  JWT_REFRESH_PEPPER: 'e2e-postgres-refresh-pepper-1234567890',
  CORS_ORIGIN: 'http://localhost:5373',
  SSO_ENCRYPTION_KEY: 'b'.repeat(64),
  PORT: '3101',
}

export const E2E_ADMIN = {
  email: 'admin@e2e.local',
  password: 'E2eAdminPass123',
  name: 'E2E管理者',
}

export default async function globalSetup() {
  const env = { ...process.env, ...E2E_PG_ENV }
  execSync('docker compose -f docker-compose.e2e.yml up -d --wait', {
    stdio: 'inherit',
  })
  execSync('npm --prefix server run db:migrate', { stdio: 'inherit', env })
  execSync(
    `npm --prefix server run db:seed-admin -- --email=${E2E_ADMIN.email} --name=${E2E_ADMIN.name} --password=${E2E_ADMIN.password}`,
    { stdio: 'inherit', env },
  )

  // ペルソナ別ジャーニー用に残り4ロールの利用者も種まきする。
  // adminのAPI経由ではなくCLIで作るのは、テスト本体を「その人の仕事」だけに保つため
  for (const [role, email, name, password] of [
    ['manager', 'manager@e2e.local', 'E2E田中', 'E2eManagerPass123'],
    ['editor', 'editor@e2e.local', 'E2E鈴木', 'E2eEditorPass123'],
    ['viewer', 'viewer@e2e.local', 'E2E山本', 'E2eViewerPass123'],
    ['partner', 'partner@e2e.local', 'E2E高橋', 'E2ePartnerPass123'],
  ]) {
    execSync(
      `npm --prefix server run db:seed-admin -- --email=${email} --name=${name} --password=${password} --role=${role}`,
      { stdio: 'inherit', env },
    )
  }
}
