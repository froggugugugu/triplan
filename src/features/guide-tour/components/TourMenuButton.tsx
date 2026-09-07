import { CircleHelp } from 'lucide-react'
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Button } from '@/shared/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/components/ui/popover'
import { useTourStore } from '@/stores/tour-store'
import { getTourSteps } from '../steps'
import { getAvailableTours } from '../utils/tour-route-map'

export function TourMenuButton() {
  const { pathname } = useLocation()
  const startTour = useTourStore((s) => s.startTour)
  const [open, setOpen] = useState(false)

  const tours = getAvailableTours(pathname)

  const handleSelect = (tourId: string) => {
    const steps = getTourSteps(tourId)
    if (steps.length > 0) {
      setOpen(false)
      // 少し遅延させて Popover が閉じてからツアーを開始する
      setTimeout(() => startTour(tourId, steps), 150)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="操作ガイド"
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-48 p-1">
        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          操作ガイド
        </p>
        {tours.map((tour) => (
          <button
            key={tour.id}
            type="button"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={() => handleSelect(tour.id)}
          >
            {tour.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
