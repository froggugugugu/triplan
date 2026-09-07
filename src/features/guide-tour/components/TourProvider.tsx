import { useEffect } from 'react'
import { EVENTS, type EventData, Joyride } from 'react-joyride'
import { useTourStore } from '@/stores/tour-store'
import { TourTooltip } from './TourTooltip'

/**
 * ガイドツアーの実行コンテナ。
 *
 * react-joyride 3.2.0 への移行でAPIが大きく変わっている:
 * - default export → named export（`Joyride`）
 * - `callback` → `onEvent`（型も`CallBackProps`→`EventData`）
 * - 表示系のフラグは`styles.options`ではなく**Props直下の`options`**へ集約
 * - ステップ単位の`disableBeacon`は廃止。全28ステップに付けていたので
 *   `options.skipBeacon`（全体設定）で等価に置き換えた
 *
 * **ステップ進行はjoyrideに任せる（uncontrolled）**。3.0系では`stepIndex`を
 * ストアで持ち`step:after`のたびに更新していたが、3.2.0はステップ遷移の前後に
 * スクロール・before hook・target待ちの非同期段階が入り、
 * **その最中に「次へ」を押すと`step:after`ではなく`scroll:end action=next`が飛ぶ**。
 * 外部が`stepIndex`を握っていると、この経路で更新が漏れてツアーが停止する
 * （E2Eで再現・特定）。アプリ側が現在位置を知る必要は無いので、
 * 開始・終了だけを状態として持つ。
 *
 * **ESC・オーバーレイクリックは「離脱」ではなく「次へ進む」に意味が変わった**
 * （`dismissKeyAction`/`overlayClickAction`の`'close'`＝
 * 「現在のステップを閉じて次へ進む」。3.0の`disableCloseOnEsc={false}`＝
 * 「ESCでツアーを閉じる」とは逆）。ツアーを抜ける手段が無くなるうえ、
 * 誤操作で勝手に進むため両方とも無効化し、ESCでの離脱は自前で拾って
 * 旧来どおりの挙動に戻す。
 */
export function TourProvider() {
  const isRunning = useTourStore((s) => s.isRunning)
  const steps = useTourStore((s) => s.steps)
  const currentTourId = useTourStore((s) => s.currentTourId)
  const stopTour = useTourStore((s) => s.stopTour)

  // ESCでツアーを離脱する（joyride側の既定は「次へ進む」なので無効化してある）
  useEffect(() => {
    if (!isRunning) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stopTour()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isRunning, stopTour])

  const handleEvent = (data: EventData) => {
    // 終了（最終ステップの完了・スキップ）だけを拾う
    if (data.type === EVENTS.TOUR_END) {
      stopTour()
    }
  }

  if (!isRunning || steps.length === 0) return null

  return (
    <Joyride
      // ツアーを切り替えたら内部の進行位置ごと作り直す
      key={currentTourId ?? 'tour'}
      onEvent={handleEvent}
      continuous
      run={isRunning}
      steps={steps}
      tooltipComponent={TourTooltip}
      scrollToFirstStep
      options={{
        zIndex: 10000,
        overlayColor: 'rgba(0, 0, 0, 0.4)',
        scrollOffset: 80,
        // 旧: 全ステップの`disableBeacon: true`。ツアーは常にメニューから
        // 明示的に開始するため、ビーコン（点滅する開始ポイント）は出さない
        skipBeacon: true,
        // どちらも既定は「次へ進む」。誤操作で勝手に進まないよう無効化する
        dismissKeyAction: false,
        overlayClickAction: false,
      }}
    />
  )
}
