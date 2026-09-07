import type { TooltipRenderProps } from 'react-joyride'
import { Button } from '@/shared/components/ui/button'

/**
 * ツアーの吹き出し。
 *
 * react-joyride 3.2.0 では`TooltipRenderProps`から`continuous`が外れた。
 * TourProviderが常に`continuous`で動かすため、旧実装の「continuousなら次へ／
 * そうでなければ閉じる」の分岐は前者に固定する（後者は到達しないコードだった）。
 */
export function TourTooltip({
  backProps,
  index,
  isLastStep,
  primaryProps,
  size,
  step,
  tooltipProps,
}: TooltipRenderProps) {
  return (
    <div
      {...tooltipProps}
      className="max-w-sm rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-md"
    >
      {step.title && (
        <h4 className="mb-1 text-sm font-semibold">{step.title}</h4>
      )}
      <div className="text-sm leading-relaxed">{step.content}</div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {index + 1} / {size}
        </span>
        <div className="flex gap-1">
          {index > 0 && (
            <Button variant="ghost" size="sm" {...backProps}>
              戻る
            </Button>
          )}
          <Button size="sm" {...primaryProps}>
            {isLastStep ? '完了' : '次へ'}
          </Button>
        </div>
      </div>
    </div>
  )
}
