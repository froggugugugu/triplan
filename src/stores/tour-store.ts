import type { Step } from 'react-joyride'
import { create } from 'zustand'

interface TourState {
  isRunning: boolean
  currentTourId: string | null
  steps: Step[]
  startTour: (tourId: string, steps: Step[]) => void
  stopTour: () => void
}

export const useTourStore = create<TourState>((set) => ({
  isRunning: false,
  currentTourId: null,
  steps: [],
  // 現在のステップ位置はreact-joyride側が持つ（uncontrolled）。
  // 3.2.0はステップ遷移中に非同期段階が入り、外部から位置を制御すると
  // 更新が漏れてツアーが止まるため（TourProviderのコメント参照）
  startTour: (tourId, steps) =>
    set({ isRunning: true, currentTourId: tourId, steps }),
  stopTour: () => set({ isRunning: false, currentTourId: null, steps: [] }),
}))
