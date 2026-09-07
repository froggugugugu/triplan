import { describe, expect, it } from 'vitest'
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiryDate,
  signAccessToken,
  verifyAccessToken,
} from '../jwt.js'

describe('アクセストークン（JWT）', () => {
  it('発行したトークンを検証すると同じclaimsが復元される', async () => {
    const token = await signAccessToken({
      sub: 'user-1',
      email: 'taro@example.com',
      role: 'editor',
    })
    const claims = await verifyAccessToken(token)
    expect(claims.sub).toBe('user-1')
    expect(claims.email).toBe('taro@example.com')
    expect(claims.role).toBe('editor')
  })

  it('改ざんされたトークンは検証に失敗する', async () => {
    const token = await signAccessToken({
      sub: 'user-1',
      email: 'taro@example.com',
      role: 'viewer',
    })
    const tampered = `${token.slice(0, -2)}xx`
    await expect(verifyAccessToken(tampered)).rejects.toThrow()
  })

  it('無効な文字列は検証に失敗する', async () => {
    await expect(verifyAccessToken('not-a-jwt')).rejects.toThrow()
  })
})

describe('リフレッシュトークン', () => {
  it('毎回異なる不透明トークンを生成する', () => {
    const a = generateRefreshToken()
    const b = generateRefreshToken()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThan(32)
  })

  it('同じトークンは常に同じハッシュ値になる（決定論的）', () => {
    const token = generateRefreshToken()
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token))
  })

  it('異なるトークンは異なるハッシュ値になる', () => {
    const a = generateRefreshToken()
    const b = generateRefreshToken()
    expect(hashRefreshToken(a)).not.toBe(hashRefreshToken(b))
  })

  it('ハッシュ値からトークン自体は復元できない（平文と異なる）', () => {
    const token = generateRefreshToken()
    expect(hashRefreshToken(token)).not.toBe(token)
  })

  it('有効期限は未来の日時になる', () => {
    const expiry = refreshTokenExpiryDate()
    expect(expiry.getTime()).toBeGreaterThan(Date.now())
  })
})
