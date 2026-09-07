import type {
  SkillEvaluation,
  SkillEvaluatorType,
  SkillLevel,
} from '@/shared/types/skill'

/** レベルの序列（比較・進捗計算に使用） */
export const SKILL_LEVEL_ORDER: Record<SkillLevel, number> = {
  none: 0,
  beginner: 1,
  intermediate: 2,
  advanced: 3,
  expert: 4,
}

/** レベルの表示ラベル（行動基準の定義は全タグ共通） */
export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  none: '未経験',
  beginner: '初級',
  intermediate: '中級',
  advanced: '上級',
  expert: 'エキスパート',
}

/** レベルアップ判定（トースト通知のトリガー判定に使用） */
export function isSkillLevelUp(before: SkillLevel, after: SkillLevel): boolean {
  return SKILL_LEVEL_ORDER[after] > SKILL_LEVEL_ORDER[before]
}

/**
 * member×techTagId×evaluatorTypeの現在レベルを評価履歴から導出する（最新のevaluatedAtの
 * afterLevel）。同日に複数件ある場合はcreatedAtが新しい方を採用する。
 * 該当履歴が1件もない場合はnull（＝未評価。'none'レベルとは意味的に区別する）。
 */
export function getCurrentSkillLevel(
  evaluations: SkillEvaluation[],
  memberId: string,
  techTagId: string,
  evaluatorType: SkillEvaluatorType,
): SkillLevel | null {
  const matched = evaluations.filter(
    (e) =>
      e.memberId === memberId &&
      e.techTagId === techTagId &&
      e.evaluatorType === evaluatorType,
  )
  if (matched.length === 0) return null

  const sorted = [...matched].sort((a, b) => {
    const dateCompare = b.evaluatedAt.localeCompare(a.evaluatedAt)
    if (dateCompare !== 0) return dateCompare
    return b.createdAt.localeCompare(a.createdAt)
  })

  return sorted[0]?.afterLevel ?? null
}

/**
 * 成長ロードマップの進捗率（%）を算出する。
 * targetLevelが'none'の場合は達成不要のため常に100を返す。
 * currentLevelが未評価（null）の場合は'none'相当（進捗0からの計算）として扱う（設計判断⑦）。
 */
export function calcSkillRoadmapProgress(
  currentLevel: SkillLevel | null,
  targetLevel: SkillLevel,
): number {
  const targetIndex = SKILL_LEVEL_ORDER[targetLevel]
  if (targetIndex <= 0) return 100
  const currentIndex = currentLevel ? SKILL_LEVEL_ORDER[currentLevel] : 0
  return Math.min(100, Math.round((currentIndex / targetIndex) * 100))
}

/** レビュー周期（固定3ヶ月、設計判断⑤。設定UIは設けない） */
export const SKILL_REVIEW_CYCLE_MONTHS = 3

/**
 * 定期評価の見直し要否を判定する（設計判断④のリマインドバッジ表示に使用）。
 * 最終評価日から`cycleMonths`ヶ月以上経過している場合、または一度も評価されていない場合にtrue。
 * タイムゾーン問題を避けるため`new Date('YYYY-MM-DD')`は使わず年月日を分解して比較する
 * （docs/development-patterns.md の既知の落とし穴を踏襲）。
 */
export function isSkillEvaluationStale(
  lastEvaluatedAt: string | null,
  baseDate: Date,
  cycleMonths = SKILL_REVIEW_CYCLE_MONTHS,
): boolean {
  if (!lastEvaluatedAt) return true

  const [year, month, day] = lastEvaluatedAt.split('-').map(Number) as [
    number,
    number,
    number,
  ]
  const lastDate = new Date(year, month - 1, day)

  const thresholdDate = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth() - cycleMonths,
    baseDate.getDate(),
  )

  return lastDate <= thresholdDate
}
