import type { Step } from 'react-joyride'

export const dashboardSteps: Step[] = [
  {
    target: '[data-tour="dashboard-fiscal-year"]',
    title: '年度選択',
    content:
      '表示する年度を切り替えられます。各チャートが選択した年度のデータに連動します。',
    placement: 'bottom',
  },
  {
    target: '[data-tour="dashboard-project-chart"]',
    title: 'プロジェクト別アサイン',
    content: 'プロジェクトごとの月別アサイン状況を確認できます。',
    placement: 'bottom',
  },
  {
    target: '[data-tour="dashboard-budget-chart"]',
    title: '売上予算 vs 見込売上',
    content:
      '部門別の売上予算と見込売上を比較できます。見込売上はアサイン×単価から自動計算されます。',
    placement: 'bottom',
  },
  {
    target: '[data-tour="dashboard-member-chart"]',
    title: 'メンバー別アサイン',
    content:
      'メンバーごとの月別アサイン状況を確認できます。部門・課でフィルタリングも可能です。',
    placement: 'bottom',
  },
  {
    target: '[data-tour="dashboard-utilization-chart"]',
    title: 'アサイン充足率',
    content:
      'メンバーごとの年間アサイン充足率を色分けで確認できます。100%超過は赤で表示されます。',
    placement: 'bottom',
  },
]
