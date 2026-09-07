import { z } from 'zod'
import { DateOnlySchema } from './date-only'

/**
 * 案件レベル（数値: 0=案件, 1-5=階層レベル）
 * 最大5階層まで対応
 */
export const MAX_PROJECT_LEVEL = 5
export const ProjectLevelSchema = z.number().int().min(0).max(MAX_PROJECT_LEVEL)
export type ProjectLevel = number

/**
 * 案件レベルの日本語ラベル
 */
export const PROJECT_LEVEL_LABELS: Record<number, string> = {
  0: 'プロジェクト',
  1: 'レベル1',
  2: 'レベル2',
  3: 'レベル3',
  4: 'レベル4',
  5: 'レベル5',
}

/**
 * 旧レベル文字列から数値への変換（データマイグレーション用）
 */
export function migrateProjectLevel(level: string | number): number {
  if (typeof level === 'number') return level
  const map: Record<string, number> = {
    project: 0,
    major: 1,
    middle: 2,
    minor: 3,
  }
  return map[level] ?? 0
}

/**
 * 案件ステータス選択肢
 */
export const STATUS_OPTIONS = [
  { value: 'not_started', label: '未着手' },
  { value: 'active', label: '進行中' },
  { value: 'completed', label: '完了' },
] as const

/**
 * 案件優先度選択肢
 */
export const PRIORITY_OPTIONS = [
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
] as const

/**
 * 案件確度選択肢（判断基準の説明付き）
 */
export const CONFIDENCE_OPTIONS = [
  { value: 'S', label: '確定（S）', description: '受注確定。契約締結済み' },
  {
    value: 'A',
    label: '高（A）',
    description: '予算確保済み、決裁者合意あり、時期確定、最終調整中',
  },
  {
    value: 'B',
    label: '中（B）',
    description: '課題は明確だが、予算調整中、または競合と比較中',
  },
  {
    value: 'C',
    label: '低（C）',
    description: '情報収集段階。課題がふわっとしており、時期も未定',
  },
] as const

/**
 * 案件スキーマ
 */
export const ProjectSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  background: z.string().max(2000).optional(),
  purpose: z.string().max(2000).optional(),
  // 完了条件。WBSグリッドで「説明」列の右隣に表示・編集する
  completionCriteria: z.string().max(2000).optional(),
  parentId: z.string().uuid().nullable(),
  level: ProjectLevelSchema,
  status: z.enum(['not_started', 'active', 'completed']).default('not_started'),
  confidence: z.enum(['S', 'A', 'B', 'C']).nullable().default(null),
  // WBS完了フラグ。最下層タスク（子を持たないノード）にのみ
  // ユーザーが直接操作する。既存のstatus（案件単位の3値enum）とは別軸。
  // 未指定は未完了として扱う（default(false)で自動付与）
  // （status/confidenceと同じパターン。マイグレーション関数の追加は不要）
  completed: z.boolean().optional().default(false),
  // 完了チェックを入れた日（YYYY-MM-DD）。completedをtrueにした時点で記録し、falseへ戻したらnullに戻す。
  // 任意の過去週時点の進捗率をこの日付から再現できるため、EVの週次スナップショット記録が不要になる
  // （非公開の設計文書）。既存データはjson-storageのmigrateProjectsが
  // updatedAtの日付部分をフォールバックとして付与する
  completedAt: DateOnlySchema.nullable().optional(),
  // 担当部門（Division）ID。未割当を許容するためoptional/nullable。
  // トップレベル案件（level===0）のみ設定対象とし、タスク（level>0）では使用しない
  divisionId: z.string().uuid().nullable().optional(),
  // 発注元（対外クライアント）名。トップレベル案件（level===0）のみ設定対象。
  // 既存のCompanyは協力会社（コスト側の外注先）専用マスタのため、対外クライアントは
  // 別概念として自由記述で保持する（専用マスタ化は過剰設計のため見送り、【仮定】）
  clientName: z.string().max(200).nullable().optional(),
  // 受注金額（万円）。トップレベル案件（level===0）のみ設定対象。
  // 案件別損益（受注額 vs 実コスト）算出の入力値
  contractAmount: z.number().min(0).nullable().optional(),
  // 優先度。トップレベル案件（level===0）のみ設定対象
  priority: z.enum(['high', 'medium', 'low']).nullable().optional(),
  // 案件レベルの契約形態（非公開の設計文書）。
  // Member.contractType（個人単位）とは別軸で、請負＝固定受注額に対する原価管理、
  // 準委任＝実働に応じた精算、と原価管理・警告閾値の意味が変わる。level===0のみ設定対象
  contractType: z
    .enum(['請負', '準委任', '派遣', '混在'])
    .nullable()
    .optional(),
  // 契約上のマスター納期（動かせない最終期日）。ScheduleEntry（工程別予定日の集合）とは
  // 別概念の制約点で、納期超過・遅延予測アラートの起点になる。level===0のみ設定対象
  masterDueDate: DateOnlySchema.nullable().optional(),
  // 所属する工程（PhaseSettings.phasesのphaseKey）。WBSツリー（工数・進捗）と
  // スケジュール（日付）を繋ぐ唯一の接続点で、設定すると①タスクの期日を工程の終了日から
  // 導出でき（API起票の期日）、②ガントバーへWBS進捗をロールアップできる。
  // level>0のタスクが対象。未設定のタスクは最も近い祖先の設定を継承する
  // （resolveTaskPhaseKey、shared/utils/task-phase-utils.ts）
  phaseKey: z.string().max(50).nullable().optional(),
  // 外部実行管理ツール連携（非公開の設計文書）。
  // リーフタスクのみ対象。externalTaskIdは完了同期の受信時に学習保存する
  // （手動編集UIなし。初回はタスクコード突合→以降はこの外部IDが一次突合キー）
  externalSource: z.string().max(50).nullable().optional(),
  externalTaskId: z.string().max(200).nullable().optional(),
  // 起票先の既定接続（`externalToolConnections.id`）。
  // 案件ごとに使う外部ツールが違う運用（A案件=Asana／B案件=GitHub等）を想定し、
  // 起票のたびに接続を選ばせない＝取り違えて別ツールへ起票する事故を防ぐ。
  // 併せて、`externalSource`がツール名しか持たないために解決できなかった
  // 「同一ツールで複数接続（別スペース）」のリンクもこの参照で確定できる。
  // **FK制約は張らない弱参照**（接続は業務テーブルではなくサーバー専用エンティティで、
  // 相互参照を作るとimportのTRUNCATE CASCADEの影響範囲が読みにくくなる。
  // 存在しないidはUI側が未設定として扱う）。トップレベル案件（level===0）のみ設定対象
  externalConnectionId: z.string().uuid().nullable().optional(),
  // EVMのPV算出における単価の扱い（非公開の設計文書）。
  // 'frozen'（既定）＝凍結時点の単価で固定、'latest'＝最新の単価履歴で再計算。
  // 単価改定の影響をコスト差異（CV）として扱うか、計画の前提変更として扱うかの切替。
  // トップレベル案件（level===0）のみ設定対象
  evmUnitPriceMode: z.enum(['frozen', 'latest']).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Project = z.infer<typeof ProjectSchema>

/**
 * 案件作成用スキーマ（IDと日時は自動生成）
 */
export const CreateProjectSchema = ProjectSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type CreateProject = z.infer<typeof CreateProjectSchema>

/**
 * 案件更新用スキーマ
 */
export const UpdateProjectSchema = ProjectSchema.partial().required({
  id: true,
})
export type UpdateProject = z.infer<typeof UpdateProjectSchema>

/**
 * 案件ツリーノード（UI表示用）
 */
export interface ProjectTreeNode extends Project {
  children: ProjectTreeNode[]
  depth: number
}
