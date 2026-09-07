import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/shared/components/ui/badge'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table'
import { useToast } from '@/shared/hooks/use-toast'
import type { Member } from '@/shared/types'
import { pickReadableTextColor } from '@/shared/utils/color-contrast'
import { useMembersStore, useTeamStore, useTechTagsStore } from '@/stores'
import { MemberDialog } from '../components/MemberDialog'

export function MembersPage() {
  const { toast } = useToast()
  const members = useMembersStore((state) => state.members)
  const loadMembers = useMembersStore((state) => state.loadMembers)
  const deleteMember = useMembersStore((state) => state.deleteMember)
  const techTags = useTechTagsStore((s) => s.techTags)
  const loadTechTags = useTechTagsStore((s) => s.loadTechTags)
  const divisions = useTeamStore((s) => s.divisions)
  const sections = useTeamStore((s) => s.sections)
  const loadTeam = useTeamStore((s) => s.loadTeam)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editMember, setEditMember] = useState<Member | null>(null)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null)

  useEffect(() => {
    loadMembers()
    loadTechTags()
    loadTeam()
  }, [loadMembers, loadTechTags, loadTeam])

  const handleAdd = useCallback(() => {
    setEditMember(null)
    setDialogOpen(true)
  }, [])

  const handleEdit = useCallback((member: Member) => {
    setEditMember(member)
    setDialogOpen(true)
  }, [])

  const handleDeleteClick = useCallback((member: Member) => {
    setMemberToDelete(member)
    setDeleteDialogOpen(true)
  }, [])

  const handleDeleteConfirm = useCallback(() => {
    if (memberToDelete) {
      deleteMember(memberToDelete.id)
      toast({ title: '担当者を削除しました' })
    }
    setDeleteDialogOpen(false)
    setMemberToDelete(null)
  }, [memberToDelete, deleteMember, toast])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">メンバー</h1>
        <Button onClick={handleAdd}>
          <Plus className="h-4 w-4" />
          新規担当者
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>担当者一覧（{members.length}名）</CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              担当者がいません。「新規担当者」ボタンから追加してください。
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>氏名</TableHead>
                  <TableHead>所属</TableHead>
                  <TableHead>役割</TableHead>
                  <TableHead>技術タグ</TableHead>
                  <TableHead>状態</TableHead>
                  <TableHead className="w-[100px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.name}</TableCell>
                    <TableCell>
                      {(() => {
                        const sec = member.sectionId
                          ? sections.find((s) => s.id === member.sectionId)
                          : null
                        const div = sec
                          ? divisions.find((d) => d.id === sec.divisionId)
                          : null
                        return div && sec
                          ? `${div.name} / ${sec.name}`
                          : '未所属'
                      })()}
                    </TableCell>
                    <TableCell>{member.role}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(member.techTagIds ?? []).map((tagId) => {
                          const tag = techTags.find((t) => t.id === tagId)
                          if (!tag) return null
                          return (
                            <Badge
                              key={tag.id}
                              style={{
                                backgroundColor: tag.color,
                                color: pickReadableTextColor(tag.color),
                              }}
                              className="border-transparent text-[11px] px-1.5 py-0"
                            >
                              {tag.name}
                            </Badge>
                          )
                        })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={member.isActive ? 'default' : 'secondary'}
                      >
                        {member.isActive ? 'アクティブ' : '非アクティブ'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEdit(member)}
                          aria-label="編集"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteClick(member)}
                          aria-label="削除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <MemberDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        member={editMember}
      />

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>担当者の削除</DialogTitle>
            <DialogDescription>
              「{memberToDelete?.name}
              」を削除しますか？関連する配分データもすべて削除されます。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
