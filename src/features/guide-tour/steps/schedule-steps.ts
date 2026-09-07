import type { Step } from 'react-joyride'

export const scheduleSteps: Step[] = [
  {
    target: '[data-tour="schedule-project-selector"]',
    title: 'プロジェクト選択',
    content: 'スケジュールを編集する対象プロジェクトを選択します。',
    placement: 'bottom',
  },
  {
    target: '[data-tour="schedule-settings"]',
    title: '工程設定',
    content: '工程の名前・色・有効/無効を管理します（最大10工程）。',
    placement: 'bottom',
  },
  {
    target: '[data-tour="schedule-gantt"]',
    title: 'ガントチャート',
    content:
      'タイムライン上でドラッグして工程期間を設定します。ダブルクリックで新規作成も可能です。',
    placement: 'top',
  },
]
