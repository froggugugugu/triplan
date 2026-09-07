import { relations, sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

// ============================================================================
// 認証（フェーズ2・5）
// ============================================================================

/**
 * ロール（非公開の設計文書、3階層。
 * 部門スコープ等の細粒度権限は現行データモデルに合致しないため対象外＝§16の拡張ポイント）
 */
// 5ロール（でmanager/partnerを追加。権限マトリクスはauth/rbac.ts参照）。
// 既存DBへは`ALTER TYPE ... ADD VALUE`の追加のみで移行できるよう、新値は末尾に足す
export const userRoleEnum = pgEnum('user_role', [
  'admin',
  'editor',
  'viewer',
  'manager',
  'partner',
])

/**
 * 認証方式。'local'はID/PASS。'azure_ad'/'google_workspace'はSSO（フェーズ5）
 */
export const authProviderEnum = pgEnum('auth_provider', [
  'local',
  'azure_ad',
  'google_workspace',
])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  // ローカル認証（ID/PASS）のユーザーのみ設定。SSO専用ユーザーはnull
  passwordHash: text('password_hash'),
  name: text('name').notNull(),
  role: userRoleEnum('role').notNull().default('viewer'),
  authProvider: authProviderEnum('auth_provider').notNull().default('local'),
  // 無効化されたユーザーはログイン不可（削除はしない。監査証跡として残す）
  isActive: boolean('is_active').notNull().default(true),
  // 業務データ上の担当者（members）との紐づけ。
  // 「自分の担当タスク」（/my-tasks）を出すための接続点で、未紐づけならnull。
  //
  // **FK制約を張らない（弱参照）**。当初はON DELETE SET NULLで張ったが、
  // `database/import`の`TRUNCATE members CASCADE`が**参照元のusersごと巻き込んで
  // 全削除**することが統合テストで判明した（PostgreSQLのTRUNCATE CASCADEは
  // 参照している側のテーブルもTRUNCATEする）。JSONインポートで全ユーザーが消えるのは
  // 担当者紐づけの自動解除より遥かに危険なため、参照整合性はアプリ側で担保する
  // （存在しないmemberIdは未紐づけ扱い＝documentTemplateIdsと同じ弱参照の整理）
  memberId: uuid('member_id'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // トークン自体ではなくハッシュ値のみ保存（漏洩時の悪用防止、§12.1）
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  // 使用の都度ローテーションし旧トークンをここに記録して即時無効化する（§12.1）
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
})

/** SSOプロバイダ種別。全社共通・単一設定 */
export const ssoProviderTypeEnum = pgEnum('sso_provider_type', [
  'azure_ad',
  'google_workspace',
])

/**
 * SSOプロバイダの接続設定（フェーズ5）。clientSecretは平文保存せず、AES-256-GCMで
 * 暗号化した値のみ保存する（auth/crypto.ts）。実際のOIDC認可コードフローは未実装
 * （のスコープ、実テナントでのアプリ登録情報が無いと実機検証できないため）。
 */
export const ssoProviderConfigs = pgTable('sso_provider_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: ssoProviderTypeEnum('provider').notNull().unique(),
  enabled: boolean('enabled').notNull().default(false),
  clientId: text('client_id'),
  clientSecretEncrypted: text('client_secret_encrypted'),
  tenantId: text('tenant_id'),
  redirectUri: text('redirect_uri'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
}))

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}))

// ============================================================================
// 組織（部門・課・所属会社）
// ============================================================================

export const divisions = pgTable('divisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

export const sections = pgTable('sections', {
  id: uuid('id').primaryKey().defaultRandom(),
  divisionId: uuid('division_id')
    .notNull()
    .references(() => divisions.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  // 内部リソース（自社）として人件費計上する会社か（旧isProper）
  isInternal: boolean('is_internal').notNull().default(false),
  // 適格請求書発行事業者の登録番号（T+13桁）
  invoiceRegistrationNumber: text('invoice_registration_number'),
  // 支払サイト（締め日・支払月オフセット・支払日）
  paymentTerms: jsonb('payment_terms').$type<{
    closingDay: number
    paymentMonthOffset: number
    paymentDay: number
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

// ============================================================================
// 技術タグ
// ============================================================================

export const techTagCategories = pgTable('tech_tag_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

export const techTagSubCategories = pgTable('tech_tag_sub_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => techTagCategories.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

export const techTags = pgTable('tech_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => techTagCategories.id, { onDelete: 'restrict' }),
  subCategoryId: uuid('sub_category_id').references(
    () => techTagSubCategories.id,
    { onDelete: 'set null' },
  ),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

// ============================================================================
// 担当者（Member）
// ============================================================================

export const memberContractTypeEnum = pgEnum('member_contract_type', [
  '請負',
  '準委任',
  '派遣',
  '正社員',
])

interface UnitPriceEntryJson {
  effectiveFrom: string
  amount: number
}

export const members = pgTable('members', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // メールアドレス（null = 未設定）。通知・外部ツール連携のキー
  email: text('email'),
  sectionId: uuid('section_id').references(() => sections.id, {
    onDelete: 'set null',
  }),
  companyId: uuid('company_id').references(() => companies.id, {
    onDelete: 'set null',
  }),
  contractType: memberContractTypeEnum('contract_type'),
  role: text('role').notNull().default(''),
  isActive: boolean('is_active').notNull().default(true),
  // 技術タグの保有状態（多対多）。中間テーブルではなくネイティブ配列で表現
  // （現行のjsonStorage実装がid配列そのままのため、忠実な移植を優先）
  techTagIds: uuid('tech_tag_ids').array().notNull().default([]),
  // 月間稼働率の上限（0 < x <= 1、既定1.0）。時短勤務・兼務・部分参画に対応する
  capacityRatio: numeric('capacity_ratio', {
    precision: 4,
    scale: 3,
    mode: 'number',
  })
    .notNull()
    .default(1),
  startDate: date('start_date', { mode: 'string' }),
  endDate: date('end_date', { mode: 'string' }),
  unitPriceHistory: jsonb('unit_price_history')
    .$type<UnitPriceEntryJson[]>()
    .notNull()
    .default([]),
  contractUnitPriceHistory: jsonb('contract_unit_price_history')
    .$type<UnitPriceEntryJson[]>()
    .notNull()
    .default([]),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

// ============================================================================
// 案件（Project）・WBS工数・アサイン
// ============================================================================

export const projectStatusEnum = pgEnum('project_status', [
  'not_started',
  'active',
  'completed',
])
export const projectConfidenceEnum = pgEnum('project_confidence', [
  'S',
  'A',
  'B',
  'C',
])
export const projectPriorityEnum = pgEnum('project_priority', [
  'high',
  'medium',
  'low',
])

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  background: text('background'),
  purpose: text('purpose'),
  completionCriteria: text('completion_criteria'),
  // 自己参照（親案件）。ツリー削除はカスケード。自己参照FKはAnyPgColumnで型推論の循環を回避する
  parentId: uuid('parent_id').references((): AnyPgColumn => projects.id, {
    onDelete: 'cascade',
  }),
  level: integer('level').notNull(),
  status: projectStatusEnum('status').notNull().default('not_started'),
  confidence: projectConfidenceEnum('confidence'),
  completed: boolean('completed').notNull().default(false),
  // 完了チェックを入れた日。任意の過去週時点のEVをこの日付から再現するために使う
  // （非公開の設計文書）。未完了なら null
  completedAt: date('completed_at', { mode: 'string' }),
  divisionId: uuid('division_id').references(() => divisions.id, {
    onDelete: 'set null',
  }),
  // 発注元（対外クライアント）名。level===0のみ設定対象、null = 未設定
  clientName: text('client_name'),
  // 受注金額（万円）。level===0のみ設定対象、null = 未設定
  contractAmount: numeric('contract_amount', {
    precision: 14,
    scale: 2,
    mode: 'number',
  }),
  // 優先度。level===0のみ設定対象、null = 未設定
  priority: projectPriorityEnum('priority'),
  // EVMのPV算出における単価の扱い（'frozen' = 凍結時点で固定、'latest' = 最新単価で再計算）
  evmUnitPriceMode: text('evm_unit_price_mode'),
  // 外部実行管理ツール連携（非公開の設計文書）。
  // 完了同期の受信時に学習保存される（リーフタスク対象）
  externalSource: text('external_source'),
  externalTaskId: text('external_task_id'),
  /**
   * 起票先の既定接続。**FK制約は張らない弱参照**。
   * external_tool_connectionsはサーバー専用エンティティで、業務テーブル側から
   * FKを張るとimportのTRUNCATE CASCADEの影響範囲が読みにくくなるため
   * （users.member_idで実際に全ユーザーが消えた事故と同じ整理）。
   * 存在しないidはアプリ側が未設定として扱う
   */
  externalConnectionId: uuid('external_connection_id'),
  // 案件レベルの契約形態（請負/準委任/派遣/混在）。level===0のみ設定対象、null = 未設定
  contractType: text('contract_type'),
  // 契約上のマスター納期。level===0のみ設定対象、null = 未設定
  masterDueDate: date('master_due_date', { mode: 'string' }),
  // 所属する工程（PhaseSettings.phasesのphaseKey）。WBSとスケジュールの接続点。
  // level>0のタスクが対象で、未設定は最も近い祖先から継承する
  phaseKey: text('phase_key'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

export const projectsRelations = relations(projects, ({ one }) => ({
  parent: one(projects, {
    fields: [projects.parentId],
    references: [projects.id],
  }),
}))

export const efforts = pgTable('efforts', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  // "effort-1" ~ "effort-10"
  columnId: text('column_id').notNull(),
  value: numeric('value', { precision: 10, scale: 2, mode: 'number' })
    .notNull()
    .default(0),
})

export const assignments = pgTable('assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id')
    .notNull()
    .references(() => members.id, { onDelete: 'cascade' }),
  // キー: "YYYY-MM"、値: 0.0〜1.0
  monthlyValues: jsonb('monthly_values')
    .$type<Record<string, number>>()
    .notNull()
    .default({}),
  // 実績の例外入力（入力された月のキーだけが存在する）。未入力月は計画値をそのまま実績とみなす
  actualMonthlyValues: jsonb('actual_monthly_values')
    .$type<Record<string, number>>()
    .notNull()
    .default({}),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

// ============================================================================
// スケジュール（ガントチャート）
// ============================================================================

export const dependencyTypeEnum = pgEnum('dependency_type', [
  'FS',
  'SS',
  'FF',
  'SF',
])

export const scheduleEntries = pgTable(
  'schedule_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    phaseKey: text('phase_key').notNull(),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),
  },
  (table) => [
    unique('schedule_entries_project_phase_unique').on(
      table.projectId,
      table.phaseKey,
    ),
  ],
)

export const phaseDependencies = pgTable(
  'phase_dependencies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    fromPhaseKey: text('from_phase_key').notNull(),
    toPhaseKey: text('to_phase_key').notNull(),
    dependencyType: dependencyTypeEnum('dependency_type').notNull(),
  },
  (table) => [
    unique('phase_dependencies_unique').on(
      table.projectId,
      table.fromPhaseKey,
      table.toPhaseKey,
    ),
  ],
)

// 案件別の工程設定（PhaseSettings、案件×1レコード）。旧schedule-settings-store
// （Zustand persist、独立localStorageキー）からの移行先。phases配列はThemeColor（string|
// {light,dark}のunion）を含む複雑な木構造ではないが、既存クライアントZodスキーマ
// （PhaseDefinitionSchema）との二重管理を避けるためjsonbで丸ごと保持する（wbsTemplates.nodesと
// 同じ設計判断、ARCH §16）。17ストアのDataAdapter配線・第11弾
interface PhaseDefinitionJson {
  phaseKey: string
  name: string
  color: unknown
  enabled: boolean
  sortOrder: number
}

export const scheduleSettingsEntries = pgTable(
  'schedule_settings_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    phases: jsonb('phases')
      .$type<PhaseDefinitionJson[]>()
      .notNull()
      .default([]),
    lastModified: timestamp('last_modified', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    unique('schedule_settings_entries_project_unique').on(table.projectId),
  ],
)

// 案件別のWBS列設定（WbsSettings、案件×1レコード）。旧wbs-settings-store（Zustand persist、
// 独立localStorageキー）からの移行先。effortColumns/levelColorsもjsonbで丸ごと保持する
interface EffortColumnJson {
  id: string
  displayName: string
  enabled: boolean
  order: number
  backgroundColor?: unknown
  techTagIds?: string[]
}

export const wbsColumnSettingsEntries = pgTable(
  'wbs_column_settings_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    effortColumns: jsonb('effort_columns')
      .$type<EffortColumnJson[]>()
      .notNull()
      .default([]),
    levelColors: jsonb('level_colors').$type<Record<string, unknown>>(),
    lastModified: timestamp('last_modified', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    unique('wbs_column_settings_entries_project_unique').on(table.projectId),
  ],
)

// ============================================================================
// WBSテンプレート
// ============================================================================

interface WbsTemplateNodeJson {
  name: string
  completionCriteria?: string
  documentTemplateIds?: string[]
  children?: WbsTemplateNodeJson[]
}

export const wbsTemplates = pgTable('wbs_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // 再帰構造の木。SQL側での正規化は行わない（ARCH §16、必要になった時点で検討する拡張ポイント）
  nodes: jsonb('nodes').$type<WbsTemplateNodeJson[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

// ============================================================================
// ドキュメントテンプレート
// ============================================================================

export const documentTemplates = pgTable('document_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // 対象工程の表示名（自由記述）。null = 工程横断
  phase: text('phase'),
  description: text('description'),
  // OKF準拠のマークダウン本文（YAML frontmatter含む）
  content: text('content').notNull(),
  // 出典（IPA資料名・URL等）。クライアントZodは.optional()のみのためGET時にnull→undefined変換する
  sourceRefs: jsonb('source_refs').$type<string[]>(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

// ============================================================================
// 通知（アラート送出、Phase 3）
// ============================================================================

/**
 * 通知チャンネル（非公開の設計文書）。**サーバー専用エンティティ**:
 * クライアントEntityMap・DatabaseSchema・export/importの対象にしない（localモードに
 * 存在せず、Webhook URL/APIトークンという実質シークレットを含むため。usersと同じ整理）。
 * webhookUrl/apiTokenはAES-256-GCM暗号化文字列を保存する（SSO clientSecretと同機構）
 */
export const notificationChannels = pgTable('notification_channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  provider: text('provider', {
    enum: ['slack', 'teams', 'google_chat', 'discord', 'chatwork', 'generic'],
  }).notNull(),
  webhookUrlEncrypted: text('webhook_url_encrypted'),
  apiTokenEncrypted: text('api_token_encrypted'),
  roomId: text('room_id'),
  enabled: boolean('enabled').notNull().default(true),
  minSeverity: text('min_severity', {
    enum: ['critical', 'warning', 'info'],
  })
    .notNull()
    .default('warning'),
  notifyEvents: boolean('notify_events').notNull().default(true),
  notifyDigest: boolean('notify_digest').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

/** 通知送信ログ（追記専用。追跡性＋日次ダイジェストの同日再送防止に使う） */
export const notificationLogs = pgTable('notification_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  sentAt: text('sent_at').notNull(),
  channelId: uuid('channel_id')
    .notNull()
    .references(() => notificationChannels.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['event', 'digest', 'test'] }).notNull(),
  subject: text('subject').notNull(),
  ok: boolean('ok').notNull(),
  detail: text('detail'),
})

// ============================================================================
// 汎用監査証跡
// ============================================================================

/**
 * 業務データの変更履歴（追記専用・サーバー専用エンティティ）。
 *
 * 月次締めで数字を確定させる製品が「誰がいつ何を変えたか分からない」状態だったため、
 * `crud-factory`の書き込み系ハンドラから**業務操作と同一トランザクションで**記録する
 * （記録漏れを許容すると証跡として使えないため、fire-and-forgetにしない）。
 *
 * **FK制約を張らない**のが要点: `entityId`の対象レコードも`actorId`のユーザーも、
 * 削除・退職後に証跡が消えては監査にならない（`ON DELETE CASCADE`で消える）。
 * 参照整合性より「消えないこと」を優先する。
 *
 * localモードには存在しない（認証が無くactorを特定できないため。usersと同じ整理で
 * クライアントのEntityMapへは登録しない）。
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 対象エンティティ名（'projects'等。crud-factoryのpathから導出） */
    entity: text('entity').notNull(),
    /** 対象レコードのid。削除後も追跡するためFKは張らない */
    entityId: text('entity_id').notNull(),
    action: text('action', {
      enum: ['create', 'update', 'delete'],
    }).notNull(),
    /** 操作者のusers.id。退職・削除後も残すためFKは張らない */
    actorId: uuid('actor_id'),
    /** 操作時点のメールアドレス（JWT由来。usersが消えても誰の操作か辿れる） */
    actorEmail: text('actor_email'),
    /**
     * create=null（作成値は現レコードを見れば分かる）／
     * update={field:{before,after}}（実際に値が変わったフィールドのみ）／
     * delete=削除直前の行全体（元の値が失われるため）
     */
    changes: jsonb('changes'),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    // 監査ログは唯一「件数が単調増加し続ける」テーブルのため、
    // 一覧（新しい順）と対象レコード指定の絞り込みに索引を張る
    index('audit_logs_occurred_at_idx').on(table.occurredAt),
    index('audit_logs_entity_idx').on(table.entity, table.entityId),
  ],
)

// ============================================================================
// 月次実績（P1-a）
// ============================================================================

/**
 * 月次実績の確定マーク（全社×月で1レコード）。ソフトロック（警告のみ、編集は拒否しない）。
 * confirmedAt/importedAtはクライアントZodがISO 8601文字列（z.string().datetime()）で
 * 検証・生成する監査用の値のため、SQL側で日付演算せずtext列で無変換往復させる
 * （timestampのmode:'string'はPostgres書式（'T'なし）で返りクライアントZodに弾かれる）
 */
export const monthlyActualsConfirmations = pgTable(
  'monthly_actuals_confirmations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // "YYYY-MM"。全社×月で1レコード
    month: text('month').notNull().unique(),
    confirmedAt: text('confirmed_at').notNull(),
  },
)

/**
 * 月次締めイベント（P1-b）。追記専用で、締め状態は月ごとの最新イベント
 * （occurredAt昇順の末尾）から導出する。monthはuniqueにしない（close→reopen→closeが積まれる）。
 * actorNameはサーバー側がreq.userからスタンプする（クライアント申告は無視）
 */
export const monthlyCloseEvents = pgTable('monthly_close_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  month: text('month').notNull(),
  action: text('action', { enum: ['close', 'reopen'] }).notNull(),
  reason: text('reason'),
  occurredAt: text('occurred_at').notNull(),
  actorName: text('actor_name'),
})

/**
 * 外部完了同期ログ（P1-c改）。追記専用。
 * syncedAtはISO文字列を無変換往復するtext列（confirmedAtと同じ判断）
 */
export const taskSyncLogs = pgTable('task_sync_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  syncedAt: text('synced_at').notNull(),
  channel: text('channel').notNull(),
  source: text('source').notNull(),
  fileName: text('file_name'),
  completedCount: integer('completed_count').notNull(),
  reopenedCount: integer('reopened_count').notNull(),
  unchangedCount: integer('unchanged_count').notNull(),
  skippedCount: integer('skipped_count').notNull(),
  /** API起票で作成した件数（完了同期のログでは0） */
  createdCount: integer('created_count').notNull().default(0),
  skippedReasons: jsonb('skipped_reasons')
    .$type<Array<{ row: number; reason: string }>>()
    .notNull()
    .default([]),
  note: text('note'),
})

/** CSV取込履歴（追記専用。PATCH/DELETEルートは登録しない） */
export const actualsImportLogs = pgTable('actuals_import_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  importedAt: text('imported_at').notNull(),
  fileName: text('file_name').notNull(),
  targetMonths: jsonb('target_months').$type<string[]>().notNull().default([]),
  appliedCount: integer('applied_count').notNull(),
  skippedCount: integer('skipped_count').notNull(),
  skippedReasons: jsonb('skipped_reasons')
    .$type<Array<{ row: number; reason: string }>>()
    .notNull()
    .default([]),
  note: text('note'),
})

// ============================================================================
// 部門予算
// ============================================================================

export const divisionBudgets = pgTable(
  'division_budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    divisionId: uuid('division_id')
      .notNull()
      .references(() => divisions.id, { onDelete: 'cascade' }),
    fiscalYear: integer('fiscal_year').notNull(),
    // 内訳・AI利用費・SaaS年間コストから自動計算される（サーバー側で再計算）
    initialAmount: numeric('initial_amount', {
      precision: 14,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    unique('division_budgets_division_fiscal_year_unique').on(
      table.divisionId,
      table.fiscalYear,
    ),
  ],
)

export const budgetAdjustmentTypeEnum = pgEnum('budget_adjustment_type', [
  'increase',
  'decrease',
])

/** 追記専用（更新・削除APIは設けない） */
export const budgetAdjustments = pgTable('budget_adjustments', {
  id: uuid('id').primaryKey().defaultRandom(),
  budgetId: uuid('budget_id')
    .notNull()
    .references(() => divisionBudgets.id, { onDelete: 'cascade' }),
  amount: numeric('amount', {
    precision: 14,
    scale: 2,
    mode: 'number',
  }).notNull(),
  adjustmentType: budgetAdjustmentTypeEnum('adjustment_type')
    .notNull()
    .default('increase'),
  reason: text('reason').notNull(),
  adjustedAt: date('adjusted_at', { mode: 'string' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

export const budgetBreakdownCategoryEnum = pgEnum('budget_breakdown_category', [
  'project_personnel',
  'project_expense',
  'general_expense',
])

export const budgetBreakdowns = pgTable('budget_breakdowns', {
  id: uuid('id').primaryKey().defaultRandom(),
  budgetId: uuid('budget_id')
    .notNull()
    .references(() => divisionBudgets.id, { onDelete: 'cascade' }),
  category: budgetBreakdownCategoryEnum('category').notNull(),
  label: text('label').notNull(),
  amount: numeric('amount', {
    precision: 14,
    scale: 2,
    mode: 'number',
  }).notNull(),
  recordedAt: date('recorded_at', { mode: 'string' }).notNull(),
  estimateAmount: numeric('estimate_amount', {
    precision: 14,
    scale: 2,
    mode: 'number',
  }),
  coefficient: numeric('coefficient', {
    precision: 6,
    scale: 3,
    mode: 'number',
  }),
  projectId: uuid('project_id').references(() => projects.id, {
    onDelete: 'set null',
  }),
  // 専用アクション経由でのみ更新（setBudgetBreakdownActual）
  monthlyActuals: jsonb('monthly_actuals')
    .$type<Record<string, number>>()
    .notNull()
    .default({}),
  // 実績明細（購入日・品目・金額の配列、予算1:実績Nの構造）。専用アクション経由でのみ更新。
  // クライアントのBudgetBreakdownSchemaがactualRecordsを自身の配列フィールドとして
  // 持つ契約（EntityMapに独立エンティティとしては存在しない）に合わせ、
  // 子テーブルへ正規化せずjsonbで埋め込む（monthlyActualsと同じパターン）
  actualRecords: jsonb('actual_records')
    .$type<
      Array<{
        id: string
        purchasedAt: string
        itemLabel: string
        amount: number
        note?: string | null
      }>
    >()
    .notNull()
    .default([]),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

export const aiUsageProviders = pgTable('ai_usage_providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  divisionId: uuid('division_id')
    .notNull()
    .references(() => divisions.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  plan: text('plan'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

export const aiUsageEntries = pgTable(
  'ai_usage_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    divisionId: uuid('division_id')
      .notNull()
      .references(() => divisions.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id').references(() => sections.id, {
      onDelete: 'set null',
    }),
    providerId: uuid('provider_id').references(() => aiUsageProviders.id, {
      onDelete: 'cascade',
    }),
    fiscalYear: integer('fiscal_year').notNull(),
    month: text('month').notNull(),
    budgetAmount: numeric('budget_amount', {
      precision: 14,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    // nullは「未記録」を表す（0円と区別する）
    actualAmount: numeric('actual_amount', {
      precision: 14,
      scale: 2,
      mode: 'number',
    }),
  },
  (table) => [
    unique('ai_usage_entries_unique')
      .on(
        table.divisionId,
        table.fiscalYear,
        table.month,
        table.sectionId,
        table.providerId,
      )
      .nullsNotDistinct(),
  ],
)

export const aiUsageMemberAllocations = pgTable(
  'ai_usage_member_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    divisionId: uuid('division_id')
      .notNull()
      .references(() => divisions.id, { onDelete: 'cascade' }),
    fiscalYear: integer('fiscal_year').notNull(),
    month: text('month').notNull(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    providerId: uuid('provider_id').references(() => aiUsageProviders.id, {
      onDelete: 'cascade',
    }),
    monthlyBudget: numeric('monthly_budget', {
      precision: 14,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    bufferAmount: numeric('buffer_amount', {
      precision: 14,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    actualAmount: numeric('actual_amount', {
      precision: 14,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    bufferActualAmount: numeric('buffer_actual_amount', {
      precision: 14,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
  },
  (table) => [
    unique('ai_usage_member_allocations_unique')
      .on(
        table.divisionId,
        table.fiscalYear,
        table.month,
        table.memberId,
        table.providerId,
      )
      .nullsNotDistinct(),
  ],
)

export const saasContractTypeEnum = pgEnum('saas_contract_type', [
  'annual',
  'monthly',
])
export const saasPaymentCycleEnum = pgEnum('saas_payment_cycle', [
  'monthly',
  'annual',
])

interface SaasAmountHistoryEntryJson {
  effectiveFrom: string
  amount: number
}

export const saasContracts = pgTable('saas_contracts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  plan: text('plan'),
  divisionId: uuid('division_id')
    .notNull()
    .references(() => divisions.id, { onDelete: 'cascade' }),
  contractType: saasContractTypeEnum('contract_type').notNull(),
  amount: numeric('amount', {
    precision: 14,
    scale: 2,
    mode: 'number',
  }).notNull(),
  headcount: integer('headcount'),
  unitPrice: numeric('unit_price', {
    precision: 14,
    scale: 2,
    mode: 'number',
  }),
  amountHistory: jsonb('amount_history')
    .$type<SaasAmountHistoryEntryJson[]>()
    .notNull()
    .default([]),
  // 専用アクション経由でのみ更新（setSaasContractActual）
  monthlyActuals: jsonb('monthly_actuals')
    .$type<Record<string, number>>()
    .notNull()
    .default({}),
  paymentCycle: saasPaymentCycleEnum('payment_cycle').notNull(),
  contractStartDate: date('contract_start_date', {
    mode: 'string',
  }).notNull(),
  nextRenewalDate: date('next_renewal_date', { mode: 'string' }).notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

// ============================================================================
// 人員計画
// ============================================================================

export const personnelPlanCategoryEnum = pgEnum('personnel_plan_category', [
  'personnel_internal',
  'personnel_external',
  'planned_internal',
  'planned_external',
])

export const personnelPlans = pgTable(
  'personnel_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    divisionId: uuid('division_id')
      .notNull()
      .references(() => divisions.id, { onDelete: 'cascade' }),
    fiscalYear: integer('fiscal_year').notNull(),
    category: personnelPlanCategoryEnum('category').notNull(),
    monthlyHeadcount: jsonb('monthly_headcount')
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    monthlyRealizedHeadcount: jsonb('monthly_realized_headcount')
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    unique('personnel_plans_unique').on(
      table.divisionId,
      table.fiscalYear,
      table.category,
    ),
  ],
)

// ============================================================================
// スキル評価・成長ロードマップ（いずれも追記専用）
// ============================================================================

export const skillLevelEnum = pgEnum('skill_level', [
  'none',
  'beginner',
  'intermediate',
  'advanced',
  'expert',
])
export const skillEvaluatorTypeEnum = pgEnum('skill_evaluator_type', [
  'self',
  'manager',
])

export const skillEvaluations = pgTable('skill_evaluations', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id')
    .notNull()
    .references(() => members.id, { onDelete: 'cascade' }),
  techTagId: uuid('tech_tag_id')
    .notNull()
    .references(() => techTags.id, { onDelete: 'cascade' }),
  evaluatorType: skillEvaluatorTypeEnum('evaluator_type').notNull(),
  beforeLevel: skillLevelEnum('before_level').notNull(),
  afterLevel: skillLevelEnum('after_level').notNull(),
  evaluatedAt: date('evaluated_at', { mode: 'string' }).notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

export const skillRoadmapGoals = pgTable('skill_roadmap_goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id')
    .notNull()
    .references(() => members.id, { onDelete: 'cascade' }),
  techTagId: uuid('tech_tag_id')
    .notNull()
    .references(() => techTags.id, { onDelete: 'cascade' }),
  targetLevel: skillLevelEnum('target_level').notNull(),
  // "YYYY-MM"
  targetDate: text('target_date').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

// ============================================================================
// EVM（案件×週次進捗率）
// ============================================================================

export const projectProgressEntries = pgTable('project_progress_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: 'cascade' }),
  // キー: "YYYY-Www"（ISO週番号）、値: 0.0〜1.0
  weeklyProgress: jsonb('weekly_progress')
    .$type<Record<string, number>>()
    .notNull()
    .default({}),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

/**
 * 計画のスナップショット（EVMのPVの基準線）。案件×版で1レコードの追記専用エンティティ。
 * 要件変更・追加予算で計画が改定された場合は新しいversionを追記する（再ベースライン）。
 * 非公開の設計文書 参照。
 */
export const projectBaselines = pgTable(
  'project_baselines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    approvedAt: date('approved_at', { mode: 'string' }).notNull(),
    reason: text('reason').notNull(),
    bacAmount: numeric('bac_amount', {
      precision: 14,
      scale: 2,
      mode: 'number',
    }).notNull(),
    // キー: "YYYY-MM"、値: その月の計画コスト（万円）
    monthlyPlannedCost: jsonb('monthly_planned_cost')
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    // 凍結時点のアサイン配分率（単価改定時に最新単価で再計算するモード用）
    plannedAllocations: jsonb('planned_allocations')
      .$type<{ memberId: string; monthlyValues: Record<string, number> }[]>()
      .notNull()
      .default([]),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [unique().on(table.projectId, table.version)],
)

/**
 * 変更管理（Change Request）。期中の契約変更・追加発注の記録。
 * 承認時の受注額・納期のProject反映はクライアント側（change-request-store）が行う
 * （DivisionBudget.initialAmountと同じ「計算ロジックはクライアントに1箇所」の設計判断）。
 */
export const changeRequests = pgTable('change_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  requestedAt: date('requested_at', { mode: 'string' }).notNull(),
  // 'pending' | 'approved' | 'rejected'
  status: text('status').notNull().default('pending'),
  contractAmountDelta: numeric('contract_amount_delta', {
    precision: 14,
    scale: 2,
    mode: 'number',
  })
    .notNull()
    .default(0),
  // 'increase' | 'decrease'
  contractAmountDeltaType: text('contract_amount_delta_type')
    .notNull()
    .default('increase'),
  effortDeltaDays: numeric('effort_delta_days', {
    precision: 10,
    scale: 2,
    mode: 'number',
  })
    .notNull()
    .default(0),
  effortDeltaType: text('effort_delta_type').notNull().default('increase'),
  newDueDate: date('new_due_date', { mode: 'string' }),
  note: text('note'),
  decidedAt: date('decided_at', { mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

/**
 * 請求マイルストン。受注額の分割割付と検収→請求→入金のステータス追跡。
 */
export const billingMilestones = pgTable('billing_milestones', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  amount: numeric('amount', {
    precision: 14,
    scale: 2,
    mode: 'number',
  }).notNull(),
  plannedAcceptanceDate: date('planned_acceptance_date', {
    mode: 'string',
  }).notNull(),
  // 'planned' | 'accepted' | 'invoiced' | 'paid'
  status: text('status').notNull().default('planned'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

// ============================================================================
// システム設定（全社共通・単一行）
// ============================================================================

/**
 * クライアントのDatabaseスキーマが持つ「レコード配列ではない」単一値フィールド
 * （fiscalYear・estimatedUnitPrice・defaultCoefficient・projectCoefficients・
 * exchangeRateHistory・wbsSettings・metadata）の置き場所。entity-registry.tsの
 * EntityMapが意図的にこれらを対象外としている（個別のストアが扱う設計）のに合わせ、
 * 24エンティティの汎用CRUDとは別の単一行テーブルとして持つ。
 * `GET/POST /api/database/export・import`（移行スクリプト用）でのみ参照する。
 */
export const appSettings = pgTable('app_settings', {
  // 常に1行のみ（シングルトン）。固定値の主キーで強制する
  id: integer('id').primaryKey().default(1),
  version: text('version').notNull().default('1.0.0'),
  fiscalYear: integer('fiscal_year').notNull(),
  estimatedUnitPrice: numeric('estimated_unit_price', {
    precision: 14,
    scale: 2,
    mode: 'number',
  }),
  defaultCoefficient: numeric('default_coefficient', {
    precision: 6,
    scale: 3,
    mode: 'number',
  }),
  projectCoefficients: jsonb('project_coefficients')
    .$type<Record<string, number>>()
    .notNull()
    .default({}),
  exchangeRateHistory: jsonb('exchange_rate_history')
    .$type<Array<{ effectiveFrom: string; rate: number }>>()
    .notNull()
    .default([]),
  // 業務定数の設定化（P0-a）。NULL=未設定（クライアント側が
  // 従来のハードコード既定値20/3/0.1へフォールバックする）
  workdaysPerMonth: doublePrecision('workdays_per_month'),
  skillReviewCycleMonths: integer('skill_review_cycle_months'),
  baselineStaleThreshold: doublePrecision('baseline_stale_threshold'),
  // 時間換算（1人日あたりの時間）。CSV取込の時間→人月換算に使用（P1-a）
  hoursPerDay: doublePrecision('hours_per_day'),
  // 簡易FPの人時/FP。NULL=未設定（クライアント既定値10）
  hoursPerFunctionPoint: doublePrecision('hours_per_function_point'),
  // プロジェクトサマリーの判定閾値。NULL=未設定（クライアント既定値0.15/0.9）
  summaryBudgetProgressGapThreshold: doublePrecision(
    'summary_budget_progress_gap_threshold',
  ),
  summarySpiWarningThreshold: doublePrecision('summary_spi_warning_threshold'),
  wbsSettings: jsonb('wbs_settings').$type<Record<string, unknown>>(),
  metadata: jsonb('metadata')
    .$type<{ lastModified: string; createdBy: string; version: string }>()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

/**
 * 汎用CSVマッピングプロファイル（非公開の設計文書）。
 * 外部システム向けCSVの列レイアウト（選択・並び・改名）のユーザー定義。
 * 金額データ自体は含まない（列名・並びのみ）ため readGuard は設けない
 */
export const csvMappingProfiles = pgTable('csv_mapping_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  sourceKey: text('source_key').notNull(),
  direction: text('direction', { enum: ['export', 'import'] }).notNull(),
  columns: jsonb('columns')
    .$type<
      Array<{
        field: string
        header: string
        enabled: boolean
        order: number
      }>
    >()
    .notNull()
    .default([]),
  includeHeader: boolean('include_header').notNull().default(true),
  // ソース固有の追加設定（実績取込の単位等）。クライアントZodは.optional()のみのため
  // GETではnull→undefined変換が必要（normalizeRow）
  options: jsonb('options').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

/**
 * 公開API v1のAPIキー。キー本体は保存せずSHA-256ハッシュのみ保持する
 * （発行時に一度だけ平文を返す）。スコープは現状read-onlyのみのため列を持たない
 * （書き込みAPI追加時にscope列を導入する）
 */
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
})

/**
 * 外部ツール接続（API起票基盤、非公開の設計文書）。
 * notificationChannelsと同じ整理でサーバー専用エンティティ（EntityMap非登録＝
 * localモードには存在しない）。APIトークンはAES-256-GCM暗号化して保存し、
 * GETでは「設定済みか」のbooleanのみ返す書き込み専用フィールドとして扱う。
 * `targetConfig`はツール別の起票先設定（Zod discriminated unionでルート側が検証）。
 */
export const externalToolConnections = pgTable('external_tool_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  tool: text('tool', {
    enum: ['backlog', 'asana', 'jira', 'github'],
  }).notNull(),
  name: text('name').notNull(),
  /** Backlog=スペースURL／Jira=サイトURL。Asana/GitHubは固定ホストのためnull */
  baseUrl: text('base_url'),
  /** JiraのBasic認証で使うメールアドレス。他ツールはnull */
  authEmail: text('auth_email'),
  apiTokenEncrypted: text('api_token_encrypted'),
  targetConfig: jsonb('target_config'),
  enabled: boolean('enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

/**
 * 体制メモ（アサイン表の申し送り）。
 * 案件削除で一緒に消してよい（案件に付随するメモのため）。
 */
export const assignmentNotes = pgTable('assignment_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  /** postgresモードはサーバーがreq.userからスタンプする（クライアント申告は採用しない） */
  authorName: text('author_name'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

/**
 * アサイン表のスナップショット。追記専用（更新APIなし・削除は可）。
 * entriesはタスク×メンバー×月の配分をjsonbで保持する（ProjectBaselineと違い
 * メンバー合算せず、金額も持たない）。
 */
export const assignmentSnapshots = pgTable('assignment_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  /** ISO文字列を無変換で往復させる（monthlyCloseEvents.occurredAtと同じ整理） */
  takenAt: text('taken_at').notNull(),
  entries: jsonb('entries').notNull(),
  authorName: text('author_name'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

// ============================================================================
// 型エクスポート
// ============================================================================

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type RefreshToken = typeof refreshTokens.$inferSelect
export type NewRefreshToken = typeof refreshTokens.$inferInsert
export type SsoProviderConfig = typeof ssoProviderConfigs.$inferSelect
export type NewSsoProviderConfig = typeof ssoProviderConfigs.$inferInsert
export type Division = typeof divisions.$inferSelect
export type NewDivision = typeof divisions.$inferInsert
export type Section = typeof sections.$inferSelect
export type NewSection = typeof sections.$inferInsert
export type Company = typeof companies.$inferSelect
export type NewCompany = typeof companies.$inferInsert
export type TechTagCategory = typeof techTagCategories.$inferSelect
export type NewTechTagCategory = typeof techTagCategories.$inferInsert
export type TechTagSubCategory = typeof techTagSubCategories.$inferSelect
export type NewTechTagSubCategory = typeof techTagSubCategories.$inferInsert
export type TechTag = typeof techTags.$inferSelect
export type NewTechTag = typeof techTags.$inferInsert
export type Member = typeof members.$inferSelect
export type NewMember = typeof members.$inferInsert
export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type Effort = typeof efforts.$inferSelect
export type NewEffort = typeof efforts.$inferInsert
export type Assignment = typeof assignments.$inferSelect
export type NewAssignment = typeof assignments.$inferInsert
export type ScheduleEntryRow = typeof scheduleEntries.$inferSelect
export type NewScheduleEntryRow = typeof scheduleEntries.$inferInsert
export type PhaseDependencyRow = typeof phaseDependencies.$inferSelect
export type NewPhaseDependencyRow = typeof phaseDependencies.$inferInsert
export type ScheduleSettingsEntryRow =
  typeof scheduleSettingsEntries.$inferSelect
export type NewScheduleSettingsEntryRow =
  typeof scheduleSettingsEntries.$inferInsert
export type WbsColumnSettingsEntryRow =
  typeof wbsColumnSettingsEntries.$inferSelect
export type NewWbsColumnSettingsEntryRow =
  typeof wbsColumnSettingsEntries.$inferInsert
export type WbsTemplateRow = typeof wbsTemplates.$inferSelect
export type NewWbsTemplateRow = typeof wbsTemplates.$inferInsert
export type DivisionBudget = typeof divisionBudgets.$inferSelect
export type NewDivisionBudget = typeof divisionBudgets.$inferInsert
export type BudgetAdjustment = typeof budgetAdjustments.$inferSelect
export type NewBudgetAdjustment = typeof budgetAdjustments.$inferInsert
export type BudgetBreakdown = typeof budgetBreakdowns.$inferSelect
export type NewBudgetBreakdown = typeof budgetBreakdowns.$inferInsert
export type AiUsageProvider = typeof aiUsageProviders.$inferSelect
export type NewAiUsageProvider = typeof aiUsageProviders.$inferInsert
export type AiUsageEntryRow = typeof aiUsageEntries.$inferSelect
export type NewAiUsageEntryRow = typeof aiUsageEntries.$inferInsert
export type AiUsageMemberAllocationRow =
  typeof aiUsageMemberAllocations.$inferSelect
export type NewAiUsageMemberAllocationRow =
  typeof aiUsageMemberAllocations.$inferInsert
export type SaasContractRow = typeof saasContracts.$inferSelect
export type NewSaasContractRow = typeof saasContracts.$inferInsert
export type PersonnelPlanRow = typeof personnelPlans.$inferSelect
export type NewPersonnelPlanRow = typeof personnelPlans.$inferInsert
export type SkillEvaluationRow = typeof skillEvaluations.$inferSelect
export type NewSkillEvaluationRow = typeof skillEvaluations.$inferInsert
export type SkillRoadmapGoalRow = typeof skillRoadmapGoals.$inferSelect
export type NewSkillRoadmapGoalRow = typeof skillRoadmapGoals.$inferInsert
export type ProjectProgressEntryRow = typeof projectProgressEntries.$inferSelect
export type NewProjectProgressEntryRow =
  typeof projectProgressEntries.$inferInsert
export type AppSettingsRow = typeof appSettings.$inferSelect
export type NewAppSettingsRow = typeof appSettings.$inferInsert
export type MonthlyActualsConfirmationRow =
  typeof monthlyActualsConfirmations.$inferSelect
export type NewMonthlyActualsConfirmationRow =
  typeof monthlyActualsConfirmations.$inferInsert
export type ActualsImportLogRow = typeof actualsImportLogs.$inferSelect
export type NewActualsImportLogRow = typeof actualsImportLogs.$inferInsert
export type MonthlyCloseEventRow = typeof monthlyCloseEvents.$inferSelect
export type CsvMappingProfileRow = typeof csvMappingProfiles.$inferSelect
export type ApiKeyRow = typeof apiKeys.$inferSelect
export type NewMonthlyCloseEventRow = typeof monthlyCloseEvents.$inferInsert
export type TaskSyncLogRow = typeof taskSyncLogs.$inferSelect
export type NewTaskSyncLogRow = typeof taskSyncLogs.$inferInsert
export type NotificationChannelRow = typeof notificationChannels.$inferSelect
export type NewNotificationChannelRow = typeof notificationChannels.$inferInsert
export type NotificationLogRow = typeof notificationLogs.$inferSelect
export type NewNotificationLogRow = typeof notificationLogs.$inferInsert
export type ExternalToolConnectionRow =
  typeof externalToolConnections.$inferSelect
export type NewExternalToolConnectionRow =
  typeof externalToolConnections.$inferInsert

// ────────────────────────────────────────────────────────────
// リスク登録簿（非公開の設計文書）
// ────────────────────────────────────────────────────────────

export const riskLevelEnum = pgEnum('risk_level', ['high', 'medium', 'low'])
export const riskStatusEnum = pgEnum('risk_status', [
  'open',
  'realized',
  'closed',
])

export const riskEntries = pgTable('risk_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  probability: riskLevelEnum('probability').notNull(),
  impact: riskLevelEnum('impact').notNull(),
  status: riskStatusEnum('status').notNull().default('open'),
  response: text('response'),
  /** オーナーは弱参照（FKを張らない。退職・削除後もリスクの記録は残す） */
  ownerMemberId: uuid('owner_member_id'),
  dueDate: date('due_date', { mode: 'string' }),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

export type RiskEntryRow = typeof riskEntries.$inferSelect
export type NewRiskEntryRow = typeof riskEntries.$inferInsert

// ────────────────────────────────────────────────────────────
// 見積スナップショット（非公開の設計文書）
// ────────────────────────────────────────────────────────────

export const estimateStageEnum = pgEnum('estimate_stage', [
  'initial_concept',
  'product_definition',
  'requirements_complete',
  'ui_design_complete',
  'detailed_design_complete',
  'completed',
])
export const estimateMethodEnum = pgEnum('estimate_method', [
  'function_point',
  'wbs',
  'manual',
  'actual',
])

/**
 * 見積スナップショット。案件×版で1レコードの追記専用（更新APIはクライアントが持たない。
 * 削除は最新版のみ）。段階・方法・根拠（FP項目／WBS要約）・当時の設定値を自己完結で凍結する。
 */
export const estimateSnapshots = pgTable(
  'estimate_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    stage: estimateStageEnum('stage').notNull(),
    method: estimateMethodEnum('method').notNull(),
    label: text('label').notNull(),
    /** ISO文字列を無変換で往復させる（assignmentSnapshots.takenAtと同じ整理） */
    takenAt: text('taken_at').notNull(),
    effortDays: numeric('effort_days', {
      precision: 12,
      scale: 2,
      mode: 'number',
    }).notNull(),
    amount: numeric('amount', {
      precision: 14,
      scale: 2,
      mode: 'number',
    }).notNull(),
    /** 記録時点の設定値（概算単価・係数・人日/人月・時間/日・人時/FP） */
    basis: jsonb('basis').$type<Record<string, number>>().notNull(),
    /** FP法の根拠（method='function_point'のみ） */
    fp: jsonb('fp'),
    /** WBS法の要約（method='wbs'のみ） */
    wbs: jsonb('wbs'),
    /** 変更起因の改定なら紐づける。弱参照（FKを張らない。CR削除後も版は残す） */
    changeRequestId: uuid('change_request_id'),
    note: text('note'),
    authorName: text('author_name'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [unique().on(table.projectId, table.version)],
)

export type EstimateSnapshotRow = typeof estimateSnapshots.$inferSelect
export type NewEstimateSnapshotRow = typeof estimateSnapshots.$inferInsert
