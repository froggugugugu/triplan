import type { Step } from 'react-joyride'

export const assignmentSteps: Step[] = [
  {
    target: '[data-tour="assignment-member-summary"]',
    title: 'メンバーサマリー',
    content:
      '全プロジェクト横断で、メンバーごとの月別アサイン合計を確認できます。1.00人月を超えると赤で警告されます。',
    placement: 'bottom',
  },
  {
    target: '[data-tour="assignment-project-selector"]',
    title: 'プロジェクト選択',
    content: 'アサインを編集する対象プロジェクトを選択します。',
    placement: 'bottom',
  },
  {
    target: '[data-tour="assignment-grid"]',
    title: 'アサイングリッド',
    content:
      'タスク別に担当者と月次配分（人月）を入力します。セルをダブルクリックして編集できます。',
    placement: 'top',
  },
]
