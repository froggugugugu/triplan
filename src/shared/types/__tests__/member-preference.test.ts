import { describe, expect, it } from 'vitest'
import {
  CreateMemberPreferenceSchema,
  MEMBER_PREFERENCE_MAX_ITEMS,
  UpdateMemberPreferenceSchema,
} from '../member-preference'

const uuid = () => crypto.randomUUID()
const base = () => ({
  memberId: uuid(),
  desiredProductIds: [uuid()],
  desiredTechTagIds: [uuid(), uuid()],
  consentedAt: '2026-11-20',
})

describe('MemberPreferenceSchema', () => {
  it('了解日つきの希望を受け付ける。希望が空配列でもよい', () => {
    expect(CreateMemberPreferenceSchema.safeParse(base()).success).toBe(true)
    expect(
      CreateMemberPreferenceSchema.safeParse({
        ...base(),
        desiredProductIds: [],
        desiredTechTagIds: [],
      }).success,
    ).toBe(true)
  })

  // 反証: 1on1の会話内容を入れる経路を作らない。メモ欄などの未知キーは拒否する
  it('反証: 自由記述（note等の未知キー）を含む入力は拒否する', () => {
    const r = CreateMemberPreferenceSchema.safeParse({
      ...base(),
      note: '1on1で上司と合わないと話していた',
    })
    expect(r.success).toBe(false)
  })

  it('反証: 了解日がない／存在しない日付なら拒否する', () => {
    const { consentedAt: _omit, ...noConsent } = base()
    expect(CreateMemberPreferenceSchema.safeParse(noConsent).success).toBe(
      false,
    )
    expect(
      CreateMemberPreferenceSchema.safeParse({
        ...base(),
        consentedAt: '2026-02-30',
      }).success,
    ).toBe(false)
  })

  it('反証: 希望が上限件数を超えると拒否する（上限ちょうどは受け付ける）', () => {
    const ids = (n: number) => Array.from({ length: n }, uuid)
    expect(
      CreateMemberPreferenceSchema.safeParse({
        ...base(),
        desiredTechTagIds: ids(MEMBER_PREFERENCE_MAX_ITEMS),
      }).success,
    ).toBe(true)
    expect(
      CreateMemberPreferenceSchema.safeParse({
        ...base(),
        desiredTechTagIds: ids(MEMBER_PREFERENCE_MAX_ITEMS + 1),
      }).success,
    ).toBe(false)
  })

  it('反証: 更新で担当者の付け替え（memberId）は受け付けない', () => {
    const r = UpdateMemberPreferenceSchema.safeParse({
      id: uuid(),
      memberId: uuid(),
    })
    expect(r.success).toBe(false)
  })
})
