import { GripVertical } from 'lucide-react'
import { useRef } from 'react'
import { useDrag, useDrop } from 'react-dnd'
import { cn } from '@/lib/utils'
import type { PhaseDefinition } from '@/shared/types/schedule'

const ITEM_TYPE = 'PHASE_ROW'

interface DragItem {
  phaseKey: string
}

interface PhaseRowProps {
  phase: PhaseDefinition
  index: number
  onDrop: (fromKey: string, toKey: string) => void
  children: React.ReactNode
}

export function PhaseRow({ phase, index, onDrop, children }: PhaseRowProps) {
  const ref = useRef<HTMLTableRowElement>(null)

  const [{ isDragging }, drag, preview] = useDrag({
    type: ITEM_TYPE,
    item: { phaseKey: phase.phaseKey } satisfies DragItem,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  })

  const [{ isOver }, drop] = useDrop({
    accept: ITEM_TYPE,
    drop: (item: DragItem) => {
      if (item.phaseKey !== phase.phaseKey) {
        onDrop(item.phaseKey, phase.phaseKey)
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  })

  preview(drop(ref))

  return (
    <tr
      ref={ref}
      className={cn(
        'border-b border-border last:border-b-0 transition-colors',
        isDragging && 'opacity-40',
        isOver && 'bg-accent/30',
      )}
    >
      <td className="px-2 py-2 w-8">
        <span
          ref={(el) => {
            drag(el)
          }}
          className="cursor-grab active:cursor-grabbing text-muted-foreground"
        >
          <GripVertical className="h-4 w-4" />
        </span>
      </td>
      <td className="px-2 py-2 text-sm text-muted-foreground w-8">
        {index + 1}
      </td>
      {children}
    </tr>
  )
}
