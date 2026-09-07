import { createHash, randomBytes } from 'node:crypto'
import { type JWTPayload, jwtVerify, SignJWT } from 'jose'
import { env } from '../env.js'

export interface AccessTokenClaims extends JWTPayload {
  sub: string // user id
  email: string
  role: 'admin' | 'manager' | 'editor' | 'viewer' | 'partner'
}

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET)

/**
 * アクセストークン発行（JWT、HS256、有効期限15分既定。§12.1）
 */
export async function signAccessToken(
  claims: Omit<AccessTokenClaims, 'iat' | 'exp'>,
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_ACCESS_TTL_MIN}m`)
    .sign(accessSecret)
}

export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, accessSecret)
  return payload as AccessTokenClaims
}

/**
 * リフレッシュトークン。不透明なランダム値をクライアントへ渡し、DBには
 * ハッシュ値のみ保存する（漏洩時の悪用防止、§12.1）。
 */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url')
}

export function hashRefreshToken(token: string): string {
  // ペッパー（サーバー側のみが知る秘密値）を混ぜてハッシュ化する
  return createHash('sha256')
    .update(`${env.JWT_REFRESH_PEPPER}:${token}`)
    .digest('hex')
}

export function refreshTokenExpiryDate(): Date {
  const days = env.JWT_REFRESH_TTL_DAYS
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}
