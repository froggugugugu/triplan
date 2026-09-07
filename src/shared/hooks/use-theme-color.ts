import { getThemeColor, type ThemeColor } from '@/shared/types/theme-color'
import { useAppStore } from '@/stores/app-store'

/**
 * ThemeColorから現在のテーマに応じた色を取得するフック
 */
export function useThemeColor(
  color: ThemeColor | undefined,
): string | undefined {
  const theme = useAppStore((s) => s.theme)
  if (!color) return undefined
  return getThemeColor(color, theme)
}

/**
 * 現在のテーマを取得するフック（値のみ）
 */
export function useCurrentTheme() {
  return useAppStore((s) => s.theme)
}
