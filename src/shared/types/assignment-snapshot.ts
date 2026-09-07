import { z } from 'zod'

/**
 * アサイン表のスナップショット。
 *
 * 「あの時点の体制」を任意のタイミングで記録し、現在との差分を見るための追記専用エンティティ。
 *
 * **既存の2機能とは目的が異なる**:
 * - 全データスナップショット（`snapshot-storage.ts`）: DB全体のバックアップ。
 *   復元も全体単位で、アサイン表だけを見比べることはできない
 * - `ProjectBaseline`: EVMのPV基準線。配分を**メンバー単位に合算**して保持するため
 *   「どのタスクに誰を置いていたか」は失われ、金額（BAC・月次計画コスト）を伴う
 *
 * こちらは**タスク×メンバーの粒度**を保ち、金額を持たない。体制の変遷を追うことに特化する。
 * **復元は提供しない**（誤操作で現在の計画を壊すリスクと、締め済み月のガード・
 * 監査証跡との整合コストが利便性に見合わないため。差分を見て手で直す運用）。
 */
export const AssignmentSnapshotEntrySchema = z.object({
  taskId: z.string().uuid(),
  memberId: z.string().uuid(),
  /** キー: "YYYY-MM"、値: 月次配分率。計画値（`monthlyValues`）のみを記録する */
  monthlyValues: z.record(z.string(), z.number().min(0)),
})
export type AssignmentSnapshotEntry = z.infer<
  typeof AssignmentSnapshotEntrySchema
>

export const AssignmentSnapshotSchema = z.object({
  id: z.string().uuid(),
  /** 対象のトップレベル案件（level===0） */
  projectId: z.string().uuid(),
  /** 利用者が付ける名前（「10月キックオフ時点」等） */
  label: z.string().min(1).max(100),
  takenAt: z.string().datetime(),
  /** 取得時点のアサイン。空配列可（体制が未登録の時点を記録する場合） */
  entries: z.array(AssignmentSnapshotEntrySchema),
  /** 取得者名。postgresモードはサーバースタンプ、localモードはnull */
  authorName: z.string().max(100).nullable(),
  createdAt: z.string().datetime(),
})

export type AssignmentSnapshot = z.infer<typeof AssignmentSnapshotSchema>

/** 追記専用のため更新用スキーマは持たない（削除は可） */
export const CreateAssignmentSnapshotSchema = AssignmentSnapshotSchema.omit({
  id: true,
})
export type CreateAssignmentSnapshot = z.infer<
  typeof CreateAssignmentSnapshotSchema
>
