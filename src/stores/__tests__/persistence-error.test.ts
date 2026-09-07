import { describe, expect, it } from 'vitest'
import { ApiError } from '@/infrastructure/adapters/authenticated-fetch'
import {
  describeSaveFailure,
  isConflictError,
  isForbiddenError,
  isStorageQuotaError,
} from '../persistence-error'

/**
 * 読み込みの403判定。ペルソナ別E2Eで、partnerがダッシュボードを開くと
 * 金額系エンティティの403をエラー通知してしまう実バグを発見した際に追加した。
 */
describe('isForbiddenError', () => {
  it('403のApiErrorだけをtrueと判定する', () => {
    expect(isForbiddenError(new ApiError('権限がありません', 403))).toBe(true)
  })

  it('反証: 他のHTTPエラーは通知対象として残す（本物の障害を隠さない）', () => {
    for (const status of [400, 401, 404, 409, 500, 502]) {
      expect(
        isForbiddenError(new ApiError('エラー', status)),
        `${status}`,
      ).toBe(false)
    }
  })

  it('反証: ApiError以外（ネットワーク断・型エラー等）はtrueにしない', () => {
    expect(isForbiddenError(new Error('Failed to fetch'))).toBe(false)
    expect(isForbiddenError('403')).toBe(false)
    expect(isForbiddenError(null)).toBe(false)
    expect(isForbiddenError(undefined)).toBe(false)
    // statusプロパティだけ持つ別物を誤判定しない
    expect(isForbiddenError({ status: 403 })).toBe(false)
  })
})

/**
 * 楽観ロックの競合判定。競合は障害ではなく並行編集の正常な結果なので、
 * 「保存に失敗しました」ではなく再読込を促す必要がある。
 */
describe('isConflictError', () => {
  it('412のApiErrorだけをtrueと判定する', () => {
    expect(isConflictError(new ApiError('競合', 412))).toBe(true)
  })

  it('反証: 409（unique制約違反）と混同しない', () => {
    // サーバーが敢えて412を使い分けているのは、この2つで利用者への案内が違うため
    expect(
      isConflictError(new ApiError('既存のデータと重複しています', 409)),
    ).toBe(false)
  })

  it('反証: 他のHTTPエラー・ApiError以外をtrueにしない', () => {
    for (const status of [400, 401, 403, 404, 500]) {
      expect(isConflictError(new ApiError('エラー', status)), `${status}`).toBe(
        false,
      )
    }
    expect(isConflictError(new Error('Failed to fetch'))).toBe(false)
    expect(isConflictError({ status: 412 })).toBe(false)
  })
})

/**
 * localStorageの容量上限（のスケーラビリティ計測で判明）。
 * 実測で50案件×200タスクのデータは9.6MBとなり、一般的な上限5MBを超える。
 */
describe('isStorageQuotaError', () => {
  it('QuotaExceededErrorをtrueと判定する', () => {
    const error = new Error('quota')
    error.name = 'QuotaExceededError'
    expect(isStorageQuotaError(error)).toBe(true)
  })

  it('Firefoxの名称（NS_ERROR_DOM_QUOTA_REACHED）も拾う', () => {
    const error = new Error('quota')
    error.name = 'NS_ERROR_DOM_QUOTA_REACHED'
    expect(isStorageQuotaError(error)).toBe(true)
  })

  it('反証: 他のエラーをtrueにしない（本物の障害を容量問題と誤診しない）', () => {
    expect(isStorageQuotaError(new Error('network error'))).toBe(false)
    expect(isStorageQuotaError(new ApiError('conflict', 412))).toBe(false)
    expect(isStorageQuotaError({ name: 'QuotaExceededError' })).toBe(false)
    expect(isStorageQuotaError(null)).toBe(false)
  })
})

describe('describeSaveFailure', () => {
  it('競合のときは再読込を促す文言を返す', () => {
    expect(describeSaveFailure(new ApiError('競合', 412), undefined)).toContain(
      '他のユーザーが先に更新しました',
    )
  })

  it('容量上限のときは退避・移行を促す文言を返す', () => {
    const error = new Error('quota')
    error.name = 'QuotaExceededError'
    const message = describeSaveFailure(error, undefined)
    expect(message).toContain('保存容量が上限')
    // 変更が取り消されたこと（データが壊れていないこと）も伝える
    expect(message).toContain('変更は取り消されています')
  })

  it('反証: 競合以外は元のエラー内容（フォールバック）を保つ', () => {
    // 本物の障害を「他のユーザーが〜」と誤って案内しない
    expect(
      describeSaveFailure(
        new ApiError('サーバーエラー', 500),
        'サーバーエラー',
      ),
    ).toBe('サーバーエラー')
    // fallbackがundefinedなら独自の定型文を足さない（元のトースト挙動を保つ）
    expect(describeSaveFailure(new Error('boom'), undefined)).toBeUndefined()
  })
})
