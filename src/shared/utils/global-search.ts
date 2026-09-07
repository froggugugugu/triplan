import { findRootProjectId, type PhaseLinkNode } from './task-phase-utils'

/**
 * 横断検索のコア。プロジェクト・タスク・メンバーを1つの検索語で引き、
 * 該当画面への遷移先まで解決する純関数。
 *
 * 標準WBSテンプレートは1案件で50〜100タスクを生成するため、数案件運用した時点で
 * 「未完了のみ表示」トグルと目視スクロールでは目的のタスクへ到達できなくなる。
 */

/** 検索結果の上限。多すぎるとパレットが埋まり選べなくなる */
const MAX_RESULTS = 20

export type SearchResultKind = 'project' | 'task' | 'member'

export interface SearchResult {
  id: string
  kind: SearchResultKind
  /** 表示用の主ラベル（プロジェクト・タスクは名前、メンバーは氏名） */
  label: string
  /** 補助表示（プロジェクト・タスクはコード）。メンバーはnull */
  code: string | null
  /** 遷移先パス（クエリパラメータ込み） */
  to: string
}

/** 検索対象のプロジェクト（Projectから必要フィールドのみ） */
export interface SearchableProject extends PhaseLinkNode {
  code: string
  name: string
  level: number
}

/** 検索対象のメンバー（Memberから必要フィールドのみ） */
export interface SearchableMember {
  id: string
  name: string
  isActive: boolean
}

/**
 * マッチの強さ。小さいほど上位に出す。
 * 「探しているものが上に来る」ためにコードの完全一致を最優先し、前方一致・部分一致と続ける。
 */
const MATCH_EXACT = 0
const MATCH_PREFIX = 1
const MATCH_PARTIAL = 2
const NO_MATCH = 99

function scoreOf(haystacks: readonly string[], needle: string): number {
  let best = NO_MATCH
  for (const raw of haystacks) {
    const value = raw.toLowerCase()
    if (value === needle) return MATCH_EXACT
    if (value.startsWith(needle)) best = Math.min(best, MATCH_PREFIX)
    else if (value.includes(needle)) best = Math.min(best, MATCH_PARTIAL)
  }
  return best
}

/** 同じマッチ強度のときの種別の並び（プロジェクト→タスク→メンバー） */
const KIND_ORDER: Record<SearchResultKind, number> = {
  project: 0,
  task: 1,
  member: 2,
}

/**
 * 検索語にマッチするプロジェクト・タスク・メンバーを返す。
 * 空クエリでは何も返さない（全件を返してパレットを埋めない）。
 */
export function searchEntities(
  query: string,
  projects: readonly SearchableProject[],
  members: readonly SearchableMember[],
): SearchResult[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  const scored: Array<{ score: number; result: SearchResult }> = []

  for (const project of projects) {
    const score = scoreOf([project.code, project.name], needle)
    if (score === NO_MATCH) continue
    const isRoot = project.level === 0
    // タスクはルート案件のWBSを開く（WBS画面は案件単位で表示するため）。
    // 親が辿れない壊れたデータでは存在しないIDをクエリに載せない
    const rootId = isRoot ? project.id : findRootProjectId(project.id, projects)
    scored.push({
      score,
      result: {
        id: project.id,
        kind: isRoot ? 'project' : 'task',
        label: project.name,
        code: project.code,
        to: isRoot
          ? `/project-summary?projectId=${project.id}`
          : rootId
            ? `/wbs?projectId=${rootId}`
            : '/wbs',
      },
    })
  }

  for (const member of members) {
    // 退職済みは現在の体制を探す用途に合わないため対象外
    if (!member.isActive) continue
    const score = scoreOf([member.name], needle)
    if (score === NO_MATCH) continue
    scored.push({
      score,
      result: {
        id: member.id,
        kind: 'member',
        label: member.name,
        code: null,
        to: '/team',
      },
    })
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    const kindDiff = KIND_ORDER[a.result.kind] - KIND_ORDER[b.result.kind]
    if (kindDiff !== 0) return kindDiff
    // 決定論的に並べる（同点はコード→ラベルの辞書順）
    return (a.result.code ?? a.result.label).localeCompare(
      b.result.code ?? b.result.label,
      'ja',
    )
  })

  return scored.slice(0, MAX_RESULTS).map((s) => s.result)
}
