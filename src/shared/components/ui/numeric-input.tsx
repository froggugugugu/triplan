import * as React from 'react'
import { Input } from '@/shared/components/ui/input'
import {
  parseNumericInput,
  stripLeadingZeros,
  toHalfWidthNumeral,
} from '@/shared/utils/numeric-input-utils'

export interface NumericInputProps
  extends Omit<React.ComponentProps<'input'>, 'onChange' | 'value' | 'type'> {
  value: number
  onValueChange: (value: number) => void
}

/**
 * 数値入力用コンポーネント。
 * - 全角数字・全角ピリオドの入力を許可し、フォーカスアウト時に半角へ自動変換する
 * - 先頭のゼロを入力中に自動除去する（小数点直前の単一の0は除去しない）
 * - type="number"ではなくtype="text"を使う（ブラウザのtype="number"は全角入力を受け付けないため）
 */
const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ value, onValueChange, onBlur, className, ...props }, ref) => {
    const [text, setText] = React.useState(() => String(value))

    React.useEffect(() => {
      setText(String(value))
    }, [value])

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const stripped = stripLeadingZeros(event.target.value)
      setText(stripped)

      const parsed = parseNumericInput(stripped)
      if (parsed !== null) {
        onValueChange(parsed)
      }
    }

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      const halfWidth = toHalfWidthNumeral(text)
      const parsed = parseNumericInput(halfWidth) ?? 0
      setText(String(parsed))
      onValueChange(parsed)
      onBlur?.(event)
    }

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        className={className}
        {...props}
      />
    )
  },
)
NumericInput.displayName = 'NumericInput'

export { NumericInput }
