export interface TourDefinition {
  id: string
  label: string
}

const pageTourMap: Record<string, TourDefinition> = {
  '/dashboard': { id: 'dashboard', label: 'ダッシュボードガイド' },
  '/team': { id: 'team', label: 'チームガイド' },
  '/projects': { id: 'projects', label: 'プロジェクトガイド' },
  '/wbs': { id: 'wbs', label: 'WBSガイド' },
  '/schedule': { id: 'schedule', label: 'スケジュールガイド' },
  '/assignment': { id: 'assignment', label: 'アサインガイド' },
}

export function getAvailableTours(pathname: string): TourDefinition[] {
  const tours: TourDefinition[] = [{ id: 'global', label: '全体概要' }]

  const pageTour = pageTourMap[pathname]
  if (pageTour) {
    tours.push(pageTour)
  }

  return tours
}
