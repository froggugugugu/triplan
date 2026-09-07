import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Member } from '@/shared/types/member'
import type { Project } from '@/shared/types/project'
import { parseAllocationInput } from '@/shared/utils/allocation-input-utils'

/**
 * 汎用CSV取込（P1-a Phase 2。非公開の設計文書）の
 * コアロジック。すべて純関数で、ファイルI/O・ストア書込みはウィザードUI側が担う。
 * 細粒度（日次・週次）の行も人×プロジェクト×タスク×月へ合算してから適用する。
 */

/** 取込CSVの列の役割 */
export type CsvColumnRole = 'member' | 'project' | 'task' | 'period' | 'value'

/** 列マッピング（値はヘッダ配列のインデックス。taskのみ任意） */
export interface CsvColumnMapping {
  member: number
  project: number
  period: number
  value: number
  task?: number
}

/** 工数値の単位 */
export type EffortUnit = 'manMonth' | 'manDay' | 'hour'

export const EFFORT_UNIT_LABELS: Record<EffortUnit, string> = {
  manMonth: '人月',
  manDay: '人日',
  hour: '時間',
}

/**
 * ヘッダ名から列マッピングを自動推定する（手動修正はウィザード側）。
 * 複数列がマッチした場合は最初の列を採用する。
 */
export function suggestColumnMapping(
  headers: string[],
): Partial<CsvColumnMapping> {
  const patterns: Array<[keyof CsvColumnMapping, RegExp]> = [
    ['member', /mail|メール|担当|氏名|名前|member|user|社員/i],
    ['task', /タスク|task/i],
    ['project', /プロジェクト|案件|project|pj/i],
    ['period', /年月|月|日付|期間|date|month|period/i],
    ['value', /工数|人月|人日|時間|value|effort|hour|man/i],
  ]
  const mapping: Partial<CsvColumnMapping> = {}
  const used = new Set<number>()
  for (const [role, pattern] of patterns) {
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
 * 期間文字列を月キー（"YYYY-MM"）へ解決する。
 * `YYYY-MM`／`YYYY/MM`／`YYYY-MM-DD`／`YYYY/MM/DD` を受け付け、日次・週次の行は
 * 属する月へ丸める。解釈できない場合はnull。
 */
export function resolvePeriodToMonth(raw: string): string | null {
  const trimmed = raw.trim()
  const m = trimmed.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?$/)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12) return null
  if (m[3] !== undefined) {
    const day = Number(m[3])
    if (day < 1 || day > 31) return null
  }
  return `${year}-${String(month).padStart(2, '0')}`
}

/**
 * 工数値を人月へ換算する（0.01刻みへ丸め）。
 * 人日→人月は`workdaysPerMonth`（P0-a設定値）、時間→人日は`hoursPerDay`（P1-a新設）。
 */
export function convertToManMonths(
  value: number,
  unit: EffortUnit,
  workdaysPerMonth: number,
  hoursPerDay: number,
): number {
  let manMonths = value
  if (unit === 'manDay') {
    manMonths = value / workdaysPerMonth
  } else if (unit === 'hour') {
    manMonths = value / hoursPerDay / workdaysPerMonth
  }
  return Math.round(manMonths * 100) / 100
}

/** 取込候補1件（人×プロジェクト×タスク×月へ合算済み） */
export interface ImportCandidate {
  memberId: string
  memberName: string
  projectId: string
  projectLabel: string
  taskId: string
  taskName: string
  month: string
  /** 人月換算・合算・丸め済みの取込値 */
  value: number
  /** 既存アサインレコード（member×project×task一致）のid。無ければ計画外の新規 */
  assignmentId: string | null
  /** 対象月の計画値（レコード無し・キー欠落は0） */
  planned: number
}

export interface ImportSkip {
  /** CSV上の行番号（ヘッダ=1行目、データ行は2始まり） */
  row: number
  reason: string
}

export interface ImportPlan {
  candidates: ImportCandidate[]
  skips: ImportSkip[]
  /** 既存アサインレコードへの上書き件数 */
  overrideCount: number
  /** 計画外の新規レコード件数 */
  unplannedCount: number
  /** 取込対象の月（昇順・重複なし） */
  targetMonths: string[]
  /** 取込値の合計（人月） */
  totalValue: number
  /** 対応する計画値の合計（人月）。乖離表示用 */
  totalPlanned: number
}

export interface ImportContext {
  members: Member[]
  projects: Project[]
  assignments: AssignmentEntry[]
  workdaysPerMonth: number
  hoursPerDay: number
  /** 締め済み月（P1-b）。該当月の行はper-row skipになる */
  closedMonths?: Set<string>
}

interface ResolvedRow {
  row: number
  memberId: string
  projectId: string
  taskId: string
  month: string
  value: number
}

/** トップレベル案件配下のリーフタスク（子を持たないノード）。子が無い案件はroot自身 */
function collectLeafTasks(rootId: string, projects: Project[]): Project[] {
  const byParent = new Map<string | null, Project[]>()
  for (const p of projects) {
    const list = byParent.get(p.parentId) ?? []
    list.push(p)
    byParent.set(p.parentId, list)
  }
  const leaves: Project[] = []
  const walk = (parentId: string) => {
    for (const child of byParent.get(parentId) ?? []) {
      const grandChildren = byParent.get(child.id) ?? []
      if (grandChildren.length === 0) {
        leaves.push(child)
      } else {
        walk(child.id)
      }
    }
  }
  walk(rootId)
  if (leaves.length === 0) {
    const root = projects.find((p) => p.id === rootId)
    if (root) return [root]
  }
  return leaves
}

/**
 * パース済みCSVのデータ行から取込計画（ドライラン結果）を構築する。
 * 解決できない行はスキップ理由（行番号付き）へ回し、解決できた行だけを
 * 人×プロジェクト×タスク×月へ合算する（per-row skip。DESIGN §5.2）。
 *
 * - メンバー解決: email一致（大文字小文字無視）を優先し、氏名完全一致へフォールバック。
 *   同名複数はスキップ（誤帰属の防止）
 * - プロジェクト解決: トップレベル案件（level===0）のコード完全一致→名称完全一致
 * - タスク解決: タスク列があれば配下リーフのコード/名称一致。無ければ
 *   リーフが1件の案件のみ自動解決（複数はスキップ＝要タスク指定）
 */
export function buildImportPlan(
  dataRows: string[][],
  mapping: CsvColumnMapping,
  unit: EffortUnit,
  ctx: ImportContext,
): ImportPlan {
  const skips: ImportSkip[] = []
  const resolved: ResolvedRow[] = []

  const membersByEmail = new Map<string, Member[]>()
  const membersByName = new Map<string, Member[]>()
  for (const m of ctx.members) {
    if (m.email) {
      const key = m.email.toLowerCase()
      membersByEmail.set(key, [...(membersByEmail.get(key) ?? []), m])
    }
    membersByName.set(m.name, [...(membersByName.get(m.name) ?? []), m])
  }
  const rootProjects = ctx.projects.filter((p) => p.level === 0)
  const leafCache = new Map<string, Project[]>()
  const leavesOf = (rootId: string): Project[] => {
    let leaves = leafCache.get(rootId)
    if (!leaves) {
      leaves = collectLeafTasks(rootId, ctx.projects)
      leafCache.set(rootId, leaves)
    }
    return leaves
  }

  dataRows.forEach((cells, index) => {
    const row = index + 2 // ヘッダ=1行目
    const memberRaw = (cells[mapping.member] ?? '').trim()
    const projectRaw = (cells[mapping.project] ?? '').trim()
    const taskRaw =
      mapping.task !== undefined ? (cells[mapping.task] ?? '').trim() : ''
    const periodRaw = (cells[mapping.period] ?? '').trim()
    const valueRaw = (cells[mapping.value] ?? '').trim()

    // メンバー解決
    const emailMatches = membersByEmail.get(memberRaw.toLowerCase()) ?? []
    let member: Member | undefined
    if (emailMatches.length === 1) {
      member = emailMatches[0]
    } else if (emailMatches.length === 0) {
      const nameMatches = membersByName.get(memberRaw) ?? []
      if (nameMatches.length === 1) {
        member = nameMatches[0]
      } else if (nameMatches.length > 1) {
        skips.push({
          row,
          reason: `同名のメンバーが複数います（emailで指定してください）: ${memberRaw}`,
        })
        return
      }
    }
    if (!member) {
      skips.push({ row, reason: `メンバーが見つかりません: ${memberRaw}` })
      return
    }

    // プロジェクト解決（コード優先→名称。複数一致はskip=誤帰属防止、で
    // 完了同期設計のコード一意性議論から水平展開）
    const byCode = rootProjects.filter((p) => p.code === projectRaw)
    const byName =
      byCode.length === 0
        ? rootProjects.filter((p) => p.name === projectRaw)
        : []
    if (byCode.length > 1 || byName.length > 1) {
      skips.push({
        row,
        reason: `プロジェクトの候補が複数あり特定できません: ${projectRaw}`,
      })
      return
    }
    const project = byCode[0] ?? byName[0]
    if (!project) {
      skips.push({ row, reason: `プロジェクトが見つかりません: ${projectRaw}` })
      return
    }

    // タスク解決（複数一致はskip、同上）
    const leaves = leavesOf(project.id)
    let task: Project | undefined
    if (taskRaw !== '') {
      const taskByCode = leaves.filter((t) => t.code === taskRaw)
      const taskByName =
        taskByCode.length === 0 ? leaves.filter((t) => t.name === taskRaw) : []
      if (taskByCode.length > 1 || taskByName.length > 1) {
        skips.push({
          row,
          reason: `タスクの候補が複数あり特定できません: ${taskRaw}`,
        })
        return
      }
      task = taskByCode[0] ?? taskByName[0]
      if (!task) {
        skips.push({ row, reason: `タスクが見つかりません: ${taskRaw}` })
        return
      }
    } else if (leaves.length === 1) {
      task = leaves[0]
    } else {
      skips.push({
        row,
        reason: `タスクを特定できません（プロジェクトに複数のタスクがあります）: ${projectRaw}`,
      })
      return
    }
    if (!task) return

    // 期間解決
    const month = resolvePeriodToMonth(periodRaw)
    if (!month) {
      skips.push({ row, reason: `期間を解釈できません: ${periodRaw}` })
      return
    }

    // 締め済み月の行はスキップ（他月の行は適用する。P1-b月次締めハードロック）
    if (ctx.closedMonths?.has(month)) {
      skips.push({ row, reason: `締め済みの月です: ${month}` })
      return
    }

    // 工数値パース（全角対応・0以上。実績は上限なし）
    const value = parseAllocationInput(valueRaw)
    if (value === null) {
      skips.push({ row, reason: `工数値を解釈できません: ${valueRaw}` })
      return
    }

    resolved.push({
      row,
      memberId: member.id,
      projectId: project.id,
      taskId: task.id,
      month,
      value,
    })
  })

  // 人×プロジェクト×タスク×月へ合算（単位変換前の生値で合算し、変換・丸めは合算後）
  const aggregated = new Map<string, ResolvedRow>()
  for (const r of resolved) {
    const key = `${r.memberId}|${r.projectId}|${r.taskId}|${r.month}`
    const existing = aggregated.get(key)
    if (existing) {
      existing.value += r.value
    } else {
      aggregated.set(key, { ...r })
    }
  }

  const memberById = new Map(ctx.members.map((m) => [m.id, m]))
  const projectById = new Map(ctx.projects.map((p) => [p.id, p]))
  const candidates: ImportCandidate[] = []
  for (const r of aggregated.values()) {
    const assignment = ctx.assignments.find(
      (a) =>
        a.memberId === r.memberId &&
        a.projectId === r.projectId &&
        a.taskId === r.taskId,
    )
    const project = projectById.get(r.projectId)
    const task = projectById.get(r.taskId)
    candidates.push({
      memberId: r.memberId,
      memberName: memberById.get(r.memberId)?.name ?? '',
      projectId: r.projectId,
      projectLabel: project ? `${project.code} ${project.name}` : '',
      taskId: r.taskId,
      taskName: task?.name ?? '',
      month: r.month,
      value: convertToManMonths(
        r.value,
        unit,
        ctx.workdaysPerMonth,
        ctx.hoursPerDay,
      ),
      assignmentId: assignment?.id ?? null,
      planned: assignment?.monthlyValues[r.month] ?? 0,
    })
  }
  candidates.sort(
    (a, b) =>
      a.memberName.localeCompare(b.memberName, 'ja') ||
      a.projectLabel.localeCompare(b.projectLabel, 'ja') ||
      a.taskName.localeCompare(b.taskName, 'ja') ||
      a.month.localeCompare(b.month),
  )

  const targetMonths = [...new Set(candidates.map((c) => c.month))].sort()
  return {
    candidates,
    skips,
    overrideCount: candidates.filter((c) => c.assignmentId !== null).length,
    unplannedCount: candidates.filter((c) => c.assignmentId === null).length,
    targetMonths,
    totalValue:
      Math.round(candidates.reduce((sum, c) => sum + c.value, 0) * 100) / 100,
    totalPlanned:
      Math.round(candidates.reduce((sum, c) => sum + c.planned, 0) * 100) / 100,
  }
}
