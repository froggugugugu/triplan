import { z } from 'zod'
import { DateOnlySchema } from './date-only'

/** 希望プロダクト・希望スキルそれぞれの登録上限 */
export const MEMBER_PREFERENCE_MAX_ITEMS = 10

/**
 * 担当者の希望（1on1で本人の了解を得て登録したものだけ）。1担当者1レコード。
 *
 * - **自由記述欄は持たない**。1on1の会話内容を入れないことをスキーマで強制する
 *   （`z.strictObject`で未知キーを拒否し、メモ欄を足す抜け道も塞ぐ）
 * - `consentedAt`（本人の了解を取った日）は必須。了解のない希望は登録できない
 * - 本人が了解を取り下げたら削除できる（更新・削除可）
 * - 閲覧は`people:sensitive-read`保持者と本人のみ（サーバー側で行を絞る）
 */
export const MemberPreferenceSchema = z.strictObject({
  id: z.guid(),
  memberId: z.guid(),
  /** やりたいプロダクト（ルート案件 level===0 のID） */
  desiredProductIds: z.array(z.guid()).max(MEMBER_PREFERENCE_MAX_ITEMS),
  /** 伸ばしたいスキル（技術タグID） */
  desiredTechTagIds: z.array(z.guid()).max(MEMBER_PREFERENCE_MAX_ITEMS),
  consentedAt: DateOnlySchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type MemberPreference = z.infer<typeof MemberPreferenceSchema>

export const CreateMemberPreferenceSchema = MemberPreferenceSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type CreateMemberPreference = z.infer<
  typeof CreateMemberPreferenceSchema
>

/** 担当者の付け替えは受け付けない（memberIdは更新不可） */
export const UpdateMemberPreferenceSchema = MemberPreferenceSchema.omit({
  memberId: true,
  createdAt: true,
})
  .partial()
  .required({ id: true })
export type UpdateMemberPreference = z.infer<
  typeof UpdateMemberPreferenceSchema
>
