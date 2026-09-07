import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from '../env.js'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // GCM推奨のIV長（バイト）

function getKey(): Buffer {
  return Buffer.from(env.SSO_ENCRYPTION_KEY, 'hex')
}

/**
 * SSOプロバイダのclientSecret等、DBに平文保存してはいけない値を暗号化する（AES-256-GCM）。
 * 戻り値は `iv:authTag:ciphertext`（いずれもhex）を`:`連結した文字列。
 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptSecret(encrypted: string): string {
  const parts = encrypted.split(':')
  // 空平文の暗号文はciphertext部分が空文字列になりうるため、存在チェックは
  // 真偽値ではなくundefined判定で行う（''は正当な値、falsy判定だと誤って弾いてしまう）
  if (parts.length !== 3) {
    throw new Error('暗号化データの形式が不正です')
  }
  const [ivHex, authTagHex, dataHex] = parts as [string, string, string]
  if (!ivHex || !authTagHex) {
    throw new Error('暗号化データの形式が不正です')
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivHex, 'hex'),
  )
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}
