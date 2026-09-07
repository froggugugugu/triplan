import type {
  EstimateMethod,
  EstimateSnapshot,
  FpItem,
  FpItemType,
} from '@/shared/types/estimate-snapshot'

export const ESTIMATE_METHOD_LABELS: Record<EstimateMethod, string> = {
  function_point: '簡易FP',
  wbs: 'WBS積み上げ',
  manual: '手入力',
  actual: '実績',
}

/** 版の昇順（同案件内）。入力順に依存しない */
export function sortSnapshotsByVersion(
  snapshots: readonly EstimateSnapshot[],
): EstimateSnapshot[] {
  return [...snapshots].sort((a, b) => a.version - b.version)
}

/** 対象案件の版を昇順で返す */
export function getSnapshotsForProject(
  snapshots: readonly EstimateSnapshot[],
  projectId: string,
): EstimateSnapshot[] {
  return sortSnapshotsByVersion(
    snapshots.filter((s) => s.projectId === projectId),
  )
}

/** 最新版（最大version）。無ければnull */
export function getLatestSnapshot(
  snapshots: readonly EstimateSnapshot[],
  projectId: string,
): EstimateSnapshot | null {
  return getSnapshotsForProject(snapshots, projectId).at(-1) ?? null
}

/** 最新のFP版（CRで増えた機能を含めて比較するため「最新」を採る）。無ければnull */
export function getLatestFpSnapshot(
  snapshots: readonly EstimateSnapshot[],
  projectId: string,
): EstimateSnapshot | null {
  return (
    getSnapshotsForProject(snapshots, projectId)
      .filter((s) => s.method === 'function_point' && s.fp)
      .at(-1) ?? null
  )
}

export interface FpItemChange {
  name: string
  before: { type: FpItemType; count: number }
  after: { type: FpItemType; count: number }
}

export interface FpItemDiff {
  added: FpItem[]
  removed: FpItem[]
  changed: FpItemChange[]
}

export interface EstimateSnapshotDiff {
  /** 前版が無ければnull */
  effortDaysDelta: number | null
  amountDelta: number | null
  /** 両方がFP版のときだけ算出。それ以外はnull（工数・金額の差のみ） */
  fpItems: FpItemDiff | null
}

/**
 * 前版との差分をUIで導出する（保存しない）。FP項目は**名前一致**で突合し、
 * 追加・削除・件数（または種別）の変化を返す。同名が複数あれば先勝ち（件数は合算しない）
 */
export function diffEstimateSnapshots(
  previous: EstimateSnapshot | null,
  next: EstimateSnapshot,
): EstimateSnapshotDiff {
  if (!previous) {
    return { effortDaysDelta: null, amountDelta: null, fpItems: null }
  }
  const effortDaysDelta =
    Math.round((next.effortDays - previous.effortDays) * 100) / 100
  const amountDelta = next.amount - previous.amount
  const prevFp = previous.fp ?? null
  const nextFp = next.fp ?? null
  if (!prevFp || !nextFp) {
    return { effortDaysDelta, amountDelta, fpItems: null }
  }
  const prevByName = new Map<string, FpItem>()
  for (const item of prevFp.items) {
    if (!prevByName.has(item.name)) prevByName.set(item.name, item)
  }
  const seen = new Set<string>()
  const added: FpItem[] = []
  const changed: FpItemChange[] = []
  for (const item of nextFp.items) {
    if (seen.has(item.name)) continue
    seen.add(item.name)
    const before = prevByName.get(item.name)
    if (!before) {
      added.push(item)
      continue
    }
    if (before.count !== item.count || before.type !== item.type) {
      changed.push({
        name: item.name,
        before: { type: before.type, count: before.count },
        after: { type: item.type, count: item.count },
      })
    }
  }
  const removed = [...prevByName.values()].filter(
    (item) => !seen.has(item.name),
  )
  return { effortDaysDelta, amountDelta, fpItems: { added, removed, changed } }
}
