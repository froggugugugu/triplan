import { z } from 'zod'

/**
 * 組織階層の呼称（画面表示名）。データモデル上は Division（第1階層）/ Section（第2階層）の
 * ままで、表示名だけを全社設定で差し替える。CSVの列名はファイル互換のため固定（対象外）。
 */
export const DEFAULT_ORG_LEVEL1_LABEL = '部門'
export const DEFAULT_ORG_LEVEL2_LABEL = '課'

/** 呼称の制約: 前後空白を除いて1〜20文字（空の見出し・レイアウト崩れを防ぐ） */
export const OrgLabelSchema = z.string().trim().min(1).max(20)
