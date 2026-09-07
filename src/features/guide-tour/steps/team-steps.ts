import type { Step } from 'react-joyride'

export const teamSteps: Step[] = [
  {
    target: '[data-tour="team-add-division"]',
    title: '部追加',
    content:
      '組織の部門を追加します。部の下に課を作成し、課にメンバーを所属させます。',
    placement: 'bottom',
  },
  {
    target: '[data-tour="team-fiscal-year"]',
    title: '年度選択',
    content:
      '表示する年度を切り替えます。売上予算・見込売上の計算期間が変わります。',
    placement: 'bottom',
  },
  {
    target: '[data-tour="team-tree"]',
    title: '組織ツリー',
    content:
      '部門 → 課 → メンバーの階層で組織を管理します。各行にホバーすると編集・削除ボタンが表示されます。',
    placement: 'top',
  },
]
