import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret } from '../crypto.js'

describe('crypto (SSOプロバイダclientSecretの暗号化)', () => {
  it('暗号化した値を復号すると元の平文に戻る', () => {
    const encrypted = encryptSecret('my-client-secret-value')
    expect(decryptSecret(encrypted)).toBe('my-client-secret-value')
  })

  it('暗号文は平文と異なる（DBに平文を保存しない）', () => {
    const encrypted = encryptSecret('my-client-secret-value')
    expect(encrypted).not.toContain('my-client-secret-value')
  })

  it('同じ平文でも呼び出すたびに異なる暗号文になる（IVがランダムなため）', () => {
    const a = encryptSecret('same-secret')
    const b = encryptSecret('same-secret')
    expect(a).not.toBe(b)
    // どちらも正しく復号できる
    expect(decryptSecret(a)).toBe('same-secret')
    expect(decryptSecret(b)).toBe('same-secret')
  })

  it('改ざんされた暗号文は復号時に例外になる（認証タグ検証、GCMの完全性保証）', () => {
    const encrypted = encryptSecret('my-client-secret-value')
    const parts = encrypted.split(':')
    // ciphertext先頭の1文字を必ず異なる16進文字へ反転して改ざんする
    // （固定文字'f'への置換だと先頭が元々'f'のとき改ざんにならず、確率1/16で
    // flakeする潜在バグがあった。の全件実行で顕在化し修正）
    const cipherHex = parts[2] ?? ''
    const flipped = cipherHex[0] === '0' ? '1' : '0'
    const tampered = `${parts[0]}:${parts[1]}:${flipped}${cipherHex.slice(1)}`
    expect(() => decryptSecret(tampered)).toThrow()
  })

  it('形式が不正な暗号文は例外になる', () => {
    expect(() => decryptSecret('not-a-valid-format')).toThrow(
      '暗号化データの形式が不正です',
    )
  })

  it('空文字列も正しく暗号化・復号できる（境界値）', () => {
    const encrypted = encryptSecret('')
    expect(decryptSecret(encrypted)).toBe('')
  })
})
