import { Info } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/components/ui/popover'
import { ESTIMATE_STAGES } from '@/shared/types/estimate-snapshot'
import {
  ESTIMATE_STAGE_LABELS,
  formatConeWidth,
} from '@/shared/utils/uncertainty-cone'

/**
 * 不確実性コーンの解説（Infoアイコン→Popover）。知らない人が最初に触る場所
 * （段階セレクタの横・コーンタブの見出し）に置く（非公開の設計文書）
 */
export function UncertaintyConeInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="不確実性コーンの解説"
        >
          <Info className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 space-y-3 text-sm" align="start">
        <div className="space-y-1">
          <p className="font-medium">不確実性コーン（Cone of Uncertainty）</p>
          <p className="text-muted-foreground text-xs">
            見積の誤差は「分かっていること」が増えるほど狭まる、という経験則です。
            引合の時点では実績が見積の1/4〜4倍になりうるのに対し、要件が固まると
            2/3〜1.5倍に、詳細設計が終わると±10%に収まります（Boehm
            1981／McConnell 2006）。
          </p>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-1 text-left font-medium">段階</th>
              <th className="py-1 text-right font-medium">実績÷見積の幅</th>
            </tr>
          </thead>
          <tbody>
            {ESTIMATE_STAGES.map((stage) => (
              <tr key={stage} className="border-b border-border/50">
                <td className="py-1">{ESTIMATE_STAGE_LABELS[stage]}</td>
                <td className="py-1 text-right tabular-nums">
                  {formatConeWidth(stage)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-muted-foreground text-xs">
          幅が狭まるのは<strong>分からないことが減るから</strong>
          で、見積の手法が
          良くなるからではありません。受注時にWBSを切っても、要件が固まる前なら幅は
          製品定義と同じ（0.5x〜2x）です。受注額と見積の間に、その幅のぶんだけ余地が要ります。
          詳しくは利用ガイド「見積と不確実性コーン」を参照してください。
        </p>
      </PopoverContent>
    </Popover>
  )
}
