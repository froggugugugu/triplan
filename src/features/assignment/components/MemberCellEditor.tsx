import type { ICellEditorParams } from 'ag-grid-community'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { cn } from '@/lib/utils'
import type { Member } from '@/shared/types'
import { useTeamStore } from '@/stores'

interface MemberCellEditorProps extends ICellEditorParams {
  members: Member[]
}

export const MemberCellEditor = forwardRef(function MemberCellEditor(
  props: MemberCellEditorProps,
  ref: React.Ref<{ getValue: () => string }>,
) {
  const valueRef = useRef<string>(props.value ?? '')
  const [searchText, setSearchText] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const divisions = useTeamStore((s) => s.divisions)
  const sections = useTeamStore((s) => s.sections)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useImperativeHandle(ref, () => ({
    getValue: () => valueRef.current,
  }))

  const memberOptions = useMemo(
    () =>
      props.members.map((m) => {
        const sec = m.sectionId
          ? sections.find((s) => s.id === m.sectionId)
          : null
        const div = sec ? divisions.find((d) => d.id === sec.divisionId) : null
        const orgLabel = div && sec ? `${div.name} / ${sec.name}` : '未所属'
        return {
          id: m.id,
          name: m.name,
          orgLabel,
          searchText: `${m.name} ${orgLabel}`.toLowerCase(),
        }
      }),
    [props.members, divisions, sections],
  )

  const filtered = useMemo(() => {
    if (!searchText) return memberOptions
    const lower = searchText.toLowerCase()
    return memberOptions.filter((o) => o.searchText.includes(lower))
  }, [memberOptions, searchText])

  const selectMember = useCallback(
    (memberId: string) => {
      const ctx = props.context as {
        onMemberSelected?: (data: unknown, memberId: string) => void
      }

      if (ctx?.onMemberSelected) {
        const capturedData = props.data
        setTimeout(() => {
          props.stopEditing()
          setTimeout(() => {
            ctx.onMemberSelected?.(capturedData, memberId)
          }, 0)
        }, 0)
      } else {
        valueRef.current = memberId
        setTimeout(() => {
          props.stopEditing()
        }, 0)
      }
    },
    [props.stopEditing, props.context, props.data],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex((prev) =>
          prev < filtered.length - 1 ? prev + 1 : prev,
        )
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : prev))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (highlightIndex >= 0 && highlightIndex < filtered.length) {
          const item = filtered[highlightIndex]
          if (item) selectMember(item.id)
        }
      } else if (e.key === 'Escape') {
        props.stopEditing()
      }
    },
    [filtered, highlightIndex, selectMember, props.stopEditing],
  )

  // スクロールでハイライト項目を追従
  useEffect(() => {
    if (highlightIndex < 0 || !listRef.current) return
    const items = listRef.current.querySelectorAll('[data-member-item]')
    items[highlightIndex]?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex])

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchText(e.target.value)
      setHighlightIndex(0)
    },
    [],
  )

  return (
    <div className="relative w-64">
      <input
        ref={inputRef}
        type="text"
        value={searchText}
        onChange={handleSearchChange}
        onKeyDown={handleKeyDown}
        placeholder="担当者を検索..."
        className="w-full h-8 rounded-t-md border border-border bg-background text-foreground text-sm outline-none px-2 focus:ring-2 focus:ring-ring"
      />
      <div
        ref={listRef}
        className="w-full max-h-48 overflow-y-auto rounded-b-md border border-t-0 border-border bg-popover shadow-md"
      >
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            該当なし
          </div>
        ) : (
          filtered.map((opt, i) => (
            <button
              key={opt.id}
              type="button"
              data-member-item
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left cursor-pointer hover:bg-accent',
                i === highlightIndex && 'bg-accent',
                opt.id === props.value && 'font-semibold',
              )}
              onMouseDown={(e) => {
                e.preventDefault()
                selectMember(opt.id)
              }}
            >
              <span>{opt.name}</span>
              <span className="text-xs text-muted-foreground">
                {opt.orgLabel}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
})
