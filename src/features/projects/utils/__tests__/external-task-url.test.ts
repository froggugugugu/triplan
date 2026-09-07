import { describe, expect, it } from 'vitest'
import { buildExternalTaskUrl, resolveToolBaseUrls } from '../external-task-url'

describe('buildExternalTaskUrl', () => {
  describe('正常系: ツール別のURL形式', () => {
    it('backlogは {baseUrl}/view/{課題キー} を返す', () => {
      expect(
        buildExternalTaskUrl(
          'backlog',
          'PROJ-123',
          'https://example.backlog.jp',
        ),
      ).toBe('https://example.backlog.jp/view/PROJ-123')
    })

    it('jiraは {baseUrl}/browse/{課題キー} を返す', () => {
      expect(
        buildExternalTaskUrl(
          'jira',
          'PROJ-123',
          'https://example.atlassian.net',
        ),
      ).toBe('https://example.atlassian.net/browse/PROJ-123')
    })

    it('asanaはbaseUrl不要で固定ホストのURLを返す', () => {
      expect(buildExternalTaskUrl('asana', '1201234567890123', null)).toBe(
        'https://app.asana.com/0/0/1201234567890123',
      )
    })

    it('githubはbaseUrl不要で owner/repo#番号 からIssue URLを組み立てる', () => {
      expect(
        buildExternalTaskUrl('github', 'octocat/hello-world#42', null),
      ).toBe('https://github.com/octocat/hello-world/issues/42')
    })

    it('baseUrlの末尾スラッシュがあっても二重スラッシュにならない', () => {
      expect(
        buildExternalTaskUrl(
          'backlog',
          'PROJ-1',
          'https://example.backlog.jp/',
        ),
      ).toBe('https://example.backlog.jp/view/PROJ-1')
    })
  })

  describe('反証: 未起票・情報不足ではリンクを作らない', () => {
    it('externalTaskIdがnullならnull（未起票をリンクにしない）', () => {
      expect(
        buildExternalTaskUrl('backlog', null, 'https://example.backlog.jp'),
      ).toBeNull()
    })

    it('externalTaskIdが空文字・空白のみならnull', () => {
      expect(
        buildExternalTaskUrl('backlog', '', 'https://example.backlog.jp'),
      ).toBeNull()
      expect(
        buildExternalTaskUrl('backlog', '   ', 'https://example.backlog.jp'),
      ).toBeNull()
    })

    it('externalSourceがnullならnull', () => {
      expect(
        buildExternalTaskUrl(null, 'PROJ-1', 'https://example.backlog.jp'),
      ).toBeNull()
    })

    it('反証: backlog/jiraでbaseUrlが無ければnull（推測でホストを組み立てない）', () => {
      expect(buildExternalTaskUrl('backlog', 'PROJ-1', null)).toBeNull()
      expect(buildExternalTaskUrl('jira', 'PROJ-1', null)).toBeNull()
      expect(buildExternalTaskUrl('backlog', 'PROJ-1', '')).toBeNull()
    })

    it('反証: 未知のツールスラッグはnull（将来ツール追加時に誤リンクを作らない）', () => {
      expect(
        buildExternalTaskUrl('redmine', 'PROJ-1', 'https://example.com'),
      ).toBeNull()
      // Webhook受信の 'generic' も起票元ではないためリンク対象外
      expect(
        buildExternalTaskUrl('generic', 'PROJ-1', 'https://x.com'),
      ).toBeNull()
    })
  })

  describe('反証: 外部IDの形式が想定外なら誤リンクを作らない', () => {
    it('githubの外部IDが owner/repo#番号 形式でなければnull', () => {
      // CSV取込のgithubプリセットは`number`列（123）を学習しない設計。
      // 万一この形式が紛れ込んでもリンクを作らないことを保証する
      expect(buildExternalTaskUrl('github', '123', null)).toBeNull()
      expect(
        buildExternalTaskUrl('github', 'octocat/hello-world', null),
      ).toBeNull()
      expect(buildExternalTaskUrl('github', 'octocat#42', null)).toBeNull()
      expect(buildExternalTaskUrl('github', 'a/b#notanumber', null)).toBeNull()
    })

    it('asanaのgidが数字以外を含むならnull', () => {
      expect(buildExternalTaskUrl('asana', 'PROJ-1', null)).toBeNull()
      expect(buildExternalTaskUrl('asana', '12a34', null)).toBeNull()
    })

    it('backlog/jiraの課題キーが KEY-数字 形式でなければnull', () => {
      const base = 'https://example.backlog.jp'
      expect(buildExternalTaskUrl('backlog', 'PROJ', base)).toBeNull()
      expect(buildExternalTaskUrl('backlog', '123', base)).toBeNull()
      expect(buildExternalTaskUrl('backlog', 'PROJ-abc', base)).toBeNull()
    })

    it('反証: パストラバーサル・クエリ混入を含む外部IDはnull（URL汚染の防止）', () => {
      const base = 'https://example.backlog.jp'
      expect(buildExternalTaskUrl('backlog', '../../admin', base)).toBeNull()
      expect(buildExternalTaskUrl('backlog', 'PROJ-1?x=1', base)).toBeNull()
      expect(
        buildExternalTaskUrl('github', 'octocat/hello-world#42?a=b', null),
      ).toBeNull()
      expect(
        buildExternalTaskUrl('github', '../../etc/passwd#1', null),
      ).toBeNull()
    })
  })

  describe('反証: baseUrlの危険な値を拒否する', () => {
    it('httpsでないスキームはnull（javascript:によるXSSを防ぐ）', () => {
      expect(
        buildExternalTaskUrl('backlog', 'PROJ-1', 'javascript:alert(1)'),
      ).toBeNull()
      expect(
        buildExternalTaskUrl('backlog', 'PROJ-1', 'http://example.backlog.jp'),
      ).toBeNull()
      expect(
        buildExternalTaskUrl('backlog', 'PROJ-1', 'data:text/html,<script>'),
      ).toBeNull()
    })

    it('URLとして解釈できない文字列はnull', () => {
      expect(buildExternalTaskUrl('backlog', 'PROJ-1', 'not a url')).toBeNull()
    })
  })
})

describe('resolveToolBaseUrls: 案件の既定接続による確定', () => {
  const connections = [
    {
      id: 'c1',
      tool: 'backlog' as const,
      baseUrl: 'https://space-a.backlog.jp',
    },
    {
      id: 'c2',
      tool: 'backlog' as const,
      baseUrl: 'https://space-b.backlog.jp',
    },
    { id: 'c3', tool: 'github' as const, baseUrl: null },
  ]

  it('反証: 既定接続を指定しなければ同一ツール複数接続は解決不能のまま（従来動作）', () => {
    expect(resolveToolBaseUrls(connections).backlog).toBeNull()
  })

  it('既定接続を指定すると、同一ツール複数接続でもbaseUrlが確定する', () => {
    expect(resolveToolBaseUrls(connections, 'c2').backlog).toBe(
      'https://space-b.backlog.jp',
    )
  })

  it('反証: 存在しない接続idを指定しても他ツールの解決を壊さない', () => {
    const map = resolveToolBaseUrls(connections, 'missing')
    expect(map.backlog).toBeNull()
    expect(map.github).toBeUndefined()
  })

  it('反証: 既定接続の指定は他ツールの解決に影響しない', () => {
    const map = resolveToolBaseUrls(
      [
        ...connections,
        { id: 'c4', tool: 'jira' as const, baseUrl: 'https://x.atlassian.net' },
      ],
      'c1',
    )
    expect(map.backlog).toBe('https://space-a.backlog.jp')
    expect(map.jira).toBe('https://x.atlassian.net')
  })
})

describe('resolveToolBaseUrls', () => {
  it('ツールごとにbaseUrlを引けるマップを返す', () => {
    const map = resolveToolBaseUrls([
      { tool: 'backlog', baseUrl: 'https://a.backlog.jp' },
      { tool: 'jira', baseUrl: 'https://a.atlassian.net' },
    ])
    expect(map.backlog).toBe('https://a.backlog.jp')
    expect(map.jira).toBe('https://a.atlassian.net')
  })

  it('接続が0件なら空のマップを返す', () => {
    expect(resolveToolBaseUrls([])).toEqual({})
  })

  it('baseUrlを持たないツール（asana/github）はマップに載らない', () => {
    const map = resolveToolBaseUrls([
      { tool: 'asana', baseUrl: null },
      { tool: 'github', baseUrl: null },
    ])
    expect(map.asana).toBeUndefined()
    expect(map.github).toBeUndefined()
  })

  it('反証: 同一ツールでbaseUrlが食い違う複数接続はnullにする（誤ったスペースへ飛ばさない）', () => {
    // 2つのBacklogスペースを併用している場合、externalSourceは'backlog'としか
    // 記録されていないためどちらのスペースか判別できない。リンクを出さない方が安全
    const map = resolveToolBaseUrls([
      { tool: 'backlog', baseUrl: 'https://a.backlog.jp' },
      { tool: 'backlog', baseUrl: 'https://b.backlog.jp' },
    ])
    expect(map.backlog).toBeNull()
  })

  it('同一ツールでも同一baseUrlの複数接続なら解決できる', () => {
    const map = resolveToolBaseUrls([
      { tool: 'backlog', baseUrl: 'https://a.backlog.jp' },
      { tool: 'backlog', baseUrl: 'https://a.backlog.jp/' },
    ])
    expect(map.backlog).toBe('https://a.backlog.jp')
  })
})
