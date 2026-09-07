import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../password.js'

describe('password', () => {
  it('ハッシュ化したパスワードは平文と異なる', async () => {
    const hash = await hashPassword('correct-horse-battery-staple')
    expect(hash).not.toBe('correct-horse-battery-staple')
    expect(hash.length).toBeGreaterThan(0)
  })

  it('正しいパスワードはverifyPasswordでtrueを返す', async () => {
    const hash = await hashPassword('correct-horse-battery-staple')
    await expect(
      verifyPassword(hash, 'correct-horse-battery-staple'),
    ).resolves.toBe(true)
  })

  it('誤ったパスワードはverifyPasswordでfalseを返す', async () => {
    const hash = await hashPassword('correct-horse-battery-staple')
    await expect(verifyPassword(hash, 'wrong-password')).resolves.toBe(false)
  })

  it('不正な形式のハッシュに対しては例外を投げずfalseを返す', async () => {
    await expect(verifyPassword('not-a-valid-hash', 'anything')).resolves.toBe(
      false,
    )
  })

  it('同じ平文でも呼び出すたびに異なるハッシュになる（ソルトの反証）', async () => {
    const hash1 = await hashPassword('same-password')
    const hash2 = await hashPassword('same-password')
    expect(hash1).not.toBe(hash2)
  })
})
