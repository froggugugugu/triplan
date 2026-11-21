import { Copy, Pencil, Plus, Save, Trash2, Undo2, Workflow } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { NameInputDialog } from '@/shared/components/NameInputDialog'
import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/ui/tabs'
import { useAdminPermission } from '@/shared/hooks/use-admin-permissions'
import { useCanViewFinancials } from '@/shared/hooks/use-financial-visibility'
import { useOrgLabels } from '@/shared/hooks/use-org-labels'
import {
  compareOrgDesigns,
  computeOrgDesignMetrics,
  deriveCurrentOrgDesign,
  moveMember,
  type OrgDesign,
  type OrgDesignContext,
  removeTeam,
} from '@/shared/utils/org-design-utils'
import {
  useAppStore,
  useAssignmentStore,
  useMembersStore,
  useOrgDesignStore,
  useProjectsStore,
  useTeamStore,
  useTechTagsStore,
} from '@/stores'
import { ComparisonTable } from '../components/ComparisonTable'
import {
  MemberCard,
  type MoveTarget,
  UNPLACED_VALUE,
} from '../components/MemberCard'
import { DropLane, TeamColumn } from '../components/TeamColumn'
import {
  addTeam,
  groupTeamsByDivision,
  renameTeam,
  updateTeamScope,
} from '../utils/org-design-view'

interface NameDialogState {
  title: string
  defaultValue: string
  onSubmit: (name: string) => void
}

/**
 * 組織設計の試算（/org-design）。本番の課・所属は読むだけで、案（スナップショット）の中だけで
 * 人を動かして指標（稼働率・兼務・過負荷・コスト）を比べる。編集は作業コピーに対して行い、
 * 「保存」で案へ書き戻す（D&Dのたびに保存しない＝連続更新で楽観ロックが衝突しないように）。
 */
export function OrgDesignPage() {
  const { level1: l1, level2: l2 } = useOrgLabels()
  const canEdit = useAdminPermission('data:write')
  const canViewFinancials = useCanViewFinancials()
  const fiscalYear = useAppStore((s) => s.fiscalYear)
  const startMonth = useAppStore((s) => s.fiscalYearStartMonth)

  const divisions = useTeamStore((s) => s.divisions)
  const sections = useTeamStore((s) => s.sections)
  const loadTeam = useTeamStore((s) => s.loadTeam)
  const members = useMembersStore((s) => s.members)
  const loadMembers = useMembersStore((s) => s.loadMembers)
  const projects = useProjectsStore((s) => s.projects)
  const loadProjects = useProjectsStore((s) => s.loadProjects)
  const assignments = useAssignmentStore((s) => s.assignments)
  const loadAssignments = useAssignmentStore((s) => s.loadAssignments)
  const techTags = useTechTagsStore((s) => s.techTags)
  const loadTechTags = useTechTagsStore((s) => s.loadTechTags)

  const drafts = useOrgDesignStore((s) => s.drafts)
  const loadDrafts = useOrgDesignStore((s) => s.loadOrgDesignDrafts)
  const createDraft = useOrgDesignStore((s) => s.createDraft)
  const duplicateDraft = useOrgDesignStore((s) => s.duplicateDraft)
  const renameDraft = useOrgDesignStore((s) => s.renameDraft)
  const saveDesign = useOrgDesignStore((s) => s.saveDesign)
  const deleteDraft = useOrgDesignStore((s) => s.deleteDraft)

  useEffect(() => {
    loadTeam()
    loadMembers()
    loadProjects()
    loadAssignments()
    loadTechTags()
    loadDrafts()
  }, [
    loadTeam,
    loadMembers,
    loadProjects,
    loadAssignments,
    loadTechTags,
    loadDrafts,
  ])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [edits, setEdits] = useState<{
    draftId: string
    design: OrgDesign
  } | null>(null)
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const selected = drafts.find((d) => d.id === selectedId) ?? drafts[0] ?? null
  const dirty = !!selected && edits?.draftId === selected.id
  // 未編集時も参照を安定させる（毎レンダーで新しいオブジェクトにすると下の useMemo が毎回走る）
  const design: OrgDesign | null = useMemo(() => {
    if (!selected) return null
    if (edits && edits.draftId === selected.id) return edits.design
    return { teams: selected.teams, placements: selected.placements }
  }, [selected, edits])

  const edit = (change: (d: OrgDesign) => OrgDesign) => {
    if (!selected || !design) return
    const next = change(design)
    if (next !== design) setEdits({ draftId: selected.id, design: next })
  }

  const ctx: OrgDesignContext | null = useMemo(
    () =>
      selected
        ? {
            members,
            projects,
            assignments,
            // 希望の充足表示は F05 で配線する（ここでは希望を使わない）
            preferences: [],
            fiscalYear: selected.fiscalYear,
            startMonth,
          }
        : null,
    [selected, members, projects, assignments, startMonth],
  )

  const metrics = useMemo(
    () => (design && ctx ? computeOrgDesignMetrics(design, ctx) : null),
    [design, ctx],
  )

  const comparisonRows = useMemo(() => {
    if (!design || !ctx || !metrics) return []
    const current = deriveCurrentOrgDesign(design.teams, sections, members)
    return compareOrgDesigns(
      { design: current, metrics: computeOrgDesignMetrics(current, ctx) },
      { design, metrics },
    )
  }, [design, ctx, metrics, sections, members])

  const memberById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  )
  const productNameById = useMemo(
    () =>
      new Map(projects.filter((p) => !p.parentId).map((p) => [p.id, p.name])),
    [projects],
  )
  const productOptions = useMemo(
    () => [...productNameById].map(([value, label]) => ({ value, label })),
    [productNameById],
  )
  const techTagOptions = useMemo(
    () => techTags.map((t) => ({ value: t.id, label: t.name })),
    [techTags],
  )

  const groups = useMemo(
    () => (design ? groupTeamsByDivision(design.teams, divisions) : []),
    [design, divisions],
  )
  const moveTargets: MoveTarget[] = useMemo(
    () => [
      { value: UNPLACED_VALUE, label: '未配置' },
      ...groups.flatMap((g) =>
        g.teams.map((t) => ({
          value: t.id,
          label: `${g.divisionName ?? '（削除済み）'} / ${t.name}`,
        })),
      ),
    ],
    [groups],
  )

  const handleMove = (memberId: string, value: string) =>
    edit((d) =>
      moveMember(d, memberId, value === UNPLACED_VALUE ? null : value),
    )

  const renderMember = (memberId: string, laneValue: string) => {
    const m = memberById.get(memberId)
    if (!m) return null
    const info = metrics?.members[memberId]
    return (
      <MemberCard
        key={memberId}
        memberId={memberId}
        name={m.name}
        role={m.role}
        info={info}
        crossProductNames={(info?.crossProductIds ?? []).map(
          (id) => productNameById.get(id) ?? '（不明なプロダクト）',
        )}
        currentValue={laneValue}
        moveTargets={moveTargets}
        canEdit={canEdit}
        onMove={handleMove}
      />
    )
  }

  const openCreate = () =>
    setNameDialog({
      title: '現組織から案を作成',
      defaultValue: `${fiscalYear}年度 案${drafts.length + 1}`,
      onSubmit: (name) => {
        if (!name.trim()) return
        const id = createDraft({ name, fiscalYear, sections, members })
        setSelectedId(id)
      },
    })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Workflow className="h-6 w-6" aria-hidden="true" />
          組織設計の試算
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          現在の{l2}
          構成を複製した「案」の中で担当者を動かし、稼働率・兼務・コストを比べます。
          <strong className="font-semibold text-foreground">
            ここでの操作で本番の{l2}・所属は変わりません。
          </strong>
          アサインは変わらないため、個人の稼働率は変わらず、{l2}
          単位の集計だけが変わります。
        </p>
      </div>

      {!selected || !design || !metrics ? (
        <Card>
          <CardContent className="space-y-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              案がまだありません。
            </p>
            {canEdit && (
              <Button onClick={openCreate}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                現組織から案を作成
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={selected.id}
              onValueChange={setSelectedId}
              disabled={dirty}
            >
              <SelectTrigger className="w-64" aria-label="案の選択">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {drafts.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}（{d.fiscalYear}年度）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canEdit && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openCreate}
                  disabled={dirty}
                >
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                  新規作成
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={dirty}
                  onClick={() =>
                    setNameDialog({
                      title: '案を複製',
                      defaultValue: `${selected.name}のコピー`,
                      onSubmit: (name) => {
                        const id = duplicateDraft(selected.id, name)
                        if (id) setSelectedId(id)
                      },
                    })
                  }
                >
                  <Copy className="mr-1 h-4 w-4" aria-hidden="true" />
                  複製
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={dirty}
                  onClick={() =>
                    setNameDialog({
                      title: '案の名前を変更',
                      defaultValue: selected.name,
                      onSubmit: (name) => renameDraft(selected.id, name),
                    })
                  }
                >
                  <Pencil className="mr-1 h-4 w-4" aria-hidden="true" />
                  名前変更
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={dirty}
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
                  削除
                </Button>
                <div className="ml-auto flex items-center gap-2">
                  {dirty && (
                    <span
                      className="text-sm text-muted-foreground"
                      role="status"
                    >
                      未保存の変更があります
                    </span>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!dirty}
                    onClick={() => setEdits(null)}
                  >
                    <Undo2 className="mr-1 h-4 w-4" aria-hidden="true" />
                    変更を破棄
                  </Button>
                  <Button
                    size="sm"
                    disabled={!dirty}
                    onClick={() => {
                      saveDesign(selected.id, design)
                      setEdits(null)
                    }}
                  >
                    <Save className="mr-1 h-4 w-4" aria-hidden="true" />
                    案を保存
                  </Button>
                </div>
              </>
            )}
          </div>

          {metrics.missingMemberIds.length > 0 && (
            <p className="text-sm text-muted-foreground">
              本番に存在しない担当者 {metrics.missingMemberIds.length}{' '}
              名は指標から除いています。
            </p>
          )}

          <Tabs defaultValue="board">
            <TabsList>
              <TabsTrigger value="board">案の編集</TabsTrigger>
              <TabsTrigger value="compare">現組織と比較</TabsTrigger>
            </TabsList>

            <TabsContent value="board" className="space-y-4">
              <DndProvider backend={HTML5Backend}>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  <DropLane
                    testId="org-team-unplaced"
                    canEdit={canEdit}
                    onDropMember={(memberId) =>
                      handleMove(memberId, UNPLACED_VALUE)
                    }
                    isEmpty={metrics.unplacedMemberIds.length === 0}
                    title={
                      <h3 className="font-semibold">
                        未配置（{metrics.unplacedMemberIds.length}名）
                      </h3>
                    }
                  >
                    {metrics.unplacedMemberIds.map((id) =>
                      renderMember(id, UNPLACED_VALUE),
                    )}
                  </DropLane>
                </div>
                {groups.map((g) => (
                  <Card key={g.divisionId}>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                      <CardTitle className="text-base">
                        {g.divisionName ?? `（削除された${l1}）`}
                      </CardTitle>
                      {canEdit && g.divisionName !== null && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setNameDialog({
                              title: `${l2}を追加（${g.divisionName}）`,
                              defaultValue: '',
                              onSubmit: (name) =>
                                edit((d) => addTeam(d, g.divisionId, name)),
                            })
                          }
                        >
                          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                          {l2}を追加
                        </Button>
                      )}
                    </CardHeader>
                    <CardContent>
                      {g.teams.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {l2}がありません
                        </p>
                      ) : (
                        <div className="flex gap-3 overflow-x-auto pb-2">
                          {g.teams.map((t) => {
                            const tm = metrics.teams.find(
                              (x) => x.teamId === t.id,
                            )
                            return (
                              <TeamColumn
                                key={t.id}
                                team={t}
                                metrics={tm}
                                canEdit={canEdit}
                                canViewFinancials={canViewFinancials}
                                productOptions={productOptions}
                                techTagOptions={techTagOptions}
                                onDropMember={(memberId) =>
                                  handleMove(memberId, t.id)
                                }
                                onRename={() =>
                                  setNameDialog({
                                    title: `${l2}の名前を変更`,
                                    defaultValue: t.name,
                                    onSubmit: (name) =>
                                      edit((d) => renameTeam(d, t.id, name)),
                                  })
                                }
                                onRemove={() =>
                                  edit((d) => removeTeam(d, t.id))
                                }
                                onScopeChange={(scope) =>
                                  edit((d) => updateTeamScope(d, t.id, scope))
                                }
                              >
                                {(tm?.memberIds ?? []).map((id) =>
                                  renderMember(id, t.id),
                                )}
                              </TeamColumn>
                            )
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </DndProvider>
            </TabsContent>

            <TabsContent value="compare">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    現組織 → 案（{selected.fiscalYear}年度）
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-3 text-xs text-muted-foreground">
                    現組織側の受け持ちプロダクトは、案の同じ{l2}
                    （複製元）の設定を使って判定しています。
                    {dirty && ' 未保存の変更を含めて比較しています。'}
                  </p>
                  <ComparisonTable
                    rows={comparisonRows}
                    canViewFinancials={canViewFinancials}
                    teamLabel={l2}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      <NameInputDialog
        open={nameDialog !== null}
        onOpenChange={(open) => {
          if (!open) setNameDialog(null)
        }}
        title={nameDialog?.title ?? ''}
        defaultValue={nameDialog?.defaultValue ?? ''}
        onSubmit={(name) => nameDialog?.onSubmit(name)}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>案を削除しますか？</DialogTitle>
            <DialogDescription>
              「{selected?.name}」を削除します。本番の{l2}
              ・所属には影響しません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selected) deleteDraft(selected.id)
                setSelectedId(null)
                setDeleteOpen(false)
              }}
            >
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
