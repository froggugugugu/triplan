import { beforeAll, describe, expect, it } from 'vitest'

// biome-ignore lint/suspicious/noExplicitAny: 動的import（env検証を先に満たすため）
let generateApiKey: any
// biome-ignore lint/suspicious/noExplicitAny: 同上
let hashApiKey: any

beforeAll(async () => {
  ;({ generateApiKey, hashApiKey } = await import('../api-key.js'))
})

describe('APIキー生成・ハッシュ', () => {
  it('rpk_プレフィックス＋64桁16進で生成され、毎回異なる', () => {
    const a = generateApiKey()
    const b = generateApiKey()
    expect(a).toMatch(/^rpk_[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
  })

  it('ハッシュは決定論的で、平文がハッシュから読み取れない（SHA-256）', () => {
    const key = generateApiKey()
    expect(hashApiKey(key)).toBe(hashApiKey(key))
    expect(hashApiKey(key)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashApiKey(key)).not.toContain(key)
    // 反証: 1文字違いで全く別のハッシュになる
    expect(hashApiKey(`${key}x`)).not.toBe(hashApiKey(key))
  })
})
