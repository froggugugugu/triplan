import type { Project } from '@/shared/types/project'
import {
  extractCodeFromSubject,
  resolveDateOnly,
} from '@/shared/utils/task-sync-core'

/**
 * 外部実行管理ツールとの完了同期（非公開の設計文書）の
 * コアロジック。すべて純関数で、ファイルI/O・ストア書込みはUI側が担う
 * （csv-import-utils.tsと同じ設計方針）。
 *
 * 突合の優先順位（§3）:
 * 1. externalSource＋externalTaskId一致（学習済みタスク。最優先）
 * 2. 件名中の`[コード]`抽出 → タスクコード完全一致
 * 3. 値そのものがコードに一致、またはタスク名完全一致
 * 複数一致（コード重複含む）・非リーフ解決は理由つきskip（誤帰属の防止）。
 */

/** 対応ツール（決定事項8: Backlog・Asana・Jira＋汎用。でGitHubを追加） */
export type TaskSyncTool = 'generic' | 'backlog' | 'asana' | 'jira' | 'github'

export const TASK_SYNC_TOOL_LABELS: Record<TaskSyncTool, string> = {
  generic: '汎用',
  backlog: 'Backlog',
  asana: 'Asana',
  jira: 'Jira',
  github: 'GitHub',
}

/** 完了判定モード: 状態列の語彙一致 or 完了日列の非空（Asanaは状態列を持たない） */
export type TaskSyncCompletionMode = 'status' | 'completedAtPresence'

export interface TaskSyncToolPreset {
  /** 列自動推定パターン（役割→ヘッダ名の正規表現） */
  columnPatterns: {
    subject: RegExp
    status?: RegExp
    completedAt?: RegExp
    externalKey?: RegExp
  }
  /** 完了扱いの語彙（statusモード。大文字小文字無視で比較） */
  completedValues: string[]
  mode: TaskSyncCompletionMode
}

/**
 * ツール別プリセット（§4.1）。列推定・完了語彙・判定モードの初期値で、
 * ウィザード上で手動修正できる。実際のエクスポート形式はツール・プランで
 * 揺れるため、推定はあくまで初期値の提示に留める。
 */
export const TASK_SYNC_TOOL_PRESETS: Record<TaskSyncTool, TaskSyncToolPreset> =
  {
    generic: {
      columnPatterns: {
        subject: /件名|タスク|subject|task|name|summary|title/i,
        status: /状態|ステータス|status|state/i,
        completedAt: /完了日|completed/i,
        externalKey: /キー|key|^id$/i,
      },
      completedValues: ['完了', '済', 'done', 'closed', 'resolved'],
      mode: 'status',
    },
    backlog: {
      columnPatterns: {
        subject: /件名/i,
        status: /状態/i,
        completedAt: /完了日/i,
        externalKey: /キー/i,
      },
      completedValues: ['完了'],
      mode: 'status',
    },
    asana: {
      // Asanaのエクスポートは状態列を持たず、`Completed At`の非空が完了を表す
      columnPatterns: {
        subject: /^name$/i,
        completedAt: /completed at/i,
        externalKey: /task id/i,
      },
      completedValues: [],
      mode: 'completedAtPresence',
    },
    jira: {
      columnPatterns: {
        subject: /summary/i,
        status: /status|状態/i,
        completedAt: /resolved|resolution date/i,
        externalKey: /issue key|^key$/i,
      },
      completedValues: ['done', 'closed', 'resolved', '完了'],
      mode: 'status',
    },
    github: {
      // `gh issue list --json number,title,state,closedAt` のCSV化を想定した推定。
      // externalKeyはあえて推定しない: 外部IDはWebhook・API起票経路が
      // `owner/repo#123`形式で学習するため、CSVのnumber列（`123`）を学習させると
      // 同一タスクなのに別IDになり経路間で突合が分裂する（§6.3）
      columnPatterns: {
        subject: /^title$|件名|タイトル/i,
        status: /^state$|^status$|状態/i,
        completedAt: /closed_?at|完了日/i,
      },
      completedValues: ['closed', 'done', '完了'],
      mode: 'status',
    },
  }

/** 完了CSV取込の列マッピング（subjectのみ必須） */
export interface TaskSyncColumnMapping {
  subject: number
  status?: number
  completedAt?: number
  externalKey?: number
}

/** ヘッダ名から列マッピングを自動推定する（同じ列は複数役割に割り当てない） */
export function suggestTaskSyncMapping(
  headers: string[],
  tool: TaskSyncTool,
): Partial<TaskSyncColumnMapping> {
  const preset = TASK_SYNC_TOOL_PRESETS[tool]
  const roles: Array<[keyof TaskSyncColumnMapping, RegExp | undefined]> = [
    ['externalKey', preset.columnPatterns.externalKey],
    ['completedAt', preset.columnPatterns.completedAt],
    ['status', preset.columnPatterns.status],
    ['subject', preset.columnPatterns.subject],
  ]
  const mapping: Partial<TaskSyncColumnMapping> = {}
  const used = new Set<number>()
  for (const [role, pattern] of roles) {
    if (!pattern) continue
    const idx = headers.findIndex(
      (h, i) => !used.has(i) && pattern.test(h.trim()),
    )
    if (idx >= 0) {
      mapping[role] = idx
      used.add(idx)
    }
  }
  return mapping
}

/**
 * リエクスポート: 実体はshared/utils/task-sync-core.ts（サーバーのWebhook受信と共用）
 * （Webhook受信エンドポイント（サーバー側、Phase 2）と共用するため）
 */
export {
  extractCodeFromSubject,
  resolveDateOnly,
} from '@/shared/utils/task-sync-core'

/** リーフタスク（子を持たないノード。子の無いルート単体もリーフ扱い=既存規則） */
export function collectLeafProjects(projects: Project[]): Project[] {
  const parentIds = new Set(
    projects.map((p) => p.parentId).filter((id): id is string => id !== null),
  )
  return projects.filter((p) => !parentIds.has(p.id))
}

export interface TaskSyncChange {
  taskId: string
  code: string
  name: string
  /** 変更前の完了状態 */
  before: boolean
  /** 変更後の完了状態 */
  after: boolean
  /** after=trueのときの完了日（イベント/CSVの完了日、無ければ取込実行日） */
  completedAt: string | null
  /** 学習保存する外部ID（externalKey列が無い・空なら null=学習しない） */
  learnExternalId: string | null
}

export interface TaskSyncSkip {
  row: number
  reason: string
}

export interface TaskSyncPlan {
  /** 状態が変わる行（適用対象） */
  changes: TaskSyncChange[]
  /** 解決できたが状態が変わらない件数（適用しない・学習もしない） */
  unchangedCount: number
  completedCount: number
  reopenedCount: number
  skips: TaskSyncSkip[]
}

export interface TaskSyncContext {
  projects: Project[]
  /** 学習保存するexternalSource（取込元ツールのスラッグ） */
  source: TaskSyncTool
  /** 完了日が無い行に使う日付（"YYYY-MM-DD"。決定論のため注入） */
  today: string
  completedValues: string[]
  mode: TaskSyncCompletionMode
}

/**
 * パース済みCSVのデータ行から完了同期計画（ドライラン結果）を構築する。
 * 解決できない行は理由つきskipへ回す（per-row skip）。
 * 同一タスクに複数行が解決された場合は最後の行が勝つ（一覧CSVでは通常1タスク1行）。
 */
export function buildTaskSyncPlan(
  dataRows: string[][],
  mapping: TaskSyncColumnMapping,
  ctx: TaskSyncContext,
): TaskSyncPlan {
  const skips: TaskSyncSkip[] = []
  const leaves = collectLeafProjects(ctx.projects)
  const leafIds = new Set(leaves.map((l) => l.id))
  const completedSet = new Set(
    ctx.completedValues.map((v) => v.trim().toLowerCase()),
  )

  // taskId → 解決済み行（最後の行が勝つ）
  const resolved = new Map<
    string,
    {
      after: boolean
      completedAt: string | null
      learnExternalId: string | null
    }
  >()

  dataRows.forEach((cells, index) => {
    const row = index + 2 // ヘッダ=1行目
    const subjectRaw = (cells[mapping.subject] ?? '').trim()
    const externalKeyRaw =
      mapping.externalKey !== undefined
        ? (cells[mapping.externalKey] ?? '').trim()
        : ''

    // --- タスク解決（優先順位: 外部ID → コード → 名前） ---
    let task: Project | undefined

    if (externalKeyRaw !== '') {
      const byExternal = ctx.projects.filter(
        (p) =>
          p.externalSource === ctx.source &&
          p.externalTaskId === externalKeyRaw,
      )
      if (byExternal.length === 1) task = byExternal[0]
    }

    if (!task) {
      const code = extractCodeFromSubject(subjectRaw) ?? subjectRaw
      if (code !== '') {
        const byCode = ctx.projects.filter((p) => p.code === code)
        if (byCode.length > 1) {
          skips.push({
            row,
            reason: `コードが重複しているため特定できません: ${code}`,
          })
          return
        }
        if (byCode.length === 1) task = byCode[0]
      }
      if (!task && subjectRaw !== '') {
        // 名前完全一致フォールバック（リーフのみ対象・複数一致はskip）
        const byName = leaves.filter((p) => p.name === subjectRaw)
        if (byName.length > 1) {
          skips.push({
            row,
            reason: `同名のタスクが複数あります: ${subjectRaw}`,
          })
          return
        }
        if (byName.length === 1) task = byName[0]
      }
    }

    if (!task) {
      skips.push({ row, reason: `タスクを特定できません: ${subjectRaw}` })
      return
    }
    if (!leafIds.has(task.id)) {
      skips.push({
        row,
        reason: `リーフタスクではありません（完了はリーフのみ対象）: ${task.code}`,
      })
      return
    }

    // --- 完了判定 ---
    const completedAtRaw =
      mapping.completedAt !== undefined
        ? (cells[mapping.completedAt] ?? '').trim()
        : ''
    let after: boolean
    if (ctx.mode === 'completedAtPresence') {
      after = completedAtRaw !== ''
    } else {
      if (mapping.status === undefined) {
        skips.push({ row, reason: '状態列がマッピングされていません' })
        return
      }
      const statusRaw = (cells[mapping.status] ?? '').trim().toLowerCase()
      after = completedSet.has(statusRaw)
    }

    const completedAt = after
      ? (resolveDateOnly(completedAtRaw) ?? ctx.today)
      : null

    resolved.set(task.id, {
      after,
      completedAt,
      // 外部IDは状態変化のあった行で学習保存する（未学習 or 変更時のみ）
      learnExternalId:
        externalKeyRaw !== '' &&
        (task.externalTaskId !== externalKeyRaw ||
          task.externalSource !== ctx.source)
          ? externalKeyRaw
          : null,
    })
  })

  const projectById = new Map(ctx.projects.map((p) => [p.id, p]))
  const changes: TaskSyncChange[] = []
  let unchangedCount = 0
  for (const [taskId, r] of resolved) {
    const task = projectById.get(taskId)
    if (!task) continue
    const before = task.completed ?? false
    if (before === r.after) {
      unchangedCount++
      continue
    }
    changes.push({
      taskId,
      code: task.code,
      name: task.name,
      before,
      after: r.after,
      completedAt: r.completedAt,
      learnExternalId: r.learnExternalId,
    })
  }
  changes.sort((a, b) => a.code.localeCompare(b.code))

  return {
    changes,
    unchangedCount,
    completedCount: changes.filter((c) => c.after).length,
    reopenedCount: changes.filter((c) => !c.after).length,
    skips,
  }
}

// ============================================================================
// 連携用WBSエクスポート（行き。§5）
// ============================================================================

/**
 * エクスポート対応形式（取込対応ツール＝`TaskSyncTool`のサブセット）。
 * GitHubはIssueのCSVインポート標準機能が無く、専用形式を出力しても食べさせる先が
 * 無いため含めない（行きはAPI起票が担う。 §6.4）。
 */
export type TaskSyncExportFormat = Exclude<TaskSyncTool, 'github'>

export const TASK_SYNC_EXPORT_FORMATS: readonly TaskSyncExportFormat[] = [
  'generic',
  'backlog',
  'asana',
  'jira',
]

/** エクスポートの出力形式（各ツールのインポーターが期待するヘッダ名で出し分け） */
export const TASK_SYNC_EXPORT_HEADERS: Record<TaskSyncExportFormat, string[]> =
  {
    generic: ['件名', 'グループ', '説明', '期日'],
    backlog: ['件名', 'カテゴリー', '詳細', '期限日'],
    asana: ['Name', 'Section/Column', 'Description', 'Due Date'],
    jira: ['Summary', 'Epic Link', 'Description', 'Due date'],
  }

/**
 * 選択中プロジェクト配下のリーフタスクを連携用CSVの行データへ変換する。
 * - 件名: `[コード] タスク名`（帰りの突合キー。§2）
 * - グループ列: 直近親の`[コード] 名前`（階層のグルーピング写像。§5.1。親が無い＝
 *   ルート単体のリーフは空）
 * - 説明: completionCriteria
 * - 期日: 空（WBSタスクと工程（ScheduleEntry）の紐付けが存在しないため。【仮定】
 *   各ツールのインポーターは空の期日を受け付ける）
 */
export function buildWbsExportRows(
  rootProjectId: string,
  projects: Project[],
  format: TaskSyncExportFormat,
): string[][] {
  const projectById = new Map(projects.map((p) => [p.id, p]))

  // 選択中ルート配下のノードのみに絞る（ルート自身を含む）
  const inTree = new Set<string>()
  const collect = (id: string) => {
    inTree.add(id)
    for (const p of projects) {
      if (p.parentId === id) collect(p.id)
    }
  }
  collect(rootProjectId)
  const treeProjects = projects.filter((p) => inTree.has(p.id))

  const leaves = collectLeafProjects(treeProjects).sort((a, b) =>
    a.code.localeCompare(b.code),
  )

  const rows: string[][] = [TASK_SYNC_EXPORT_HEADERS[format]]
  for (const leaf of leaves) {
    const parent = leaf.parentId ? projectById.get(leaf.parentId) : undefined
    rows.push([
      `[${leaf.code}] ${leaf.name}`,
      parent ? `[${parent.code}] ${parent.name}` : '',
      leaf.completionCriteria ?? '',
      '',
    ])
  }
  return rows
}
