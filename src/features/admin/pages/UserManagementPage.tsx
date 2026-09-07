import { Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  createUser,
  listUsers,
  updateUser,
} from '@/features/admin/api/users-api'
import { CreateUserDialog } from '@/features/admin/components/CreateUserDialog'
import type { CreateUserFormValues } from '@/infrastructure/validation/schemas'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { useToast } from '@/shared/hooks/use-toast'
import type { AuthUser, UserRole } from '@/shared/types'
import { useAuthStore, useMembersStore } from '@/stores'

/** 「担当者なし」を表す内部センチネル（Selectは空文字を選択値にできない） */
const UNLINKED = '__unlinked__'

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'admin（システム管理者）',
  manager: 'manager（承認・全社設定）',
  editor: 'editor（編集）',
  viewer: 'viewer（閲覧）',
  partner: 'partner（閲覧・金額非表示）',
}

const AUTH_PROVIDER_LABELS: Record<string, string> = {
  local: 'ID/PASS',
  azure_ad: 'Azure AD',
  google_workspace: 'Google Workspace',
}

/**
 * admin限定のユーザー管理画面（postgresモードのみ）。
 * ユーザー一覧・追加・ロール変更・有効/無効の切り替えを行う。
 */
export function UserManagementPage() {
  const { toast } = useToast()
  const currentUser = useAuthStore((s) => s.currentUser)
  const [users, setUsers] = useState<AuthUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const list = await listUsers()
      setUsers(list)
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : 'ユーザー一覧の取得に失敗しました',
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  // 担当者の紐づけ候補
  const members = useMembersStore((state) => state.members)
  const loadMembers = useMembersStore((state) => state.loadMembers)
  useEffect(() => {
    loadMembers()
  }, [loadMembers])

  const handleCreate = useCallback(
    async (values: CreateUserFormValues) => {
      try {
        await createUser(values)
        toast({ title: 'ユーザーを作成しました' })
        await reload()
      } catch (error) {
        toast({
          title: 'ユーザー作成に失敗しました',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
        throw error
      }
    },
    [toast, reload],
  )

  const handleRoleChange = useCallback(
    async (user: AuthUser, role: UserRole) => {
      setPendingUserId(user.id)
      try {
        await updateUser(user.id, { role })
        toast({ title: `${user.name}さんのロールを${role}に変更しました` })
        await reload()
      } catch (error) {
        toast({
          title: 'ロール変更に失敗しました',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      } finally {
        setPendingUserId(null)
      }
    },
    [toast, reload],
  )

  /** 担当者の紐づけ変更。「担当者なし」はnullで送って解除する */
  const handleMemberChange = useCallback(
    async (user: AuthUser, value: string) => {
      const memberId = value === UNLINKED ? null : value
      setPendingUserId(user.id)
      try {
        await updateUser(user.id, { memberId })
        toast({
          title: memberId
            ? `${user.name}さんに担当者を紐づけました`
            : `${user.name}さんの担当者の紐づけを解除しました`,
        })
        await reload()
      } catch (error) {
        toast({
          title: '担当者の紐づけに失敗しました',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      } finally {
        setPendingUserId(null)
      }
    },
    [toast, reload],
  )

  const handleToggleActive = useCallback(
    async (user: AuthUser) => {
      setPendingUserId(user.id)
      try {
        await updateUser(user.id, { isActive: !user.isActive })
        toast({
          title: user.isActive
            ? `${user.name}さんを無効化しました`
            : `${user.name}さんを有効化しました`,
        })
        await reload()
      } catch (error) {
        toast({
          title: '状態の変更に失敗しました',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      } finally {
        setPendingUserId(null)
      }
    },
    [toast, reload],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">ユーザー管理</h1>
          <p className="text-sm text-muted-foreground">
            ログインアカウントとロールを管理します（admin限定）
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          ユーザーを追加
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">
            読み込み中...
          </div>
        ) : loadError ? (
          <div className="py-12 text-center text-destructive">{loadError}</div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            ユーザーが登録されていません。「ユーザーを追加」ボタンから登録してください。
          </div>
        ) : (
          <div className="divide-y divide-border">
            {users.map((user) => {
              const isSelf = user.id === currentUser?.id
              const isPending = pendingUserId === user.id
              return (
                <div
                  key={user.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{user.name}</span>
                      {isSelf && (
                        <Badge variant="outline" className="text-xs">
                          自分
                        </Badge>
                      )}
                      {user.isActive === false && (
                        <Badge variant="destructive" className="text-xs">
                          無効化済み
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {user.email}
                      {user.authProvider && (
                        <>
                          {' '}
                          ・
                          {AUTH_PROVIDER_LABELS[user.authProvider] ??
                            user.authProvider}
                        </>
                      )}
                    </p>
                  </div>

                  {/* 担当者の紐づけ。/my-tasksの「自分の担当」を
                      引くための接続点で、未紐づけならその案内が出る */}
                  <Select
                    // 弱参照（FKを張っていない）。担当者が削除された後の
                    // ダングリング参照は「未紐づけ」として扱う
                    value={
                      user.memberId &&
                      members.some((m) => m.id === user.memberId)
                        ? user.memberId
                        : UNLINKED
                    }
                    disabled={isPending}
                    onValueChange={(v) => handleMemberChange(user, v)}
                  >
                    <SelectTrigger
                      className="w-48"
                      aria-label={`${user.name}さんの担当者`}
                    >
                      <SelectValue placeholder="担当者を紐づけ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNLINKED}>担当者なし</SelectItem>
                      {members.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={user.role}
                    disabled={isSelf || isPending}
                    onValueChange={(v) => handleRoleChange(user, v as UserRole)}
                  >
                    <SelectTrigger
                      className="w-40"
                      aria-label={`${user.name}さんのロール`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSelf || isPending}
                    onClick={() => handleToggleActive(user)}
                    title={isSelf ? '自分自身は無効化できません' : undefined}
                  >
                    {user.isActive === false ? '有効化' : '無効化'}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <CreateUserDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleCreate}
      />
    </div>
  )
}
