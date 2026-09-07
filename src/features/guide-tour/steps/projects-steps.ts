import type { Step } from 'react-joyride'

export const projectsSteps: Step[] = [
  {
    target: '[data-tour="projects-add"]',
    title: '新規プロジェクト',
    content:
      'プロジェクトを新規追加します。コードは自動採番されます。確度（S/A/B/C）で受注見込みを管理できます。',
    placement: 'bottom',
  },
  {
    target: '[data-tour="projects-table"]',
    title: 'プロジェクト一覧',
    content:
      '登録済みプロジェクトの一覧です。工数・アサイン・スケジュールのサマリーも表示されます。',
    placement: 'top',
  },
]
