import type { Division } from '@/shared/types/division'
import type { Project } from '@/shared/types/project'
import { isValidDateOnly } from './iso-week-utils'
import {
  buildHeaderIndex,
  cellAt,
  type ImportSkip,
  parseOptionalNumber,
} from './master-import-core'

/**
 * プロジェクト・タスクCSV一括登録の突合（純関数）。
 *
 * 階層は「親コード」列で表す。**行の順序に依存しない**（親が後の行にあっても解決する）。
 * コードから親子を推測する方式（`P001-01`の親は`P001`）は採らない——
 * 命名規約から外れたコードを黙って別の親にぶら下げる事故が起きるため。
 */

const STATUS_BY_LABEL: Record<string, Project['status']> = {
  未着手: 'not_started',
  進行中: 'active',
  完了: 'completed',
}
const PRIORITY_BY_LABEL: Record<string, NonNullable<Project['priority']>> = {
  高: 'high',
  中: 'medium',
  低: 'low',
}
const CONTRACT_TYPES = ['請負', '準委任', '派遣', '混在'] as const
const CONFIDENCES = ['S', 'A', 'B', 'C'] as const
/** Projectスキーマのlevel上限 */
const MAX_LEVEL = 5

export interface ProjectImportCandidate {
  row: number
  code: string
  name: string
  /** 親のコード。null=最上位 */
  parentCode: string | null
  /** 既存プロジェクトの親id。同じCSV内の行が親なら適用時に解決するのでnull */
  parentId: string | null
  level: number
  description: string | null
  completionCriteria: string | null
  status: Project['status']
  confidence: Project['confidence']
  divisionName: string | null
  divisionId: string | null
  clientName: string | null
  contractAmount: number | null
  priority: Project['priority']
  contractType: Project['contractType']
  masterDueDate: string | null
}

export interface ProjectImportPlan {
  /** 親→子の順に並べ替え済み（この順に作れば親が必ず先にある） */
  candidates: ProjectImportCandidate[]
  skips: ImportSkip[]
  newDivisions: string[]
}

export interface ProjectImportContext {
  projects: Project[]
  divisions: Division[]
  autoCreateMasters: boolean
}

interface DraftRow {
  row: number
  code: string
  name: string
  parentCode: string | null
  raw: string[]
}

export function buildProjectImportPlan(
  rows: string[][],
  ctx: ProjectImportContext,
): ProjectImportPlan {
  const [headerRow, ...dataRows] = rows
  const plan: ProjectImportPlan = {
    candidates: [],
    skips: [],
    newDivisions: [],
  }
  if (!headerRow) return plan

  const index = buildHeaderIndex(headerRow)
  for (const required of ['コード', '名前']) {
    if (!index.has(required)) {
      plan.skips.push({ row: 1, reason: `「${required}」列が見つかりません` })
      return plan
    }
  }

  const existingByCode = new Map(ctx.projects.map((p) => [p.code, p]))
  const divisionByName = new Map(ctx.divisions.map((d) => [d.name, d]))
  const pendingDivisions = new Set<string>()

  // 1周目: 行を読み、コードの重複を検出する
  const drafts: DraftRow[] = []
  const codeCount = new Map<string, number>()
  dataRows.forEach((raw, i) => {
    const rowNo = i + 2
    if (raw.every((c) => !c.trim())) return

    const code = cellAt(raw, index, 'コード')
    const name = cellAt(raw, index, '名前')
    if (!code) {
      plan.skips.push({ row: rowNo, reason: 'コードが空です' })
      return
    }
    if (!name) {
      plan.skips.push({ row: rowNo, reason: '名前が空です' })
      return
    }
    if (existingByCode.has(code)) {
      plan.skips.push({
        row: rowNo,
        reason: `既に登録済みのコードです（${code}）`,
      })
      return
    }
    codeCount.set(code, (codeCount.get(code) ?? 0) + 1)
    drafts.push({
      row: rowNo,
      code,
      name,
      parentCode: cellAt(raw, index, '親コード') || null,
      raw,
    })
  })

  // CSV内で重複したコードは、どちらが正しいか決められないので両方skipする
  // （突合キーになるコードで新たな重複を作らない。完了同期の流儀と同じ）
  const duplicated = new Set(
    [...codeCount.entries()].filter(([, n]) => n > 1).map(([code]) => code),
  )
  const unique = drafts.filter((d) => {
    if (!duplicated.has(d.code)) return true
    plan.skips.push({
      row: d.row,
      reason: `CSV内でコードが重複しています（${d.code}）`,
    })
    return false
  })

  // 2周目: 親を解決してlevelを決める。行順に依存しないよう、
  // 「levelが確定した行」が増えなくなるまで繰り返す
  const draftByCode = new Map(unique.map((d) => [d.code, d]))
  const resolvedLevel = new Map<string, number>()
  let remaining = [...unique]
  for (;;) {
    const next: DraftRow[] = []
    let progressed = false
    for (const d of remaining) {
      if (!d.parentCode) {
        resolvedLevel.set(d.code, 0)
        progressed = true
        continue
      }
      const existingParent = existingByCode.get(d.parentCode)
      if (existingParent) {
        resolvedLevel.set(d.code, existingParent.level + 1)
        progressed = true
        continue
      }
      const parentLevel = resolvedLevel.get(d.parentCode)
      if (parentLevel !== undefined) {
        resolvedLevel.set(d.code, parentLevel + 1)
        progressed = true
        continue
      }
      next.push(d)
    }
    remaining = next
    if (!progressed || remaining.length === 0) break
  }

  for (const d of remaining) {
    // 親が既存にもCSV内にも無い、または親子が循環している
    const reason = draftByCode.has(d.parentCode ?? '')
      ? `親子関係が循環しています（${d.code}）`
      : `親コード「${d.parentCode}」が見つかりません`
    plan.skips.push({ row: d.row, reason })
  }

  const accepted = unique.filter((d) => resolvedLevel.has(d.code))
  for (const d of accepted) {
    const rowNo = d.row
    const level = resolvedLevel.get(d.code) ?? 0
    const skip = (reason: string) => plan.skips.push({ row: rowNo, reason })

    if (level > MAX_LEVEL) {
      skip(`階層が深すぎます（${level}階層目。${MAX_LEVEL}階層までです）`)
      continue
    }

    const rawStatus = cellAt(d.raw, index, 'ステータス')
    if (rawStatus && !STATUS_BY_LABEL[rawStatus]) {
      skip(`ステータスは未着手／進行中／完了のいずれかです（${rawStatus}）`)
      continue
    }
    const status: Project['status'] = rawStatus
      ? (STATUS_BY_LABEL[rawStatus] ?? 'not_started')
      : 'not_started'

    // 最上位だけが持つ属性。タスク行に書かれていても取り込まない
    const isRoot = level === 0
    const topLevelOnly = (key: string): string => {
      const value = cellAt(d.raw, index, key)
      return isRoot ? value : ''
    }

    const rawConfidence = topLevelOnly('確度')
    if (
      rawConfidence &&
      !CONFIDENCES.includes(rawConfidence as (typeof CONFIDENCES)[number])
    ) {
      skip(`確度はS／A／B／Cのいずれかです（${rawConfidence}）`)
      continue
    }

    const rawPriority = topLevelOnly('優先度')
    if (rawPriority && !PRIORITY_BY_LABEL[rawPriority]) {
      skip(`優先度は高／中／低のいずれかです（${rawPriority}）`)
      continue
    }

    const rawContractType = topLevelOnly('契約形態')
    if (
      rawContractType &&
      !CONTRACT_TYPES.includes(
        rawContractType as (typeof CONTRACT_TYPES)[number],
      )
    ) {
      skip(
        `契約形態は請負／準委任／派遣／混在のいずれかです（${rawContractType}）`,
      )
      continue
    }

    const rawDue = topLevelOnly('マスター納期')
    if (rawDue && !isValidDateOnly(rawDue)) {
      skip(
        `マスター納期はYYYY-MM-DD形式で実在する日付を指定してください（${rawDue}）`,
      )
      continue
    }

    const rawAmount = topLevelOnly('受注金額')
    let contractAmount: number | null = null
    if (rawAmount) {
      const parsed = parseOptionalNumber(rawAmount)
      if (parsed === null || parsed < 0) {
        skip(`受注金額は0以上の数値で指定してください（${rawAmount}）`)
        continue
      }
      contractAmount = parsed
    }

    const divisionName = topLevelOnly('担当部門') || null
    let divisionId: string | null = null
    if (divisionName) {
      const division = divisionByName.get(divisionName)
      if (!division && !ctx.autoCreateMasters) {
        skip(`部門「${divisionName}」が登録されていません`)
        continue
      }
      if (division) divisionId = division.id
      else pendingDivisions.add(divisionName)
    }

    plan.candidates.push({
      row: rowNo,
      code: d.code,
      name: d.name,
      parentCode: d.parentCode,
      parentId: d.parentCode
        ? (existingByCode.get(d.parentCode)?.id ?? null)
        : null,
      level,
      description: cellAt(d.raw, index, '説明') || null,
      completionCriteria: cellAt(d.raw, index, '完了条件') || null,
      status,
      confidence: rawConfidence
        ? (rawConfidence as NonNullable<Project['confidence']>)
        : null,
      divisionName,
      divisionId,
      clientName: topLevelOnly('発注元') || null,
      contractAmount,
      priority: rawPriority ? (PRIORITY_BY_LABEL[rawPriority] ?? null) : null,
      contractType: rawContractType
        ? (rawContractType as NonNullable<Project['contractType']>)
        : null,
      masterDueDate: rawDue || null,
    })
  }

  // 親が先に作られるようlevel昇順で並べる（同一levelは行順を保つ）
  plan.candidates.sort((a, b) => a.level - b.level || a.row - b.row)
  plan.newDivisions = [...pendingDivisions].sort()
  return plan
}
