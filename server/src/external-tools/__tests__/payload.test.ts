import { describe, expect, it } from 'vitest'
import {
  buildAddToSectionRequest,
  buildCreatePayload,
  buildGroupCreateRequest,
  buildGroupListRequest,
  buildTaskCreationPlan,
  extractCreatedGroupId,
  extractExternalId,
  extractGroupId,
  type TaskCreationCandidate,
} from '../payload.js'

/**
 * API起票のコア（非公開の設計文書・§5）。
 * すべて純関数で、HTTP呼び出し・DB書込みは呼び出し側の責務。
 */

const ROOT = '00000000-0000-4000-8000-0000000000a0'
const PHASE = '00000000-0000-4000-8000-0000000000a1'
const TASK_A = '00000000-0000-4000-8000-0000000000a2'
const TASK_B = '00000000-0000-4000-8000-0000000000a3'
const OTHER_ROOT = '00000000-0000-4000-8000-0000000000b0'

function candidate(
  overrides: Partial<TaskCreationCandidate> & { id: string },
): TaskCreationCandidate {
  return {
    code: 'P001',
    name: 'タスク',
    parentId: null,
    completionCriteria: null,
    externalSource: null,
    externalTaskId: null,
    ...overrides,
  }
}

const PROJECTS: TaskCreationCandidate[] = [
  candidate({ id: ROOT, code: 'P020', name: '基幹刷新' }),
  candidate({ id: PHASE, code: 'P020-01', name: '要件定義', parentId: ROOT }),
  candidate({
    id: TASK_A,
    code: 'P020-01-01',
    name: '業務要件の整理',
    parentId: PHASE,
    completionCriteria: 'レビュー承認済み',
  }),
  candidate({
    id: TASK_B,
    code: 'P020-01-02',
    name: '非機能要件の整理',
    parentId: PHASE,
  }),
  candidate({ id: OTHER_ROOT, code: 'P099', name: '別案件' }),
]

describe('buildTaskCreationPlan', () => {
  it('指定ルート配下のリーフタスクを対象にする（コード昇順）', () => {
    const plan = buildTaskCreationPlan(PROJECTS, ROOT, [TASK_B, TASK_A])
    expect(plan.targets.map((t) => t.code)).toEqual([
      'P020-01-01',
      'P020-01-02',
    ])
    expect(plan.skips).toEqual([])
  })

  it('反証: 学習済み（起票済み）のタスクはskipする＝再実行しても二重起票しない', () => {
    const projects = PROJECTS.map((p) =>
      p.id === TASK_A
        ? { ...p, externalSource: 'github', externalTaskId: 'acme/webapp#1' }
        : p,
    )
    const plan = buildTaskCreationPlan(projects, ROOT, [TASK_A, TASK_B])
    expect(plan.targets.map((t) => t.code)).toEqual(['P020-01-02'])
    expect(plan.skips[0]).toMatchObject({ code: 'P020-01-01' })
    expect(plan.skips[0]?.reason).toMatch(/起票済み/)
  })

  it('反証: 別ツールで学習済みのタスクもskipする（1タスク1外部ツールの原則）', () => {
    const projects = PROJECTS.map((p) =>
      p.id === TASK_A
        ? { ...p, externalSource: 'backlog', externalTaskId: 'PORTAL-5' }
        : p,
    )
    const plan = buildTaskCreationPlan(projects, ROOT, [TASK_A])
    expect(plan.targets).toEqual([])
    expect(plan.skips[0]?.reason).toMatch(/起票済み/)
  })

  it('反証: 非リーフ（中間ノード）はskipする（完了操作はリーフのみのため）', () => {
    const plan = buildTaskCreationPlan(PROJECTS, ROOT, [PHASE])
    expect(plan.targets).toEqual([])
    expect(plan.skips[0]?.reason).toMatch(/リーフ/)
  })

  it('反証: 指定ルート配下に無いタスクIDは通さない（クライアント申告を信頼しない）', () => {
    const plan = buildTaskCreationPlan(PROJECTS, ROOT, [OTHER_ROOT])
    expect(plan.targets).toEqual([])
    expect(plan.skips[0]?.reason).toMatch(/配下/)
  })

  it('反証: 存在しないタスクIDはskipする（削除済みへの参照）', () => {
    const plan = buildTaskCreationPlan(PROJECTS, ROOT, [
      '00000000-0000-4000-8000-00000000dead',
    ])
    expect(plan.targets).toEqual([])
    expect(plan.skips).toHaveLength(1)
  })

  it('グループ（直近親の工程名）が対象に付く', () => {
    const plan = buildTaskCreationPlan(PROJECTS, ROOT, [TASK_A])
    expect(plan.targets[0]?.group).toBe('[P020-01] 要件定義')
  })
})

describe('buildCreatePayload', () => {
  const target = {
    id: TASK_A,
    code: 'P020-01-01',
    name: '業務要件の整理',
    completionCriteria: 'レビュー承認済み',
    group: '[P020-01] 要件定義',
    dueDate: null,
  }
  /** 所属工程のスケジュール終了日が解決できたタスク */
  const targetWithDue = { ...target, dueDate: '2026-03-31' }

  it('件名は[コード] タスク名・説明は完了条件（帰りの突合キーを保つ）', () => {
    const payload = buildCreatePayload(
      'github',
      { owner: 'acme', repo: 'webapp' },
      target,
    )
    expect(payload.path).toBe('/repos/acme/webapp/issues')
    expect(payload.body).toMatchObject({
      title: '[P020-01-01] 業務要件の整理',
      body: 'レビュー承認済み',
      labels: ['[P020-01] 要件定義'],
    })
  })

  describe('期日の送信', () => {
    it('Backlogは`dueDate`、Jiraは`duedate`、Asanaは`due_on`で送る', () => {
      expect(
        buildCreatePayload(
          'backlog',
          { projectId: 1, issueTypeId: 1, priorityId: 3 },
          targetWithDue,
        ).body,
      ).toMatchObject({ dueDate: '2026-03-31' })
      expect(
        (
          buildCreatePayload(
            'jira',
            { projectKey: 'PJ', issueTypeId: '1' },
            targetWithDue,
          ).body as { fields: Record<string, unknown> }
        ).fields,
      ).toMatchObject({ duedate: '2026-03-31' })
      expect(
        (
          buildCreatePayload('asana', { projectGid: '123' }, targetWithDue)
            .body as { data: Record<string, unknown> }
        ).data,
      ).toMatchObject({ due_on: '2026-03-31' })
    })

    it('反証: 期日が無いタスクはキー自体を送らない（空文字やnullを送らない）', () => {
      const backlogBody = buildCreatePayload(
        'backlog',
        { projectId: 1, issueTypeId: 1, priorityId: 3 },
        target,
      ).body
      expect(backlogBody).not.toHaveProperty('dueDate')
      const jiraFields = (
        buildCreatePayload(
          'jira',
          { projectKey: 'PJ', issueTypeId: '1' },
          target,
        ).body as { fields: Record<string, unknown> }
      ).fields
      expect(jiraFields).not.toHaveProperty('duedate')
      const asanaData = (
        buildCreatePayload('asana', { projectGid: '123' }, target).body as {
          data: Record<string, unknown>
        }
      ).data
      expect(asanaData).not.toHaveProperty('due_on')
    })

    it('反証: GitHubには期日を送らない（Issueに期日フィールドが無い）', () => {
      // マイルストーンは番号指定が必要で工程名からは解決できないため対象外
      const body = buildCreatePayload(
        'github',
        { owner: 'acme', repo: 'webapp' },
        targetWithDue,
      ).body
      expect(body).not.toHaveProperty('due_on')
      expect(body).not.toHaveProperty('dueDate')
      expect(body).not.toHaveProperty('duedate')
      expect(body).not.toHaveProperty('milestone')
    })
  })

  describe('Jiraのdescription（ADF形式）', () => {
    it('完了条件をADFドキュメント（オブジェクト）として送る', () => {
      // Jira API v3のdescriptionはリッチテキストのオブジェクト。
      // 文字列を渡すと400になるため、他3ツールと同じようには送れない
      const fields = (
        buildCreatePayload(
          'jira',
          { projectKey: 'PJ', issueTypeId: '1' },
          target,
        ).body as { fields: { description: unknown } }
      ).fields
      expect(fields.description).toEqual({
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'レビュー承認済み' }],
          },
        ],
      })
    })

    it('反証: 完了条件が空ならdescriptionキー自体を送らない（空のADFを送らない）', () => {
      const fields = (
        buildCreatePayload(
          'jira',
          { projectKey: 'PJ', issueTypeId: '1' },
          { ...target, completionCriteria: null },
        ).body as { fields: Record<string, unknown> }
      ).fields
      expect(fields).not.toHaveProperty('description')
    })

    it('改行は段落に分割する（ADFのtextノードは改行を含められない）', () => {
      const fields = (
        buildCreatePayload(
          'jira',
          { projectKey: 'PJ', issueTypeId: '1' },
          { ...target, completionCriteria: '1行目\n2行目' },
        ).body as { fields: { description: { content: unknown[] } } }
      ).fields
      expect(fields.description.content).toHaveLength(2)
      expect(fields.description.content[1]).toEqual({
        type: 'paragraph',
        content: [{ type: 'text', text: '2行目' }],
      })
    })
  })

  it('Backlogは起票先設定の種別・優先度を載せる', () => {
    const payload = buildCreatePayload(
      'backlog',
      { projectId: 12, issueTypeId: 3, priorityId: 3 },
      target,
    )
    expect(payload.path).toBe('/api/v2/issues')
    expect(payload.body).toMatchObject({
      projectId: 12,
      issueTypeId: 3,
      priorityId: 3,
      summary: '[P020-01-01] 業務要件の整理',
    })
  })

  it('反証: Backlogはform-urlencoded・他3ツールはJSON（公式の必須要件）', () => {
    // Backlog公式: Add Issue は "Content-Type:application/x-www-form-urlencoded"
    expect(
      buildCreatePayload(
        'backlog',
        { projectId: 1, issueTypeId: 1, priorityId: 3 },
        target,
      ).encoding,
    ).toBe('form')
    for (const [tool, config] of [
      ['jira', { projectKey: 'PJ', issueTypeId: '1' }],
      ['asana', { projectGid: '1' }],
      ['github', { owner: 'a', repo: 'b' }],
    ] as const) {
      const payload = buildCreatePayload(tool, config, target)
      expect(payload.encoding ?? 'json', tool).toBe('json')
    }
  })

  it('解決済みグループIDがBacklogのcategoryId[]へ載る', () => {
    const payload = buildCreatePayload(
      'backlog',
      { projectId: 12, issueTypeId: 3, priorityId: 3 },
      target,
      '77',
    )
    expect(payload.body).toMatchObject({ 'categoryId[]': '77' })
  })

  it('反証: グループ未解決（null）ならcategoryId[]を送らない（空カテゴリを作らない）', () => {
    const payload = buildCreatePayload(
      'backlog',
      { projectId: 12, issueTypeId: 3, priorityId: 3 },
      target,
      null,
    )
    expect('categoryId[]' in (payload.body as object)).toBe(false)
  })

  it('反証: Jiraのラベルは空白を含められないため正規化する', () => {
    const payload = buildCreatePayload(
      'jira',
      { projectKey: 'PORTAL', issueTypeId: '10001' },
      target,
    )
    const body = payload.body as {
      fields: { labels: string[]; summary: string }
    }
    expect(body.fields.labels[0]).toBe('[P020-01]-要件定義')
    expect(body.fields.labels[0]).not.toContain(' ')
    expect(body.fields.summary).toBe('[P020-01-01] 業務要件の整理')
  })

  it('Asanaはプロジェクト配下に作る（セクションは起票後に付ける）', () => {
    const payload = buildCreatePayload('asana', { projectGid: '111' }, target)
    expect(payload.path).toBe('/tasks')
    expect(payload.body).toMatchObject({
      data: {
        name: '[P020-01-01] 業務要件の整理',
        projects: ['111'],
      },
    })
  })

  it('反証: 完了条件が無いタスクの説明は空になる（undefinedを送らない）', () => {
    const payload = buildCreatePayload(
      'github',
      { owner: 'acme', repo: 'webapp' },
      { ...target, completionCriteria: null },
    )
    expect((payload.body as { body: string }).body).toBe('')
  })

  it('反証: グループが無いタスクにはラベルを付けない（空ラベルを作らない）', () => {
    const payload = buildCreatePayload(
      'github',
      { owner: 'acme', repo: 'webapp' },
      { ...target, group: null },
    )
    expect((payload.body as { labels?: string[] }).labels).toBeUndefined()
  })
})

describe('グループ解決（Backlog=カテゴリー／Asana=セクション）', () => {
  it('一覧・作成のエンドポイントをツール別に組み立てる', () => {
    expect(buildGroupListRequest('backlog', { projectId: 12 })?.path).toBe(
      '/api/v2/projects/12/categories',
    )
    expect(buildGroupListRequest('asana', { projectGid: '99' })?.path).toBe(
      '/projects/99/sections',
    )
    const created = buildGroupCreateRequest(
      'backlog',
      { projectId: 12 },
      '設計',
    )
    expect(created?.path).toBe('/api/v2/projects/12/categories')
    expect(created?.encoding).toBe('form')
    expect(created?.body).toEqual({ name: '設計' })
  })

  it('反証: Jira・GitHubはグループ解決を必要としない（ラベルは自由文字列）', () => {
    expect(buildGroupListRequest('jira', { projectKey: 'PJ' })).toBeNull()
    expect(
      buildGroupListRequest('github', { owner: 'a', repo: 'b' }),
    ).toBeNull()
    expect(
      buildGroupCreateRequest('github', { owner: 'a', repo: 'b' }, '設計'),
    ).toBeNull()
  })

  it('一覧レスポンスから名前一致の識別子を取り出す（Backlog=id / Asana=gid）', () => {
    expect(
      extractGroupId(
        'backlog',
        [
          { id: 1, name: '要件定義' },
          { id: 2, name: '設計' },
        ],
        '設計',
      ),
    ).toBe('2')
    expect(
      extractGroupId('asana', { data: [{ gid: '555', name: '設計' }] }, '設計'),
    ).toBe('555')
  })

  it('反証: 名前が一致しなければnull（別グループへ誤って割り当てない）', () => {
    expect(
      extractGroupId('backlog', [{ id: 1, name: '要件定義' }], '設計'),
    ).toBeNull()
    // 想定外のレスポンス形でも例外にせずnull
    expect(extractGroupId('backlog', { unexpected: true }, '設計')).toBeNull()
    expect(extractGroupId('asana', null, '設計')).toBeNull()
  })

  it('作成レスポンスから識別子を取り出す', () => {
    expect(extractCreatedGroupId('backlog', { id: 42, name: '設計' })).toBe(
      '42',
    )
    expect(extractCreatedGroupId('asana', { data: { gid: '77' } })).toBe('77')
    expect(extractCreatedGroupId('backlog', {})).toBeNull()
  })

  it('Asanaは起票後にセクションへ移す（作成時に指定できないため）', () => {
    const req = buildAddToSectionRequest('asana', '555', '999')
    expect(req?.path).toBe('/sections/555/addTask')
    expect(req?.body).toEqual({ data: { task: '999' } })
    // 反証: 他ツールは後追いの移動が不要
    expect(buildAddToSectionRequest('backlog', '1', '2')).toBeNull()
    expect(buildAddToSectionRequest('github', '1', '2')).toBeNull()
  })
})

describe('extractExternalId', () => {
  it('起票レスポンスからWebhookと同一形式の外部IDを取り出す', () => {
    expect(
      extractExternalId(
        'github',
        { owner: 'acme', repo: 'webapp' },
        { number: 123 },
      ),
    ).toBe('acme/webapp#123')
    expect(
      extractExternalId('backlog', { projectId: 1 }, { issueKey: 'PORTAL-9' }),
    ).toBe('PORTAL-9')
    expect(
      extractExternalId('jira', { projectKey: 'PJ' }, { key: 'PJ-42' }),
    ).toBe('PJ-42')
    expect(
      extractExternalId('asana', { projectGid: '1' }, { data: { gid: '555' } }),
    ).toBe('555')
  })

  it('反証: 期待した形でないレスポンスはnull（誤った外部IDを学習しない）', () => {
    expect(
      extractExternalId('github', { owner: 'a', repo: 'b' }, {}),
    ).toBeNull()
    expect(extractExternalId('jira', { projectKey: 'PJ' }, null)).toBeNull()
    expect(
      extractExternalId('backlog', { projectId: 1 }, { issueKey: 123 }),
    ).toBeNull()
  })
})
