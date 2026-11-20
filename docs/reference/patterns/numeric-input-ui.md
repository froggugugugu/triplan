# 数値入力（NumericInput）・UI規約

> [`docs/development-patterns.md`](../../development-patterns.md) から分割した詳細リファレンス。常時ロードされないため、必要なときにこのファイルを直接Readする。

## 6. 数値入力（NumericInput）コンポーネント

### 6.1 設計の背景

`NumericInput` は `type="text"` ベースの数値入力コンポーネント。全角数字・全角ピリオドを自動的に半角に変換し、入力中の先頭ゼロを除去する（ただし「0.5」のような小数点前の単一0は保持）。

従来の `type="number"` では、ブラウザの自動フォーマットが負値やワイルドカード入力を処理しきれず、複数の単価・金額フィールドで齟齬が生まれていた。

### 6.2 使用場面

- 単価履歴・契約単価の入力（16箇所超）
- SaaS契約金額・利用人数・単価の入力
- 予算内訳金額・概算額・係数の入力
- 予算追加額の入力
- システム設定の概算単価入力

### 6.3 実装パターン

`NumericInput`は`value: number` / `onValueChange: (value: number) => void`を受け取る（`onChange`ではない点に注意。`type`/`value`/`onChange`は`React.ComponentProps<'input'>`からOmitされている）。

```typescript
import { NumericInput } from '@/shared/components/ui/numeric-input'

// useStateとの組み合わせ
const [amount, setAmount] = useState(0)
<NumericInput
  value={amount}
  onValueChange={setAmount}
  placeholder="万円"
/>

// React Hook Formとの組み合わせ（watch/setValueで橋渡しする。
// Controllerのfieldをそのまま{...field}展開してはいけない
// ＝ fieldのonChangeとNumericInputのonValueChangeはシグネチャが異なるため）
const amount = watch('amount')
<NumericInput
  value={amount ?? 0}
  onValueChange={(v) => setValue('amount', v)}
/>
```

**重要**: 負値・不正値の入力時は`onValueChange`が呼ばれない（外部stateを汚染しない）。空文字は`0`として扱われる。丸めや範囲チェックが必要な場合は呼び出し側（フォーム送信時のZodバリデーション等）で実施する。

### 6.4 内部ロジック

1. **入力中（onChange）**: `stripLeadingZeros()`で表示テキストの先頭ゼロを除去し、`parseNumericInput()`でパースできた場合のみ`onValueChange`を呼ぶ（無効な入力中は表示のみ更新し、外部stateは据え置く）
2. **フォーカスアウト時（onBlur）**: `toHalfWidthNumeral()`で全角→半角に変換してから`parseNumericInput()`で確定値を算出し、表示テキストを`String(確定値)`に正規化して`onValueChange`を呼ぶ（無効値は`0`にフォールバック）

---

## 7. UI 規約

### 7.1 ダークモード

```typescript
// OK: shadcn/ui のセマンティックカラー（自動対応）
className="text-foreground bg-background border-border"

// OK: Tailwind の dark: プレフィックス
className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"

// NG: ハードコードされた色値（ダークモードで見えなくなる）
style={{ backgroundColor: '#f0f0f0' }}
// → AG Grid の getRowStyle 等でやむを得ない場合は CSS変数を使う
```

### 7.2 コンポーネント設計

- **Presentational**: props のみに依存、ストアを直接参照しない
- **Container**: ストア/hooks を使用、pages ディレクトリまたは feature のトップに配置
- `components/` 配下で `useXxxStore` を直接呼ぶ場合は Container であることを意識する

### 7.3 shadcn/ui コンポーネント追加

```bash
npx shadcn@latest add <component-name>
```

追加後は `src/shared/components/ui/` に配置される。

### 7.4 条件付きスタイル

```typescript
import { cn } from '@/lib/utils'

<div className={cn(
  'rounded-lg border p-4 transition-colors',
  isActive && 'border-primary bg-primary/5',
  isError && 'border-destructive bg-destructive/5',
)}>
```

### 7.5 通貨・数値の桁揃え表示

表形式で複数の通貨値が縦に並ぶ箇所（合計行・サマリー行等）では、値によって小数の有無が
混在すると桁が揃わず視認性が悪化する（例: ＄→万円換算(`convertUsdToManYen`)や係数計算由来の
小数値と、整数値が同一列内に混在するケース）。会計UIの定石（Excel/Google Sheetsの「会計」書式等）
に倣い、以下の3点セットで統一する。

```typescript
// OK: 万円建て金額は共通フォーマッタmanYenFormatter（固定小数点2桁）を再利用する
import { manYenFormatter as currencyFormatter } from '@/shared/utils/budget-utils'
// セルには 'text-right tabular-nums' を付与する

// NG: ファイルごとにオプション未指定のIntl.NumberFormatを個別定義
// （整数値は小数なし、小数値は最大3桁までと桁数が不揃いになる。かつ13箇所で重複していた）
const currencyFormatter = new Intl.NumberFormat('ja-JP')
```

右寄せ単体では小数点の位置は揃わない（「100」と「100.50」は末尾の文字が揃うだけで小数点が
ズレる）。ゼロパディングで全ての値の小数桁数を統一した上で右寄せし、tabular-numsで
プロポーショナルフォントの文字幅差（「1」と「8」等）による微妙なガタつきも解消する。
予算管理画面の万円建て金額表示は`shared/utils/budget-utils.ts`の`manYenFormatter`（共通定義）を
`import { manYenFormatter as currencyFormatter } from '@/shared/utils/budget-utils'`の形で再利用し、
ファイルごとの個別定義を増やさない。＄建て金額（AI利用費タブ）は`usdFormatter`として各ファイルに
個別定義したまま（2箇所のみのためRule of Three未達、共通化していない）。
NumericInputによる編集用セル（入力中の値）は対象外とし、既存の表示・正規化仕様に従う。

**右寄せの適用範囲**: 予算管理画面（`src/features/budget/`）では、金額（万円/＄）に限らず、
工数（人月）・係数・人数等、表形式で縦に並ぶ数値セル全般に`text-right`（可能なら`tabular-nums`も）
を適用する。ただし以下は対象外とする:
- 単一の標準フォーム入力欄（他行と比較・整列する文脈がない、例: SaaS契約ダイアログの単価入力）
- `flex justify-between`等のレイアウトで既に数値が右端に位置している要約パネル（例:
  BudgetBreakdownDialogの小計表示、BudgetAdjustmentDialogの履歴リスト）。これらは`text-align`を
  変更しても見た目が変わらないため対象外とする
- カード形式で横並び表示する統計値（例: BudgetActualDashboardの予算総額/実績合計カード、
  OtherExpenseActualDialogの予算額/実績合計/残額カード）。単一の大きな数値を中央表示する用途のため
  中央寄せ（`text-center`）のまま維持する
