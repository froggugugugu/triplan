import { execSync } from 'node:child_process'

export default async function globalTeardown() {
  execSync('docker compose -f docker-compose.e2e.yml down -v', {
    stdio: 'inherit',
  })
}
