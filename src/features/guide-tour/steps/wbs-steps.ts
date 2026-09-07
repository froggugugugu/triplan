import type { Step } from 'react-joyride'

export const wbsSteps: Step[] = [
  {
    target: '[data-tour="wbs-project-selector"]',
    title: 'プロジェクト選択',
    content: 'WBSを編集する対象プロジェクトを選択します。',
    placement: 'bottom',
  },
  {
    target: '[data-tour="wbs-settings"]',
    title: 'WBS設定',
    content:
      '工数列の名前・表示/非表示・背景色をカスタマイズできます（最大10列）。',
    placement: 'bottom',
  },
  {
    target: '[data-tour="wbs-grid"]',
    title: 'WBSツリーグリッド',
    content:
      '階層構造でタスクと工数を管理します。セルをダブルクリックして工数を入力します。親タスクには子の合計が自動集計されます。',
    placement: 'top',
  },
]
