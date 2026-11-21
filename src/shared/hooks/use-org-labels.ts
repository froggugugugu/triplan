import { useBudgetStore } from '@/stores/budget-store'

export interface OrgLabels {
  /** 第1階層（Division）の呼称。既定「部門」 */
  level1: string
  /** 第2階層（Section）の呼称。既定「課」 */
  level2: string
}

/**
 * 組織階層の呼称（全社設定）を返す。画面の見出し・ラベル・フィルタはここから取る。
 * CSVの列名はファイル互換のため固定文字列のままにする（この値を使わない）。
 * 設定は Layout マウント時の loadBudgetData で読み込まれ、未ロード中は既定値になる。
 */
export function useOrgLabels(): OrgLabels {
  const level1 = useBudgetStore((s) => s.orgLevel1Label)
  const level2 = useBudgetStore((s) => s.orgLevel2Label)
  return { level1, level2 }
}
