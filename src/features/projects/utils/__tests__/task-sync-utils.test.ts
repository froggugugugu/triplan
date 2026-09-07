import { describe, expect, it } from 'vitest'
import type { Project } from '@/shared/types/project'
import {
  buildTaskSyncPlan,
  buildWbsExportRows,
  collectLeafProjects,
  extractCodeFromSubject,
  resolveDateOnly,
  suggestTaskSyncMapping,
  TASK_SYNC_EXPORT_FORMATS,
  TASK_SYNC_TOOL_LABELS,
  TASK_SYNC_TOOL_PRESETS,
  type TaskSyncColumnMapping,
  type TaskSyncContext,
} from '../task-sync-utils'

const NOW = '2026-09-01T00:00:00.000Z'
const ROOT_ID = '00000000-0000-4000-8000-00000000f001'
const PHASE_ID = '00000000-0000-4000-8000-00000000f010'
const TASK_A_ID = '00000000-0000-4000-8000-00000000f011'
const TASK_B_ID = '00000000-0000-4000-8000-00000000f012'
const SOLO_ROOT_ID = '00000000-0000-4000-8000-00000000f002'

function buildProject(overrides: Partial<Project> & { id: string }): Project {
  return {
    code: 'P001',
    name: 'プロジェクト',
    parentId: null,
    level: 0,
    status: 'active',
    confidence: null,
    completed: false,
    completedAt: null,
    externalSource: null,
    externalTaskId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Project
}

const PROJECTS: Project[] = [
  buildProject({ id: ROOT_ID, code: 'P012', name: '顧客ポータル刷新' }),
  buildProject({
    id: PHASE_ID,
    code: 'P012-03',
    name: '実装',
    parentId: ROOT_ID,
    level: 1,
  }),
  buildProject({
    id: TASK_A_ID,
    code: 'P012-03-01',
    name: 'ログイン機能',
    parentId: PHASE_ID,
    level: 2,
  }),
  buildProject({
    id: TASK_B_ID,
    code: 'P012-03-02',
    name: '検索機能',
    parentId: PHASE_ID,
    level: 2,
    completed: true,
    completedAt: '2026-08-20',
  }),
  buildProject({ id: SOLO_ROOT_ID, code: 'P099', name: '単体プロジェクト' }),
]

const MAPPING: TaskSyncColumnMapping = {
  externalKey: 0,
  subject: 1,
  status: 2,
  completedAt: 3,
}

function buildCtx(overrides: Partial<TaskSyncContext> = {}): TaskSyncContext {
  return {
    projects: PROJECTS,
    source: 'backlog',
    today: '2026-10-10',
    completedValues: ['完了'],
    mode: 'status',
    ...overrides,
  }
}

describe('extractCodeFromSubject', () => {
  it('件名の最初の角括弧からコードを抽出する', () => {
    expect(extractCodeFromSubject('[P012-03-01] ログイン機能')).toBe(
      'P012-03-01',
    )
    expect(extractCodeFromSubject('前置き [A] [B]')).toBe('A')
  })

  it('反証: 角括弧が無い・空の角括弧はnull', () => {
    expect(extractCodeFromSubject('ログイン機能')).toBeNull()
    expect(extractCodeFromSubject('[] 名前')).toBeNull()
  })
})

describe('resolveDateOnly', () => {
  it('YYYY-MM-DD・YYYY/M/D・ISO datetimeの前方一致を受け付ける', () => {
    expect(resolveDateOnly('2026-10-03')).toBe('2026-10-03')
    expect(resolveDateOnly('2026/10/3')).toBe('2026-10-03')
    expect(resolveDateOnly('2026-10-03T12:34:56.000Z')).toBe('2026-10-03')
  })

  it('反証: 暦として存在しない日付はnull（外部ツールの手編集で届きうる）', () => {
    // 形式は合っているが実在しない日付。で受理してしまうバグを発見・修正
    expect(resolveDateOnly('2026-02-30')).toBeNull()
    expect(resolveDateOnly('2026-04-31')).toBeNull()
    expect(resolveDateOnly('2025-02-29')).toBeNull()
    // 閏年の2/29は受理する
    expect(resolveDateOnly('2024-02-29')).toBe('2024-02-29')
  })

  it('反証: 解釈できない形式・範囲外はnull', () => {
    for (const raw of ['', 'いつか', '2026-13-01', '2026-10-32', '10/03']) {
      expect(resolveDateOnly(raw)).toBeNull()
    }
  })
})

describe('collectLeafProjects', () => {
  it('子を持たないノードのみ返す（子の無いルート単体もリーフ扱い）', () => {
    const leaves = collectLeafProjects(PROJECTS)
    expect(leaves.map((l) => l.code).sort()).toEqual([
      'P012-03-01',
      'P012-03-02',
      'P099',
    ])
  })
})

describe('suggestTaskSyncMapping', () => {
  it('Backlogのヘッダから推定する', () => {
    expect(
      suggestTaskSyncMapping(['キー', '件名', '状態', '完了日'], 'backlog'),
    ).toEqual({ externalKey: 0, subject: 1, status: 2, completedAt: 3 })
  })

  it('Asanaのヘッダから推定する（状態列なし・Completed At）', () => {
    expect(
      suggestTaskSyncMapping(['Task ID', 'Name', 'Completed At'], 'asana'),
    ).toEqual({ externalKey: 0, subject: 1, completedAt: 2 })
  })

  it('Jiraのヘッダから推定する', () => {
    expect(
      suggestTaskSyncMapping(
        ['Issue key', 'Summary', 'Status', 'Resolved'],
        'jira',
      ),
    ).toEqual({ externalKey: 0, subject: 1, status: 2, completedAt: 3 })
  })

  it('反証: 同じ列を複数の役割に割り当てない', () => {
    const mapping = suggestTaskSyncMapping(['名前'], 'generic')
    const values = Object.values(mapping)
    expect(new Set(values).size).toBe(values.length)
  })

  it('GitHubのヘッダから推定する（gh issue list --json の列名）', () => {
    expect(
      suggestTaskSyncMapping(
        ['number', 'title', 'state', 'closedAt'],
        'github',
      ),
    ).toEqual({ subject: 1, status: 2, completedAt: 3 })
  })

  it('反証: GitHubのnumber列をexternalKeyとして推定しない（外部IDはowner/repo#Nのため経路間で分裂する）', () => {
    const mapping = suggestTaskSyncMapping(
      ['number', 'title', 'state', 'closedAt'],
      'github',
    )
    expect(mapping.externalKey).toBeUndefined()
  })
})

describe('TASK_SYNC_TOOL_PRESETS.github / エクスポート形式の分離', () => {
  it('反証: CLOSED（大文字）が完了扱いになる（gh --json stateの出力）', () => {
    const plan = buildTaskSyncPlan(
      [['', '[P012-03-01] ログイン機能', 'CLOSED', '2026-10-03T09:00:00Z']],
      { subject: 1, status: 2, completedAt: 3 },
      buildCtx({
        source: 'github',
        completedValues: TASK_SYNC_TOOL_PRESETS.github.completedValues,
        mode: TASK_SYNC_TOOL_PRESETS.github.mode,
      }),
    )
    expect(plan.skips).toEqual([])
    expect(plan.changes).toHaveLength(1)
    expect(plan.changes[0]).toMatchObject({
      taskId: TASK_A_ID,
      after: true,
      completedAt: '2026-10-03',
      // externalKey列が無いため学習しない（Webhook/API起票経路に委ねる）
      learnExternalId: null,
    })
  })

  it('反証: エクスポート形式にgithubを含めない（IssueのCSVインポート標準機能が無い）', () => {
    expect(TASK_SYNC_EXPORT_FORMATS).toEqual([
      'generic',
      'backlog',
      'asana',
      'jira',
    ])
    expect(TASK_SYNC_EXPORT_FORMATS).not.toContain('github')
    // 取込側（ツール選択）にはgithubが存在する
    expect(TASK_SYNC_TOOL_LABELS.github).toBe('GitHub')
  })
})

describe('buildTaskSyncPlan', () => {
  it('件名のコード抽出で解決し、未完了→完了の変更が計画される', () => {
    const plan = buildTaskSyncPlan(
      [['PORTAL-101', '[P012-03-01] ログイン機能', '完了', '2026/10/03']],
      MAPPING,
      buildCtx(),
    )
    expect(plan.skips).toEqual([])
    expect(plan.changes).toHaveLength(1)
    expect(plan.changes[0]).toMatchObject({
      taskId: TASK_A_ID,
      before: false,
      after: true,
      completedAt: '2026-10-03',
      learnExternalId: 'PORTAL-101',
    })
    expect(plan.completedCount).toBe(1)
    expect(plan.reopenedCount).toBe(0)
  })

  it('完了→未完了へ戻す行も同期される（completedAt=null）', () => {
    const plan = buildTaskSyncPlan(
      [['', '[P012-03-02] 検索機能', '処理中', '']],
      MAPPING,
      buildCtx(),
    )
    expect(plan.changes[0]).toMatchObject({
      taskId: TASK_B_ID,
      before: true,
      after: false,
      completedAt: null,
    })
    expect(plan.reopenedCount).toBe(1)
  })

  it('反証: 状態が変わらない行は適用対象にならない（unchangedCount）', () => {
    const plan = buildTaskSyncPlan(
      [['', '[P012-03-02] 検索機能', '完了', '2026-08-20']],
      MAPPING,
      buildCtx(),
    )
    expect(plan.changes).toHaveLength(0)
    expect(plan.unchangedCount).toBe(1)
  })

  it('完了日が無い完了行はtoday（取込実行日）を使う', () => {
    const plan = buildTaskSyncPlan(
      [['', '[P012-03-01] ログイン機能', '完了', '']],
      MAPPING,
      buildCtx(),
    )
    expect(plan.changes[0]?.completedAt).toBe('2026-10-10')
  })

  it('外部ID一致が最優先で、件名からコードが消えていても追跡できる', () => {
    const projects = PROJECTS.map((p) =>
      p.id === TASK_A_ID
        ? { ...p, externalSource: 'backlog', externalTaskId: 'PORTAL-101' }
        : p,
    )
    const plan = buildTaskSyncPlan(
      // 件名が書き換えられてコードが無い
      [['PORTAL-101', 'ログイン機能（OAuth対応版）', '完了', '2026-10-05']],
      MAPPING,
      buildCtx({ projects }),
    )
    expect(plan.skips).toEqual([])
    expect(plan.changes[0]?.taskId).toBe(TASK_A_ID)
    // 学習済みと同じ値のため再学習は不要
    expect(plan.changes[0]?.learnExternalId).toBeNull()
  })

  it('反証: 別sourceの外部IDは一致扱いしない（backlogのIDをjiraの取込で使わない）', () => {
    const projects = PROJECTS.map((p) =>
      p.id === TASK_A_ID
        ? { ...p, externalSource: 'backlog', externalTaskId: 'PORTAL-101' }
        : p,
    )
    const plan = buildTaskSyncPlan(
      [['PORTAL-101', 'コードなし件名', 'done', '']],
      MAPPING,
      buildCtx({ projects, source: 'jira', completedValues: ['done'] }),
    )
    expect(plan.changes).toHaveLength(0)
    expect(plan.skips[0]?.reason).toContain('タスクを特定できません')
  })

  it('値そのものがコードの行（コード列運用）も解決できる', () => {
    const plan = buildTaskSyncPlan(
      [['', 'P012-03-01', '完了', '']],
      MAPPING,
      buildCtx(),
    )
    expect(plan.changes[0]?.taskId).toBe(TASK_A_ID)
  })

  it('タスク名完全一致フォールバック（リーフのみ・一意のみ）', () => {
    const plan = buildTaskSyncPlan(
      [['', 'ログイン機能', '完了', '']],
      MAPPING,
      buildCtx(),
    )
    expect(plan.changes[0]?.taskId).toBe(TASK_A_ID)
  })

  it('反証: コードが重複している場合はskipし、どちらにも書き込まない（誤帰属防止の核心）', () => {
    const projects = [
      ...PROJECTS,
      buildProject({
        id: '00000000-0000-4000-8000-00000000f099',
        code: 'P012-03-01', // TASK_Aと重複
        name: '重複コードタスク',
        parentId: SOLO_ROOT_ID,
        level: 1,
      }),
    ]
    const plan = buildTaskSyncPlan(
      [['', '[P012-03-01] ログイン機能', '完了', '']],
      MAPPING,
      buildCtx({ projects }),
    )
    expect(plan.changes).toHaveLength(0)
    expect(plan.skips[0]?.reason).toContain('コードが重複')
  })

  it('反証: 非リーフ（中間ノード）に解決された行はskipする', () => {
    const plan = buildTaskSyncPlan(
      [['', '[P012-03] 実装', '完了', '']],
      MAPPING,
      buildCtx(),
    )
    expect(plan.changes).toHaveLength(0)
    expect(plan.skips[0]?.reason).toContain('リーフタスクではありません')
  })

  it('反証: 同名タスクが複数ある場合の名前フォールバックはskipする', () => {
    const projects = [
      ...PROJECTS,
      buildProject({
        id: '00000000-0000-4000-8000-00000000f098',
        code: 'P099-01',
        name: 'ログイン機能', // TASK_Aと同名
        parentId: SOLO_ROOT_ID,
        level: 1,
      }),
    ]
    const plan = buildTaskSyncPlan(
      [['', 'ログイン機能', '完了', '']],
      MAPPING,
      buildCtx({ projects }),
    )
    expect(plan.changes).toHaveLength(0)
    expect(plan.skips[0]?.reason).toContain('同名のタスクが複数')
  })

  it('completedAtPresenceモード（Asana型）: 完了日の非空=完了・空=未完了', () => {
    const mapping: TaskSyncColumnMapping = {
      externalKey: 0,
      subject: 1,
      completedAt: 2,
    }
    const plan = buildTaskSyncPlan(
      [
        ['123', '[P012-03-01] ログイン機能', '2026-10-03'],
        ['456', '[P012-03-02] 検索機能', ''],
      ],
      mapping,
      buildCtx({
        source: 'asana',
        mode: 'completedAtPresence',
        completedValues: [],
      }),
    )
    expect(plan.completedCount).toBe(1)
    expect(plan.reopenedCount).toBe(1)
    expect(plan.changes.find((c) => c.taskId === TASK_A_ID)?.completedAt).toBe(
      '2026-10-03',
    )
  })

  it('完了語彙は大文字小文字を無視して比較する（Jira: Done/done/DONE）', () => {
    const plan = buildTaskSyncPlan(
      [['', '[P012-03-01] ログイン機能', 'DONE', '']],
      MAPPING,
      buildCtx({ source: 'jira', completedValues: ['done'] }),
    )
    expect(plan.completedCount).toBe(1)
  })

  it('同一タスクに複数行が解決された場合は最後の行が勝つ', () => {
    const plan = buildTaskSyncPlan(
      [
        ['', '[P012-03-01] ログイン機能', '完了', '2026-10-01'],
        ['', '[P012-03-01] ログイン機能', '処理中', ''],
      ],
      MAPPING,
      buildCtx(),
    )
    // 最後の行=未完了。beforeもfalseのため変化なし
    expect(plan.changes).toHaveLength(0)
    expect(plan.unchangedCount).toBe(1)
  })

  it('per-row skip: 解決不能行が混ざっても解決できた行は適用される', () => {
    const plan = buildTaskSyncPlan(
      [
        ['', '[P012-03-01] ログイン機能', '完了', ''],
        ['', '存在しないタスク', '完了', ''],
      ],
      MAPPING,
      buildCtx(),
    )
    expect(plan.changes).toHaveLength(1)
    expect(plan.skips).toHaveLength(1)
    expect(plan.skips[0]?.row).toBe(3)
  })
})

describe('buildWbsExportRows', () => {
  it('リーフのみを件名[コード]＋直近親グループ列で出力する（コード順）', () => {
    const rows = buildWbsExportRows(ROOT_ID, PROJECTS, 'generic')
    expect(rows[0]).toEqual(['件名', 'グループ', '説明', '期日'])
    expect(rows.slice(1)).toEqual([
      ['[P012-03-01] ログイン機能', '[P012-03] 実装', '', ''],
      ['[P012-03-02] 検索機能', '[P012-03] 実装', '', ''],
    ])
  })

  it('形式ごとにヘッダ名が切り替わる（中身は同一）', () => {
    const backlog = buildWbsExportRows(ROOT_ID, PROJECTS, 'backlog')
    const asana = buildWbsExportRows(ROOT_ID, PROJECTS, 'asana')
    expect(backlog[0]).toEqual(['件名', 'カテゴリー', '詳細', '期限日'])
    expect(asana[0]).toEqual([
      'Name',
      'Section/Column',
      'Description',
      'Due Date',
    ])
    expect(backlog.slice(1)).toEqual(asana.slice(1))
  })

  it('反証: 選択プロジェクト配下のみが対象（他プロジェクトのリーフは含めない）', () => {
    const rows = buildWbsExportRows(ROOT_ID, PROJECTS, 'generic')
    expect(rows.flat().join()).not.toContain('P099')
  })

  it('子の無いルート単体はリーフとして出力され、グループ列は空', () => {
    const rows = buildWbsExportRows(SOLO_ROOT_ID, PROJECTS, 'generic')
    expect(rows.slice(1)).toEqual([['[P099] 単体プロジェクト', '', '', '']])
  })

  it('completionCriteriaが説明列へ転記される', () => {
    const projects = PROJECTS.map((p) =>
      p.id === TASK_A_ID ? { ...p, completionCriteria: '単体テストパス' } : p,
    )
    const rows = buildWbsExportRows(ROOT_ID, projects, 'generic')
    expect(rows[1]?.[2]).toBe('単体テストパス')
  })
})
