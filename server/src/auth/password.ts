import argon2 from 'argon2'

/**
 * パスワードハッシュ化（argon2id、OWASP推奨。ARCH §12.1）
 */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id })
}

export async function verifyPassword(
  hash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain)
  } catch {
    // ハッシュ形式が不正な場合もfalse扱い（例外を上位に伝播させない）
    return false
  }
}
