import { Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ThemeColor } from '@/shared/types/theme-color'
import { migrateToThemeColor } from '@/shared/types/theme-color'
import { Button } from './button'

interface ThemeColorPickerProps {
  value: ThemeColor
  onChange: (value: ThemeColor) => void
  className?: string
  disabled?: boolean
}

type ColorMode = 'light' | 'dark'

/**
 * ThemeColorPicker
 *
 * ライト/ダークモード別のカラーピッカーコンポーネント
 *
 * @param value - ThemeColor（単一stringまたは{ light, dark }オブジェクト）
 * @param onChange - 値変更時のコールバック
 * @param className - 追加のCSSクラス
 * @param disabled - 無効化フラグ
 */
export function ThemeColorPicker({
  value,
  onChange,
  className,
  disabled = false,
}: ThemeColorPickerProps) {
  const [mode, setMode] = useState<ColorMode>('light')

  // ThemeColorを正規化（単一stringの場合はオブジェクトに変換）
  const colorObj = migrateToThemeColor(value)

  const handleColorChange = (newColor: string, targetMode: ColorMode) => {
    const updated = { ...colorObj, [targetMode]: newColor }
    onChange(updated)
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* モード切り替えボタン */}
      <div className="flex rounded-md border border-border">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'h-7 w-7 rounded-r-none',
            mode === 'light' && 'bg-accent text-accent-foreground',
          )}
          onClick={() => setMode('light')}
          disabled={disabled}
          aria-label="ライトモード"
          title="ライトモード"
        >
          <Sun className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'h-7 w-7 rounded-l-none border-l border-border',
            mode === 'dark' && 'bg-accent text-accent-foreground',
          )}
          onClick={() => setMode('dark')}
          disabled={disabled}
          aria-label="ダークモード"
          title="ダークモード"
        >
          <Moon className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* カラーピッカー */}
      <input
        type="color"
        value={mode === 'light' ? colorObj.light : colorObj.dark}
        onChange={(e) => handleColorChange(e.target.value, mode)}
        disabled={disabled}
        className={cn(
          'h-8 w-10 cursor-pointer rounded border border-border',
          disabled && 'cursor-not-allowed opacity-50',
        )}
        aria-label={mode === 'light' ? 'ライトモードの色' : 'ダークモードの色'}
      />

      {/* HEX値表示 */}
      <span className="text-xs text-muted-foreground font-mono">
        {mode === 'light' ? colorObj.light : colorObj.dark}
      </span>
    </div>
  )
}
