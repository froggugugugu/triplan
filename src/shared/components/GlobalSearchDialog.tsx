import { FolderKanban, ListTree, Search, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/components/ui/command'
import type {
  SearchResult,
  SearchResultKind,
} from '@/shared/utils/global-search'
import { searchEntities } from '@/shared/utils/global-search'
import { useMembersStore, useProjectsStore } from '@/stores'

/**
 * 横断検索パレット。Cmd+K（Windows/LinuxはCtrl+K）で開き、
 * プロジェクト・タスク・メンバーを1つの検索語で引いて該当画面へ遷移する。
 *
 * 標準WBSテンプレートは1案件で50〜100タスクを生成するため、数案件運用すると
 * 「未完了のみ表示」と目視スクロールでは目的のタスクへ到達できない。
 */

const GROUP_LABELS: Record<SearchResultKind, string> = {
  project: 'プロジェクト',
  task: 'タスク',
  member: '担当者',
}

const GROUP_ICONS: Record<SearchResultKind, typeof FolderKanban> = {
  project: FolderKanban,
  task: ListTree,
  member: Users,
}

const KIND_ORDER: SearchResultKind[] = ['project', 'task', 'member']

interface GlobalSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GlobalSearchDialog({
  open,
  onOpenChange,
}: GlobalSearchDialogProps) {
  const navigate = useNavigate()
  const projects = useProjectsStore((state) => state.projects)
  const members = useMembersStore((state) => state.members)
  const [query, setQuery] = useState('')

  // 閉じたら検索語を捨てる（次回開いたときに前回の結果が残らない）
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const results = useMemo(
    () => searchEntities(query, projects, members),
    [query, projects, members],
  )

  const grouped = useMemo(() => {
    const map = new Map<SearchResultKind, SearchResult[]>()
    for (const result of results) {
      const list = map.get(result.kind) ?? []
      list.push(result)
      map.set(result.kind, list)
    }
    return map
  }, [results])

  const handleSelect = (result: SearchResult) => {
    onOpenChange(false)
    navigate(result.to)
  }

  return (
    // 検索は自前の純関数（searchEntities）で行うためcmdkの内蔵フィルタは無効化する
    // （有効なままだと二重に絞られて結果が消える）
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder="プロジェクト・タスク・担当者を検索..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {query.trim()
            ? '該当するものがありません'
            : 'コード・名前の一部を入力してください'}
        </CommandEmpty>
        {KIND_ORDER.map((kind) => {
          const items = grouped.get(kind)
          if (!items || items.length === 0) return null
          const Icon = GROUP_ICONS[kind]
          return (
            <CommandGroup key={kind} heading={GROUP_LABELS[kind]}>
              {items.map((result) => (
                <CommandItem
                  key={`${result.kind}-${result.id}`}
                  // cmdkは内部でvalueによる絞り込みを行うため、一意かつ
                  // 検索語に依存しない値を渡す（絞り込みはshouldFilter=falseで無効）
                  value={`${result.kind}-${result.id}`}
                  onSelect={() => handleSelect(result)}
                >
                  <Icon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{result.label}</span>
                  {result.code ? (
                    <span className="ml-2 shrink-0 text-muted-foreground text-xs">
                      {result.code}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          )
        })}
      </CommandList>
    </CommandDialog>
  )
}

/** サイドバーに置く検索トリガー（Cmd+Kを知らなくても辿り着けるようにする） */
export function GlobalSearchTrigger({
  collapsed,
  onClick,
}: {
  collapsed: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="検索（⌘K）"
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <Search className="h-4 w-4 shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 text-left">検索</span>
          <kbd className="rounded border border-border px-1 text-[10px]">
            ⌘K
          </kbd>
        </>
      )}
    </button>
  )
}
