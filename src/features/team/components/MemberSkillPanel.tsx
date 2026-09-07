import { ChevronDown, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { skillEvaluationFormSchema } from '@/infrastructure/validation/schemas'
import { cn } from '@/lib/utils'
import { Button } from '@/shared/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/shared/components/ui/collapsible'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table'
import { useToast } from '@/shared/hooks/use-toast'
import type { Member, SkillEvaluatorType, SkillLevel } from '@/shared/types'
import { SKILL_LEVELS } from '@/shared/types'
import {
  calcSkillRoadmapProgress,
  isSkillEvaluationStale,
  isSkillLevelUp,
  SKILL_LEVEL_LABELS,
} from '@/shared/utils/skill-utils'
import { useBudgetStore, useSkillStore, useTechTagsStore } from '@/stores'
import { SkillLevelBadge } from './SkillLevelBadge'

const EVALUATOR_TYPE_LABELS: Record<SkillEvaluatorType, string> = {
  self: '本人',
  manager: '上長',
}

function getTodayDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getCurrentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

interface MemberSkillPanelProps {
  member: Member
}

/**
 * メンバー詳細ダイアログ（TeamMemberDialog）の編集時に「スキル・成長記録」タブとして
 * 組み込むパネル。requirements-skill-growth.md ①〜⑤に対応する「レベル一覧」
 * 「成長タイムライン」「成長ロードマップ」の3セクションで構成する。タブ自体が
 * 開閉の役割を兼ねるため、パネル内部では折りたたみを持たない。
 */
export function MemberSkillPanel({ member }: MemberSkillPanelProps) {
  const { toast } = useToast()
  const techTags = useTechTagsStore((s) => s.techTags)
  const loadTechTags = useTechTagsStore((s) => s.loadTechTags)
  const skillEvaluations = useSkillStore((s) => s.skillEvaluations)
  // スキルレビュー周期（P0-a設定化。既定3ヶ月）
  const skillReviewCycleMonths = useBudgetStore((s) => s.skillReviewCycleMonths)
  const skillRoadmapGoals = useSkillStore((s) => s.skillRoadmapGoals)
  const loadSkillData = useSkillStore((s) => s.loadSkillData)
  const addSkillEvaluation = useSkillStore((s) => s.addSkillEvaluation)
  const addSkillRoadmapGoal = useSkillStore((s) => s.addSkillRoadmapGoal)
  const getCurrentLevel = useSkillStore((s) => s.getCurrentLevel)
  const getCurrentRoadmapGoal = useSkillStore((s) => s.getCurrentRoadmapGoal)
  const getSkillRoadmapGoalHistory = useSkillStore(
    (s) => s.getSkillRoadmapGoalHistory,
  )

  useEffect(() => {
    loadSkillData()
    loadTechTags()
  }, [loadSkillData, loadTechTags])

  const [showGoalHistory, setShowGoalHistory] = useState(false)

  const memberTags = useMemo(
    () => techTags.filter((t) => (member.techTagIds ?? []).includes(t.id)),
    [techTags, member.techTagIds],
  )

  // 評価記録フォームの状態
  const [evalTagId, setEvalTagId] = useState('')
  const [evaluatorType, setEvaluatorType] = useState<SkillEvaluatorType>('self')
  const [afterLevel, setAfterLevel] = useState<SkillLevel>('beginner')
  const [evaluatedAt, setEvaluatedAt] = useState(getTodayDate)
  const [evalNote, setEvalNote] = useState('')

  const handleSubmitEvaluation = useCallback(() => {
    const result = skillEvaluationFormSchema.safeParse({
      techTagId: evalTagId,
      evaluatorType,
      afterLevel,
      evaluatedAt,
      note: evalNote || null,
    })
    if (!result.success) {
      toast({
        title: result.error.issues[0]?.message ?? '入力内容を確認してください',
        variant: 'destructive',
      })
      return
    }
    const beforeLevel =
      getCurrentLevel(member.id, result.data.techTagId, evaluatorType) ?? 'none'
    addSkillEvaluation({
      memberId: member.id,
      techTagId: result.data.techTagId,
      evaluatorType: result.data.evaluatorType,
      beforeLevel,
      afterLevel: result.data.afterLevel,
      evaluatedAt: result.data.evaluatedAt,
      note: result.data.note,
    })
    const tagName =
      memberTags.find((t) => t.id === result.data.techTagId)?.name ?? ''
    if (isSkillLevelUp(beforeLevel, result.data.afterLevel)) {
      toast({
        title: `${tagName}のレベルが${SKILL_LEVEL_LABELS[result.data.afterLevel]}に上がりました！`,
      })
    } else {
      toast({ title: '評価を記録しました' })
    }
    setEvalNote('')
  }, [
    evalTagId,
    evaluatorType,
    afterLevel,
    evaluatedAt,
    evalNote,
    member.id,
    memberTags,
    getCurrentLevel,
    addSkillEvaluation,
    toast,
  ])

  // 成長タイムライン: 該当メンバーの全評価履歴を横断して評価日降順
  const timeline = useMemo(
    () =>
      skillEvaluations
        .filter((e) => e.memberId === member.id)
        .sort((a, b) => {
          const dateCompare = b.evaluatedAt.localeCompare(a.evaluatedAt)
          return dateCompare !== 0
            ? dateCompare
            : b.createdAt.localeCompare(a.createdAt)
        }),
    [skillEvaluations, member.id],
  )

  // ロードマップフォームの状態
  const [goalTagId, setGoalTagId] = useState('')
  const [targetLevel, setTargetLevel] = useState<SkillLevel>('intermediate')
  const [targetDate, setTargetDate] = useState(getCurrentMonthKey)
  const [goalNote, setGoalNote] = useState('')

  const handleSubmitGoal = useCallback(() => {
    if (!goalTagId) {
      toast({ title: '技術タグを選択してください', variant: 'destructive' })
      return
    }
    addSkillRoadmapGoal({
      memberId: member.id,
      techTagId: goalTagId,
      targetLevel,
      targetDate,
      note: goalNote || null,
    })
    toast({ title: '成長ロードマップの目標を更新しました' })
    setGoalNote('')
  }, [
    goalTagId,
    targetLevel,
    targetDate,
    goalNote,
    member.id,
    addSkillRoadmapGoal,
    toast,
  ])

  // 参照用: skillRoadmapGoalsの変更を検知して再レンダーするための購読
  const roadmapTagIds = useMemo(() => {
    const ids = new Set<string>()
    for (const goal of skillRoadmapGoals) {
      if (goal.memberId === member.id) ids.add(goal.techTagId)
    }
    return Array.from(ids)
  }, [skillRoadmapGoals, member.id])

  if (memberTags.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        技術タグが未設定です。先に「基本情報」タブで技術タグを設定してください。
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {/* 1. レベル一覧 */}
      <div className="space-y-2">
        <Label>スキルレベル一覧</Label>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>タグ</TableHead>
              <TableHead>本人評価</TableHead>
              <TableHead>上長評価</TableHead>
              <TableHead>要見直し</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {memberTags.map((tag) => {
              const selfLevel = getCurrentLevel(member.id, tag.id, 'self')
              const managerLevel = getCurrentLevel(member.id, tag.id, 'manager')
              const lastEvaluatedAt =
                [...timeline.filter((e) => e.techTagId === tag.id)][0]
                  ?.evaluatedAt ?? null
              const stale = isSkillEvaluationStale(
                lastEvaluatedAt,
                new Date(),
                skillReviewCycleMonths,
              )
              return (
                <TableRow key={tag.id}>
                  <TableCell>{tag.name}</TableCell>
                  <TableCell>
                    <SkillLevelBadge level={selfLevel} />
                  </TableCell>
                  <TableCell>
                    <SkillLevelBadge level={managerLevel} />
                  </TableCell>
                  <TableCell>
                    {stale && (
                      <span className="text-xs font-medium text-destructive">
                        要見直し
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="skill-eval-tag" className="text-xs">
              評価対象タグ
            </Label>
            <select
              id="skill-eval-tag"
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
              value={evalTagId}
              onChange={(e) => setEvalTagId(e.target.value)}
            >
              <option value="">選択してください</option>
              {memberTags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="skill-eval-evaluator" className="text-xs">
              評価者区分
            </Label>
            <select
              id="skill-eval-evaluator"
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
              value={evaluatorType}
              onChange={(e) =>
                setEvaluatorType(e.target.value as SkillEvaluatorType)
              }
            >
              {Object.entries(EVALUATOR_TYPE_LABELS).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}として記録
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="skill-eval-level" className="text-xs">
              レベル
            </Label>
            <select
              id="skill-eval-level"
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
              value={afterLevel}
              onChange={(e) => setAfterLevel(e.target.value as SkillLevel)}
            >
              {SKILL_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {SKILL_LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="skill-eval-date" className="text-xs">
              評価日
            </Label>
            <Input
              id="skill-eval-date"
              type="date"
              value={evaluatedAt}
              onChange={(e) => setEvaluatedAt(e.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-3">
            <Label htmlFor="skill-eval-note" className="text-xs">
              備考（任意）
            </Label>
            <Input
              id="skill-eval-note"
              value={evalNote}
              onChange={(e) => setEvalNote(e.target.value)}
              placeholder="例: ペアプロで習得"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              size="sm"
              className="w-full"
              onClick={handleSubmitEvaluation}
            >
              評価を記録
            </Button>
          </div>
        </div>
      </div>

      {/* 2. 成長タイムライン */}
      <div className="space-y-2">
        <Label>成長タイムライン</Label>
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            評価記録はまだありません
          </p>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {timeline.map((entry) => {
              const tagName =
                techTags.find((t) => t.id === entry.techTagId)?.name ?? ''
              return (
                <div
                  key={entry.id}
                  className="flex items-center justify-between border-b border-border/60 px-1 py-1.5 text-sm last:border-b-0"
                >
                  <div>
                    <p>
                      {entry.evaluatedAt} ・ {tagName} ・{' '}
                      {EVALUATOR_TYPE_LABELS[entry.evaluatorType]}評価
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {SKILL_LEVEL_LABELS[entry.beforeLevel]} →{' '}
                      {SKILL_LEVEL_LABELS[entry.afterLevel]}
                      {entry.note ? ` ・ ${entry.note}` : ''}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 3. 成長ロードマップ */}
      <div className="space-y-2">
        <Label>成長ロードマップ</Label>
        {roadmapTagIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            目標はまだ設定されていません
          </p>
        ) : (
          <div className="space-y-2">
            {roadmapTagIds.map((tagId) => {
              const tagName = techTags.find((t) => t.id === tagId)?.name ?? ''
              const goal = getCurrentRoadmapGoal(member.id, tagId)
              if (!goal) return null
              const managerLevel = getCurrentLevel(member.id, tagId, 'manager')
              const selfLevel = getCurrentLevel(member.id, tagId, 'self')
              // 代表レベル: 上長評価を優先、未記録時のみ自己評価（ダッシュボード集計と同じ方針）
              const representativeLevel = managerLevel ?? selfLevel
              const progress = calcSkillRoadmapProgress(
                representativeLevel,
                goal.targetLevel,
              )
              return (
                <div
                  key={tagId}
                  className="rounded-md border border-border p-2 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{tagName}</span>
                    <span className="text-xs text-muted-foreground">
                      目標: {SKILL_LEVEL_LABELS[goal.targetLevel]}（
                      {goal.targetDate}まで）
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    進捗 {progress}%
                  </p>
                </div>
              )
            })}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="skill-goal-tag" className="text-xs">
              目標タグ
            </Label>
            <select
              id="skill-goal-tag"
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
              value={goalTagId}
              onChange={(e) => setGoalTagId(e.target.value)}
            >
              <option value="">選択してください</option>
              {memberTags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="skill-goal-level" className="text-xs">
              目標レベル
            </Label>
            <select
              id="skill-goal-level"
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
              value={targetLevel}
              onChange={(e) => setTargetLevel(e.target.value as SkillLevel)}
            >
              {SKILL_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {SKILL_LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="skill-goal-date" className="text-xs">
              達成予定時期
            </Label>
            <Input
              id="skill-goal-date"
              type="month"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="skill-goal-note" className="text-xs">
              備考（任意）
            </Label>
            <Input
              id="skill-goal-note"
              value={goalNote}
              onChange={(e) => setGoalNote(e.target.value)}
            />
          </div>
          <div className="flex items-end sm:col-span-4">
            <Button
              type="button"
              size="sm"
              className="w-full sm:w-auto"
              onClick={handleSubmitGoal}
            >
              目標を更新
            </Button>
          </div>
        </div>

        {roadmapTagIds.length > 0 && (
          <Collapsible open={showGoalHistory} onOpenChange={setShowGoalHistory}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground',
                )}
              >
                {showGoalHistory ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                過去の目標を見る
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1 space-y-1">
              {roadmapTagIds.flatMap((tagId) => {
                const tagName = techTags.find((t) => t.id === tagId)?.name ?? ''
                const history = getSkillRoadmapGoalHistory(member.id, tagId)
                return history.slice(1).map((goal) => (
                  <p key={goal.id} className="text-xs text-muted-foreground">
                    {tagName}: {SKILL_LEVEL_LABELS[goal.targetLevel]}（
                    {goal.targetDate}まで） ・ 設定日{' '}
                    {goal.createdAt.substring(0, 10)}
                  </p>
                ))
              })}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  )
}
