import { fileURLToPath } from 'node:url'
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { FastifyInstance } from 'fastify'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * 実Postgres（Testcontainers）に対する統合テスト。単体テスト（vi.mock多用）では
 * 検出できなかった実バグ（例: DrizzleQueryError.causeのアンラップ漏れ、numeric列の
 * 文字列返却、DELETEの空ボディ拒否、null/undefined不一致）を本セッションで多数
 * 発見・修正した経緯があるため、それらの回帰防止として実DBベースで検証する。
 *
 * env.ts（DATABASE_URL等をモジュール読み込み時に一度だけzod検証する）が
 * vitest.config.tsのダミーDATABASE_URLで固まらないよう、コンテナ起動後に
 * process.envを上書きしてから動的importする（静的importだとモジュール評価が
 * 先に走ってしまうため）。
 */
describe('full-stack integration (Testcontainers postgres:16-alpine)', () => {
  let container: StartedPostgreSqlContainer
  let app: FastifyInstance
  let adminToken: string

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start()
    const connectionString = container.getConnectionUri()

    process.env.DATABASE_URL = connectionString
    process.env.NODE_ENV = 'test'
    process.env.JWT_ACCESS_SECRET = 'integration-test-access-secret-1234567890'
    process.env.JWT_REFRESH_PEPPER =
      'integration-test-refresh-pepper-1234567890'
    process.env.JWT_ACCESS_TTL_MIN = '15'
    process.env.JWT_REFRESH_TTL_DAYS = '30'
    process.env.CORS_ORIGIN = 'http://localhost:5173'
    process.env.SSO_ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.TASK_WEBHOOK_SECRET = 'webhook-secret-for-integration-test'
    process.env.ASANA_ACCESS_TOKEN = 'asana-test-token'
    process.env.TASK_WEBHOOK_BACKLOG_DONE_STATUSES = '完了,Closed'

    const migrationsFolder = fileURLToPath(
      new URL('../../../drizzle/migrations', import.meta.url),
    )
    const migrationPool = new Pool({ connectionString })
    await migrate(drizzle(migrationPool), { migrationsFolder })
    await migrationPool.end()

    const { buildApp } = await import('../../app.js')
    app = await buildApp()

    const { hashPassword } = await import('../../auth/password.js')
    const { db } = await import('../../db/client.js')
    const { users } = await import('../../db/schema.js')
    await db.insert(users).values({
      email: 'admin@integration.test',
      name: '統合テスト管理者',
      passwordHash: await hashPassword('IntegrationTest123'),
      role: 'admin',
      authProvider: 'local',
    })

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'admin@integration.test',
        password: 'IntegrationTest123',
      },
    })
    expect(loginRes.statusCode).toBe(200)
    adminToken = loginRes.json().accessToken
  }, 120_000)

  afterAll(async () => {
    await app.close()
    // db/client.tsのシングルトンPoolを閉じてからコンテナを止める。
    // 順序を逆にすると接続中のPoolがコンテナ停止で強制切断され、
    // 未処理のPostgresエラー（57P01）がテスト終了後に漏れる
    const { closeDb } = await import('../../db/client.js')
    await closeDb()
    await container.stop()
  })

  function authed(headers: Record<string, string> = {}) {
    return { authorization: `Bearer ${adminToken}`, ...headers }
  }

  it('divisionsのCRUDが一通り動作する', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/divisions',
      headers: authed(),
      payload: { name: '統合テスト部門', sortOrder: 0 },
    })
    expect(created.statusCode).toBe(201)
    const division = created.json()
    expect(division.id).toBeTruthy()

    const list = await app.inject({
      method: 'GET',
      url: '/api/divisions',
      headers: authed(),
    })
    expect(list.statusCode).toBe(200)
    expect(list.json()).toContainEqual(
      expect.objectContaining({ id: division.id }),
    )

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/divisions/${division.id}`,
      headers: authed(),
      payload: { name: '統合テスト部門（改）' },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.json().name).toBe('統合テスト部門（改）')

    // DELETEはボディなし + Content-Type: application/jsonでも成功すること
    // （Fastify既定パーサーが空ボディを拒否していた実バグの回帰テスト）
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/divisions/${division.id}`,
      headers: { ...authed(), 'content-type': 'application/json' },
    })
    expect(deleted.statusCode).toBe(204)
  })

  it('POST時にクライアント指定idを渡すと、そのidで作成される（楽観的更新の仮id→確定id安定化）', async () => {
    const clientId = crypto.randomUUID()
    const created = await app.inject({
      method: 'POST',
      url: '/api/companies',
      headers: authed(),
      payload: {
        id: clientId,
        name: 'クライアントid指定会社',
        sortOrder: 0,
        isInternal: false,
      },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json().id).toBe(clientId)

    const list = await app.inject({
      method: 'GET',
      url: '/api/companies',
      headers: authed(),
    })
    expect(list.json()).toContainEqual(
      expect.objectContaining({ id: clientId, name: 'クライアントid指定会社' }),
    )
  })

  it('POST時にidを省略すると、従来どおりDB側で自動採番される（後方互換の回帰テスト）', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/companies',
      headers: authed(),
      payload: { name: 'id省略会社', sortOrder: 1, isInternal: false },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json().id).toBeTruthy()
  })

  it('POST時に不正な形式のidを渡すと400になる', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/companies',
      headers: authed(),
      payload: {
        id: 'not-a-uuid',
        name: '不正id会社',
        sortOrder: 2,
        isInternal: false,
      },
    })
    expect(created.statusCode).toBe(400)
  })

  it('POST時に既存レコードと重複するidを渡すと409になる', async () => {
    const clientId = crypto.randomUUID()
    const first = await app.inject({
      method: 'POST',
      url: '/api/companies',
      headers: authed(),
      payload: {
        id: clientId,
        name: '重複元会社',
        sortOrder: 3,
        isInternal: false,
      },
    })
    expect(first.statusCode).toBe(201)

    const dup = await app.inject({
      method: 'POST',
      url: '/api/companies',
      headers: authed(),
      payload: {
        id: clientId,
        name: '重複会社',
        sortOrder: 4,
        isInternal: false,
      },
    })
    expect(dup.statusCode).toBe(409)
  })

  it('projectsの自己参照FKがカスケード削除される', async () => {
    const parent = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'INT1',
        name: '統合テスト親案件',
        parentId: null,
        level: 0,
        status: 'not_started',
        confidence: null,
        divisionId: null,
      },
    })
    expect(parent.statusCode).toBe(201)
    const parentId = parent.json().id

    const child = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'INT1-01',
        name: '統合テスト子タスク',
        parentId,
        level: 1,
        status: 'not_started',
        confidence: null,
        divisionId: null,
      },
    })
    expect(child.statusCode).toBe(201)
    const childId = child.json().id

    // descriptionを設定していないプロジェクトはレスポンスにキー自体が
    // 含まれないこと（null→undefined正規化の回帰テスト）
    expect(child.json()).not.toHaveProperty('description')

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${parentId}`,
      headers: authed(),
    })
    expect(del.statusCode).toBe(204)

    const listAfter = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: authed(),
    })
    const ids = listAfter.json().map((p: { id: string }) => p.id)
    expect(ids).not.toContain(parentId)
    expect(ids).not.toContain(childId)
  })

  it('担当者の月次アサイン合計1.0人月上限を超えると400になる', async () => {
    const member = await app.inject({
      method: 'POST',
      url: '/api/members',
      headers: authed(),
      payload: {
        name: '統合テスト担当者',
        sectionId: null,
        role: 'ENG',
        isActive: true,
        techTagIds: [],
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
      },
    })
    const memberId = member.json().id

    const project = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'INT2',
        name: '統合テストアサイン案件',
        parentId: null,
        level: 0,
        status: 'not_started',
        confidence: null,
        divisionId: null,
      },
    })
    const projectId = project.json().id

    const first = await app.inject({
      method: 'POST',
      url: '/api/assignments',
      headers: authed(),
      payload: {
        projectId,
        taskId: projectId,
        memberId,
        monthlyValues: { '2026-04': 0.7 },
      },
    })
    expect(first.statusCode).toBe(201)

    const overCap = await app.inject({
      method: 'POST',
      url: '/api/assignments',
      headers: authed(),
      payload: {
        projectId,
        taskId: projectId,
        memberId,
        monthlyValues: { '2026-04': 0.5 },
      },
    })
    expect(overCap.statusCode).toBe(400)
    expect(overCap.json().error).toMatch(/1\.0/)
  })

  it('companiesの取引先属性（支払サイト・インボイス登録番号）がGET往復する', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/companies',
      headers: authed(),
      payload: {
        name: '支払サイト検証会社',
        sortOrder: 90,
        isInternal: false,
        invoiceRegistrationNumber: 'T1234567890123',
        paymentTerms: { closingDay: 31, paymentMonthOffset: 1, paymentDay: 31 },
      },
    })
    expect(created.statusCode, created.body).toBe(201)
    const list = await app.inject({
      method: 'GET',
      url: '/api/companies',
      headers: authed(),
    })
    const found = list
      .json()
      .find((c: { name: string }) => c.name === '支払サイト検証会社')
    expect(found).toMatchObject({
      invoiceRegistrationNumber: 'T1234567890123',
      paymentTerms: { closingDay: 31, paymentMonthOffset: 1, paymentDay: 31 },
    })
    // 反証: 不正な登録番号形式は400（Zod検証がサーバー側でも効く）
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/companies',
      headers: authed(),
      payload: {
        name: '不正登録番号会社',
        sortOrder: 91,
        isInternal: false,
        invoiceRegistrationNumber: '1234567890123',
      },
    })
    expect(invalid.statusCode).toBe(400)
  })

  it('複合ユニーク制約違反（NULLS NOT DISTINCT）は409を返す', async () => {
    const division = await app.inject({
      method: 'POST',
      url: '/api/divisions',
      headers: authed(),
      payload: { name: 'AI利用費検証部門', sortOrder: 0 },
    })
    const divisionId = division.json().id

    const entry1 = await app.inject({
      method: 'POST',
      url: '/api/aiUsageEntries',
      headers: authed(),
      payload: {
        divisionId,
        sectionId: null,
        providerId: null,
        fiscalYear: 2026,
        month: '2026-04',
        budgetAmount: 100,
        actualAmount: null,
      },
    })
    expect(entry1.statusCode).toBe(201)

    // sectionId/providerId共にnullの同一部門・年度・月 → NULLS NOT DISTINCTにより重複扱い
    const entry2 = await app.inject({
      method: 'POST',
      url: '/api/aiUsageEntries',
      headers: authed(),
      payload: {
        divisionId,
        sectionId: null,
        providerId: null,
        fiscalYear: 2026,
        month: '2026-04',
        budgetAmount: 200,
        actualAmount: null,
      },
    })
    expect(entry2.statusCode).toBe(409)
  })

  it('editorロールはadmin限定エンドポイント（database export）を403で拒否される', async () => {
    const createEditor = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: authed(),
      payload: {
        email: 'editor@integration.test',
        name: '統合テスト編集者',
        password: 'EditorPass123',
        role: 'editor',
      },
    })
    expect(createEditor.statusCode).toBe(201)

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'editor@integration.test', password: 'EditorPass123' },
    })
    const editorToken = loginRes.json().accessToken

    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/database/export',
      headers: { authorization: `Bearer ${editorToken}` },
    })
    expect(forbidden.statusCode).toBe(403)

    // editorは通常の業務データCRUDは可能
    const allowed = await app.inject({
      method: 'POST',
      url: '/api/divisions',
      headers: { authorization: `Bearer ${editorToken}` },
      payload: { name: 'editor作成部門', sortOrder: 0 },
    })
    expect(allowed.statusCode).toBe(201)
  })

  it('documentTemplatesのCRUDが一通り動作する（クライアント指定id・sourceRefs正規化含む）', async () => {
    const clientId = 'd0c00000-0000-4000-8000-0000000000f1'
    const created = await app.inject({
      method: 'POST',
      url: '/api/documentTemplates',
      headers: authed(),
      payload: {
        id: clientId,
        name: '要件定義書テンプレート',
        phase: '要件定義',
        description: '統合テスト用',
        content: '---\ntype: document\n---\n\n## 目的\n',
        sourceRefs: ['IPA 共通フレーム2013'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json().id).toBe(clientId)

    // sourceRefs未指定（DB上NULL）の行はGETでundefined（キー欠落）に正規化される
    const noRefs = await app.inject({
      method: 'POST',
      url: '/api/documentTemplates',
      headers: authed(),
      payload: {
        name: '出典なしテンプレート',
        phase: null,
        description: null,
        content: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    })
    expect(noRefs.statusCode).toBe(201)

    const list = await app.inject({
      method: 'GET',
      url: '/api/documentTemplates',
      headers: authed(),
    })
    expect(list.statusCode).toBe(200)
    const rows = list.json()
    const fetched = rows.find((r: { id: string }) => r.id === clientId)
    expect(fetched?.sourceRefs).toEqual(['IPA 共通フレーム2013'])
    const fetchedNoRefs = rows.find(
      (r: { id: string }) => r.id === noRefs.json().id,
    )
    expect('sourceRefs' in fetchedNoRefs).toBe(false)

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/documentTemplates/${clientId}`,
      headers: authed(),
      payload: { content: '---\ntype: document\n---\n\n## 更新済み\n' },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.json().content).toContain('## 更新済み')

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/documentTemplates/${noRefs.json().id}`,
      headers: authed(),
    })
    expect(deleted.statusCode).toBe(204)
  })

  it('partnerロールの権限境界: 金額系は403・混在エンティティはフィールドマスク・書き込みは全拒否', async () => {
    // partnerユーザーを作成してログイン（enum拡張のALTER TYPE ADD VALUEが効いていることの実証を兼ねる）
    const createPartner = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: authed(),
      payload: {
        email: 'partner@integration.test',
        name: '統合テスト協力会社',
        password: 'PartnerPass123',
        role: 'partner',
      },
    })
    expect(createPartner.statusCode).toBe(201)
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'partner@integration.test',
        password: 'PartnerPass123',
      },
    })
    expect(loginRes.statusCode).toBe(200)
    const partnerToken = loginRes.json().accessToken
    const partnerHeaders = { authorization: `Bearer ${partnerToken}` }

    // 金額データ（単価付きメンバー・受注額付き案件）をadminで用意する
    const member = await app.inject({
      method: 'POST',
      url: '/api/members',
      headers: authed(),
      payload: {
        name: '単価保持メンバー',
        email: null,
        sectionId: null,
        companyId: null,
        contractType: null,
        role: 'エンジニア',
        isActive: true,
        techTagIds: [],
        startDate: '2026-04-01',
        endDate: null,
        unitPriceHistory: [{ effectiveFrom: '2026-04', amount: 100 }],
        contractUnitPriceHistory: [{ effectiveFrom: '2026-04', amount: 80 }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    })
    expect(member.statusCode).toBe(201)
    const project = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'PARTNER-P1',
        name: '受注額付き案件',
        parentId: null,
        level: 0,
        status: 'not_started',
        confidence: null,
        divisionId: null,
        clientName: null,
        contractAmount: 5000,
        priority: null,
        contractType: null,
        masterDueDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    })
    expect(project.statusCode).toBe(201)

    // 反証1: 金額専用エンティティのGETは403（財務データ自体を遮断）
    for (const path of [
      '/api/divisionBudgets',
      '/api/budgetBreakdowns',
      '/api/personnelPlans',
      '/api/projectBaselines',
      '/api/billingMilestones',
      '/api/changeRequests',
      '/api/saasContracts',
    ]) {
      const res = await app.inject({
        method: 'GET',
        url: path,
        headers: partnerHeaders,
      })
      expect(res.statusCode, `GET ${path}`).toBe(403)
    }

    // 反証2: membersは200だが単価履歴・契約単価履歴が空配列へマスクされる
    const membersRes = await app.inject({
      method: 'GET',
      url: '/api/members',
      headers: partnerHeaders,
    })
    expect(membersRes.statusCode).toBe(200)
    const maskedMember = membersRes
      .json()
      .find((m: { id: string }) => m.id === member.json().id)
    expect(maskedMember.unitPriceHistory).toEqual([])
    expect(maskedMember.contractUnitPriceHistory).toEqual([])

    // 反証3: projectsは200だが受注金額がnullへマスクされる
    const projectsRes = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: partnerHeaders,
    })
    expect(projectsRes.statusCode).toBe(200)
    const maskedProject = projectsRes
      .json()
      .find((p: { id: string }) => p.id === project.json().id)
    expect(maskedProject.contractAmount).toBeNull()

    // 反証4: adminで同じGETをすると単価・受注額はマスクされない（redactの誤爆防止）
    const adminMembersRes = await app.inject({
      method: 'GET',
      url: '/api/members',
      headers: authed(),
    })
    const unmasked = adminMembersRes
      .json()
      .find((m: { id: string }) => m.id === member.json().id)
    expect(unmasked.unitPriceHistory).toEqual([
      { effectiveFrom: '2026-04', amount: 100 },
    ])

    // 反証5: partnerは書き込み（data:write）を一切行えない
    const writeDenied = await app.inject({
      method: 'POST',
      url: '/api/companies',
      headers: partnerHeaders,
      payload: {
        name: 'partner作成会社',
        sortOrder: 0,
        isInternal: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    })
    expect(writeDenied.statusCode).toBe(403)

    // partnerでも金額を含まない業務データ（documentTemplates等）は閲覧できる
    const docsRes = await app.inject({
      method: 'GET',
      url: '/api/documentTemplates',
      headers: partnerHeaders,
    })
    expect(docsRes.statusCode).toBe(200)
  })

  it('managerロールは業務データの書き込みができるが、ユーザー管理は403（管理者権限の分離）', async () => {
    const createManager = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: authed(),
      payload: {
        email: 'manager@integration.test',
        name: '統合テストマネージャー',
        password: 'ManagerPass123',
        role: 'manager',
      },
    })
    expect(createManager.statusCode).toBe(201)
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'manager@integration.test',
        password: 'ManagerPass123',
      },
    })
    const managerToken = loginRes.json().accessToken

    const allowed = await app.inject({
      method: 'POST',
      url: '/api/divisions',
      headers: { authorization: `Bearer ${managerToken}` },
      payload: { name: 'manager作成部門', sortOrder: 10 },
    })
    expect(allowed.statusCode).toBe(201)

    const denied = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${managerToken}` },
    })
    expect(denied.statusCode).toBe(403)
  })

  it('appSettings専用ルート: PATCH（settings:manage）→GET往復・部分更新・権限境界（P0-b）', async () => {
    // manager（settings:manage保持）で業務定数と概算単価を更新できる
    const mgrLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'manager@integration.test',
        password: 'ManagerPass123',
      },
    })
    const managerToken = mgrLogin.json().accessToken
    const managerHeaders = { authorization: `Bearer ${managerToken}` }

    const patch1 = await app.inject({
      method: 'PATCH',
      url: '/api/appSettings',
      headers: managerHeaders,
      payload: {
        estimatedUnitPrice: 95,
        workdaysPerMonth: 18,
        hoursPerDay: 7.5,
        hoursPerFunctionPoint: 12,
      },
    })
    expect(patch1.statusCode).toBe(200)
    expect(patch1.json().estimatedUnitPrice).toBe(95)
    expect(patch1.json().workdaysPerMonth).toBe(18)
    // 時間換算（P1-a）もフィールド単位パッチの対象
    expect(patch1.json().hoursPerDay).toBe(7.5)
    // 人時/FPもフィールド単位パッチの対象
    expect(patch1.json().hoursPerFunctionPoint).toBe(12)

    // 反証: 部分更新。別フィールドのPATCHが既存の設定を消さない
    const patch2 = await app.inject({
      method: 'PATCH',
      url: '/api/appSettings',
      headers: managerHeaders,
      payload: { skillReviewCycleMonths: 6 },
    })
    expect(patch2.statusCode).toBe(200)
    const got = await app.inject({
      method: 'GET',
      url: '/api/appSettings',
      headers: authed(),
    })
    expect(got.statusCode).toBe(200)
    expect(got.json().estimatedUnitPrice).toBe(95)
    expect(got.json().workdaysPerMonth).toBe(18)
    expect(got.json().skillReviewCycleMonths).toBe(6)

    // 反証: editor（settings:manage非保持）はPATCH不可（全社設定の変更は管理職以上）
    const editorLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'editor@integration.test', password: 'EditorPass123' },
    })
    const editorToken = editorLogin.json().accessToken
    const editorPatch = await app.inject({
      method: 'PATCH',
      url: '/api/appSettings',
      headers: { authorization: `Bearer ${editorToken}` },
      payload: { workdaysPerMonth: 25 },
    })
    expect(editorPatch.statusCode).toBe(403)

    // 反証: partnerのGETは金額系フィールド（概算単価・係数・為替）がキーごと落ち、
    // 非金額の業務定数（人月換算等）は見える
    const ptrLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'partner@integration.test',
        password: 'PartnerPass123',
      },
    })
    const partnerToken = ptrLogin.json().accessToken
    const ptrGet = await app.inject({
      method: 'GET',
      url: '/api/appSettings',
      headers: { authorization: `Bearer ${partnerToken}` },
    })
    expect(ptrGet.statusCode).toBe(200)
    const ptrBody = ptrGet.json()
    expect('estimatedUnitPrice' in ptrBody).toBe(false)
    expect('exchangeRateHistory' in ptrBody).toBe(false)
    expect(ptrBody.workdaysPerMonth).toBe(18)

    // 反証: バリデーション（0以下の人月換算日数は400）
    const invalid = await app.inject({
      method: 'PATCH',
      url: '/api/appSettings',
      headers: managerHeaders,
      payload: { workdaysPerMonth: 0 },
    })
    expect(invalid.statusCode).toBe(400)
  })

  it('月次実績エンティティ: 確定マークのmonth unique・再確定PATCH・取込ログの追記専用（P1-a）', async () => {
    // 確定マーク: クライアント指定idでPOST
    const confirmationId = 'ac000000-0000-4000-8000-0000000000c1'
    const created = await app.inject({
      method: 'POST',
      url: '/api/monthlyActualsConfirmations',
      headers: authed(),
      payload: {
        id: confirmationId,
        month: '2025-09',
        confirmedAt: '2025-10-01T09:00:00.000Z',
      },
    })
    expect(created.statusCode, created.body).toBe(201)
    expect(created.json().id).toBe(confirmationId)

    // 反証: 同じ月の二重POSTはunique制約で409（全社×月1レコードの担保）
    const duplicated = await app.inject({
      method: 'POST',
      url: '/api/monthlyActualsConfirmations',
      headers: authed(),
      payload: { month: '2025-09', confirmedAt: '2025-10-02T09:00:00.000Z' },
    })
    expect(duplicated.statusCode).toBe(409)

    // 再確定はconfirmedAtのPATCH（confirmedAtはtext列でISO文字列を無変換往復）
    const reconfirmed = await app.inject({
      method: 'PATCH',
      url: `/api/monthlyActualsConfirmations/${confirmationId}`,
      headers: authed(),
      payload: { confirmedAt: '2025-10-05T09:00:00.000Z' },
    })
    expect(reconfirmed.statusCode, reconfirmed.body).toBe(200)
    expect(reconfirmed.json().confirmedAt).toBe('2025-10-05T09:00:00.000Z')

    // 取込ログ: 追記POST
    const logRes = await app.inject({
      method: 'POST',
      url: '/api/actualsImportLogs',
      headers: authed(),
      payload: {
        importedAt: '2025-10-01T10:00:00.000Z',
        fileName: 'timesheet-2025-09.csv',
        targetMonths: ['2025-09'],
        appliedCount: 12,
        skippedCount: 1,
        skippedReasons: [{ row: 5, reason: 'メンバーが見つかりません' }],
        note: null,
      },
    })
    expect(logRes.statusCode, logRes.body).toBe(201)
    const logId = logRes.json().id

    // 反証: 追記専用のためPATCH/DELETEルート自体が存在しない（404）
    const patchLog = await app.inject({
      method: 'PATCH',
      url: `/api/actualsImportLogs/${logId}`,
      headers: authed(),
      payload: { note: '改ざん' },
    })
    expect(patchLog.statusCode).toBe(404)
    const deleteLog = await app.inject({
      method: 'DELETE',
      url: `/api/actualsImportLogs/${logId}`,
      headers: authed(),
    })
    expect(deleteLog.statusCode).toBe(404)
  })

  it('月次締めイベント: governance権限境界・actorのサーバースタンプ・追記専用（P1-b）', async () => {
    // editor（governance:approveなし）の締めPOSTは403
    const editorLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'editor@integration.test', password: 'EditorPass123' },
    })
    const editorToken = editorLogin.json().accessToken
    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/monthlyCloseEvents',
      headers: { authorization: `Bearer ${editorToken}` },
      payload: {
        month: '2026-01',
        action: 'close',
        reason: null,
        occurredAt: '2026-02-01T09:00:00.000Z',
        actorName: null,
      },
    })
    expect(forbidden.statusCode).toBe(403)

    // manager（governance:approve保持）は締められる。actorNameはクライアント申告値を
    // 無視してサーバー側（usersテーブルの表示名）でスタンプされる
    const mgrLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'manager@integration.test',
        password: 'ManagerPass123',
      },
    })
    const managerToken = mgrLogin.json().accessToken
    const created = await app.inject({
      method: 'POST',
      url: '/api/monthlyCloseEvents',
      headers: { authorization: `Bearer ${managerToken}` },
      payload: {
        month: '2026-01',
        action: 'close',
        reason: null,
        occurredAt: '2026-02-01T09:00:00.000Z',
        actorName: 'なりすまし申告',
      },
    })
    expect(created.statusCode, created.body).toBe(201)
    expect(created.json().actorName).not.toBe('なりすまし申告')
    expect(created.json().actorName).toBeTruthy()
    const eventId = created.json().id

    // 反証: 追記専用のためPATCH/DELETEルート自体が存在しない（締め記録の改ざん・抹消不可）
    const patchEvent = await app.inject({
      method: 'PATCH',
      url: `/api/monthlyCloseEvents/${eventId}`,
      headers: authed(),
      payload: { reason: '改ざん' },
    })
    expect(patchEvent.statusCode).toBe(404)
    const deleteEvent = await app.inject({
      method: 'DELETE',
      url: `/api/monthlyCloseEvents/${eventId}`,
      headers: authed(),
    })
    expect(deleteEvent.statusCode).toBe(404)
  })

  it('締め済み月のアサイン書込み・削除はサーバー側でも拒否される（P1-b多層防御の実体）', async () => {
    // 準備: メンバーとプロジェクト（2026-01は先行テストで締め済み）
    const memberRes = await app.inject({
      method: 'POST',
      url: '/api/members',
      headers: authed(),
      payload: {
        name: '締めテスト担当',
        sectionId: null,
        role: 'エンジニア',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
      },
    })
    expect(memberRes.statusCode, memberRes.body).toBe(201)
    const memberId = memberRes.json().id
    const projectRes = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'CLS1',
        name: '締めテスト案件',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: null,
      },
    })
    const projectId = projectRes.json().id

    // 反証: 締め済み月に計画値を持つ新規POSTは400
    const blockedCreate = await app.inject({
      method: 'POST',
      url: '/api/assignments',
      headers: authed(),
      payload: {
        projectId,
        taskId: projectId,
        memberId,
        monthlyValues: { '2026-01': 0.5 },
      },
    })
    expect(blockedCreate.statusCode).toBe(400)
    expect(blockedCreate.body).toContain('締め済み')

    // 締め月以外の値だけを持つレコードは作成できる
    const okCreate = await app.inject({
      method: 'POST',
      url: '/api/assignments',
      headers: authed(),
      payload: {
        projectId,
        taskId: projectId,
        memberId,
        monthlyValues: { '2026-02': 0.5 },
      },
    })
    expect(okCreate.statusCode, okCreate.body).toBe(201)
    const assignmentId = okCreate.json().id

    // 反証: 締め済み月の計画値を変えるPATCHは400（他月のみの変更は200）
    const blockedPlan = await app.inject({
      method: 'PATCH',
      url: `/api/assignments/${assignmentId}`,
      headers: authed(),
      payload: { monthlyValues: { '2026-01': 0.3, '2026-02': 0.5 } },
    })
    expect(blockedPlan.statusCode).toBe(400)
    const okPatch = await app.inject({
      method: 'PATCH',
      url: `/api/assignments/${assignmentId}`,
      headers: authed(),
      payload: { monthlyValues: { '2026-02': 0.7 } },
    })
    expect(okPatch.statusCode, okPatch.body).toBe(200)

    // 反証: 締め済み月への実績（actualMonthlyValues）のPATCHも400
    const blockedActual = await app.inject({
      method: 'PATCH',
      url: `/api/assignments/${assignmentId}`,
      headers: authed(),
      payload: { actualMonthlyValues: { '2026-01': 0.8 } },
    })
    expect(blockedActual.statusCode).toBe(400)

    // 締め月以外の実績は書ける（1.0人月超も上限でブロックしない既存挙動の維持）
    const okActual = await app.inject({
      method: 'PATCH',
      url: `/api/assignments/${assignmentId}`,
      headers: authed(),
      payload: { actualMonthlyValues: { '2026-02': 1.2 } },
    })
    expect(okActual.statusCode, okActual.body).toBe(200)

    // 反証: 締め済み月に実績キーを持つレコードのDELETEは400
    // （2026-02に実績を持つ現状では削除可能なことも確認してから、2026-02を締める）
    const closeFeb = await app.inject({
      method: 'POST',
      url: '/api/monthlyCloseEvents',
      headers: authed(),
      payload: {
        month: '2026-02',
        action: 'close',
        reason: null,
        occurredAt: '2026-03-01T09:00:00.000Z',
        actorName: null,
      },
    })
    expect(closeFeb.statusCode).toBe(201)
    const blockedDelete = await app.inject({
      method: 'DELETE',
      url: `/api/assignments/${assignmentId}`,
      headers: authed(),
    })
    expect(blockedDelete.statusCode).toBe(400)
    expect(blockedDelete.body).toContain('削除できません')

    // 解除（reopen）後は削除できる（永続ロックではない反証）
    const reopenFeb = await app.inject({
      method: 'POST',
      url: '/api/monthlyCloseEvents',
      headers: authed(),
      payload: {
        month: '2026-02',
        action: 'reopen',
        reason: '統合テストの後片付け',
        occurredAt: '2026-03-02T09:00:00.000Z',
        actorName: null,
      },
    })
    expect(reopenFeb.statusCode).toBe(201)
    const okDelete = await app.inject({
      method: 'DELETE',
      url: `/api/assignments/${assignmentId}`,
      headers: authed(),
    })
    expect(okDelete.statusCode).toBe(204)
  })

  it('締め済み月の実績を含むプロジェクトの削除はサーバー側でも拒否される（P1-b段階2）', async () => {
    // 体制: 案件＋子タスク＋メンバー＋締め対象月に値を持つアサイン
    const root = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'DELG1',
        name: '削除ガード案件',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: null,
      },
    })
    const rootId = root.json().id
    const task = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'DELG1-01',
        name: '削除ガードタスク',
        parentId: rootId,
        level: 1,
        status: 'active',
        confidence: null,
        divisionId: null,
      },
    })
    const taskId = task.json().id
    const member = await app.inject({
      method: 'POST',
      url: '/api/members',
      headers: authed(),
      payload: {
        name: '削除ガード要員',
        sectionId: null,
        role: '',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
      },
    })
    expect(member.statusCode, member.body).toBe(201)
    const assignment = await app.inject({
      method: 'POST',
      url: '/api/assignments',
      headers: authed(),
      payload: {
        projectId: rootId,
        taskId,
        memberId: member.json().id,
        monthlyValues: { '2027-01': 0.5 },
      },
    })
    expect(assignment.statusCode, assignment.body).toBe(201)

    // 対象月を締める
    const close = await app.inject({
      method: 'POST',
      url: '/api/monthlyCloseEvents',
      headers: authed(),
      payload: {
        month: '2027-01',
        action: 'close',
        reason: null,
        occurredAt: new Date().toISOString(),
        actorName: null,
      },
    })
    expect(close.statusCode, close.body).toBe(201)

    // 親の削除は400（カスケードで締め済み実績が道連れに消えるのを防ぐ）
    const denied = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${rootId}`,
      headers: authed(),
    })
    expect(denied.statusCode).toBe(400)
    expect(denied.json().error).toContain('締め済み月')
    // 子タスク単体の削除も同様に拒否
    const deniedTask = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${taskId}`,
      headers: authed(),
    })
    expect(deniedTask.statusCode).toBe(400)

    // 反証: 締めを解除すれば削除できる（永続ロックではない）
    const reopen = await app.inject({
      method: 'POST',
      url: '/api/monthlyCloseEvents',
      headers: authed(),
      payload: {
        month: '2027-01',
        action: 'reopen',
        reason: '削除ガード検証のため解除',
        occurredAt: new Date().toISOString(),
        actorName: null,
      },
    })
    expect(reopen.statusCode, reopen.body).toBe(201)
    const allowed = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${rootId}`,
      headers: authed(),
    })
    expect(allowed.statusCode).toBe(204)
  })

  it('コード一意性: 新たな重複を作るPOST/PATCHは400、コード不変の編集は既存重複があっても通る', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'UNIQ1',
        name: 'コード一意性テスト1',
        parentId: null,
        level: 0,
        status: 'not_started',
        confidence: null,
        divisionId: null,
      },
    })
    expect(first.statusCode, first.body).toBe(201)

    // 反証: 同じコードの新規POSTは400
    const dup = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'UNIQ1',
        name: 'コード一意性テスト2',
        parentId: null,
        level: 0,
        status: 'not_started',
        confidence: null,
        divisionId: null,
      },
    })
    expect(dup.statusCode).toBe(400)
    expect(dup.body).toContain('既に使われています')

    // 別コードで作成し、既存コードへ変更するPATCHも400
    const second = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'UNIQ2',
        name: 'コード一意性テスト3',
        parentId: null,
        level: 0,
        status: 'not_started',
        confidence: null,
        divisionId: null,
      },
    })
    const secondId = second.json().id
    const conflictPatch = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${secondId}`,
      headers: authed(),
      payload: { code: 'UNIQ1' },
    })
    expect(conflictPatch.statusCode).toBe(400)

    // 反証: 既にDB上に重複がある状態でも、コード不変の編集はブロックされない
    // （新たに生まれる重複のみ拒否＝既存不整合を対象外とする設計判断）
    const { db: dbClient } = await import('../../db/client.js')
    const { projects: projectsTable } = await import('../../db/schema.js')
    await dbClient.insert(projectsTable).values({
      code: 'UNIQ2', // secondと意図的に重複させる（アプリ検証を迂回した既存不整合を再現）
      name: '既存重複データ',
      parentId: null,
      level: 0,
      status: 'not_started',
    })
    const renameOnly = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${secondId}`,
      headers: authed(),
      payload: { code: 'UNIQ2', name: '改名のみ' },
    })
    expect(renameOnly.statusCode, renameOnly.body).toBe(200)
  })

  it('体制メモ・アサインスナップショット: 投稿者はサーバーがスタンプし、案件削除で一緒に消える', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'NOTE1',
        name: '体制メモ検証',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: null,
      },
    })
    const projectId = created.json().id as string

    // 体制メモ: authorNameはクライアント申告を採用せずサーバーが上書きする
    const note = await app.inject({
      method: 'POST',
      url: '/api/assignmentNotes',
      headers: authed(),
      payload: {
        projectId,
        body: '9月から2名増員',
        authorName: 'なりすまし太郎',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    })
    expect(note.statusCode, note.body).toBe(201)
    // 反証: 申告した名前ではなく認証ユーザーの情報が入る
    expect(note.json().authorName).not.toBe('なりすまし太郎')
    expect(note.json().authorName).toBeTruthy()

    // スナップショット: entries（jsonb）がそのまま往復する
    const snapshot = await app.inject({
      method: 'POST',
      url: '/api/assignmentSnapshots',
      headers: authed(),
      payload: {
        projectId,
        label: '10月キックオフ時点',
        takenAt: '2026-10-01T00:00:00.000Z',
        entries: [
          {
            taskId: '00000000-0000-4000-8000-0000000000e1',
            memberId: '00000000-0000-4000-8000-0000000000e2',
            monthlyValues: { '2026-10': 0.5 },
          },
        ],
        authorName: null,
        createdAt: new Date().toISOString(),
      },
    })
    expect(snapshot.statusCode, snapshot.body).toBe(201)
    expect(snapshot.json().takenAt).toBe('2026-10-01T00:00:00.000Z')
    expect(snapshot.json().entries).toEqual([
      {
        taskId: '00000000-0000-4000-8000-0000000000e1',
        memberId: '00000000-0000-4000-8000-0000000000e2',
        monthlyValues: { '2026-10': 0.5 },
      },
    ])

    // 反証: 案件を削除するとメモ・スナップショットも消える（案件に付随する情報のため）
    await app.inject({
      method: 'DELETE',
      url: `/api/projects/${projectId}`,
      headers: authed(),
    })
    const notesAfter = await app.inject({
      method: 'GET',
      url: '/api/assignmentNotes',
      headers: authed(),
    })
    expect(
      (notesAfter.json() as Array<{ projectId: string }>).filter(
        (n) => n.projectId === projectId,
      ),
    ).toHaveLength(0)
    const snapsAfter = await app.inject({
      method: 'GET',
      url: '/api/assignmentSnapshots',
      headers: authed(),
    })
    expect(
      (snapsAfter.json() as Array<{ projectId: string }>).filter(
        (s) => s.projectId === projectId,
      ),
    ).toHaveLength(0)
  })

  it('リスク登録簿: CRUD一巡・partnerも閲覧でき・案件削除で一緒に消える（非公開の設計文書）', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'RISK1',
        name: 'リスク登録簿検証',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: null,
      },
    })
    const projectId = created.json().id as string

    // Create*SchemaはcreatedAt/updatedAtを含まない（DB既定値now()へ委譲する契約）
    const risk = await app.inject({
      method: 'POST',
      url: '/api/riskEntries',
      headers: authed(),
      payload: {
        projectId,
        title: '主要メンバーの離任リスク',
        probability: 'high',
        impact: 'high',
        status: 'open',
        response: '代替要員の育成を前倒しする',
        ownerMemberId: null,
        dueDate: '2026-09-30',
      },
    })
    expect(risk.statusCode, risk.body).toBe(201)
    const riskId = risk.json().id as string
    expect(risk.json().createdAt).toBeTruthy()
    expect(risk.json().dueDate).toBe('2026-09-30')

    // 反証: 定義外のenum値はZodで400になる
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/riskEntries',
      headers: authed(),
      payload: {
        projectId,
        title: '不正な評価',
        probability: 'critical',
        impact: 'high',
        status: 'open',
      },
    })
    expect(invalid.statusCode).toBe(400)

    // 状態遷移の更新（open→closed）
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/riskEntries/${riskId}`,
      headers: authed(),
      payload: { status: 'closed' },
    })
    expect(patched.statusCode, patched.body).toBe(200)
    expect(patched.json().status).toBe('closed')

    // partnerでも読める（金額を持たないエンティティ＝financials:readのガード対象外。
    // 体制・進捗と同じ扱い。partnerユーザーは前段のテストで作成済み）
    const partnerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'partner@integration.test',
        password: 'PartnerPass123',
      },
    })
    expect(partnerLogin.statusCode).toBe(200)
    const partnerRead = await app.inject({
      method: 'GET',
      url: '/api/riskEntries',
      headers: {
        authorization: `Bearer ${partnerLogin.json().accessToken}`,
      },
    })
    expect(partnerRead.statusCode).toBe(200)
    expect(
      (partnerRead.json() as Array<{ id: string }>).some(
        (r) => r.id === riskId,
      ),
    ).toBe(true)

    // 反証: 案件を削除するとリスクも消える（ON DELETE CASCADE）
    await app.inject({
      method: 'DELETE',
      url: `/api/projects/${projectId}`,
      headers: authed(),
    })
    const after = await app.inject({
      method: 'GET',
      url: '/api/riskEntries',
      headers: authed(),
    })
    expect(
      (after.json() as Array<{ projectId: string }>).filter(
        (r) => r.projectId === projectId,
      ),
    ).toHaveLength(0)

    // 後続のexport/import往復テストの反証対象として、残存するリスクを1件作っておく
    const survivor = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'RISK2',
        name: 'リスク往復検証',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: null,
      },
    })
    const survivorRisk = await app.inject({
      method: 'POST',
      url: '/api/riskEntries',
      headers: authed(),
      payload: {
        projectId: survivor.json().id,
        title: '往復検証用リスク',
        probability: 'medium',
        impact: 'high',
        status: 'open',
      },
    })
    expect(survivorRisk.statusCode, survivorRisk.body).toBe(201)
  })

  it('見積スナップショット: 追記・投稿者スタンプ・整合検証・最新版のみ削除可・partner 403・案件削除で消える', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'EST1',
        name: '見積履歴検証',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: null,
      },
    })
    const projectId = created.json().id as string
    const basis = {
      estimatedUnitPrice: 100,
      coefficient: 1,
      workdaysPerMonth: 20,
      hoursPerDay: 8,
      hoursPerFunctionPoint: 10,
    }

    // v1: 簡易FP（概算法）。authorNameはクライアント申告を採用せずサーバーがスタンプする
    const v1 = await app.inject({
      method: 'POST',
      url: '/api/estimateSnapshots',
      headers: authed(),
      payload: {
        projectId,
        version: 1,
        stage: 'product_definition',
        method: 'function_point',
        label: '引合時の超概算',
        takenAt: '2026-09-01T00:00:00.000Z',
        effortDays: 125,
        amount: 625,
        basis,
        fp: {
          method: 'nesma_indicative',
          items: [
            { name: '顧客', type: 'ILF', count: 2 },
            { name: '外部会計', type: 'EIF', count: 2 },
          ],
          totalFp: 100,
        },
        changeRequestId: null,
        authorName: 'なりすまし太郎',
        createdAt: new Date().toISOString(),
      },
    })
    expect(v1.statusCode, v1.body).toBe(201)
    expect(v1.json().authorName).not.toBe('なりすまし太郎')
    expect(v1.json().authorName).toBeTruthy()
    // 根拠（jsonb）・数値（numeric→number）・takenAt（text）がそのまま往復する
    expect(v1.json().fp.totalFp).toBe(100)
    expect(v1.json().basis.hoursPerFunctionPoint).toBe(10)
    expect(v1.json().effortDays).toBe(125)
    expect(v1.json().amount).toBe(625)
    expect(v1.json().takenAt).toBe('2026-09-01T00:00:00.000Z')

    // 反証: 概算法にEI（推定法でしか数えない種別）を混ぜると400
    const invalidFp = await app.inject({
      method: 'POST',
      url: '/api/estimateSnapshots',
      headers: authed(),
      payload: {
        ...v1.json(),
        id: undefined,
        version: 2,
        fp: {
          method: 'nesma_indicative',
          items: [{ name: '登録画面', type: 'EI', count: 1 }],
          totalFp: 4,
        },
      },
    })
    expect(invalidFp.statusCode).toBe(400)

    // 反証: 実績（actual）は完了段階でしか記録できない
    const invalidActual = await app.inject({
      method: 'POST',
      url: '/api/estimateSnapshots',
      headers: authed(),
      payload: {
        projectId,
        version: 2,
        stage: 'requirements_complete',
        method: 'actual',
        label: '実績',
        takenAt: '2026-09-01T00:00:00.000Z',
        effortDays: 130,
        amount: 650,
        basis,
        changeRequestId: null,
        authorName: null,
        createdAt: new Date().toISOString(),
      },
    })
    expect(invalidActual.statusCode).toBe(400)

    // v2: WBS積み上げ
    const v2 = await app.inject({
      method: 'POST',
      url: '/api/estimateSnapshots',
      headers: authed(),
      payload: {
        projectId,
        version: 2,
        stage: 'requirements_complete',
        method: 'wbs',
        label: '要件確定後のWBS',
        takenAt: '2026-10-01T00:00:00.000Z',
        effortDays: 130,
        amount: 650,
        basis: { ...basis, hoursPerFunctionPoint: undefined },
        wbs: { leafCount: 12, totalEffortDays: 130 },
        changeRequestId: null,
        authorName: null,
        createdAt: new Date().toISOString(),
      },
    })
    expect(v2.statusCode, v2.body).toBe(201)

    // 反証: 同じ版番号の再投入はunique制約で409（追記の連番が壊れない）
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/estimateSnapshots',
      headers: authed(),
      payload: { ...v2.json(), id: undefined },
    })
    expect(duplicate.statusCode).toBe(409)

    // 反証: 途中の版（v1）は削除できない（履歴の連番を壊さない）
    const deleteOld = await app.inject({
      method: 'DELETE',
      url: `/api/estimateSnapshots/${v1.json().id}`,
      headers: authed(),
    })
    expect(deleteOld.statusCode).toBe(400)
    // 最新版（v2）は削除できる
    const deleteLatest = await app.inject({
      method: 'DELETE',
      url: `/api/estimateSnapshots/${v2.json().id}`,
      headers: authed(),
    })
    expect(deleteLatest.statusCode).toBe(204)

    // 反証: 金額を持つためpartnerは一覧を読めない（403）
    const partnerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'partner@integration.test',
        password: 'PartnerPass123',
      },
    })
    expect(partnerLogin.statusCode).toBe(200)
    const partnerRead = await app.inject({
      method: 'GET',
      url: '/api/estimateSnapshots',
      headers: {
        authorization: `Bearer ${partnerLogin.json().accessToken}`,
      },
    })
    expect(partnerRead.statusCode).toBe(403)

    // 反証: 案件を削除すると記録も消える（案件に付随する履歴のため）
    await app.inject({
      method: 'DELETE',
      url: `/api/projects/${projectId}`,
      headers: authed(),
    })
    const after = await app.inject({
      method: 'GET',
      url: '/api/estimateSnapshots',
      headers: authed(),
    })
    expect(
      (after.json() as Array<{ projectId: string }>).filter(
        (s) => s.projectId === projectId,
      ),
    ).toHaveLength(0)

    // export/import往復テスト用に生き残る記録を1件作る
    const survivor = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'EST2',
        name: '見積往復検証',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: null,
      },
    })
    const survivorEstimate = await app.inject({
      method: 'POST',
      url: '/api/estimateSnapshots',
      headers: authed(),
      payload: {
        projectId: survivor.json().id,
        version: 1,
        stage: 'initial_concept',
        method: 'manual',
        label: '往復検証用の見積',
        takenAt: '2026-09-01T00:00:00.000Z',
        effortDays: 10,
        amount: 50,
        basis,
        changeRequestId: null,
        authorName: null,
        createdAt: new Date().toISOString(),
      },
    })
    expect(survivorEstimate.statusCode, survivorEstimate.body).toBe(201)
  })

  it('案件の既定接続（externalConnectionId）がGET往復し、弱参照として扱われる', async () => {
    const { db } = await import('../../db/client.js')
    const { externalToolConnections, projects: projectsTable } = await import(
      '../../db/schema.js'
    )
    const { eq } = await import('drizzle-orm')

    // 接続を直接作る（APIはusers:manage限定・トークン暗号化が絡むため）
    const [connection] = await db
      .insert(externalToolConnections)
      .values({
        tool: 'github',
        name: 'E2E用GitHub',
        baseUrl: null,
        apiTokenEncrypted: 'dummy',
        targetConfig: { tool: 'github', owner: 'acme', repo: 'app' },
        enabled: true,
      })
      .returning({ id: externalToolConnections.id })
    const connectionId = connection?.id as string

    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'EXTCONN1',
        name: '既定接続テスト',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: null,
        externalConnectionId: connectionId,
      },
    })
    expect(created.statusCode, created.body).toBe(201)
    expect(created.json().externalConnectionId).toBe(connectionId)
    const projectId = created.json().id

    // GETでも往復する
    const list = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: authed(),
    })
    const found = (list.json() as Array<{ id: string }>).find(
      (p) => p.id === projectId,
    ) as { externalConnectionId?: string } | undefined
    expect(found?.externalConnectionId).toBe(connectionId)

    // nullでクリアできる
    const cleared = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}`,
      headers: authed(),
      payload: { externalConnectionId: null },
    })
    expect(cleared.statusCode, cleared.body).toBe(200)
    expect(cleared.json().externalConnectionId).toBeNull()

    // 反証: **FKを張っていない弱参照**なので、接続を削除しても案件は消えない。
    // （業務テーブルからサーバー専用エンティティへFKを張ると、importの
    //   TRUNCATE CASCADEの影響範囲が読めなくなる。users.member_idと同じ整理）
    await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}`,
      headers: authed(),
      payload: { externalConnectionId: connectionId },
    })
    await db
      .delete(externalToolConnections)
      .where(eq(externalToolConnections.id, connectionId))

    const [survived] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
    expect(survived, '接続を削除したら案件まで消えた').toBeTruthy()
    // 参照は残るがUI側が未設定として扱う（存在しないidを引いてもnullになる）
    expect(survived?.externalConnectionId).toBe(connectionId)

    await app.inject({
      method: 'DELETE',
      url: `/api/projects/${projectId}`,
      headers: authed(),
    })
  })

  it('taskSyncLogsは追記専用で、外部参照フィールドがGET往復する', async () => {
    // 外部参照つきプロジェクト（完了同期の学習保存を模す）
    const withExternal = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'EXT1',
        name: '外部参照テスト',
        parentId: null,
        level: 0,
        status: 'not_started',
        confidence: null,
        divisionId: null,
        externalSource: 'backlog',
        externalTaskId: 'PORTAL-101',
      },
    })
    expect(withExternal.statusCode, withExternal.body).toBe(201)
    expect(withExternal.json().externalSource).toBe('backlog')
    expect(withExternal.json().externalTaskId).toBe('PORTAL-101')

    const logRes = await app.inject({
      method: 'POST',
      url: '/api/taskSyncLogs',
      headers: authed(),
      payload: {
        syncedAt: '2026-10-10T09:00:00.000Z',
        channel: 'csv',
        source: 'backlog',
        fileName: 'portal-issues.csv',
        completedCount: 2,
        reopenedCount: 0,
        unchangedCount: 1,
        skippedCount: 1,
        skippedReasons: [{ row: 3, reason: 'タスクを特定できません' }],
        note: null,
      },
    })
    expect(logRes.statusCode, logRes.body).toBe(201)
    const logId = logRes.json().id

    // 反証: 追記専用のためPATCH/DELETEルート自体が存在しない
    const patchLog = await app.inject({
      method: 'PATCH',
      url: `/api/taskSyncLogs/${logId}`,
      headers: authed(),
      payload: { note: '改ざん' },
    })
    expect(patchLog.statusCode).toBe(404)
    const deleteLog = await app.inject({
      method: 'DELETE',
      url: `/api/taskSyncLogs/${logId}`,
      headers: authed(),
    })
    expect(deleteLog.statusCode).toBe(404)
  })

  it('Webhook受信: シークレット認証・generic適用・外部ID学習・冪等（Phase 2）', async () => {
    const SECRET = 'webhook-secret-for-integration-test'

    // 準備: WBSツリー（ルート＋リーフタスク）
    const root = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'WH1',
        name: 'Webhookテスト案件',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: null,
      },
    })
    const rootId = root.json().id
    const task = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'WH1-01',
        name: 'Webhook設計タスク',
        parentId: rootId,
        level: 1,
        status: 'active',
        confidence: null,
        divisionId: null,
        completed: false,
      },
    })
    const taskId = task.json().id

    // 反証: シークレット無し・不正シークレットは401（本文は評価されない）
    const noSecret = await app.inject({
      method: 'POST',
      url: '/api/webhooks/tasks/generic',
      payload: { subject: '[WH1-01] x', completed: true },
    })
    expect(noSecret.statusCode).toBe(401)
    const badSecret = await app.inject({
      method: 'POST',
      url: `/api/webhooks/tasks/generic?secret=wrong`,
      payload: { subject: '[WH1-01] x', completed: true },
    })
    expect(badSecret.statusCode).toBe(401)

    // 反証: 未知のsourceは404
    const unknown = await app.inject({
      method: 'POST',
      url: `/api/webhooks/tasks/trello?secret=${SECRET}`,
      payload: {},
    })
    expect(unknown.statusCode).toBe(404)

    // generic: 完了イベント→適用＋外部ID学習
    const applied = await app.inject({
      method: 'POST',
      url: `/api/webhooks/tasks/generic?secret=${SECRET}`,
      payload: {
        taskKey: 'EXT-42',
        subject: '[WH1-01] Webhook設計タスク',
        completed: true,
        completedAt: '2026-10-03',
      },
    })
    expect(applied.statusCode, applied.body).toBe(200)
    expect(applied.json()).toMatchObject({ applied: 1, skipped: 0 })

    const afterApply = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: authed(),
    })
    const updated = afterApply
      .json()
      .find((p: { id: string }) => p.id === taskId)
    expect(updated.completed).toBe(true)
    expect(updated.completedAt).toBe('2026-10-03')
    expect(updated.externalSource).toBe('generic')
    expect(updated.externalTaskId).toBe('EXT-42')

    // ログ（channel=webhook）が追記される
    const logs1 = await app.inject({
      method: 'GET',
      url: '/api/taskSyncLogs',
      headers: authed(),
    })
    const webhookLogs1 = logs1
      .json()
      .filter((l: { channel: string }) => l.channel === 'webhook')
    expect(webhookLogs1.length).toBe(1)
    expect(webhookLogs1[0]).toMatchObject({
      source: 'generic',
      fileName: null,
      completedCount: 1,
    })

    // 核心の反証（冪等）: 同一イベントの再送は変化なしに収束し、ログも増えない
    const resend = await app.inject({
      method: 'POST',
      url: `/api/webhooks/tasks/generic?secret=${SECRET}`,
      payload: {
        taskKey: 'EXT-42',
        subject: '[WH1-01] Webhook設計タスク',
        completed: true,
        completedAt: '2026-10-03',
      },
    })
    expect(resend.statusCode).toBe(200)
    expect(resend.json()).toMatchObject({ applied: 0, unchanged: 1 })
    const logs2 = await app.inject({
      method: 'GET',
      url: '/api/taskSyncLogs',
      headers: authed(),
    })
    expect(
      logs2.json().filter((l: { channel: string }) => l.channel === 'webhook')
        .length,
    ).toBe(1)

    // 学習済み外部ID優先: 件名からコードが消えても追跡できる（未完了へ戻すイベント）
    const renamed = await app.inject({
      method: 'POST',
      url: `/api/webhooks/tasks/generic?secret=${SECRET}`,
      payload: {
        taskKey: 'EXT-42',
        subject: '改名されたタスク名',
        completed: false,
      },
    })
    expect(renamed.statusCode).toBe(200)
    expect(renamed.json()).toMatchObject({ reopened: 1 })
    const afterReopen = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: authed(),
    })
    const reopenedTask = afterReopen
      .json()
      .find((p: { id: string }) => p.id === taskId)
    expect(reopenedTask.completed).toBe(false)
    expect(reopenedTask.completedAt ?? null).toBeNull()

    // 反証: 突合不能は202で受理し、skipログへ記録する（4xxを返さない）
    const unresolved = await app.inject({
      method: 'POST',
      url: `/api/webhooks/tasks/generic?secret=${SECRET}`,
      payload: { subject: '存在しないタスク', completed: true },
    })
    expect(unresolved.statusCode).toBe(202)
    expect(unresolved.json()).toMatchObject({ skipped: 1 })
    const logs3 = await app.inject({
      method: 'GET',
      url: '/api/taskSyncLogs',
      headers: authed(),
    })
    const skipLog = logs3
      .json()
      .filter(
        (l: { channel: string; skippedCount: number }) =>
          l.channel === 'webhook' && l.skippedCount > 0,
      )
    expect(skipLog.length).toBe(1)
  })

  it('Webhook受信: backlog/jiraアダプタのペイロード正規化（Phase 2）', async () => {
    const SECRET = 'webhook-secret-for-integration-test'

    const root = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'WH2',
        name: 'アダプタテスト案件',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: null,
      },
    })
    const rootId = root.json().id
    const task = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'WH2-01',
        name: 'アダプタ設計',
        parentId: rootId,
        level: 1,
        status: 'active',
        confidence: null,
        divisionId: null,
        completed: false,
      },
    })
    const taskId = task.json().id

    // Backlog: 課題更新（type=2）。完了判定はchanges配列のstatus変更が一次情報
    // （公式確認済みのペイロード構造。content.statusは存在未確認のためフォールバック）
    const backlogEvent = await app.inject({
      method: 'POST',
      url: `/api/webhooks/tasks/backlog?secret=${SECRET}`,
      payload: {
        type: 2,
        created: '2026-10-05T10:00:00Z',
        project: { projectKey: 'PORTAL' },
        content: {
          key_id: 123,
          summary: '[WH2-01] アダプタ設計',
          changes: [
            { field: 'status', old_value: '処理中', new_value: '完了' },
          ],
        },
      },
    })
    expect(backlogEvent.statusCode, backlogEvent.body).toBe(200)
    expect(backlogEvent.json()).toMatchObject({ applied: 1 })

    const afterBacklog = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: authed(),
    })
    const updated = afterBacklog
      .json()
      .find((p: { id: string }) => p.id === taskId)
    expect(updated.completed).toBe(true)
    expect(updated.completedAt).toBe('2026-10-05')
    expect(updated.externalSource).toBe('backlog')
    expect(updated.externalTaskId).toBe('PORTAL-123')

    // カスタム完了語彙（TASK_WEBHOOK_BACKLOG_DONE_STATUSES='完了,Closed'）:
    // 英語UI等の'Closed'でも完了と判定される（の負債解消）。
    // いったん未完了へ戻してからClosedイベントを送る
    await app.inject({
      method: 'PATCH',
      url: `/api/projects/${taskId}`,
      headers: authed(),
      payload: { completed: false, completedAt: null },
    })
    const closedEvent = await app.inject({
      method: 'POST',
      url: `/api/webhooks/tasks/backlog?secret=${SECRET}`,
      payload: {
        type: 2,
        created: '2026-10-06T10:00:00Z',
        project: { projectKey: 'PORTAL' },
        content: {
          key_id: 123,
          summary: '[WH2-01] アダプタ設計',
          changes: [
            { field: 'status', old_value: 'In Progress', new_value: 'Closed' },
          ],
        },
      },
    })
    expect(closedEvent.statusCode, closedEvent.body).toBe(200)
    expect(closedEvent.json()).toMatchObject({ applied: 1 })
    const afterClosed = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: authed(),
    })
    expect(
      afterClosed.json().find((p: { id: string }) => p.id === taskId).completed,
    ).toBe(true)

    // 反証: コメント追加イベント（type=3）は完了状態と無関係のため202で無視
    const comment = await app.inject({
      method: 'POST',
      url: `/api/webhooks/tasks/backlog?secret=${SECRET}`,
      payload: {
        type: 3,
        project: { projectKey: 'PORTAL' },
        content: { key_id: 123, summary: 'x' },
      },
    })
    expect(comment.statusCode).toBe(202)
    expect(comment.json()).toMatchObject({ ignored: true })

    // 反証: 状態変更を含まない課題更新（説明の編集等、changesにstatusが無い）も202で無視
    const nonStatusUpdate = await app.inject({
      method: 'POST',
      url: `/api/webhooks/tasks/backlog?secret=${SECRET}`,
      payload: {
        type: 2,
        project: { projectKey: 'PORTAL' },
        content: {
          key_id: 123,
          summary: '[WH2-01] アダプタ設計',
          changes: [{ field: 'description', new_value: '説明変更' }],
        },
      },
    })
    expect(nonStatusUpdate.statusCode).toBe(202)
    expect(nonStatusUpdate.json()).toMatchObject({ ignored: true })

    // Jira: statusCategory.key==='done'で完了判定（ステータス名に依存しない）
    // content.statusフォールバック経路の反証（changes無し・status直下のみのペイロード）
    const jiraEvent = await app.inject({
      method: 'POST',
      url: `/api/webhooks/tasks/backlog?secret=${SECRET}`,
      payload: {
        type: 2,
        created: '2026-10-06T09:00:00Z',
        project: { projectKey: 'PORTAL' },
        content: {
          key_id: 123,
          summary: '[WH2-01] アダプタ設計',
          status: { name: '処理中' },
        },
      },
    })
    // Backlogで未完了へ戻してからJiraイベントで再完了させ、両アダプタの独立性を確認
    expect(jiraEvent.json()).toMatchObject({ reopened: 1 })

    const jiraDone = await app.inject({
      method: 'POST',
      url: `/api/webhooks/tasks/jira?secret=${SECRET}`,
      payload: {
        webhookEvent: 'jira:issue_updated',
        issue: {
          key: 'PJ-9',
          fields: {
            summary: '[WH2-01] アダプタ設計',
            status: { statusCategory: { key: 'done' } },
            resolutiondate: '2026-10-07T12:00:00.000+0900',
          },
        },
      },
    })
    expect(jiraDone.statusCode, jiraDone.body).toBe(200)
    expect(jiraDone.json()).toMatchObject({ applied: 1 })
    const afterJira = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: authed(),
    })
    const jiraUpdated = afterJira
      .json()
      .find((p: { id: string }) => p.id === taskId)
    expect(jiraUpdated.completed).toBe(true)
    expect(jiraUpdated.completedAt).toBe('2026-10-07')
    // 反証: jiraソースの学習はbacklogの学習を上書きする（最後に同期したツールが一次）
    expect(jiraUpdated.externalSource).toBe('jira')
    expect(jiraUpdated.externalTaskId).toBe('PJ-9')

    // 反証: 対象外のwebhookEventは202
    const jiraOther = await app.inject({
      method: 'POST',
      url: `/api/webhooks/tasks/jira?secret=${SECRET}`,
      payload: {
        webhookEvent: 'comment_created',
        issue: {
          key: 'PJ-9',
          fields: { summary: 'x', status: { statusCategory: { key: 'done' } } },
        },
      },
    })
    expect(jiraOther.statusCode).toBe(202)
  })

  it('Webhook受信: githubアダプタ（issues closed/reopened・ping・冪等）', async () => {
    const SECRET = 'webhook-secret-for-integration-test'

    const root = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'GH1',
        name: 'GitHub連携案件',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: null,
      },
    })
    const rootId = root.json().id
    const task = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'GH1-01',
        name: 'ログイン機能',
        parentId: rootId,
        level: 1,
        status: 'active',
        confidence: null,
        divisionId: null,
        completed: false,
      },
    })
    const taskId = task.json().id

    const getTask = async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/projects',
        headers: authed(),
      })
      return res.json().find((p: { id: string }) => p.id === taskId)
    }
    const githubPost = (payload: unknown, event = 'issues', secret = SECRET) =>
      app.inject({
        method: 'POST',
        url: `/api/webhooks/tasks/github?secret=${secret}`,
        headers: { 'x-github-event': event },
        payload: payload as Record<string, unknown>,
      })

    const closedPayload = {
      action: 'closed',
      repository: { full_name: 'acme/webapp' },
      issue: {
        number: 123,
        title: '[GH1-01] ログイン機能',
        closed_at: '2026-10-08T12:34:56Z',
      },
    }

    // 反証: シークレット不一致は401（ヘッダが正しくても認証は通さない）
    const wrongSecret = await githubPost(closedPayload, 'issues', 'wrong')
    expect(wrongSecret.statusCode).toBe(401)

    // ① closed → completed/completedAt反映＋外部ID`owner/repo#123`の学習
    const closed = await githubPost(closedPayload)
    expect(closed.statusCode, closed.body).toBe(200)
    expect(closed.json()).toMatchObject({ applied: 1 })
    const afterClosed = await getTask()
    expect(afterClosed.completed).toBe(true)
    expect(afterClosed.completedAt).toBe('2026-10-08')
    expect(afterClosed.externalSource).toBe('github')
    expect(afterClosed.externalTaskId).toBe('acme/webapp#123')

    // ③ 反証: 同一イベントの再送は変化なしに収束し、ログも増えない（冪等）
    const logsBefore = await app.inject({
      method: 'GET',
      url: '/api/taskSyncLogs',
      headers: authed(),
    })
    const logCountBefore = logsBefore.json().length
    const resend = await githubPost(closedPayload)
    expect(resend.statusCode).toBe(200)
    expect(resend.json()).toMatchObject({ applied: 0, unchanged: 1 })
    const logsAfter = await app.inject({
      method: 'GET',
      url: '/api/taskSyncLogs',
      headers: authed(),
    })
    expect(logsAfter.json().length).toBe(logCountBefore)

    // ⑦ 反証: 学習済み外部IDが件名改変に勝つ（GitHub側でタイトルからコードが消えても追える）
    const renamed = await githubPost({
      action: 'reopened',
      repository: { full_name: 'acme/webapp' },
      issue: { number: 123, title: 'ログイン機能（コード無しへ改名）' },
    })
    expect(renamed.statusCode, renamed.body).toBe(200)
    expect(renamed.json()).toMatchObject({ reopened: 1 })
    const afterReopen = await getTask()
    // ② reopened → completed=false（完了日もクリア）
    expect(afterReopen.completed).toBe(false)
    expect(afterReopen.completedAt).toBeNull()

    // ④ ping（Webhook登録時の疎通確認）は202で受理し、タスクは不変
    const ping = await githubPost({ zen: 'Design for failure.' }, 'ping')
    expect(ping.statusCode).toBe(202)
    expect(ping.json()).toMatchObject({ ignored: true })
    expect((await getTask()).completed).toBe(false)

    // ⑤ 反証: issues以外のイベント・完了と無関係なactionは202 ignored
    const push = await githubPost({ ref: 'refs/heads/main' }, 'push')
    expect(push.statusCode).toBe(202)
    const labeled = await githubPost({
      action: 'labeled',
      repository: { full_name: 'acme/webapp' },
      issue: { number: 123, title: '[GH1-01] ログイン機能' },
    })
    expect(labeled.statusCode).toBe(202)
    expect(labeled.json()).toMatchObject({ ignored: true })
    expect((await getTask()).completed).toBe(false)

    // 完了日が無いcloseは受信日（today）で補完される
    const noClosedAt = await githubPost({
      action: 'closed',
      repository: { full_name: 'acme/webapp' },
      issue: { number: 123, title: '[GH1-01] ログイン機能', closed_at: null },
    })
    expect(noClosedAt.json()).toMatchObject({ applied: 1 })
    expect((await getTask()).completedAt).toBe(
      new Date().toISOString().slice(0, 10),
    )
  })

  it('Webhook受信: asanaのハンドシェイクとAPIフェッチ（Phase 2）', async () => {
    const SECRET = 'webhook-secret-for-integration-test'

    // ハンドシェイク: X-Hook-Secretヘッダをエコー応答する
    const handshake = await app.inject({
      method: 'POST',
      url: `/api/webhooks/tasks/asana?secret=${SECRET}`,
      headers: { 'x-hook-secret': 'asana-hook-secret-123' },
      payload: {},
    })
    expect(handshake.statusCode).toBe(200)
    expect(handshake.headers['x-hook-secret']).toBe('asana-hook-secret-123')

    // 準備: タスク
    const root = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'WH3',
        name: 'Asanaテスト案件',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: null,
      },
    })
    const task = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'WH3-01',
        name: 'Asana設計',
        parentId: root.json().id,
        level: 1,
        status: 'active',
        confidence: null,
        divisionId: null,
        completed: false,
      },
    })
    const taskId = task.json().id

    // イベント通知には詳細が載らないため、Asana APIフェッチをスタブする
    const fetchStub = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          gid: '120001',
          name: '[WH3-01] Asana設計',
          completed: true,
          completed_at: '2026-10-08T03:00:00.000Z',
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchStub)
    try {
      const asanaEvent = await app.inject({
        method: 'POST',
        url: `/api/webhooks/tasks/asana?secret=${SECRET}`,
        payload: {
          events: [
            {
              action: 'changed',
              resource: { gid: '120001', resource_type: 'task' },
            },
            // 反証: 同一タスクの重複イベントはフェッチ1回へ集約される
            {
              action: 'changed',
              resource: { gid: '120001', resource_type: 'task' },
            },
            // タスク以外のイベントは無視される
            {
              action: 'changed',
              resource: { gid: '999', resource_type: 'story' },
            },
          ],
        },
      })
      expect(asanaEvent.statusCode, asanaEvent.body).toBe(200)
      expect(asanaEvent.json()).toMatchObject({ applied: 1 })
      expect(fetchStub).toHaveBeenCalledTimes(1)
      expect(String(fetchStub.mock.calls[0]?.[0])).toContain('/tasks/120001')
    } finally {
      vi.unstubAllGlobals()
    }

    const after = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: authed(),
    })
    const updated = after.json().find((p: { id: string }) => p.id === taskId)
    expect(updated.completed).toBe(true)
    expect(updated.completedAt).toBe('2026-10-08')
    expect(updated.externalSource).toBe('asana')
    expect(updated.externalTaskId).toBe('120001')
  })

  it('csvMappingProfilesのCRUD一巡（クライアント指定id・部分更新、Phase A）', async () => {
    const clientId = crypto.randomUUID()
    const created = await app.inject({
      method: 'POST',
      url: '/api/csvMappingProfiles',
      headers: authed(),
      payload: {
        id: clientId,
        name: '会計ソフト向け請求',
        sourceKey: 'billing',
        direction: 'export',
        columns: [
          { field: 'projectCode', header: '伝票番号', enabled: true, order: 0 },
          { field: 'amount', header: '金額', enabled: true, order: 1 },
        ],
        includeHeader: false,
      },
    })
    expect(created.statusCode, created.body).toBe(201)
    expect(created.json().id).toBe(clientId)
    expect(created.json().includeHeader).toBe(false)

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/csvMappingProfiles/${clientId}`,
      headers: authed(),
      payload: { name: '改名後プロファイル' },
    })
    expect(patched.statusCode, patched.body).toBe(200)
    // 反証: 部分更新でcolumns等の他フィールドが消えない
    expect(patched.json().columns).toHaveLength(2)

    const list = await app.inject({
      method: 'GET',
      url: '/api/csvMappingProfiles',
      headers: authed(),
    })
    expect(list.json()).toContainEqual(
      expect.objectContaining({ id: clientId, name: '改名後プロファイル' }),
    )
    // このプロファイルは後続のexport/import往復テストの反証対象として残す
  })

  it('通知配信: 暗号化保存・kindフィルタ・1チャンネル失敗の非波及・ログ記録（Phase 3 Phase A）', async () => {
    const { db } = await import('../../db/client.js')
    const { notificationChannels, notificationLogs } = await import(
      '../../db/schema.js'
    )
    const { encryptSecret, decryptSecret } = await import(
      '../../auth/crypto.js'
    )
    const { dispatchNotification } = await import(
      '../../notifications/dispatch.js'
    )
    const { eq } = await import('drizzle-orm')

    const slackUrl = 'https://hooks.slack.com/services/INT/TEST/1'
    const discordUrl = 'https://discord.com/api/webhooks/INT/2'
    const failUrl = 'https://example.com/failing-hook'

    const inserted = await db
      .insert(notificationChannels)
      .values([
        {
          name: 'イベント用Slack',
          provider: 'slack' as const,
          webhookUrlEncrypted: encryptSecret(slackUrl),
          enabled: true,
          notifyEvents: true,
          notifyDigest: false,
        },
        {
          name: 'ダイジェスト用Discord',
          provider: 'discord' as const,
          webhookUrlEncrypted: encryptSecret(discordUrl),
          enabled: true,
          notifyEvents: false,
          notifyDigest: true,
        },
        {
          name: '無効化済みチャンネル',
          provider: 'teams' as const,
          webhookUrlEncrypted: encryptSecret('https://prod.logic.azure.com/x'),
          enabled: false,
          notifyEvents: true,
          notifyDigest: true,
        },
        {
          name: '失敗するgeneric',
          provider: 'generic' as const,
          webhookUrlEncrypted: encryptSecret(failUrl),
          enabled: true,
          notifyEvents: true,
          notifyDigest: false,
        },
      ])
      .returning()
    const slackChannel = inserted.find((c) => c.provider === 'slack')
    const discordChannel = inserted.find((c) => c.provider === 'discord')
    const failChannel = inserted.find((c) => c.provider === 'generic')
    if (!slackChannel || !discordChannel || !failChannel) {
      throw new Error('チャンネルのinsertに失敗')
    }

    // 反証: Webhook URLは平文でDBに保存されない（暗号化at-rest）。復号すると元に戻る
    expect(slackChannel.webhookUrlEncrypted).not.toBe(slackUrl)
    expect(slackChannel.webhookUrlEncrypted).not.toContain('hooks.slack.com')
    expect(decryptSecret(slackChannel.webhookUrlEncrypted ?? '')).toBe(slackUrl)

    const calledUrls: string[] = []
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = String(url)
      calledUrls.push(u)
      if (u === failUrl) throw new Error('ECONNREFUSED (integration)')
      return {
        status: u === discordUrl ? 204 : 200,
        headers: new Headers(),
      } as Response
    }) as unknown as typeof fetch

    // kind='event': slack + 失敗generic のみが対象（discordはdigest専用・teamsは無効）。
    // 反証: genericの送信例外が他チャンネルの配信・呼び出し元を巻き込まない（throwしない）
    await dispatchNotification(
      'event',
      {
        title: '統合テストイベント',
        severity: 'warning',
        lines: ['案件A: 納期超過'],
      },
      { fetchImpl, retryDelayMs: 0 },
    )
    expect(calledUrls).toContain(slackUrl)
    expect(calledUrls).toContain(failUrl)
    expect(calledUrls).not.toContain(discordUrl)

    const eventLogs = await db
      .select()
      .from(notificationLogs)
      .where(eq(notificationLogs.kind, 'event'))
    expect(eventLogs).toHaveLength(2)
    const slackLog = eventLogs.find((l) => l.channelId === slackChannel.id)
    const failLog = eventLogs.find((l) => l.channelId === failChannel.id)
    expect(slackLog).toMatchObject({ ok: true, subject: '統合テストイベント' })
    expect(failLog?.ok).toBe(false)
    expect(failLog?.detail).toContain('ECONNREFUSED')

    // kind='digest': discordのみが対象（イベント専用チャンネルには送らない）
    calledUrls.length = 0
    await dispatchNotification(
      'digest',
      { title: '日次ダイジェスト', severity: 'info', lines: ['アラート3件'] },
      { fetchImpl, retryDelayMs: 0 },
    )
    expect(calledUrls).toEqual([discordUrl])
    const digestLogs = await db
      .select()
      .from(notificationLogs)
      .where(eq(notificationLogs.kind, 'digest'))
    expect(digestLogs).toHaveLength(1)
    expect(digestLogs[0]).toMatchObject({
      channelId: discordChannel.id,
      ok: true,
    })

    // チャンネル削除でログもカスケード削除される（FK ON DELETE CASCADE）
    await db
      .delete(notificationChannels)
      .where(eq(notificationChannels.id, discordChannel.id))
    const orphanLogs = await db
      .select()
      .from(notificationLogs)
      .where(eq(notificationLogs.channelId, discordChannel.id))
    expect(orphanLogs).toHaveLength(0)

    // 後続テスト（即時イベント通知等）が本テストのチャンネルへ誤送信しないよう掃除する
    for (const channel of inserted) {
      await db
        .delete(notificationChannels)
        .where(eq(notificationChannels.id, channel.id))
    }
  })

  it('通知チャンネル管理API: シークレット非返却・3値PATCH・テスト送信・権限境界（Phase 3 Phase B）', async () => {
    // editor（users:manage無し）は全エンドポイント403
    const editorLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'editor@integration.test', password: 'EditorPass123' },
    })
    const editorToken = editorLogin.json().accessToken
    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/notificationChannels',
      headers: { authorization: `Bearer ${editorToken}` },
    })
    expect(forbidden.statusCode).toBe(403)

    // 作成: webhookUrlを平文で送る→レスポンスにはシークレットを一切含まない（設定済みフラグのみ）
    const created = await app.inject({
      method: 'POST',
      url: '/api/notificationChannels',
      headers: authed(),
      payload: {
        name: '管理APIテストSlack',
        provider: 'slack',
        webhookUrl: 'https://hooks.slack.com/services/ADMIN/API/TEST',
        notifyDigest: false,
      },
    })
    expect(created.statusCode).toBe(201)
    const channel = created.json().channel
    expect(channel.webhookUrlConfigured).toBe(true)
    expect(channel.apiTokenConfigured).toBe(false)
    // 反証: レスポンス全文に平文URL・暗号文キーが現れない
    expect(created.body).not.toContain('hooks.slack.com')
    expect(created.body).not.toContain('Encrypted')

    const listed = await app.inject({
      method: 'GET',
      url: '/api/notificationChannels',
      headers: authed(),
    })
    expect(listed.statusCode).toBe(200)
    expect(listed.body).not.toContain('hooks.slack.com')

    // 反証: webhookUrlを送らないPATCH（名前変更のみ）ではシークレットが消えない（undefined=変更なし）
    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/notificationChannels/${channel.id}`,
      headers: authed(),
      payload: { name: '改名後Slack' },
    })
    expect(renamed.statusCode).toBe(200)
    expect(renamed.json().channel.webhookUrlConfigured).toBe(true)

    // テスト送信: fetchスタブで成功させ、kind='test'のログが残る
    const fetchStub = vi.fn(
      async () => ({ status: 200, headers: new Headers() }) as Response,
    )
    vi.stubGlobal('fetch', fetchStub)
    try {
      const testRes = await app.inject({
        method: 'POST',
        url: `/api/notificationChannels/${channel.id}/test`,
        headers: authed(),
      })
      expect(testRes.statusCode).toBe(200)
      expect(testRes.json()).toEqual({ ok: true, detail: null })
      // 復号された平文URLへ送信されている
      expect(fetchStub.mock.calls[0]?.[0]).toBe(
        'https://hooks.slack.com/services/ADMIN/API/TEST',
      )
    } finally {
      vi.unstubAllGlobals()
    }
    const logsRes = await app.inject({
      method: 'GET',
      url: '/api/notificationLogs?limit=10',
      headers: authed(),
    })
    expect(logsRes.statusCode).toBe(200)
    const testLog = logsRes
      .json()
      .logs.find(
        (l: { channelId: string; kind: string }) =>
          l.channelId === channel.id && l.kind === 'test',
      )
    expect(testLog).toMatchObject({ ok: true, channelName: '改名後Slack' })

    // null=クリア: webhookUrl: nullで設定解除
    const cleared = await app.inject({
      method: 'PATCH',
      url: `/api/notificationChannels/${channel.id}`,
      headers: authed(),
      payload: { webhookUrl: null },
    })
    expect(cleared.json().channel.webhookUrlConfigured).toBe(false)

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/notificationChannels/${channel.id}`,
      headers: authed(),
    })
    expect(deleted.statusCode).toBe(204)
  })

  it('即時イベント通知: 月次締めPOST・CR承認PATCHで送出され、再PATCHでは再通知しない（Phase 3 Phase B）', async () => {
    const { db } = await import('../../db/client.js')
    const { notificationChannels, notificationLogs } = await import(
      '../../db/schema.js'
    )
    const { eq, like } = await import('drizzle-orm')

    const createChannel = await app.inject({
      method: 'POST',
      url: '/api/notificationChannels',
      headers: authed(),
      payload: {
        name: 'イベント通知テスト',
        provider: 'slack',
        webhookUrl: 'https://hooks.slack.com/services/EVENT/TEST',
      },
    })
    expect(createChannel.statusCode).toBe(201)
    const channelId = createChannel.json().channel.id

    const fetchStub = vi.fn(
      async () => ({ status: 200, headers: new Headers() }) as Response,
    )
    vi.stubGlobal('fetch', fetchStub)
    try {
      // 月次締めPOST → afterCreateからfire-and-forgetで通知される
      const closeRes = await app.inject({
        method: 'POST',
        url: '/api/monthlyCloseEvents',
        headers: authed(),
        payload: {
          month: '2026-01',
          action: 'close',
          reason: '通知テスト用',
          occurredAt: new Date().toISOString(),
          actorName: null,
        },
      })
      expect(closeRes.statusCode, closeRes.body).toBe(201)
      await vi.waitFor(async () => {
        const logs = await db
          .select()
          .from(notificationLogs)
          .where(eq(notificationLogs.subject, '2026-01を締めました'))
        expect(logs).toHaveLength(1)
        expect(logs[0]).toMatchObject({ channelId, kind: 'event', ok: true })
      })
      // 送信ペイロードに実行者（サーバースタンプのactorName）が含まれる
      const closeBody = String(fetchStub.mock.calls[0]?.[1]?.body ?? '')
      expect(closeBody).toContain('統合テスト管理者')

      // CR承認: pending→approvedの遷移でのみ通知される
      const project = await app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: authed(),
        payload: {
          code: 'NTFY1',
          name: '通知テスト案件',
          parentId: null,
          level: 0,
          status: 'active',
          confidence: null,
          divisionId: null,
        },
      })
      expect(project.statusCode).toBe(201)
      const cr = await app.inject({
        method: 'POST',
        url: '/api/changeRequests',
        headers: authed(),
        payload: {
          projectId: project.json().id,
          title: '通知テストCR',
          requestedAt: '2026-01-10',
          status: 'pending',
          contractAmountDelta: 300,
          contractAmountDeltaType: 'increase',
          effortDeltaDays: 0,
          effortDeltaType: 'increase',
          newDueDate: '2026-03-31',
          decidedAt: null,
        },
      })
      expect(cr.statusCode, cr.body).toBe(201)
      const crId = cr.json().id

      const approve = await app.inject({
        method: 'PATCH',
        url: `/api/changeRequests/${crId}`,
        headers: authed(),
        payload: { status: 'approved', decidedAt: '2026-01-15' },
      })
      expect(approve.statusCode).toBe(200)
      await vi.waitFor(async () => {
        const logs = await db
          .select()
          .from(notificationLogs)
          .where(like(notificationLogs.subject, '%通知テストCR%'))
        expect(logs).toHaveLength(1)
        expect(logs[0]?.subject).toBe('変更要求を承認: 通知テストCR')
      })
      // 反証: 文面に金額（受注額差分300）を含めない（決定事項7）
      const crBody = String(fetchStub.mock.calls[1]?.[1]?.body ?? '')
      expect(crBody).toContain('通知テスト案件')
      expect(crBody).toContain('2026-03-31')
      expect(crBody).not.toContain('300')

      // 反証: 承認済みCRへの再PATCH（note編集等）では再通知しない
      const editNote = await app.inject({
        method: 'PATCH',
        url: `/api/changeRequests/${crId}`,
        headers: authed(),
        payload: { note: '備考の追記' },
      })
      expect(editNote.statusCode).toBe(200)
      // fire-and-forgetの発火猶予を与えてからログ件数が増えていないことを確認
      await new Promise((resolve) => setTimeout(resolve, 300))
      const crLogs = await db
        .select()
        .from(notificationLogs)
        .where(like(notificationLogs.subject, '%通知テストCR%'))
      expect(crLogs).toHaveLength(1)
      expect(fetchStub).toHaveBeenCalledTimes(2)
    } finally {
      vi.unstubAllGlobals()
      await db
        .delete(notificationChannels)
        .where(eq(notificationChannels.id, channelId))
    }
  })

  it('日次ダイジェスト: 納期超過アラートの集約送信・同日再送防止・手動送信のバイパス（Phase 3 Phase C）', async () => {
    const { db } = await import('../../db/client.js')
    const { notificationChannels, notificationLogs } = await import(
      '../../db/schema.js'
    )
    const { sendDailyDigest } = await import('../../notifications/digest.js')
    const { and, eq } = await import('drizzle-orm')

    // 納期超過（critical）を発生させる: マスター納期が過去・未完了のトップレベル案件
    const overdue = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'DGST1',
        name: 'ダイジェスト検証案件',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: null,
        masterDueDate: '2020-01-01',
      },
    })
    expect(overdue.statusCode, overdue.body).toBe(201)
    const overdueProjectId = overdue.json().id

    // ベースライン乖離（Phase D）: WBS工数0（現行BAC=0）の案件にbacAmount>0の
    // ベースラインを凍結すると乖離警告の対象になる
    const baseline = await app.inject({
      method: 'POST',
      url: '/api/projectBaselines',
      headers: authed(),
      payload: {
        projectId: overdueProjectId,
        version: 1,
        approvedAt: '2026-01-01',
        reason: '当初計画',
        bacAmount: 1000,
        monthlyPlannedCost: {},
        plannedAllocations: [],
        createdAt: new Date().toISOString(),
      },
    })
    expect(baseline.statusCode, baseline.body).toBe(201)

    const createChannel = await app.inject({
      method: 'POST',
      url: '/api/notificationChannels',
      headers: authed(),
      payload: {
        name: 'ダイジェスト用Slack',
        provider: 'slack',
        webhookUrl: 'https://hooks.slack.com/services/DIGEST/TEST',
        notifyEvents: false,
        minSeverity: 'warning',
      },
    })
    expect(createChannel.statusCode).toBe(201)
    const channelId = createChannel.json().channel.id

    const fetchStub = vi.fn(
      async () => ({ status: 200, headers: new Headers() }) as Response,
    )
    vi.stubGlobal('fetch', fetchStub)
    try {
      // 手動送信API（force=同日再送防止バイパス）
      const manualRes = await app.inject({
        method: 'POST',
        url: '/api/notifications/digest/send',
        headers: authed(),
      })
      expect(manualRes.statusCode).toBe(200)
      const manual = manualRes.json()
      expect(manual.sent).toBe(1)
      expect(manual.alertCount).toBeGreaterThanOrEqual(2)

      const body = String(fetchStub.mock.calls[0]?.[1]?.body ?? '')
      expect(body).toContain('本日のアラート')
      expect(body).toContain('ダイジェスト検証案件')
      expect(body).toContain('2020-01-01')
      // ベースライン乖離（Phase D）も同じダイジェストに含まれる
      expect(body).toContain('ベースラインを再凍結')
      // 反証: 通知文面に具体的な金額を含めない（決定事項7。bacAmount=1000等が漏れない）
      expect(body).not.toContain('万円')
      expect(body).not.toContain('1000')

      const digestLogs = await db
        .select()
        .from(notificationLogs)
        .where(
          and(
            eq(notificationLogs.channelId, channelId),
            eq(notificationLogs.kind, 'digest'),
          ),
        )
      expect(digestLogs).toHaveLength(1)
      expect(digestLogs[0]?.ok).toBe(true)

      // 反証: スケジューラ相当の呼び出し（force無し）は同日再送防止でスキップされる
      const second = await sendDailyDigest({
        fetchImpl: fetchStub as unknown as typeof fetch,
        retryDelayMs: 0,
      })
      expect(second.sent).toBe(0)
      expect(second.skipped).toBe(1)
      expect(fetchStub).toHaveBeenCalledTimes(1)

      // 反証: 手動送信（force）は同日でも再送できる
      const third = await sendDailyDigest({
        force: true,
        fetchImpl: fetchStub as unknown as typeof fetch,
        retryDelayMs: 0,
      })
      expect(third.sent).toBe(1)
      expect(fetchStub).toHaveBeenCalledTimes(2)
    } finally {
      vi.unstubAllGlobals()
      await db
        .delete(notificationChannels)
        .where(eq(notificationChannels.id, channelId))
    }
  })

  it('公開API v1: キー発行→認証→read-only集計→失効401・OAS配信', async () => {
    // 権限境界: editorはAPIキーを発行できない
    const editorLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'editor@integration.test', password: 'EditorPass123' },
    })
    const editorToken = editorLogin.json().accessToken
    const editorDenied = await app.inject({
      method: 'POST',
      url: '/api/apiKeys',
      headers: { authorization: `Bearer ${editorToken}` },
      payload: { name: 'editor発行キー' },
    })
    expect(editorDenied.statusCode).toBe(403)

    // adminが発行→平文キーは発行時のみ返り、一覧には含まれない
    const issued = await app.inject({
      method: 'POST',
      url: '/api/apiKeys',
      headers: authed(),
      payload: { name: 'BI連携用' },
    })
    expect(issued.statusCode, issued.body).toBe(201)
    const plainKey: string = issued.json().key
    expect(plainKey).toMatch(/^rpk_[0-9a-f]{64}$/)
    const keyId = issued.json().apiKey.id

    const keyList = await app.inject({
      method: 'GET',
      url: '/api/apiKeys',
      headers: authed(),
    })
    expect(keyList.statusCode).toBe(200)
    // 反証: 一覧レスポンスのどこにも平文キー・ハッシュが現れない
    expect(keyList.body).not.toContain(plainKey)
    expect(keyList.body).not.toContain('keyHash')

    // キー無し・不正キーは401
    const noKey = await app.inject({ method: 'GET', url: '/api/v1/billing' })
    expect(noKey.statusCode).toBe(401)
    const badKey = await app.inject({
      method: 'GET',
      url: '/api/v1/billing',
      headers: { 'x-api-key': `rpk_${'0'.repeat(64)}` },
    })
    expect(badKey.statusCode).toBe(401)

    // 請求データ: 案件＋マイルストンを作成して取得（Authorization: Bearer形式も受理）
    const project = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'API1',
        name: '公開APIテスト案件',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: null,
        clientName: '株式会社外部',
      },
    })
    const milestone = await app.inject({
      method: 'POST',
      url: '/api/billingMilestones',
      headers: authed(),
      payload: {
        projectId: project.json().id,
        label: '検収時',
        amount: 500,
        plannedAcceptanceDate: '2026-06-30',
        status: 'accepted',
      },
    })
    expect(milestone.statusCode, milestone.body).toBe(201)

    const billing = await app.inject({
      method: 'GET',
      url: '/api/v1/billing',
      headers: { authorization: `Bearer ${plainKey}` },
    })
    expect(billing.statusCode, billing.body).toBe(200)
    const billingItem = billing
      .json()
      .items.find((i: { projectCode: string }) => i.projectCode === 'API1')
    expect(billingItem).toMatchObject({
      label: '検収時',
      amount: 500,
      status: '検収済',
      clientName: '株式会社外部',
    })

    // 案件別収支: 作成した案件が含まれる
    const finance = await app.inject({
      method: 'GET',
      url: '/api/v1/project-finance',
      headers: { 'x-api-key': plainKey },
    })
    expect(finance.statusCode, finance.body).toBe(200)
    expect(
      finance.json().items.some((i: { code: string }) => i.code === 'API1'),
    ).toBe(true)

    // 月次明細: 形（month/mode/items）とバリデーション
    const statement = await app.inject({
      method: 'GET',
      url: '/api/v1/statements/partner-payment?month=2026-01',
      headers: { 'x-api-key': plainKey },
    })
    expect(statement.statusCode).toBe(200)
    expect(statement.json()).toMatchObject({ month: '2026-01', mode: 'actual' })
    expect(Array.isArray(statement.json().items)).toBe(true)
    const badMonth = await app.inject({
      method: 'GET',
      url: '/api/v1/statements/client?month=2026-13',
      headers: { 'x-api-key': plainKey },
    })
    expect(badMonth.statusCode).toBe(400)

    // アラート: ダイジェストと同一判定（先行テストの納期超過案件が拾われる）
    const alerts = await app.inject({
      method: 'GET',
      url: '/api/v1/alerts',
      headers: { 'x-api-key': plainKey },
    })
    expect(alerts.statusCode).toBe(200)
    expect(alerts.json().items.length).toBeGreaterThan(0)

    // プロジェクト一覧・詳細: 子タスクを作り進捗・タスク数を反証
    const apiTask = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'API1-01',
        name: 'APIテストタスク',
        parentId: project.json().id,
        level: 1,
        status: 'active',
        confidence: null,
        divisionId: null,
        completed: true,
        completedAt: '2026-06-01',
      },
    })
    expect(apiTask.statusCode, apiTask.body).toBe(201)

    const projectList = await app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: { 'x-api-key': plainKey },
    })
    expect(projectList.statusCode, projectList.body).toBe(200)
    const listed = projectList
      .json()
      .items.find((i: { code: string }) => i.code === 'API1')
    expect(listed).toMatchObject({
      name: '公開APIテスト案件',
      clientName: '株式会社外部',
      taskCount: 1,
      completedTaskCount: 1,
      progressRate: 100,
    })
    // 反証: 一覧に金額情報（受注額等）を含めない（金額はproject-financeの責務）
    expect(listed).not.toHaveProperty('contractAmount')
    // 反証: タスク（level>0）は一覧に現れない
    expect(
      projectList
        .json()
        .items.some((i: { code: string }) => i.code === 'API1-01'),
    ).toBe(false)

    const projectDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${project.json().id}`,
      headers: { 'x-api-key': plainKey },
    })
    expect(projectDetail.statusCode, projectDetail.body).toBe(200)
    const detail = projectDetail.json()
    expect(detail.tasks).toHaveLength(1)
    expect(detail.tasks[0]).toMatchObject({
      code: 'API1-01',
      completed: true,
      completedAt: '2026-06-01',
      parentId: project.json().id,
    })
    expect(Array.isArray(detail.schedule)).toBe(true)

    // 反証: タスクのid（トップレベルでない）は404
    const notRoot = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${apiTask.json().id}`,
      headers: { 'x-api-key': plainKey },
    })
    expect(notRoot.statusCode).toBe(404)

    // EVM: まず対象外案件で年度を取得（eligible=false・金額なしの反証を兼ねる）
    const bareProject = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'API2',
        name: 'EVM対象外案件',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: null,
      },
    })
    const notEligible = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${bareProject.json().id}/evm`,
      headers: { 'x-api-key': plainKey },
    })
    expect(notEligible.statusCode).toBe(200)
    expect(notEligible.json().eligible).toBe(false)
    expect(notEligible.json().weeks).toHaveLength(0)
    expect(notEligible.json()).not.toHaveProperty('bacAmount')
    const fiscalYear: number = notEligible.json().fiscalYear

    // ベースラインを凍結（計画月は取得した年度内に置く）→ PVの終点は必ずBACに一致
    const evmBaseline = await app.inject({
      method: 'POST',
      url: '/api/projectBaselines',
      headers: authed(),
      payload: {
        projectId: project.json().id,
        version: 1,
        approvedAt: `${fiscalYear}-04-01`,
        reason: '当初計画',
        bacAmount: 1000,
        monthlyPlannedCost: {
          [`${fiscalYear}-05`]: 400,
          [`${fiscalYear}-07`]: 600,
        },
        plannedAllocations: [],
        createdAt: new Date().toISOString(),
      },
    })
    expect(evmBaseline.statusCode, evmBaseline.body).toBe(201)

    const evmFirst = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${project.json().id}/evm`,
      headers: { 'x-api-key': plainKey },
    })
    expect(evmFirst.statusCode, evmFirst.body).toBe(200)
    const evmBody = evmFirst.json()
    expect(evmBody.eligible).toBe(true)
    expect(evmBody.bacAmount).toBe(1000)
    expect(evmBody.baseline).toMatchObject({ version: 1, bacAmount: 1000 })
    expect(evmBody.weeks.length).toBeGreaterThan(50)
    // 核心の反証: 全期間経過後のPVは必ずBACに一致する（計画コスト総額に関わらずスケール）
    const lastWeek = evmBody.weeks[evmBody.weeks.length - 1]
    expect(lastWeek.pv).toBe(1000)
    expect(lastWeek.ac).toBe(0)

    // 週次進捗の手入力がEVへ反映される（進捗率50% → EV=500、直近値保持で最終週まで継続）
    const progressEntry = await app.inject({
      method: 'POST',
      url: '/api/projectProgressEntries',
      headers: authed(),
      payload: {
        projectId: project.json().id,
        weeklyProgress: { [evmBody.weeks[0].week]: 0.5 },
      },
    })
    expect(progressEntry.statusCode, progressEntry.body).toBe(201)
    const evmSecond = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${project.json().id}/evm`,
      headers: { 'x-api-key': plainKey },
    })
    expect(evmSecond.json().weeks.at(-1).ev).toBe(500)

    // 反証: 失効（enabled=false）で即401になる
    const disabled = await app.inject({
      method: 'PATCH',
      url: `/api/apiKeys/${keyId}`,
      headers: authed(),
      payload: { enabled: false },
    })
    expect(disabled.statusCode).toBe(200)
    const afterDisable = await app.inject({
      method: 'GET',
      url: '/api/v1/billing',
      headers: { 'x-api-key': plainKey },
    })
    expect(afterDisable.statusCode).toBe(401)

    // OAS仕様書は認証不要で配信される（利用者への提供物）
    const spec = await app.inject({
      method: 'GET',
      url: '/api/v1/openapi.yaml',
    })
    expect(spec.statusCode).toBe(200)
    expect(spec.body).toContain('openapi: 3.0.3')
    expect(spec.body).toContain('/api/v1/billing')
  })

  it('公開API v1: 原価4区分（労務費/外注費の分割・間接費の直接工数比例配賦）', async () => {
    const issued = await app.inject({
      method: 'POST',
      url: '/api/apiKeys',
      headers: authed(),
      payload: { name: '原価4区分テスト用' },
    })
    const plainKey: string = issued.json().key

    // 組織・メンバー: 内部リソース（companyId未設定・通常単価100万）と
    // 外部リソース（協力会社所属・契約単価80万）
    const division = await app.inject({
      method: 'POST',
      url: '/api/divisions',
      headers: authed(),
      payload: { name: '原価テスト部門', sortOrder: 90 },
    })
    expect(division.statusCode, division.body).toBe(201)
    const partner = await app.inject({
      method: 'POST',
      url: '/api/companies',
      headers: authed(),
      payload: { name: '原価テスト協力会社', sortOrder: 90, isInternal: false },
    })
    expect(partner.statusCode, partner.body).toBe(201)
    const internalMember = await app.inject({
      method: 'POST',
      url: '/api/members',
      headers: authed(),
      payload: {
        name: '原価テスト内部',
        sectionId: null,
        companyId: null,
        role: 'エンジニア',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [{ effectiveFrom: '2000-01', amount: 100 }],
        contractUnitPriceHistory: [],
      },
    })
    expect(internalMember.statusCode, internalMember.body).toBe(201)
    const externalMember = await app.inject({
      method: 'POST',
      url: '/api/members',
      headers: authed(),
      payload: {
        name: '原価テスト外部',
        sectionId: null,
        companyId: partner.json().id,
        role: 'エンジニア',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
        contractUnitPriceHistory: [{ effectiveFrom: '2000-01', amount: 80 }],
      },
    })
    expect(externalMember.statusCode, externalMember.body).toBe(201)

    // 案件（担当部門・受注額あり）＋タスク。年度はEVMエンドポイントの解決値を使う
    const root = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'COST1',
        name: '原価4区分テスト案件',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: division.json().id,
        contractAmount: 1000,
      },
    })
    expect(root.statusCode, root.body).toBe(201)
    const task = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'COST1-01',
        name: '原価テストタスク',
        parentId: root.json().id,
        level: 1,
        status: 'active',
        confidence: null,
        divisionId: null,
      },
    })
    expect(task.statusCode, task.body).toBe(201)
    const evmProbe = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${root.json().id}/evm`,
      headers: { 'x-api-key': plainKey },
    })
    const fiscalYear: number = evmProbe.json().fiscalYear

    // アサイン: 内部1.0人月・外部0.5人月（年度開始月=常に対象年度内）
    for (const [memberId, value] of [
      [internalMember.json().id, 1.0],
      [externalMember.json().id, 0.5],
    ] as const) {
      const assignment = await app.inject({
        method: 'POST',
        url: '/api/assignments',
        headers: authed(),
        payload: {
          projectId: root.json().id,
          taskId: task.json().id,
          memberId,
          monthlyValues: { [`${fiscalYear}-04`]: value },
        },
      })
      expect(assignment.statusCode, assignment.body).toBe(201)
    }

    // 間接費原資: 部門予算の一般経費に実績明細30万円
    const divisionBudget = await app.inject({
      method: 'POST',
      url: '/api/divisionBudgets',
      headers: authed(),
      payload: {
        divisionId: division.json().id,
        fiscalYear,
        initialAmount: 0,
      },
    })
    expect(divisionBudget.statusCode, divisionBudget.body).toBe(201)
    const breakdown = await app.inject({
      method: 'POST',
      url: '/api/budgetBreakdowns',
      headers: authed(),
      payload: {
        budgetId: divisionBudget.json().id,
        category: 'general_expense',
        label: '部門共通経費',
        amount: 100,
        recordedAt: `${fiscalYear}-04-01`,
      },
    })
    expect(breakdown.statusCode, breakdown.body).toBe(201)
    const record = await app.inject({
      method: 'POST',
      url: `/api/budgetBreakdowns/${breakdown.json().id}/actual-records`,
      headers: authed(),
      payload: {
        purchasedAt: `${fiscalYear}-05-10`,
        itemLabel: 'オフィス消耗品',
        amount: 30,
      },
    })
    expect(record.statusCode, record.body).toBe(201)

    const finance = await app.inject({
      method: 'GET',
      url: '/api/v1/project-finance',
      headers: { 'x-api-key': plainKey },
    })
    expect(finance.statusCode, finance.body).toBe(200)
    const row = finance
      .json()
      .items.find((i: { code: string }) => i.code === 'COST1')
    expect(row).toBeDefined()

    // 核心の恒等式: 労務費＋外注費＝実人件費（内部=通常単価・外部=契約単価で分割）
    expect(row.laborCost).toBeGreaterThan(0)
    expect(row.subcontractCost).toBeGreaterThan(0)
    expect(row.laborCost + row.subcontractCost).toBe(row.actualPersonnelCost)
    // 直接経費＝実付帯費用（4区分の語彙での再掲）
    expect(row.directExpense).toBe(row.actualExpenseCost)
    // 間接費: 部門唯一の工数保有案件のため一般経費実績30万円が全額配賦される
    expect(row.allocatedOverhead).toBe(30)
    // 配賦後利益 = 粗利 − 間接費配賦
    expect(row.netProfitAfterOverhead).toBe(row.grossProfit - 30)

    // 反証: divisionId未設定の案件は間接費配賦0・受注未設定なら配賦後利益null
    const bare = finance
      .json()
      .items.find((i: { code: string }) => i.code === 'API1')
    expect(bare.allocatedOverhead).toBe(0)
    expect(bare.netProfitAfterOverhead).toBeNull()
  })

  it('database export/importが往復できる（自己参照projectsのparentId保持を含む）', async () => {
    const exportRes = await app.inject({
      method: 'GET',
      url: '/api/database/export',
      headers: authed(),
    })
    expect(exportRes.statusCode).toBe(200)
    const exported = exportRes.json()

    const importRes = await app.inject({
      method: 'POST',
      url: '/api/database/import',
      headers: authed(),
      payload: exported,
    })
    expect(importRes.statusCode, importRes.body).toBe(204)

    const reExportRes = await app.inject({
      method: 'GET',
      url: '/api/database/export',
      headers: authed(),
    })
    expect(reExportRes.statusCode).toBe(200)
    expect(reExportRes.json().divisions.length).toBe(exported.divisions.length)

    // 反証: インポートで認証ユーザーが消えない（踏んだ回帰の防止）。
    // importは業務テーブルを`TRUNCATE ... CASCADE`で全消しするが、PostgreSQLの
    // TRUNCATE CASCADEは**参照している側のテーブルも巻き込んでTRUNCATEする**。
    // usersに業務テーブルへのFK（member_id → members）を張った瞬間、
    // 「JSONインポートしたら全ユーザーが消えてログインできない」状態になった。
    // usersが認証基盤としてimportの対象外である前提は、FKを増やすと簡単に崩れる
    const { db: verifyDb } = await import('../../db/client.js')
    const { users: usersTable } = await import('../../db/schema.js')
    const survivingUsers = await verifyDb
      .select({ email: usersTable.email })
      .from(usersTable)
    expect(
      survivingUsers.some((u) => u.email === 'admin@integration.test'),
      'importで認証ユーザーが消えている',
    ).toBe(true)

    // 反証: documentTemplatesもexport/import往復で失われない
    // （商流系エンティティがexport対象から漏れていた既存バグと同型の回帰テスト）
    expect(exported.documentTemplates.length).toBeGreaterThan(0)
    expect(reExportRes.json().documentTemplates.length).toBe(
      exported.documentTemplates.length,
    )

    // 反証: 月次実績エンティティ（P1-a）も往復で失われない
    // （先行テストで作成した確定マーク・取込ログが対象。同型の回帰テスト）
    expect(exported.monthlyActualsConfirmations.length).toBeGreaterThan(0)
    expect(exported.actualsImportLogs.length).toBeGreaterThan(0)
    expect(reExportRes.json().monthlyActualsConfirmations.length).toBe(
      exported.monthlyActualsConfirmations.length,
    )
    expect(reExportRes.json().actualsImportLogs.length).toBe(
      exported.actualsImportLogs.length,
    )
    // 締めイベント（P1-b）も往復で失われない（先行テストで作成済み）
    expect(exported.monthlyCloseEvents.length).toBeGreaterThan(0)
    expect(reExportRes.json().monthlyCloseEvents.length).toBe(
      exported.monthlyCloseEvents.length,
    )
    // 完了同期ログも往復で失われない
    expect(exported.taskSyncLogs.length).toBeGreaterThan(0)
    expect(reExportRes.json().taskSyncLogs.length).toBe(
      exported.taskSyncLogs.length,
    )
    // CSVマッピングプロファイル（Phase A）も往復で失われない
    // （商流3エンティティのexport漏れ=データ消失バグと同型の回帰反証）
    expect(exported.csvMappingProfiles.length).toBeGreaterThan(0)
    expect(reExportRes.json().csvMappingProfiles.length).toBe(
      exported.csvMappingProfiles.length,
    )
    // リスク登録簿（非公開の設計文書）も往復で失われない（先行テストで作成済み）
    expect(exported.riskEntries.length).toBeGreaterThan(0)
    expect(reExportRes.json().riskEntries.length).toBe(
      exported.riskEntries.length,
    )
    // 見積スナップショットも往復で失われない（先行テストで作成済み）
    expect(exported.estimateSnapshots.length).toBeGreaterThan(0)
    expect(reExportRes.json().estimateSnapshots.length).toBe(
      exported.estimateSnapshots.length,
    )
  })

  it('外部ツール接続API: 暗号化at-rest・3値PATCH・入力検証・RBAC境界', async () => {
    const { decryptSecret } = await import('../../auth/crypto.js')
    const { db } = await import('../../db/client.js')
    const { externalToolConnections } = await import('../../db/schema.js')
    const { eq } = await import('drizzle-orm')

    const TOKEN = 'ghp_integration_test_token_value'

    const created = await app.inject({
      method: 'POST',
      url: '/api/externalToolConnections',
      headers: authed(),
      payload: {
        tool: 'github',
        name: 'webapp用GitHub',
        apiToken: TOKEN,
        targetConfig: { owner: 'acme', repo: 'webapp' },
      },
    })
    expect(created.statusCode, created.body).toBe(201)
    const connection = created.json().connection
    expect(connection.apiTokenConfigured).toBe(true)
    // 反証: レスポンスに平文・暗号文いずれのトークンも現れない
    expect(created.body).not.toContain(TOKEN)
    expect(connection.apiToken).toBeUndefined()

    // 反証: DBには平文で保存されない（暗号化at-rest）。復号すると元に戻る
    const [row] = await db
      .select()
      .from(externalToolConnections)
      .where(eq(externalToolConnections.id, connection.id))
    expect(row?.apiTokenEncrypted).not.toBe(TOKEN)
    expect(decryptSecret(row?.apiTokenEncrypted ?? '')).toBe(TOKEN)

    // 反証: GETもトークンを返さない（設定済みフラグのみ）
    const list = await app.inject({
      method: 'GET',
      url: '/api/externalToolConnections',
      headers: authed(),
    })
    expect(list.statusCode).toBe(200)
    expect(list.body).not.toContain(TOKEN)
    expect(
      list
        .json()
        .connections.find((c: { id: string }) => c.id === connection.id)
        .apiTokenConfigured,
    ).toBe(true)

    // 反証: 名前だけのPATCH（apiToken未指定=undefined）でトークンが消えない
    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/externalToolConnections/${connection.id}`,
      headers: authed(),
      payload: { name: '名前だけ変更' },
    })
    expect(renamed.statusCode, renamed.body).toBe(200)
    expect(renamed.json().connection.apiTokenConfigured).toBe(true)
    const [afterRename] = await db
      .select()
      .from(externalToolConnections)
      .where(eq(externalToolConnections.id, connection.id))
    expect(decryptSecret(afterRename?.apiTokenEncrypted ?? '')).toBe(TOKEN)

    // null=クリア（3値セマンティクス）
    const cleared = await app.inject({
      method: 'PATCH',
      url: `/api/externalToolConnections/${connection.id}`,
      headers: authed(),
      payload: { apiToken: null },
    })
    expect(cleared.json().connection.apiTokenConfigured).toBe(false)

    // 反証: 許可ホスト以外のbaseUrlは400（SSRF面の限定）
    const badHost = await app.inject({
      method: 'POST',
      url: '/api/externalToolConnections',
      headers: authed(),
      payload: {
        tool: 'backlog',
        name: '不正ホスト',
        baseUrl: 'https://evil.example.com',
        apiToken: 'x',
      },
    })
    expect(badHost.statusCode).toBe(400)

    // 反証: 不正な起票先設定（必須項目欠落）は400
    const badTarget = await app.inject({
      method: 'POST',
      url: '/api/externalToolConnections',
      headers: authed(),
      payload: {
        tool: 'github',
        name: '不正設定',
        apiToken: 'x',
        targetConfig: { owner: 'acme' },
      },
    })
    expect(badTarget.statusCode).toBe(400)

    // 反証: editor（users:manage非保持）は接続管理を触れない（403）
    // editorユーザーは他テストでも作られるが、単独実行でも成立するよう冪等に用意する
    await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: authed(),
      payload: {
        email: 'editor@integration.test',
        name: 'editorユーザー',
        password: 'EditorPass123',
        role: 'editor',
      },
    })
    const editorLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'editor@integration.test',
        password: 'EditorPass123',
      },
    })
    const editorToken = editorLogin.json().accessToken
    expect(editorToken, editorLogin.body).toBeTruthy()
    // 反証: editorは一覧を取得できる（data:write）。起票実行がdata:writeである以上、
    // 起票先の接続を選べなければAPI起票が成立しないため。
    // WBS画面の外部タスクリンク（baseUrl解決）もこの一覧に依存する
    const editorList = await app.inject({
      method: 'GET',
      url: '/api/externalToolConnections',
      headers: { authorization: `Bearer ${editorToken}` },
    })
    expect(editorList.statusCode, editorList.body).toBe(200)
    // 反証: 一覧を緩和してもAPIトークンは返らない（緩和で秘密が漏れていない）
    expect(editorList.body).not.toContain(TOKEN)
    expect(editorList.json().connections[0]?.apiToken).toBeUndefined()
    // 反証: 管理操作（作成・変更・削除・疎通確認・起票先取得）はeditorに開かない
    for (const [method, url] of [
      ['POST', '/api/externalToolConnections'],
      ['PATCH', `/api/externalToolConnections/${connection.id}`],
      ['DELETE', `/api/externalToolConnections/${connection.id}`],
      ['POST', `/api/externalToolConnections/${connection.id}/test`],
      ['GET', `/api/externalToolConnections/${connection.id}/metadata`],
    ] as const) {
      const res = await app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${editorToken}` },
        payload: method === 'GET' || method === 'DELETE' ? undefined : {},
      })
      expect(res.statusCode, `${method} ${url}`).toBe(403)
    }

    // 反証: viewerは一覧も見られない（data:write未満。緩和はeditor以上に限る）
    await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: authed(),
      payload: {
        email: 'viewer-ext@integration.test',
        name: 'Viewer Ext',
        password: 'ViewerPass123',
        role: 'viewer',
      },
    })
    const viewerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'viewer-ext@integration.test',
        password: 'ViewerPass123',
      },
    })
    const viewerToken = viewerLogin.json().accessToken
    const viewerList = await app.inject({
      method: 'GET',
      url: '/api/externalToolConnections',
      headers: { authorization: `Bearer ${viewerToken}` },
    })
    expect(viewerList.statusCode).toBe(403)

    // 削除できる（adminなら204）
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/externalToolConnections/${connection.id}`,
      headers: authed(),
    })
    expect(deleted.statusCode).toBe(204)
  })

  it('API起票: 外部ID即時学習・冪等な再実行・per-row失敗・上限', async () => {
    // 接続（GitHub）を用意
    const connectionRes = await app.inject({
      method: 'POST',
      url: '/api/externalToolConnections',
      headers: authed(),
      payload: {
        tool: 'github',
        name: '起票テスト用',
        apiToken: 'ghp_dummy',
        targetConfig: { owner: 'acme', repo: 'webapp' },
        enabled: true,
      },
    })
    expect(connectionRes.statusCode, connectionRes.body).toBe(201)
    const connectionId = connectionRes.json().connection.id

    // WBS: ルート → 工程 → リーフ2件
    const root = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'TC1',
        name: 'API起票案件',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: null,
      },
    })
    const rootId = root.json().id
    const phase = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'TC1-01',
        name: '要件定義',
        parentId: rootId,
        level: 1,
        status: 'active',
        confidence: null,
        divisionId: null,
      },
    })
    const phaseId = phase.json().id
    const leafIds: string[] = []
    for (const [code, name] of [
      ['TC1-01-01', '業務要件の整理'],
      ['TC1-01-02', '非機能要件の整理'],
    ] as const) {
      const leaf = await app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: authed(),
        payload: {
          code,
          name,
          parentId: phaseId,
          level: 2,
          status: 'active',
          confidence: null,
          divisionId: null,
          completionCriteria: 'レビュー承認済み',
        },
      })
      leafIds.push(leaf.json().id)
    }

    // 外部APIはスタブ（1件目=成功、2件目=422失敗）。実ネットワークへは出さない
    const requests: Array<{ url: string; body: unknown }> = []
    let issueNumber = 100
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null
      requests.push({ url: String(url), body })
      if (body?.title?.includes('非機能要件')) {
        return new Response('validation failed', { status: 422 })
      }
      issueNumber += 1
      return new Response(JSON.stringify({ number: issueNumber }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    try {
      const exec = await app.inject({
        method: 'POST',
        url: '/api/taskCreation/execute',
        headers: authed(),
        payload: { connectionId, rootProjectId: rootId, taskIds: leafIds },
      })
      expect(exec.statusCode, exec.body).toBe(200)
      const result = exec.json()
      expect(result.created).toHaveLength(1)
      expect(result.created[0]).toMatchObject({
        code: 'TC1-01-01',
        externalId: 'acme/webapp#101',
      })
      // 反証: per-row失敗（422）は他の行を巻き込まない
      expect(result.failed).toHaveLength(1)
      expect(result.failed[0].code).toBe('TC1-01-02')

      // 起票内容: 件名は[コード] タスク名（帰りの突合キー）・説明は完了条件
      expect(requests[0]?.url).toBe(
        'https://api.github.com/repos/acme/webapp/issues',
      )
      expect(requests[0]?.body).toMatchObject({
        title: '[TC1-01-01] 業務要件の整理',
        body: 'レビュー承認済み',
        labels: ['[TC1-01] 要件定義'],
      })

      // 外部IDが即時学習されている（Webhookアダプタと同一形式）
      const afterExec = await app.inject({
        method: 'GET',
        url: '/api/projects',
        headers: authed(),
      })
      const learned = afterExec
        .json()
        .find((p: { id: string }) => p.id === leafIds[0])
      expect(learned.externalSource).toBe('github')
      expect(learned.externalTaskId).toBe('acme/webapp#101')

      // 反証: 再実行しても起票済みはskipされ二重起票しない（未起票の1件だけ再試行）
      requests.length = 0
      const rerun = await app.inject({
        method: 'POST',
        url: '/api/taskCreation/execute',
        headers: authed(),
        payload: { connectionId, rootProjectId: rootId, taskIds: leafIds },
      })
      expect(rerun.json().created).toHaveLength(0)
      expect(rerun.json().skipped).toHaveLength(1)
      expect(rerun.json().skipped[0].reason).toMatch(/起票済み/)
      expect(requests).toHaveLength(1)
      expect(
        (requests[0]?.body as { title: string } | undefined)?.title,
      ).toContain('TC1-01-02')

      // 起票ログ（channel='api'）が追記されている
      const logs = await app.inject({
        method: 'GET',
        url: '/api/taskSyncLogs',
        headers: authed(),
      })
      const apiLogs = logs
        .json()
        .filter((l: { channel: string }) => l.channel === 'api')
      expect(apiLogs.length).toBeGreaterThanOrEqual(2)
      expect(
        apiLogs.some((l: { createdCount: number }) => l.createdCount === 1),
      ).toBe(true)

      // 反証: 非リーフ（工程）を指定してもskipされ、外部APIを呼ばない
      requests.length = 0
      const nonLeaf = await app.inject({
        method: 'POST',
        url: '/api/taskCreation/execute',
        headers: authed(),
        payload: { connectionId, rootProjectId: rootId, taskIds: [phaseId] },
      })
      expect(nonLeaf.json().created).toHaveLength(0)
      expect(nonLeaf.json().skipped[0].reason).toMatch(/リーフ/)
      expect(requests).toHaveLength(0)

      // 反証: 上限（50件）超過は400で、1件も起票しない
      const tooMany = await app.inject({
        method: 'POST',
        url: '/api/taskCreation/execute',
        headers: authed(),
        payload: {
          connectionId,
          rootProjectId: rootId,
          taskIds: Array.from(
            { length: 51 },
            (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          ),
        },
      })
      expect(tooMany.statusCode).toBe(400)

      // Backlog接続でのグループ解決（カテゴリー未存在→作成）とform送信の反証。
      // の実アカウント準備中に「BacklogはJSONではなくform-urlencoded必須」
      // 「カテゴリー付与が未実装」の2件を発見した回帰テスト
      const backlogConn = await app.inject({
        method: 'POST',
        url: '/api/externalToolConnections',
        headers: authed(),
        payload: {
          tool: 'backlog',
          name: 'Backlog起票テスト',
          baseUrl: 'https://example.backlog.jp',
          apiToken: 'bl_dummy',
          targetConfig: { projectId: 12, issueTypeId: 3, priorityId: 3 },
          enabled: true,
        },
      })
      expect(backlogConn.statusCode, backlogConn.body).toBe(201)

      const leaf3 = await app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: authed(),
        payload: {
          code: 'TC1-01-03',
          name: 'Backlog向けタスク',
          parentId: phaseId,
          level: 2,
          status: 'active',
          confidence: null,
          divisionId: null,
        },
      })

      // 期日の配線: 工程ノードにphaseKeyを設定し、その工程に
      // スケジュールを引くと、配下のリーフタスクへ期日が継承されて起票へ載る
      const phasePatch = await app.inject({
        method: 'PATCH',
        url: `/api/projects/${phaseId}`,
        headers: authed(),
        payload: { phaseKey: 'phase-2' },
      })
      expect(phasePatch.statusCode, phasePatch.body).toBe(200)
      const scheduleCreate = await app.inject({
        method: 'POST',
        url: '/api/scheduleEntries',
        headers: authed(),
        payload: {
          projectId: rootId,
          phaseKey: 'phase-2',
          startDate: '2026-01-05',
          endDate: '2026-03-31',
        },
      })
      expect(scheduleCreate.statusCode, scheduleCreate.body).toBe(201)

      const backlogCalls: Array<{
        url: string
        contentType: string
        body: string
      }> = []
      globalThis.fetch = (async (
        url: string | URL | Request,
        init?: RequestInit,
      ) => {
        const u = String(url)
        const headers = new Headers(init?.headers as HeadersInit)
        backlogCalls.push({
          url: u,
          contentType: headers.get('content-type') ?? '',
          body: String(init?.body ?? ''),
        })
        // カテゴリー一覧は空＝未存在（作成経路へ入る）
        if (u.endsWith('/categories') && (init?.method ?? 'GET') === 'GET') {
          return new Response('[]', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        if (u.endsWith('/categories')) {
          return new Response(JSON.stringify({ id: 77, name: '要件定義' }), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ issueKey: 'TEST-1' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      }) as typeof fetch

      const backlogExec = await app.inject({
        method: 'POST',
        url: '/api/taskCreation/execute',
        headers: authed(),
        payload: {
          connectionId: backlogConn.json().connection.id,
          rootProjectId: rootId,
          taskIds: [leaf3.json().id],
        },
      })
      expect(backlogExec.statusCode, backlogExec.body).toBe(200)
      expect(backlogExec.json().created[0]).toMatchObject({
        externalId: 'TEST-1',
      })

      // 反証: カテゴリーが無ければ作成し、そのIDが起票へ渡る
      const categoryCreate = backlogCalls.find(
        (c) => c.url.endsWith('/categories') && c.body.includes('name='),
      )
      expect(categoryCreate?.contentType).toBe(
        'application/x-www-form-urlencoded',
      )
      const issueCall = backlogCalls.find((c) => c.url.endsWith('/issues'))
      // 反証: BacklogへはJSONではなくform-urlencodedで送る（公式の必須要件）
      expect(issueCall?.contentType).toBe('application/x-www-form-urlencoded')
      expect(issueCall?.body).toContain('categoryId%5B%5D=77')
      expect(issueCall?.body).toContain('summary=')
      // 反証: 工程のスケジュール終了日が期日として起票に載る（DBから引く配線の検証。
      // 純関数のテストでは「サーバーがscheduleEntriesを実際に読んでいるか」までは見えない）
      expect(issueCall?.body).toContain('dueDate=2026-03-31')

      // 反証: viewerは起票できない（data:write非保持）
      await app.inject({
        method: 'POST',
        url: '/api/users',
        headers: authed(),
        payload: {
          email: 'viewer-taskcreation@integration.test',
          name: 'viewerユーザー',
          password: 'ViewerPass123',
          role: 'viewer',
        },
      })
      const viewerLogin = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'viewer-taskcreation@integration.test',
          password: 'ViewerPass123',
        },
      })
      const viewerRes = await app.inject({
        method: 'POST',
        url: '/api/taskCreation/execute',
        headers: {
          authorization: `Bearer ${viewerLogin.json().accessToken}`,
        },
        payload: { connectionId, rootProjectId: rootId, taskIds: leafIds },
      })
      expect(viewerRes.statusCode).toBe(403)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('監査証跡: create/update/deleteが記録され、対象が消えても残る', async () => {
    const { db } = await import('../../db/client.js')
    const { auditLogs, users } = await import('../../db/schema.js')
    const { eq, and, desc } = await import('drizzle-orm')

    const logsFor = async (entityId: string) =>
      db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entity, 'projects'),
            eq(auditLogs.entityId, entityId),
          ),
        )
        .orderBy(desc(auditLogs.occurredAt))

    // create
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'AUDIT-1',
        name: '監査テスト案件',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: null,
      },
    })
    expect(created.statusCode, created.body).toBe(201)
    const projectId = created.json().id

    const afterCreate = await logsFor(projectId)
    expect(afterCreate).toHaveLength(1)
    expect(afterCreate[0]).toMatchObject({ action: 'create', changes: null })
    // 操作者が記録される（usersが消えても辿れるようidとメールの両方）
    expect(afterCreate[0]?.actorEmail).toBe('admin@integration.test')
    expect(afterCreate[0]?.actorId).toBeTruthy()

    // update: 変更されたフィールドのbefore/afterが残る
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}`,
      headers: authed(),
      payload: { name: '監査テスト案件（改称）' },
    })
    expect(updated.statusCode, updated.body).toBe(200)

    const afterUpdate = await logsFor(projectId)
    expect(afterUpdate).toHaveLength(2)
    const updateLog = afterUpdate.find((l) => l.action === 'update')
    expect(updateLog?.changes).toEqual({
      name: { before: '監査テスト案件', after: '監査テスト案件（改称）' },
    })
    // 反証: 毎回変わるupdatedAtは差分に含めない（ノイズを残さない）
    expect(updateLog?.changes).not.toHaveProperty('updatedAt')

    // 反証: 値が変わらない更新はログを増やさない
    const noop = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}`,
      headers: authed(),
      payload: { name: '監査テスト案件（改称）' },
    })
    expect(noop.statusCode).toBe(200)
    expect(await logsFor(projectId)).toHaveLength(2)

    // delete: 削除直前の行全体がスナップショットとして残る
    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${projectId}`,
      headers: authed(),
    })
    expect(removed.statusCode).toBe(204)

    const afterDelete = await logsFor(projectId)
    // 反証: 対象レコードが消えても監査ログは残る（FKのカスケードで消えない）
    expect(afterDelete).toHaveLength(3)
    const deleteLog = afterDelete.find((l) => l.action === 'delete')
    expect(deleteLog?.changes).toMatchObject({
      code: 'AUDIT-1',
      name: '監査テスト案件（改称）',
    })

    // 反証: 操作したユーザーを削除しても監査ログは残る（actorIdにFKを張っていない）
    const actorId = afterDelete[0]?.actorId
    expect(actorId).toBeTruthy()
    const tempUser = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: authed(),
      payload: {
        email: 'audit-temp@integration.test',
        name: 'Audit Temp',
        password: 'TempPass123',
        role: 'editor',
      },
    })
    const tempUserId = tempUser.json().user.id
    const tempLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'audit-temp@integration.test',
        password: 'TempPass123',
      },
    })
    const tempToken = tempLogin.json().accessToken
    const byTemp = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { authorization: `Bearer ${tempToken}` },
      payload: {
        code: 'AUDIT-2',
        name: '退職者の操作',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: null,
      },
    })
    expect(byTemp.statusCode).toBe(201)

    await db.delete(users).where(eq(users.id, tempUserId))
    const survived = await logsFor(byTemp.json().id)
    expect(survived).toHaveLength(1)
    expect(survived[0]?.actorEmail).toBe('audit-temp@integration.test')

    // 後片付け（他テストの件数期待に影響しないよう作成物を消す）
    await app.inject({
      method: 'DELETE',
      url: `/api/projects/${byTemp.json().id}`,
      headers: authed(),
    })
  })

  it('監査証跡: ユーザーのロール変更が記録され、パスワードは証跡に載らない', async () => {
    const { db } = await import('../../db/client.js')
    const { auditLogs, users } = await import('../../db/schema.js')
    const { and, desc, eq } = await import('drizzle-orm')

    const email = `audit-user-${Date.now()}@example.com`
    const created = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: authed(),
      payload: {
        email,
        name: '監査対象ユーザー',
        password: 'initial-password-123',
        role: 'viewer',
      },
    })
    expect(created.statusCode, created.body).toBe(201)
    const userId = created.json().user.id as string

    const logsFor = async () =>
      db
        .select()
        .from(auditLogs)
        .where(
          and(eq(auditLogs.entity, 'users'), eq(auditLogs.entityId, userId)),
        )
        .orderBy(desc(auditLogs.occurredAt))

    const afterCreate = await logsFor()
    expect(afterCreate).toHaveLength(1)
    expect(afterCreate[0]?.action).toBe('create')
    // 反証: 作成時の差分にパスワード（平文・ハッシュとも）が載らない
    expect(JSON.stringify(afterCreate[0]?.changes ?? {})).not.toContain(
      'password',
    )

    // 権限昇格（viewer → admin）
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/users/${userId}`,
      headers: authed(),
      payload: { role: 'admin' },
    })
    expect(patched.statusCode, patched.body).toBe(200)

    const afterPatch = await logsFor()
    expect(afterPatch).toHaveLength(2)
    expect(afterPatch[0]?.action).toBe('update')
    expect(afterPatch[0]?.changes).toEqual({
      role: { before: 'viewer', after: 'admin' },
    })

    // 反証: パスワードハッシュは証跡のどこにも現れない
    const [row] = await db.select().from(users).where(eq(users.id, userId))
    const hash = row?.passwordHash ?? ''
    expect(hash.length).toBeGreaterThan(0)
    for (const log of afterPatch) {
      expect(JSON.stringify(log.changes ?? {})).not.toContain(hash)
      expect(JSON.stringify(log.changes ?? {})).not.toContain('passwordHash')
    }

    // 反証: 値が変わらないPATCHでは証跡を増やさない
    const noop = await app.inject({
      method: 'PATCH',
      url: `/api/users/${userId}`,
      headers: authed(),
      payload: { role: 'admin' },
    })
    expect(noop.statusCode, noop.body).toBe(200)
    expect(await logsFor()).toHaveLength(2)

    await db.delete(users).where(eq(users.id, userId))
  })

  it('監査証跡: 失敗した操作は証跡に残らない（業務操作と同一トランザクション）', async () => {
    const { db } = await import('../../db/client.js')
    const { auditLogs } = await import('../../db/schema.js')
    const { and, eq } = await import('drizzle-orm')

    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'AUDIT-TX1',
        name: 'トランザクションテスト',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: null,
      },
    })
    const projectId = created.json().id

    const countLogs = async () =>
      (
        await db
          .select()
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.entity, 'projects'),
              eq(auditLogs.entityId, projectId),
            ),
          )
      ).length
    const before = await countLogs()

    // 存在しない親を指すPATCH（FK違反）でUPDATEを失敗させる
    const failed = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}`,
      headers: authed(),
      payload: { parentId: '00000000-0000-4000-8000-0000000000fe' },
    })
    expect(failed.statusCode, failed.body).toBe(400)

    // 反証: 起きなかった変更を証跡に残さない
    expect(await countLogs()).toBe(before)

    // 反証: 業務データ側も変更されていない（トランザクションが巻き戻っている）
    const after = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: authed(),
    })
    const row = after.json().find((p: { id: string }) => p.id === projectId)
    expect(row.parentId ?? null).toBeNull()

    await app.inject({
      method: 'DELETE',
      url: `/api/projects/${projectId}`,
      headers: authed(),
    })
  })

  it('監査証跡: 一括更新（batch）も1件ずつ記録される', async () => {
    const { db } = await import('../../db/client.js')
    const { auditLogs } = await import('../../db/schema.js')
    const { eq, and, inArray } = await import('drizzle-orm')

    const ids: string[] = []
    for (const code of ['AUDIT-B1', 'AUDIT-B2']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: authed(),
        payload: {
          code,
          name: `一括${code}`,
          parentId: null,
          level: 0,
          status: 'active',
          confidence: null,
          divisionId: null,
        },
      })
      expect(res.statusCode, res.body).toBe(201)
      ids.push(res.json().id)
    }

    const batch = await app.inject({
      method: 'PATCH',
      url: '/api/projects/batch',
      headers: authed(),
      payload: {
        patches: [
          { id: ids[0], patch: { completed: true } },
          // 反証: 同じ一括更新でも、値が変わらない要素はログを増やさない
          { id: ids[1], patch: { name: '一括AUDIT-B2' } },
        ],
      },
    })
    expect(batch.statusCode, batch.body).toBe(200)

    const logs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entity, 'projects'),
          inArray(auditLogs.entityId, ids),
          eq(auditLogs.action, 'update'),
        ),
      )
    expect(logs).toHaveLength(1)
    expect(logs[0]?.entityId).toBe(ids[0])
    expect(logs[0]?.changes).toEqual({
      completed: { before: false, after: true },
    })

    for (const id of ids) {
      await app.inject({
        method: 'DELETE',
        url: `/api/projects/${id}`,
        headers: authed(),
      })
    }
  })

  it('楽観ロック: 期待updatedAtと食い違う更新を412で拒否する', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'LOCK-1',
        name: '楽観ロックテスト',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: null,
      },
    })
    expect(created.statusCode, created.body).toBe(201)
    const projectId = created.json().id
    // 「Aさんが画面で読んだ時点」のupdatedAt。DB既定値（now()）由来のマイクロ秒精度を
    // クライアントはミリ秒精度で受け取るため、その値がそのまま通ることも同時に検証している
    const readUpdatedAt = created.json().updatedAt
    expect(readUpdatedAt).toBeTruthy()

    // Bさんが先に更新する（期待値を送らない＝従来どおりの後勝ち更新）
    const byOther = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}`,
      headers: authed(),
      payload: { name: 'Bさんの変更' },
    })
    expect(byOther.statusCode, byOther.body).toBe(200)

    // Aさんが古いupdatedAtを持ったまま保存 → 412で拒否される
    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}`,
      headers: { ...authed(), 'x-expected-updated-at': readUpdatedAt },
      payload: { name: 'Aさんの変更' },
    })
    expect(stale.statusCode, stale.body).toBe(412)

    // 反証: 拒否された更新はDBへ反映されていない（Bさんの変更が生きている）
    const afterConflict = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: authed(),
    })
    const current = afterConflict
      .json()
      .find((p: { id: string }) => p.id === projectId)
    expect(current.name).toBe('Bさんの変更')

    // 反証: 最新のupdatedAtを渡せば通る（ロックが永続的に詰まらない）
    const fresh = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}`,
      headers: { ...authed(), 'x-expected-updated-at': current.updatedAt },
      payload: { name: 'Aさんの再試行' },
    })
    expect(fresh.statusCode, fresh.body).toBe(200)
    expect(fresh.json().name).toBe('Aさんの再試行')

    // 反証: 作成直後（updatedAtがDB既定値now()由来＝マイクロ秒精度）の行にも
    // 楽観ロックが効く。クライアントが受け取るISO文字列はミリ秒精度のため、
    // 丸めずに等値比較すると必ず不一致になり、正当な更新まで412で弾かれる。
    // 上の「fresh」はPATCHが明示設定したミリ秒精度の値を使うため、この経路は別に要る
    const justCreated = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'LOCK-2',
        name: '作成直後ロック',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: null,
      },
    })
    expect(justCreated.statusCode, justCreated.body).toBe(201)
    const firstLock = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${justCreated.json().id}`,
      headers: {
        ...authed(),
        'x-expected-updated-at': justCreated.json().updatedAt,
      },
      payload: { name: '作成直後ロック（更新）' },
    })
    expect(firstLock.statusCode, firstLock.body).toBe(200)
    await app.inject({
      method: 'DELETE',
      url: `/api/projects/${justCreated.json().id}`,
      headers: authed(),
    })

    // 反証: ヘッダーを送らなければ従来どおり更新できる（後方互換）
    const noHeader = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}`,
      headers: authed(),
      payload: { name: 'ヘッダーなし更新' },
    })
    expect(noHeader.statusCode).toBe(200)

    // 反証: 解釈できない期待値は400（黙って無視すると「ロックしたつもり」で素通りする）
    for (const bad of ['', 'not-a-date']) {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/projects/${projectId}`,
        headers: { ...authed(), 'x-expected-updated-at': bad },
        payload: { name: 'x' },
      })
      expect(res.statusCode, `header=${JSON.stringify(bad)}`).toBe(400)
    }

    // 反証: 存在しないレコードは412ではなく404（競合と不在を混同しない）
    const missing = await app.inject({
      method: 'PATCH',
      url: '/api/projects/00000000-0000-4000-8000-0000000000ff',
      headers: {
        ...authed(),
        'x-expected-updated-at': new Date().toISOString(),
      },
      payload: { name: 'x' },
    })
    expect(missing.statusCode).toBe(404)

    // 反証: updatedAt列を持たないエンティティでは期待値を無視して更新できる
    // （efforts等。ロックできないのにヘッダーだけ送られて全更新が失敗するのを防ぐ）
    const effortRoot = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'LOCK-E1',
        name: '工数ロック対象外',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: null,
      },
    })
    const effort = await app.inject({
      method: 'POST',
      url: '/api/efforts',
      headers: authed(),
      payload: {
        projectId: effortRoot.json().id,
        columnId: 'effort-1',
        value: 1,
      },
    })
    expect(effort.statusCode, effort.body).toBe(201)
    const effortPatch = await app.inject({
      method: 'PATCH',
      url: `/api/efforts/${effort.json().id}`,
      headers: {
        ...authed(),
        // 実在しない時刻を送っても、updatedAt列が無いテーブルでは検証されない
        'x-expected-updated-at': '2020-01-01T00:00:00.000Z',
      },
      payload: { value: 2 },
    })
    expect(effortPatch.statusCode, effortPatch.body).toBe(200)
    await app.inject({
      method: 'DELETE',
      url: `/api/projects/${effortRoot.json().id}`,
      headers: authed(),
    })

    // 反証: 412のときは監査ログを残さない（起きなかった変更を記録しない）
    const { db } = await import('../../db/client.js')
    const { auditLogs } = await import('../../db/schema.js')
    const { and, eq } = await import('drizzle-orm')
    const logs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entity, 'projects'),
          eq(auditLogs.entityId, projectId),
        ),
      )
    const names = logs
      .filter((l) => l.action === 'update')
      .map((l) => (l.changes as { name?: { after?: string } })?.name?.after)
    expect(names).not.toContain('Aさんの変更')

    await app.inject({
      method: 'DELETE',
      url: `/api/projects/${projectId}`,
      headers: authed(),
    })
  })

  it('監査証跡のパージ: 期間指定でのみ削除でき、操作自体も証跡に残る', async () => {
    const { db } = await import('../../db/client.js')
    const { auditLogs } = await import('../../db/schema.js')
    const { and, eq, sql } = await import('drizzle-orm')

    // 「古いログ」を直接仕込む（通常経路では過去日時のログを作れないため）
    const oldIds: string[] = []
    for (let i = 0; i < 3; i++) {
      const [row] = await db
        .insert(auditLogs)
        .values({
          entity: 'projects',
          entityId: `purge-target-${i}`,
          action: 'update',
          actorEmail: 'old@example.test',
          changes: { name: { before: 'a', after: 'b' } },
          occurredAt: new Date('2020-01-01T00:00:00.000Z'),
        })
        .returning({ id: auditLogs.id })
      if (row) oldIds.push(row.id)
    }
    // 直近のログ（消えてはいけない）
    const recent = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'PURGE-KEEP',
        name: 'パージ後も残る案件',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: null,
      },
    })
    const keepId = recent.json().id

    // 保持状況を取得できる（パージ判断の材料）
    const stats = await app.inject({
      method: 'GET',
      url: '/api/auditLogs/stats',
      headers: authed(),
    })
    expect(stats.statusCode, stats.body).toBe(200)
    expect(stats.json().total).toBeGreaterThan(0)
    expect(stats.json().oldestAt).toBeTruthy()

    // 反証: 保持日数が無い／不正／許可リスト外はすべて拒否する。
    // 任意の日数（0や1）を通すと「直近以外を全部消す」抜け道になるため、
    // 画面の選択肢と同じ許可リストでしか消せないこと自体を検証する
    for (const query of [
      '',
      '?days=',
      '?days=not-a-number',
      '?days=0',
      '?days=1',
      '?days=-365',
      // 旧仕様（任意の基準日時）が復活していないことの反証
      '?before=2021-01-01',
    ]) {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/auditLogs${query}`,
        headers: authed(),
      })
      expect(res.statusCode, `query=${query}`).toBe(400)
    }

    // 反証: 権限が無ければパージできない
    const managerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'manager-audit@integration.test',
        password: 'ManagerPass123',
      },
    })
    if (managerLogin.statusCode === 200) {
      const denied = await app.inject({
        method: 'DELETE',
        url: '/api/auditLogs?days=365',
        headers: {
          authorization: `Bearer ${managerLogin.json().accessToken}`,
        },
      })
      expect(denied.statusCode).toBe(403)
    }

    // パージ実行
    const purged = await app.inject({
      method: 'DELETE',
      url: '/api/auditLogs?days=365',
      headers: authed(),
    })
    expect(purged.statusCode, purged.body).toBe(200)
    expect(purged.json().deletedCount).toBe(3)

    // 反証: 基準日時より新しいログは消えない
    const kept = await db
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.entity, 'projects'), eq(auditLogs.entityId, keepId)),
      )
    expect(kept.length).toBeGreaterThan(0)

    // 反証: 対象の古いログは実際に消えている
    const [remaining] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, 'purge-target-0'))
    expect(remaining?.count).toBe(0)

    // 反証: パージ操作自体が証跡に残る（何をいつ誰が消したか）
    const purgeLogs = await db
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.entity, 'auditLogs'), eq(auditLogs.entityId, 'purge')),
      )
    expect(purgeLogs).toHaveLength(1)
    expect(purgeLogs[0]?.actorEmail).toBe('admin@integration.test')
    expect(purgeLogs[0]?.changes).toMatchObject({
      deletedCount: 3,
      retentionDays: 365,
    })

    await app.inject({
      method: 'DELETE',
      url: `/api/projects/${keepId}`,
      headers: authed(),
    })
  })

  it('CORS: 楽観ロックのカスタムヘッダーがプリフライトで許可される', async () => {
    // クライアント（Vite）とAPIサーバーは別オリジンのため、`X-Expected-Updated-At`のような
    // カスタムヘッダーはプリフライトで明示的に許可されないとブラウザがPATCHを送信せず、
    // 「更新に失敗しました Failed to fetch」になる（postgresブラウザE2Eで実際に発生）。
    // fastify.injectはプリフライトを経ないため、ヘッダーの許可を直接検証する
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/companies/00000000-0000-4000-8000-000000000001',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'PATCH',
        'access-control-request-headers':
          'content-type,authorization,x-expected-updated-at',
      },
    })
    expect(res.statusCode, res.body).toBeLessThan(300)
    const allowed = String(
      res.headers['access-control-allow-headers'] ?? '',
    ).toLowerCase()
    expect(allowed).toContain('x-expected-updated-at')
    expect(allowed).toContain('authorization')
    expect(allowed).toContain('content-type')

    // 反証: 更新・削除のメソッドがプリフライトで許可される。
    // @fastify/corsの既定は`GET,HEAD,POST`のため、明示しないと別オリジン構成で
    // PATCH/DELETEが全滅する（作成・参照だけ通るので気づきにくい）
    const methods = String(
      res.headers['access-control-allow-methods'] ?? '',
    ).toUpperCase()
    for (const method of ['PATCH', 'DELETE', 'POST', 'GET']) {
      expect(methods, `${method}がプリフライトで許可されていない`).toContain(
        method,
      )
    }
  })

  it('レスポンス圧縮: 大きなJSONがgzipで返る', async () => {
    // crud-factoryのGETは全行を返す設計のため、応答サイズは件数に比例する。
    // 実測で50案件×200タスクのprojects一覧は6.28MB→0.32MB（5.1%）になる
    const res = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { ...authed(), 'accept-encoding': 'gzip' },
    })
    expect(res.statusCode).toBe(200)
    // 小さすぎる応答はthreshold(1024B)未満で素通しになるため、
    // 圧縮されたかどうかはヘッダの有無で判定し、内容の同一性だけを保証する
    const encoding = res.headers['content-encoding']
    if (encoding) {
      expect(encoding).toBe('gzip')
    }

    // 反証: 圧縮の有無に関わらず内容は同じ（クライアントは変更不要）
    const plain = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { ...authed(), 'accept-encoding': 'identity' },
    })
    expect(plain.headers['content-encoding']).toBeUndefined()
    expect(Array.isArray(plain.json())).toBe(true)
  })

  it('監査証跡の参照API: 絞り込み・権限境界・書き込み経路の不在', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authed(),
      payload: {
        code: 'AUDIT-Q1',
        name: '参照APIテスト',
        parentId: null,
        level: 0,
        status: 'active',
        confidence: null,
        divisionId: null,
      },
    })
    const projectId = created.json().id
    await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}`,
      headers: authed(),
      payload: { name: '参照APIテスト（改称）' },
    })

    // entityId絞り込み: 当該レコードのcreate/updateが新しい順で返る
    const filtered = await app.inject({
      method: 'GET',
      url: `/api/auditLogs?entity=projects&entityId=${projectId}`,
      headers: authed(),
    })
    expect(filtered.statusCode, filtered.body).toBe(200)
    const logs = filtered.json().logs
    expect(logs).toHaveLength(2)
    expect(logs[0].action).toBe('update')
    expect(logs[1].action).toBe('create')
    // 操作者の表示名はusersから解決される
    expect(logs[0].actorName).toBeTruthy()

    // actionでの絞り込み
    const onlyUpdate = await app.inject({
      method: 'GET',
      url: `/api/auditLogs?entityId=${projectId}&action=update`,
      headers: authed(),
    })
    expect(onlyUpdate.json().logs).toHaveLength(1)

    // 反証: limitは上限を超えられない（単調増加するテーブルの全件取得を防ぐ）
    const tooMany = await app.inject({
      method: 'GET',
      url: '/api/auditLogs?limit=100000',
      headers: authed(),
    })
    expect(tooMany.statusCode).toBe(400)

    // 反証: 記録の追記・書き換え経路が無い（改ざんをAPIで提供しない）
    for (const method of ['POST', 'PATCH'] as const) {
      const res = await app.inject({
        method,
        url: '/api/auditLogs',
        headers: authed(),
        payload: {},
      })
      expect(res.statusCode, `${method} /api/auditLogs`).toBe(404)
    }
    // 反証: id指定の個別削除も無い（「都合の悪い記録だけを抜く」経路を作らない）
    const byId = await app.inject({
      method: 'DELETE',
      url: `/api/auditLogs/${logs[0].id}`,
      headers: authed(),
    })
    expect(byId.statusCode).toBe(404)

    // 反証: managerでも参照できない（差分に金額が入るためusers:manage限定）
    await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: authed(),
      payload: {
        email: 'manager-audit@integration.test',
        name: 'Manager Audit',
        password: 'ManagerPass123',
        role: 'manager',
      },
    })
    const managerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'manager-audit@integration.test',
        password: 'ManagerPass123',
      },
    })
    const managerRes = await app.inject({
      method: 'GET',
      url: '/api/auditLogs',
      headers: {
        authorization: `Bearer ${managerLogin.json().accessToken}`,
      },
    })
    expect(managerRes.statusCode).toBe(403)

    await app.inject({
      method: 'DELETE',
      url: `/api/projects/${projectId}`,
      headers: authed(),
    })
  })
})
