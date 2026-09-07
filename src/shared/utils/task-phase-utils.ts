/**
 * WBSタスクと工程（スケジュール）の紐づけを解決する純関数群。
 *
 * 本ツールには「工程」が2つの姿で存在する:
 * - WBSツリーの上位ノード（`Project`。工数・進捗を持つが日付を持たない）
 * - スケジュールの工程（`PhaseSettings.phases` ＋ `ScheduleEntry`。日付を持つが進捗を持たない）
 *
 * 両者は長らく無関係だったため、ガントで引いた期間がWBSタスクへ降りず、
 * WBSで積んだ進捗がガントへ上がらなかった。`Project.phaseKey`はこの断絶を埋める
 * 唯一の接続点で、ここではその接続を辿るロジックだけを提供する。
 *
 * すべて純関数。クライアント（WBS・ガント）とサーバー（API起票の期日）で共用するため、
 * `task-creation-core.ts`と同じく**外部の型に依存しない最小インターフェース**で受ける
 * （`Project`/`EffortEntry`/`ScheduleEntry`は構造的部分型でそのまま渡せる）。
 */

/** 工程の継承を辿るのに必要な最小形 */
export interface PhaseLinkNode {
  id: string
  parentId: string | null
  phaseKey?: string | null
}

/** 工程進捗の算出に必要な最小形 */
export interface PhaseProgressNode extends PhaseLinkNode {
  completed?: boolean
}

/** 工程の期間を引くのに必要な最小形 */
export interface PhaseScheduleEntry {
  projectId: string
  phaseKey: string
  endDate: string
}

/** 工数の集計に必要な最小形 */
export interface PhaseEffortEntry {
  projectId: string
  columnId: string
  value: number
}

/** 親を辿る回数の上限。壊れたデータ（循環参照）で無限ループしないための保険 */
const MAX_ANCESTOR_HOPS = 32

/**
 * id→ノードの索引を配列単位でキャッシュする。
 *
 * これらの関数はループ（`calcPhaseProgress`のfilter、`buildMyTaskRows`、
 * `searchEntities`）から1件ずつ呼ばれるため、呼び出しごとに索引を作り直すと
 * **O(n²)** になる。実測では10,300件で`calcPhaseProgress`×5工程が23秒かかった
 * （2,120件でも650ms）。
 *
 * キーは配列の**参照**。Zustandはイミュータブル更新なので、中身が変われば参照も
 * 変わり古い索引は使われない（同じ参照のまま中身を書き換える使い方をしないこと）。
 * WeakMapのため参照が捨てられれば索引も一緒に回収される。
 */
const indexCache = new WeakMap<object, Map<string, PhaseLinkNode>>()

function nodeIndex(
  projects: readonly PhaseLinkNode[],
): Map<string, PhaseLinkNode> {
  const cached = indexCache.get(projects as object)
  if (cached) return cached
  const map = new Map(projects.map((p) => [p.id, p]))
  indexCache.set(projects as object, map)
  return map
}

/**
 * タスクが属するルート案件（level 0）のidを返す。
 * 親が辿れない・循環している場合はnull（推測しない）。
 */
export function findRootProjectId(
  taskId: string,
  projects: readonly PhaseLinkNode[],
): string | null {
  const byId = nodeIndex(projects)
  let current = byId.get(taskId)
  if (!current) return null

  for (let hop = 0; hop <= MAX_ANCESTOR_HOPS; hop++) {
    if (!current.parentId) return current.id
    const parent = byId.get(current.parentId)
    // 親が存在しない（孤児）・自己参照は不整合として扱う
    if (!parent || parent.id === current.id) return null
    current = parent
  }
  return null
}

/**
 * タスクに適用される工程キーを解決する。
 * 自身に設定があればそれを使い、無ければ最も近い祖先の設定を継承する
 * （工程ノードに1回設定すれば配下のタスク全体へ効く）。
 */
export function resolveTaskPhaseKey(
  taskId: string,
  projects: readonly PhaseLinkNode[],
): string | null {
  const byId = nodeIndex(projects)
  let current = byId.get(taskId)
  if (!current) return null

  for (let hop = 0; hop <= MAX_ANCESTOR_HOPS; hop++) {
    // 空文字は未設定として扱う（フォームのクリア結果が''で届きうるため）
    if (current.phaseKey) return current.phaseKey
    if (!current.parentId) return null
    const parent = byId.get(current.parentId)
    if (!parent || parent.id === current.id) return null
    current = parent
  }
  return null
}

/**
 * タスクの期日（＝適用される工程の終了日）を解決する。
 *
 * 工程が未設定、またはその工程にスケジュールが引かれていない場合はnullを返す
 * （案件のマスター納期で代用しない。「工程の終わり」と「案件の終わり」は別物で、
 * 後者を各タスクの期日として外部ツールへ送ると全タスクが同じ日付になり無意味になる）。
 */
export function resolveTaskDueDate(
  taskId: string,
  projects: readonly PhaseLinkNode[],
  scheduleEntries: readonly PhaseScheduleEntry[],
): string | null {
  const phaseKey = resolveTaskPhaseKey(taskId, projects)
  if (!phaseKey) return null
  const rootId = findRootProjectId(taskId, projects)
  if (!rootId) return null

  const entry = scheduleEntries.find(
    (e) => e.projectId === rootId && e.phaseKey === phaseKey,
  )
  return entry?.endDate ?? null
}

/**
 * 工程に属するリーフタスクの完了状況から、その工程の進捗率（0.0〜1.0）を算出する。
 * ガントバーへWBSの完了チェックをロールアップするために使う。
 *
 * **紐づくタスクが1件も無い場合はnullを返す**（0%とは区別する）。
 * まだ工程へタスクを紐づけていない状態を0%として描くと、着手していないのか
 * 紐づけていないだけなのかを画面から判別できなくなるため。
 *
 * 工数が全て0の工程はタスク数ベースへフォールバックする
 * （`calcWbsProgressWeighted`と同じ方針）。
 */
export function calcPhaseProgress(
  rootProjectId: string,
  phaseKey: string,
  projects: readonly PhaseProgressNode[],
  columnIds: readonly string[],
  efforts: readonly PhaseEffortEntry[],
): number | null {
  const parentIds = new Set(
    projects.map((p) => p.parentId).filter((id): id is string => Boolean(id)),
  )
  const targets = projects.filter(
    (p) =>
      // 非リーフ（工程ノード自身・中間ノード）は配下と二重に数えないため除外
      !parentIds.has(p.id) &&
      resolveTaskPhaseKey(p.id, projects) === phaseKey &&
      findRootProjectId(p.id, projects) === rootProjectId,
  )
  if (targets.length === 0) return null

  const enabledColumns = new Set(columnIds)
  // 工数はタスクごとに1回だけ畳み込む。targetsごとにefforts全件を走査すると
  // O(タスク数 × 工数エントリ数)になり、工程が多い大規模案件で無視できない
  const effortByProject = new Map<string, number>()
  for (const e of efforts) {
    if (!enabledColumns.has(e.columnId)) continue
    effortByProject.set(
      e.projectId,
      (effortByProject.get(e.projectId) ?? 0) + e.value,
    )
  }
  const effortOf = (projectId: string): number =>
    effortByProject.get(projectId) ?? 0

  const totalEffort = targets.reduce((sum, t) => sum + effortOf(t.id), 0)
  if (totalEffort === 0) {
    const done = targets.filter((t) => t.completed ?? false).length
    return done / targets.length
  }

  const completedEffort = targets
    .filter((t) => t.completed ?? false)
    .reduce((sum, t) => sum + effortOf(t.id), 0)
  return completedEffort / totalEffort
}
