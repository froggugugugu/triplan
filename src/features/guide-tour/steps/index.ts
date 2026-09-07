import type { Step } from 'react-joyride'
import { assignmentSteps } from './assignment-steps'
import { dashboardSteps } from './dashboard-steps'
import { globalSteps } from './global-steps'
import { projectsSteps } from './projects-steps'
import { scheduleSteps } from './schedule-steps'
import { teamSteps } from './team-steps'
import { wbsSteps } from './wbs-steps'

const tourStepsMap: Record<string, Step[]> = {
  global: globalSteps,
  dashboard: dashboardSteps,
  team: teamSteps,
  projects: projectsSteps,
  wbs: wbsSteps,
  schedule: scheduleSteps,
  assignment: assignmentSteps,
}

export function getTourSteps(tourId: string): Step[] {
  return tourStepsMap[tourId] ?? []
}
