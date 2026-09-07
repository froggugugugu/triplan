import type { AppSettingsPatch, Database } from '@/shared/types'
import type {
  EntityCreateInput,
  EntityMap,
  EntityName,
  EntityUpdateInput,
} from './entity-registry'

/**
 * 全社共通の単一設定値（appSettings）。EntityMapのレコード単位CRUD（list/create/update/
 * remove）に馴染まないため専用メソッドで読み書きする（P0-b。
 * 「postgresモードでは4設定フィールドが未対応」という既知ギャップの解消）。
 * 読み取り結果も部分更新ペイロードも同じ「全フィールド任意」の形のため型を共用する。
 */
export type AppSettingsData = AppSettingsPatch

/**
 * ストレージ実装（localStorage / PostgreSQL API）の差異を吸収する境界。
 * 非公開の設計文書。
 *
 * 17ストアの通常操作はlist/create/update/removeの4メソッドに集約する
 * （§5.3: 配列丸ごと差し替えではなくレコード単位CRUDにする理由の反証を参照）。
 */
export interface DataAdapter {
  list<E extends EntityName>(entity: E): Promise<EntityMap[E][]>

  /**
   * options.idを指定すると、そのidで確定させる（省略時は実装側がランダムなidを採番する）。
   * 楽観的更新（呼び出し元が仮idで即座にローカルstateへ反映するパターン）で、確定後に
   * idが変わってしまうと、戻り値のidを同期的に他レコードのparentId等へ連鎖利用する呼び出し元
   * （applyWbsTemplate等）が壊れるため、呼び出し元が主導してidを固定できるようにする
   * （非公開の設計文書/§7.2の反証で判明、docs/project.md参照）
   */
  create<E extends EntityName>(
    entity: E,
    data: EntityCreateInput<E>,
    options?: { id?: string },
  ): Promise<EntityMap[E]>

  /**
   * options.expectedUpdatedAtを指定すると楽観ロックが効く。
   * 呼び出し元が「ローカルstateで見ていたレコードのupdatedAt」を渡すと、
   * サーバー側でその値と食い違う（＝他のユーザーが先に更新した）場合に412を返し、
   * 後勝ちの静かな上書きを防ぐ。localモードは単一ユーザー前提のため無視される。
   */
  update<E extends EntityName>(
    entity: E,
    id: string,
    patch: EntityUpdateInput<E>,
    options?: { expectedUpdatedAt?: string },
  ): Promise<EntityMap[E]>

  remove<E extends EntityName>(entity: E, id: string): Promise<void>

  bulkUpdate<E extends EntityName>(
    entity: E,
    patches: Array<{ id: string; patch: EntityUpdateInput<E> }>,
  ): Promise<EntityMap[E][]>

  /**
   * 全社共通の単一設定値の読み取り。未設定のフィールドはキー欠落（undefined）で返す
   * （呼び出し側が既定値へフォールバックする）
   */
  loadAppSettings(): Promise<AppSettingsData>

  /**
   * 全社共通の単一設定値の部分更新。**指定したキーのみ**を上書きし、未指定のキーは
   * 変更しない（フィールド単位のパッチ。全体上書きにすると、未ロードのまま保存した際に
   * 他フィールドを既定値で消してしまう既知の事故パターンを再現するため）
   */
  updateAppSettings(patch: AppSettingsData): Promise<AppSettingsData>

  // インポート/エクスポート/移行用の「丸ごと」操作。通常のストア操作からは呼ばない
  loadDatabase(): Promise<Database>
  importDatabase(db: Database): Promise<void>

  readonly capabilities: {
    mode: 'local' | 'postgres'
    supportsAuth: boolean
    supportsServerSideCascade: boolean
  }
}
