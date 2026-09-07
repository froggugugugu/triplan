import { describe, expect, it } from 'vitest'
import {
  buildApiUrl,
  buildAuthHeaders,
  parseTargetConfig,
  validateConnectionInput,
} from '../config.js'

/**
 * 外部ツール接続設定のコア（非公開の設計文書・§4.1）。
 * すべて純関数。HTTP呼び出しはclient.tsが担う。
 */

describe('validateConnectionInput', () => {
  it('BacklogはスペースURL（backlog.jp/.com/backlogtool.com）を受け付ける', () => {
    for (const url of [
      'https://example.backlog.jp',
      'https://example.backlog.com',
      'https://example.backlogtool.com',
    ]) {
      expect(validateConnectionInput('backlog', { baseUrl: url })).toBeNull()
    }
  })

  it('反証: httpのスペースURLは拒否する（トークンが平文で流れるため）', () => {
    expect(
      validateConnectionInput('backlog', {
        baseUrl: 'http://example.backlog.jp',
      }),
    ).toMatch(/https/)
  })

  it('反証: 許可ホスト以外のURLは拒否する（サーバーが任意の宛先へfetchしないためのSSRF対策）', () => {
    expect(
      validateConnectionInput('backlog', {
        baseUrl: 'https://evil.example.com',
      }),
    ).not.toBeNull()
    // ホスト名ではなくパスに許可ドメインを含む偽装URLも拒否する
    expect(
      validateConnectionInput('backlog', {
        baseUrl: 'https://evil.example.com/x.backlog.jp',
      }),
    ).not.toBeNull()
    expect(
      validateConnectionInput('jira', { baseUrl: 'https://evil.example.com' }),
    ).not.toBeNull()
  })

  it('Jiraはサイトドメイン（*.atlassian.net）とメールアドレスが必要', () => {
    expect(
      validateConnectionInput('jira', {
        baseUrl: 'https://acme.atlassian.net',
        authEmail: 'pm@example.com',
      }),
    ).toBeNull()
    // 反証: メール未設定はBasic認証が組めないため拒否
    expect(
      validateConnectionInput('jira', {
        baseUrl: 'https://acme.atlassian.net',
      }),
    ).toMatch(/メール/)
  })

  it('反証: BacklogでbaseUrl未指定は拒否（どのスペースへ起票するか決まらない）', () => {
    expect(validateConnectionInput('backlog', {})).not.toBeNull()
  })

  it('反証: Asana・GitHubはbaseUrlを受け付けない（固定ホストのみ対応）', () => {
    expect(validateConnectionInput('asana', {})).toBeNull()
    expect(validateConnectionInput('github', {})).toBeNull()
    expect(
      validateConnectionInput('github', { baseUrl: 'https://ghe.example.com' }),
    ).not.toBeNull()
  })
})

describe('parseTargetConfig', () => {
  it('ツールごとの起票先設定を検証する', () => {
    expect(
      parseTargetConfig('backlog', {
        projectId: 12,
        issueTypeId: 3,
        priorityId: 3,
      }),
    ).toEqual({ projectId: 12, issueTypeId: 3, priorityId: 3 })
    expect(parseTargetConfig('asana', { projectGid: '12345' })).toEqual({
      projectGid: '12345',
    })
    expect(
      parseTargetConfig('jira', { projectKey: 'PORTAL', issueTypeId: '10001' }),
    ).toEqual({ projectKey: 'PORTAL', issueTypeId: '10001' })
    expect(
      parseTargetConfig('github', { owner: 'acme', repo: 'webapp' }),
    ).toEqual({ owner: 'acme', repo: 'webapp' })
  })

  it('未設定（null）は許容する（認証情報を先に保存する2段階フローのため）', () => {
    expect(parseTargetConfig('github', null)).toBeNull()
    expect(parseTargetConfig('github', undefined)).toBeNull()
  })

  it('反証: 必須項目が欠けた起票先設定は拒否する', () => {
    expect(() => parseTargetConfig('github', { owner: 'acme' })).toThrow()
    expect(() => parseTargetConfig('backlog', { projectId: 12 })).toThrow()
    // 反証: 他ツールの形の設定を混ぜられない
    expect(() =>
      parseTargetConfig('asana', { owner: 'acme', repo: 'x' }),
    ).toThrow()
  })
})

describe('buildAuthHeaders', () => {
  it('ツールごとの認証ヘッダを組み立てる', () => {
    expect(buildAuthHeaders('backlog', 'tok', null)).toMatchObject({
      'Backlog-API-Key': 'tok',
    })
    expect(buildAuthHeaders('asana', 'tok', null)).toMatchObject({
      Authorization: 'Bearer tok',
    })
    expect(buildAuthHeaders('github', 'tok', null)).toMatchObject({
      Authorization: 'Bearer tok',
      Accept: 'application/vnd.github+json',
    })
    const jira = buildAuthHeaders('jira', 'tok', 'pm@example.com')
    expect(jira.Authorization).toBe(
      `Basic ${Buffer.from('pm@example.com:tok').toString('base64')}`,
    )
  })

  it('反証: BacklogのAPIキーをURLクエリではなくヘッダで送る（URLへの秘匿情報露出を避ける）', () => {
    const headers = buildAuthHeaders('backlog', 'secret-key', null)
    const url = buildApiUrl(
      'backlog',
      'https://example.backlog.jp',
      '/api/v2/users/myself',
    )
    expect(headers['Backlog-API-Key']).toBe('secret-key')
    expect(url).not.toContain('secret-key')
    expect(url).toBe('https://example.backlog.jp/api/v2/users/myself')
  })
})

describe('buildApiUrl', () => {
  it('固定ホストのツールはbaseUrl無しでURLを組める', () => {
    expect(buildApiUrl('asana', null, '/users/me')).toBe(
      'https://app.asana.com/api/1.0/users/me',
    )
    expect(buildApiUrl('github', null, '/repos/acme/webapp')).toBe(
      'https://api.github.com/repos/acme/webapp',
    )
  })

  it('baseUrl末尾のスラッシュを重複させない', () => {
    expect(
      buildApiUrl('jira', 'https://acme.atlassian.net/', '/rest/api/3/myself'),
    ).toBe('https://acme.atlassian.net/rest/api/3/myself')
  })
})
