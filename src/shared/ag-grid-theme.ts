import { colorSchemeVariable, themeQuartz } from 'ag-grid-community'

/**
 * AG Grid v33 Theming API - shadcn/ui準拠テーマ
 *
 * shadcn/uiのCSS変数（--color-*）を参照し、ライト/ダーク両モードに自動対応。
 * colorSchemeVariable: CSS `color-scheme` プロパティからライト/ダークを自動検出。
 *
 * shadcn/ui Table の配色:
 * - ヘッダー: bg-muted/50, text-muted-foreground, font-medium
 * - 行: border-b border-border, hover:bg-muted/50
 * - 交互色なし（oddRowBackgroundColor: transparent）
 */
export const gridTheme = themeQuartz.withPart(colorSchemeVariable).withParams({
  /* 密度: 既定（fontSize 14px, spacing 8px）から1段階コンパクトにし、作業領域を広げる */
  fontSize: 13,
  spacing: 6,

  /* 基本カラー */
  backgroundColor: 'var(--color-background)',
  foregroundColor: 'var(--color-foreground)',
  borderColor: 'var(--color-border)',

  /* ヘッダー */
  headerBackgroundColor: 'var(--color-muted)',
  headerTextColor: 'var(--color-muted-foreground)',
  headerFontWeight: 500,

  /* 行 */
  oddRowBackgroundColor: 'transparent',
  rowHoverColor: 'var(--color-accent)',
  selectedRowBackgroundColor: 'var(--color-accent)',

  /* 入力・選択 */
  inputBorder: { color: 'var(--color-input)' },
  rangeSelectionBorderColor: 'var(--color-ring)',

  /* 角丸 */
  wrapperBorderRadius: 'var(--radius-md)',

  /* 列区切り線を非表示（shadcn/ui Tableは行区切りのみ） */
  columnBorder: false,
})
