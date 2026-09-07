# 開発パターン集

プロジェクト固有のコード規約・落とし穴・アンチパターンをまとめる。
汎用的なReact/TypeScript知識はここには含めない。
ルート定義・ストア一覧・ディレクトリ構成・スキーマ定義は `docs/project.md`, `docs/architecture.md`, `docs/data-model.md` を参照。

---

## 1. Zustand ストア

### 1.1 セレクタの鉄則

```typescript
// NG: セレクタ内で新しい配列/オブジェクトを生成 → 無限ループ
const items = useStore((s) => s.list.filter((x) => x.active))

// OK: 生データを取得し、useMemoで派生
const list = useStore((s) => s.list)
const items = useMemo(() => list.filter((x) => x.active), [list])
```

**検出**: `useXxxStore((s) => s.xxx.filter` / `.map` / `.sort` / `.reduce` がないか確認する。

### 1.2 ストア間の参照（getState()）

```typescript
// OK: 他ストアは getState() で参照（カスケード削除等）
deleteProject: (id) => {
  set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }))
  const { assignments } = useAssignmentStore.getState()
  useAssignmentStore.getState().bulkDelete(
    assignments.filter((a) => a.projectId === id).map((a) => a.id)
  )
}
```

### 1.3 永続化アーキテクチャ（persist vs jsonStorage 混在）

本プロジェクトでは2つの永続化パターンが併存する:

| パターン | 対象ストア | ストレージキー | 特徴 |
|---------|-----------|---------------|------|
| Zustand `persist` + `createJSONStorage` | app-store（テーマ・年度等のUI状態） | `resource-manager-app` | 自動永続化 |
| 手動 `jsonStorage.load()` / `.save()` | projects, members, assignment, efforts, schedule, team, tech-tags 等 | `resource-manager-data`（単一キー） | アクション内で明示的に呼び出し |

```typescript
// パターンA: persist ミドルウェア（app-store）
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({ /* ... */ }),
    { name: 'resource-manager-app', storage: createJSONStorage(() => localStorage) },
  ),
)

// パターンB: jsonStorage（その他の業務データストア）
export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: jsonStorage.load().projects ?? [],
  addProject: (project) => {
    set((s) => ({ projects: [...s.projects, project] }))
    jsonStorage.save(get())
  },
}))
```

新規ストア追加時は、データの性質に応じてパターンを選択すること。

### 1.4 マイグレーション

`persist` ミドルウェアを使うストアの場合:

```typescript
persist(
  (set, get) => ({ /* ... */ }),
  {
    name: 'store-key',
    version: 2,
    migrate: (persisted, version) => {
      const state = persisted as Record<string, unknown>
      if (version === 0) { /* v0→v1 */ }
      if (version === 1) { /* v1→v2 */ }
      return state
    },
  },
)
```

`jsonStorage` を使うストアの場合は `json-storage.ts` 内のロード処理でデフォルト値を設定する。

---

## 2. AG Grid (v33)

### 2.1 列定義のメモ化

```typescript
// OK: useMemoで列定義を安定化
const columnDefs = useMemo<ColDef<RowData>[]>(() => {
  const dynamicCols = items.map((item) => ({
    headerName: item.name,
    field: `dynamic_${item.id}`,
    editable: (params) => params.data?.isEditable ?? false,
  }))
  return [...staticCols, ...dynamicCols]
}, [items])

// NG: レンダーごとに新しい配列を生成 → 列がリセットされる
const columnDefs = [...]
```

### 2.2 valueSetter の型変換（Number() 必須）

AG Grid のテキストエディタは **string** 値を返す。数値フィールドでは必ず `Number()` で変換する。

```typescript
// NG: string値がそのまま保存され、cellRendererの .toFixed() がクラッシュ
valueSetter: (params) => {
  params.data.value = params.newValue  // string!
  return true
}

// OK: Number()で変換
valueSetter: (params) => {
  params.data.value = Number(params.newValue)
  return true
}
```

### 2.3 cellRenderer の防御的コーディング

```typescript
// OK: data未定義チェック必須（仮想スクロール時にnullあり）
function MyCellRenderer(props: ICellRendererParams) {
  if (!props.data) return null
  const value = Number(props.data.amount)  // 防御的にNumber()変換
  return <div className="flex h-full items-center">{value.toFixed(2)}</div>
}
```

### 2.4 v33 固有の注意点

- **DOM重複行**: ピン留め列（pinned-left）と本体（center-cols）で同じ `row-id` の行が重複レンダーされる
  - セレクタ例: `.ag-center-cols-container .ag-row[row-id="..."] .ag-cell[col-id="..."]`
  - Playwright等では `.first()` やコンテナ指定セレクタを使う
- **クラス名**: インライン編集中は `ag-cell-inline-editing`（`ag-cell-editing` ではない）
- **API変更**: `columnApi` は非推奨、`gridApi` 経由でアクセスする
- **テーマAPI**:
  - `headerForegroundColor` → `headerTextColor` にリネーム
  - `inputBorderColor` は存在しない → `inputBorder: { color: '...' }` を使用

---

## 3. 数値精度

### 3.1 工数値の丸め

| 対象 | 刻み | 関数 | 計算式 |
|------|------|------|--------|
| WBS工数 | 0.05刻み | `roundToHalf()` | `Math.round(value * 20) / 20` |
| アサイン配分 | 0.01刻み | `parseAssignmentInput()` | `Math.round(parsed * 100) / 100` |

表示はいずれも `.toFixed(2)` で小数第2位まで。

### 3.2 浮動小数点比較（epsilon使用）

```typescript
// NG: 浮動小数点の直接比較（0.1 + 0.2 !== 0.3 問題）
if (total === 1.0) { ... }

// OK: イプシロンで比較
if (Math.abs(total - 1.0) < 0.001) { ... }
```

---

## 4. 年度月変換

年度月（`fiscalMonth`）と暦月（`calendarMonth`）の変換:

```
fiscalMonth 1=4月, 2=5月, ..., 9=12月, 10=1月, 11=2月, 12=3月
```

月次データのキーは `"YYYY-MM"` 形式（暦月ベース）で統一されている。
変換関数は `src/shared/types/database.ts` に定義:
- `fiscalMonthToCalendarMonth()`: 年度月 → 暦月
- `calendarMonthToFiscalMonth()`: 暦月 → 年度月
- `getFiscalMonthLabel()`: 年度月 → `"4月"` 形式のラベル

**注意**: UIの表示ラベルと内部データの月番号が一致しているか常に確認すること。

---

## 5. データモデル変更時の規約

### DatabaseSchema への追加

```typescript
// OK: 後方互換のため optional で追加（既存データの読み込みが壊れない）
newField: z.array(NewSchema).optional()

// NG: required で追加 → 既存データのパースが失敗する
newField: z.array(NewSchema)
```

### json-storage.ts のマイグレーション

`jsonStorage` パターンのストアでは、`load()` 時にデフォルト値を設定する:

```typescript
const data = jsonStorage.load()
const newItems = data.newField ?? []  // undefinedの場合のフォールバック
```

### Zodスキーマ設計パターン

```typescript
// データスキーマ（永続化用）
export const ProjectSchema = z.object({ id: z.string().uuid(), ... })
export type Project = z.infer<typeof ProjectSchema>

// フォーム用（id, timestamp除外）
export const CreateProjectSchema = ProjectSchema.omit({ id: true, createdAt: true })

// 部分更新用
export const UpdateProjectSchema = CreateProjectSchema.partial().required({ id: true })
```

---

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

---

## 8. E2E テストパターン

### 8.1 テストデータ注入

全業務データは **単一の localStorage キー** `resource-manager-data` で管理される。

```typescript
// シードデータを構築し、localStorageに注入
const seedData = {
  version: '1.0.0',
  fiscalYear: 2025,
  projects: [...],
  members: [...],
  assignments: [...],
  metadata: { lastModified: new Date().toISOString(), createdBy: 'test', version: '1.0.0' },
}

await page.evaluate((d) => {
  localStorage.setItem('resource-manager-data', JSON.stringify(d))
}, seedData)
```

### 8.2 AG Grid 操作ヘルパー（コンテナ指定セレクタ）

AG Grid はピン留め列で DOM 行が重複するため、コンテナを指定する:

```typescript
// Center-cols のセル
const cell = page.locator(
  '.ag-center-cols-container .ag-row[row-id="0"] .ag-cell[col-id="value"]'
)

// Pinned-left のセル
const cell = page.locator(
  '.ag-pinned-left-cols-container .ag-row[row-id="0"] .ag-cell[col-id="name"]'
)
```

テキストマッチの注意: `hasText: '1月'` は "1月", "11月", "12月" にもマッチするため、`col-id` セレクタを使うこと。

### 8.3 ナビゲーション回避策

Zustand ストアと `useMemo` の組み合わせで初回ナビゲーション時にデータが古い場合がある:

```typescript
// OK: /wbs 経由で SPA ナビゲーション
await page.goto('/wbs')
await page.getByRole('link', { name: /アサイン/ }).click()
```

---

## 9. デザインシステム

### 9.1 参照するデザインシステム

UI/UX実装時は以下のデザインシステム・ガイドラインに準拠する。

参考とする全体デザインシステム：https://www.digital.go.jp/policies/servicedesign/designsystem

> **出典表示（利用規約準拠）**
>
> 本プロジェクトのカラートークン（プライマリカラー・セマンティックカラー）およびスペーシング設計は、
> デジタル庁デザインシステムウェブサイト https://design.digital.go.jp/dads/ のコンテンツを参考に加工して作成しています。
> デジタル庁が本プロジェクトのUIを作成・承認したものではありません。
>
> 利用規約: https://design.digital.go.jp/dads/introduction/notices/

| リソース | URL | 用途 |
| ------------ | ------------------------------------------------- | ----------------------------------------------------------- |
| shadcn/ui    | [ui.shadcn.com](https://ui.shadcn.com/)           | UIコンポーネントライブラリ（本プロジェクトの基盤）          |
| Radix UI     | [radix-ui.com](https://www.radix-ui.com/)         | shadcn/uiの基盤プリミティブ（アクセシビリティ仕様）        |
| Tailwind CSS | [tailwindcss.com](https://tailwindcss.com/docs)   | ユーティリティファーストCSS（スペーシング・カラー・レスポンシブ） |
| WCAG 2.1     | [w3.org](https://www.w3.org/TR/WCAG21/)           | アクセシビリティ基準（AA準拠を目標）                        |
| Lucide Icons | [lucide.dev](https://lucide.dev/icons/)           | アイコンライブラリ                                          |

### 9.2 カラートークン

本プロジェクトではshadcn/uiのCSS変数ベースのカラートークンを使用する。

```css
/* src/index.css で定義済み */
--background    /* 背景色（canvas。カード面より一段暗いニュートラルグレー） */
--foreground    /* 前景色（テキスト） */
--card          /* カード面（surface。背景より明るく、二層構造で階層を表現） */
--primary       /* プライマリカラー（アクセント、インディゴ系） */
--secondary     /* セカンダリカラー */
--muted         /* ミュートカラー */
--accent        /* アクセントカラー */
--destructive   /* 破壊的操作の色 */
--border        /* ボーダー色 */
--ring          /* フォーカスリング色 */
```

2026-08-13、Linear/Notion系の配色へリニューアル（機能部分＝AG Grid本体を除く）。`--background`（canvas）と
`--card`/`--popover`（surface）を明確に分離した二層構造とし、青みがかっていた中立色（border/muted等）を
ニュートラルグレーへ、プライマリカラーをDADS由来の鮮やかな青からインディゴ系（`#4a56c9`、ダークモードは
`#7c86e6`）へ調整した。値の完全刷新ではなく、DADS参考のベースからの発展的な調整という位置づけを維持する
（出典表示コメントは`src/index.css`冒頭に残置）。

書体は英数字を`Inter Variable`、日本語を`Noto Sans JP`（400/500/700の3ウエイト）とし、いずれも
`@fontsource-variable/inter` / `@fontsource/noto-sans-jp`でセルフホストする（CDN非依存、オフライン動作を
妨げない）。`--font-sans`トークン（`src/index.css`）で定義し、`body`の`font-family`から参照する。
数値が縦に並ぶ箇所の桁揃え用に`font-variant-numeric: tabular-nums`を`body`へ全体適用済み（§7.5の
個別適用パターンと併用可、重複適用は無害）。

角丸は`--radius-lg`を0.5rem→0.625remに拡大（`--radius-md`/`--radius-sm`は連動して算出されるため個別コンポーネントの
クラス変更は不要）。

#### 9.2.1 予算管理画面の配色運用ルール（予算＝青系／支出＝赤系）

予算管理画面（`src/features/budget/`）では、「予算（見立て）」と「支出（実績）」を背景色で視覚的に区別する。

```css
/* src/index.css で定義済み（@theme本体・prefers-color-scheme dark・:root.dark・:root.light の4箇所すべてに定義） */
--budget-planned  /* 予算系要素の背景（bg-budget-planned/10等の薄色バリアントで使用） */
--budget-actual   /* 支出（実績）系要素の背景（bg-budget-actual/10等の薄色バリアントで使用） */
```

- 予算額・予算枠・予算総額などのセル/カードには `bg-budget-planned/10`（薄い青）を使用する
- 実績額・実績合計・実績割当額などのセル/カードには `bg-budget-actual/10`（薄い赤）を使用する
- 既存の`text-destructive`（予算超過等の警告色）とは役割が異なる。警告色は「異常値の強調」、`budget-actual`は「支出であることの分類」に使う。両者は併用可（例: 実績セルの背景は`bg-budget-actual/10`、超過時は文字色に`text-destructive`を追加）
- 新規トークンを`index.css`に追加する場合は、既存の`--color-primary`等と同じ4箇所（`@theme`本体、`@media (prefers-color-scheme: dark) { :root:not(.light) {...} }`、`:root.dark`、`:root.light`）すべてに値を定義すること。**メディアクエリの中は`@theme`ではなく通常のCSS宣言**にする（`@theme`はトップレベル専用で、`@media`内に書くとメディアクエリが剥がれて無条件適用される。で実バグとして発見）。2箇所（ライト/ダークmedia）のみでは、ユーザーが明示的にテーマを切り替えた際（`.dark`/`.light`クラス付与）に反映されない

### 9.3 スペーシングスケール

Tailwind CSSのデフォルトスケールに従う（`p-1` = 4px, `p-2` = 8px, `p-4` = 16px, ...）。
マジックナンバーの直指定は禁止。

#### 9.3.1 全体の表示密度（フォントサイズ・AG Grid密度）

2026-08-13、作業領域を広げる目的で全体の表示密度を1段階コンパクト化した。

- `:root`の`font-size`を`var(--app-font-size, 14px)`とし、`app-store`の`fontSize`設定（`sm`/`base`/`lg`/`xl`、
  既定値`sm`=14px）を反映する。Tailwindのほぼ全ユーティリティ（文字サイズ・余白・アイコンサイズ等）は
  rem基準のため、この1箇所の変更だけでコンポーネント個別のクラス変更なしに全体が一律スケールする。
  AG Grid以外はこの仕組みでカバーされる
- AG Grid（`shared/ag-grid-theme.ts`）はTailwindのrem基準スケーリングを継承しないため、Theming APIの
  `fontSize`/`spacing`パラメータを個別に指定する必要がある（既定値`fontSize: 14, spacing: 8`から
  `fontSize: 13, spacing: 6`に変更。`rowHeight`/`headerHeight`は`spacing`から自動算出されるため直接指定は不要）
- ユーザーが将来フォントサイズを選べるUI（`increaseFontSize`/`decreaseFontSize`/`setFontSize`アクション）を
  追加する場合、AG Grid側の`fontSize`/`spacing`も連動させる設計にすること（現状は`app-store`のfontSizeと
  独立した固定値のため、UIから変更してもGridの密度だけは追従しない）

### 9.4 コンポーネント追加手順

```bash
npx shadcn@latest add <component-name>
```

追加後は `src/shared/components/ui/` に配置される。Radix UIプリミティブのアクセシビリティ仕様を確認すること。
本リポジトリには `components.json`（shadcn CLI設定）が存在しないため、CLIが使えない場合は対応する
`@radix-ui/react-*` パッケージを直接インストールし、既存コンポーネント（`collapsible.tsx`等）と
同じスタイル（`cn()`によるクラス合成、`data-[state=...]`属性セレクタでのバリアント表現）で手動作成する
（`tabs.tsx`はこのパターンで追加）。

### 9.5 アクセシビリティ

`e2e/a11y.spec.ts` が axe-core で全対象画面（`PAGES`一覧）・主要ダイアログを WCAG 2.1 A/AA 検査し、
**違反0件を固定**している。新しい画面・ダイアログを追加したらこのリストへ足す。

導入時の実測は194件で、原因は3種に集約された。同じ轍を踏まないための規約:

- **アイコンのみのボタンには必ず `aria-label` を付ける**（開閉トグル等）。
  `title` 属性だけでは axe の `button-name` を満たさないことがある
- **表示テキストに依存するアクセシブルネームを当てにしない**。`Combobox` は
  「選択値のラベル」を表示するため、値が選択肢に無い・未選択のときに名前が消える。
  共通コンポーネント側で `aria-label={ariaLabel ?? placeholder}` を持たせてある
- **native `<select>` は `aria-label` か `<Label htmlFor>` で必ず紐づける**。
  視覚的に隣接するだけの「部門:」のようなテキストは select に関連付かない
- **ユーザー指定色の上に文字を置くときは文字色を固定しない**。
  `pickReadableTextColor`（`shared/utils/color-contrast.ts`）で背景輝度から
  白/黒を選ぶ。白と黒の二択で必ず AA（4.5:1）を満たせる（分岐点でも約4.58:1）

**axeは自動検出できる範囲しか見ない**。キーボード操作の順序、スクリーンリーダーでの
読み上げの自然さ、フォーカス管理の妥当性は対象外で、0件は「WCAG準拠」ではなく
「機械的に検出できる違反が無い」ことを意味する。

### 9.6 アイコン使用規約

```typescript
import { IconName } from 'lucide-react'

// OK: サイズはTailwindクラスまたはsize propで指定
<IconName className="h-4 w-4" />
<IconName size={16} />

// NG: styleでハードコード
<IconName style={{ width: '14px' }} />
```

---

## 10. 過去の問題事例

| 問題 | 原因 | 対策 |
| ---- | ---- | ---- |
| AG Grid で `.toFixed()` がクラッシュ | valueSetter が string 値をそのまま保存 | `Number()` で変換 |
| Zustand ストアで無限ループ | セレクタ内で `.filter()` / `.map()` | `useMemo` で派生 |
| 年度月の表示ずれ | fiscalMonth / calendarMonth の混同 | 変換関数を必ず経由 |
| ダークモードで文字が見えない | ハードコードされた色値 | セマンティックカラー使用 |
| 既存データ読み込みエラー | 新フィールドを required で追加 | optional + デフォルト値 |
| DOM 要素の重複選択（E2E） | AG Grid の pinned/body 重複行 | コンテナ指定セレクタ使用 |
| タイムゾーンでテスト失敗 | `new Date('YYYY-MM-DD')` が UTC 解釈 | `new Date(year, month, day)` を使用 |
| 既存データ消失（budget-store） | Layout マウント時に `loadBudgetData()` を呼ばず、概算単価を保存すると他フィールドが空配列で上書き | Layoutマウント時に `useBudgetStore.getState().loadBudgetData()` を必須呼び出し |
| E2E テスト誤マッチ | `getByText()` の部分一致で類似文言を誤検出（例: 「予算内訳」vs「先に予算内訳を登録してください」） | `exact: true` オプション使用 or `.first()` で最初のマッチを指定 |
| E2E シードデータの静かな読み込み失敗 | あらゆるエンティティの `id`/`projectId`/`divisionId`等（`Project`/`Member`/`Section`/`EffortEntry`等ほぼ全スキーマの`id`が`z.string().uuid()`）に16進数以外の文字（例: `se01`の`s`、`me01`の`m`、`e1`のような短縮id）を含めると`DatabaseSchema.parse()`が失敗し、`jsonStorage.load()`が例外を握りつぶして空データベースにフォールバックする（`部門が登録されていません`・`案件がありません`等の空状態表示になり、他フィールドは正しく見えるため原因が分かりにくい） | E2Eシードデータの id は必ず `0-9a-f` のみで構成する完全なUUID形式にする（例: `00000000-0000-4000-8000-00000000ec01`）。`'e1'`等の短縮idは使わない。空状態が予期せず表示されたら、まずシードデータ全エンティティのUUID形式を疑う |
| コンポーネントテストの構造依存クエリ破損 | UIをカード分割から単一テーブルに再構成する等、DOM構造を変えるリファクタで `.closest('div.rounded-lg')` のような実装詳細に依存したテストクエリが軒並み壊れる（例: PersonnelPlanPanelの4カード→単一表への再構成） | テストは可能な限り`role`/`label`/表示テキストを起点にクエリし、DOM階層に依存するクエリ（`.closest()`等）を使う場合は再構成時に必ず見直す前提でコメントを残す |
| E2E: シードした`fiscalYear`と表示中の年度がずれる | `BudgetPage.tsx`の`selectedFiscalYear`初期値はシードデータの`Database.fiscalYear`ではなく、実行時の現在日時から`getCurrentFiscalYear()`で算出される。年度をまたぐタイミングでシードデータに固定年度（例: `'2025-04'`）を仮定したアサイン等を仕込むと、実行日によって対象年度がずれて集計が0になる | 年度依存のシードデータ（`AssignmentEntry.monthlyValues`のキー等）は、テスト内で現在日時から動的に年度を算出するヘルパー（`getCurrentFiscalYearAprilKey()`等）を使って生成する。ハードコードされた年度文字列をアサイン等の月次データに使わない |
| 月=列レイアウトのAG Grid/Table使い分け | 月別入力グリッドを横方向（月=列）に再構成する際、行数が可変・大規模になりうるか（案件タブ等）と、行数が固定小規模か（人員計画4区分、AI利用費3指標等）で実装コストと保守性が大きく異なる | 行数が固定小規模（十行未満）なら素の`Table`＋`NumericInput`（`PersonnelPlanPanel`と同じパターン）、行数が可変・多数になりうるならAG Grid（`ProjectBudgetView`と同じパターン）を選ぶ。要件文書が暗黙にAG Grid前提で書かれていても、既存コードの使い分け方針（``参照）を優先する |
| Zustandストアに新フィールド追加後、既存コンポーネントが再レンダーされない | `budget-store`に`exchangeRateHistory`を追加し、`getBudgetOverview`等の既存セレクタの計算に組み込んだが、`DivisionBudgetPanel.tsx`・`BudgetBreakdownDialog.tsx`が新フィールドを`useBudgetStore((s) => s.exchangeRateHistory)`で購読していなかったため、システム設定で為替レートを変更してもUIが再計算されず古い値（変更前の0円換算）のまま表示され続けた（E2Eで実機確認して発覚）。セレクタ関数自体（`get()`経由で内部的に新フィールドを読む）は正しい値を返すため、単体テスト（セレクタを直接呼ぶ）では検出できない | 既存セレクタが内部で参照するstoreフィールドを追加・変更した場合、そのセレクタを呼び出している**すべてのコンポーネント**で「変更を検知して再レンダーされるよう購読する」の一群（`useBudgetStore((s) => s.xxx)`の羅列）に新フィールドも追加する。grepで`getBudgetOverview\|getAiUsageBudgetTotal`等の呼び出し元を洗い出し、購読漏れがないか確認する。E2Eで実際にUI操作→再表示の一連を確認するまで「セレクタのロジックが正しい」＝「UIが正しく動く」と判断しない |
| `npm run check` が意図せずリポジトリ全体を整形してしまう | `package.json`の`check`スクリプトは`biome check --write .`と`.`が固定されており、`npm run check -- <対象ファイル>`のように末尾に引数を追加しても無視され、全ファイルが整形対象になる（`.claude/settings.json`等の無関係ファイルまで書き換わり、保護ファイルなら書き戻しもブロックされる） | 特定ファイルのみを対象にしたい場合は`npm run check`ではなく`./node_modules/.bin/biome check --write <対象ファイル...>`のようにbiomeバイナリを直接呼ぶ（`npx biome ...`は`@biomejs/biome`パッケージ名との不一致で解決に失敗することがあるため`node_modules/.bin/biome`を直接指定する） |
| AG Grid以外のTable/セルで複数値を1セルに縦積み表示する際のE2Eセレクタ曖昧化 | `DivisionBudgetPanel`の3行セル（予算合計/実績合計/残）のように1つの`<td>`内に複数の数値`<div>`を縦積みすると、`getByText('1,000')`等の値ベースのE2Eアサーションが同一行内の複数箇所（予算合計セルの数値と総合計セルの数値等）にマッチして意図しない要素を拾う、または`toHaveText`の完全一致がセル内の全テキスト連結（例: `"000"`）と食い違って失敗する | 複数行セルの特定の1行を検証したい場合は、行を意味付けるCSSクラス（`text-budget-planned`/`text-budget-actual`等）を`locator('.text-budget-planned')`のように指定してスコープを絞る。列インデックス（`td.nth(n)`）も列構成変更時に必ずズレるため、変更のたびに全箇所を洗い出して更新する |
| `NumericInput`は負値を受け付けないため、増減両対応のフィールドは符号付き数値にできない | 「予算調整に減額対応させたい」という要求に対し、`BudgetAdjustment.amount`を符号付き（負値許容）にする案は`NumericInput`の仕様（`docs/development-patterns.md` 6.3「負値・不正値の入力時はonValueChangeが呼ばれない」）と衝突し、UIから減額を入力する手段がなくなる | `amount`は0以上の絶対値のまま維持し、`adjustmentType: 'increase' \| 'decrease'`のような種別フィールドを追加して符号を表現する（`BudgetAdjustment`で採用したパターン）。集計側は種別に応じて加算/減算を切り替える |
| Testing Libraryの`getByText()`がJSX補間で分割されたテキストを見つけられない | `進捗 {progress}%`のようなJSX式は`進捗 `/`67`/`%`の複数テキストノードに分割されてDOMに描画されるため、`screen.getByText('進捗 67%')`が「text broken up by multiple elements」で失敗する（`MemberSkillPanel`のロードマップ進捗表示で発生） | 完全一致の文字列マッチではなく、カスタム関数マッチャーで要素の結合済みテキストを比較する: `screen.getByText((_, el) => el?.textContent === '進捗 67%')` |
| モック化したZustandストアを使うコンポーネントテストで、アクション呼び出し後にUIが更新されない | `vi.fn().mockImplementation(...)`でストアをモックすると実際のZustand購読・再レンダー機構が働かないため、モックのクロージャ変数（例: `skillEvaluations`配列）をアクション内で書き換えても呼び出し元コンポーネントは自動再レンダーされない。加えて`setState('')`のような「変更後も同じ値」への更新はReactが`Object.is`で同一と判定してバイパスするため、狙った再レンダーが起きないケースもある（`MemberSkillPanel.test.tsx`で発覚） | モックストアを使うテストでアクション呼び出し後にUIの変化を検証したい場合は、`render()`が返す`rerender`を保持しておき、アクション実行後に明示的に`rerender(<Component .../>)`を呼んでから再アサーションする。本番コードでは実際のZustandの購読機構が自動で処理するため、この対応はテストコード限定の回避策であることをコメントで明記する |
| Radix `Tabs`で非アクティブタブの中身がテストから見つからない | `Tabs.Content`は既定でアクティブでないタブの中身をDOMからアンマウントする（`forceMount`未指定時）。`TeamMemberDialog`を「スキル・成長記録」タブに切り替えず`getByRole('cell', ...)`等で中身を探すと要素が見つからず失敗する。また`Tabs.Trigger`はネイティブ`<button>`だが`role="tab"`を明示しているため、Testing Libraryの`getByRole('button', { name: ... })`ではヒットしない | タブ内のコンテンツを検証する前に必ず`getByRole('tab', { name: ... })`でトリガーをクリックしてからアクティブ化する。Playwright側も同様に`dialog.getByRole('tab', { name: ... }).click()`でタブを開いてから内部要素を操作する（`Collapsible`のトリガー開閉と同じ「先に開く」パターンだが、role名が`button`ではなく`tab`である点に注意） |
| Biomeの`useExhaustiveDependencies`が実際には必要な依存を「不要」と誤検知する | `EvmPanel.tsx`の`seriesData`用`useMemo`が、内部で`settingsMap`/`efforts`/`estimatedUnitPrice`/`getProjectCoefficient`を参照する`calcBudgetTotal`関数（コンポーネント本体で毎回再生成される通常関数）を呼び出していたところ、Biomeはこれらの値を「コールバック本文で直接参照されていない不要な依存」と判定し、`--unsafe`修正の提案通りに除去すると、データ変更後も古い予算総額のまま再計算されないスラーレバグが生じるところだった（lintの自動修正提案を無批判に適用しない反証チェックで発覚） | 依存の実体がクロージャ関数越しである場合は、その関数自体を`useCallback`で正しい依存配列とともにメモ化し、呼び出し側の`useMemo`はその`useCallback`の戻り値（安定参照）1つだけに依存する形に書き換える。Biomeの提案する「不要な依存の削除」は必ず手動でロジックを追ってから適用すること |
| jsdom環境ではRechartsの`ResponsiveContainer`が子要素を描画しない | `ResizeObserver`やレイアウト計算に依存する`ResponsiveContainer`はjsdom（DOM APIのスタブ実装、実レイアウトなし）では幅・高さを取得できず、内部の`LineChart`/`Legend`等を一切レンダリングしない。`EvmPanel.test.tsx`で`screen.getByText('PV（計画）')`等のLegend文言を検証しようとすると要素が見つからず失敗する | コンポーネントテストではチャート内部のSVG要素・Legend文言を検証せず、`.recharts-responsive-container`コンテナ自体の存在確認に留める。実際の描画・色の視認性確認はPlaywright E2Eで行う（本プロジェクトに`Chart`系コンポーネントの単体テストが元々存在しないのはこのため） |
| UI語彙の一括置換（例:「案件」→「プロジェクト」）は静的grepだけでは見落としが残る | `docs/development-patterns.md`に載っていない画面（`LandingPage.tsx`のマーケティングコピー等）や、事前の洗い出しリストに含まれていなかった別のE2Eファイル（`project-dialog-task.spec.ts`）に、変更対象の文言を検証するアサーションが存在した。コード側だけをgrepして置換しても、対応するテスト・E2Eのアサーション文字列が置換前の文言のままだと、そこで初めてテスト失敗という形で見落としが発覚する | 語彙置換タスクでは「コード側の全出現箇所」と「テスト・E2E側の全出現箇所」を別々に洗い出し、置換後に必ずユニットテスト全件・関連E2E全件を実行して検証する（grepでの網羅確認だけで完了とみなさない）。テストが失敗して初めて見つかる見落としがある前提で臨む |
| デモデータ生成で外部キー的フィールドの割り当てを忘れると、それに依存する機能がデモ上は常に空状態になる | `demo-data.ts`のルート案件生成ロジックは`Project.divisionId`を一度も設定していなかった。EVM機能の対象条件（`divisionId`が選択中部門と一致）が常に不成立になるため、`ProjectProgressEntry`のサンプルデータだけ追加してもEVMパネルはデモ環境で常に空状態のままだった（同じ理由で「案件予算」列のWBS概算予算額集計等、既存機能のデモ表示も影響を受けていた） | 新機能が特定フィールド（`divisionId`等）の設定を前提条件とする場合、そのフィールドをデモデータ生成ロジックが実際に埋めているかをコードで確認する。「サンプルレコードを追加した」ことと「機能がデモで実際に見える」ことは別であり、後者を実機（またはテストのeligibility条件）で確認するまで完了とみなさない |
| ユニットテストが`new Date()`（テスト実行時点の現在日時）に暗黙依存し、実行日によって失敗する | `svar-gantt-utils.test.ts`の`calculateDateRange`テストは`const now = new Date()`を基準にデフォルト表示範囲を計算しており、テスト作成時点の日付を前提に期待値（月）をハードコードしていた。作成時と異なる日にテストを実行すると`expect(result.start.getMonth()).toBe(9)`のようなアサーションが失われた前提とズレて失敗する（`e2e/dashboard.spec.ts`のシード`fiscalYear`ズレと同根の問題だが、ユニットテスト側でも起こりうる） | 「現在日時」を暗黙の入力として使うロジックをテストする場合、`new Date()`をテスト内でモック（`vi.setSystemTime()`等）して固定するか、関数側に基準日を引数として注入できるようにし、テストからは固定値を渡す。テスト実行日に依存する期待値をハードコードしない |
| デモデータの予算額を固定プレースホルダーにすると、既存の実績計算ロジックと桁が乖離して非現実的な表示になる | `demo-data.ts`に部門予算（`BudgetBreakdown.project_personnel`）を追加した際、当初`amount: 1800`のような固定値を仮置きしたところ、`BudgetActualDashboard.tsx`の「実績合計」は`getPersonnelCost`（アサイン率×単価の実データ計算、既存ロジック）を使うため約16,800万円と算出され、消化率が651.9%という非現実的な表示になった。Zodバリデーションはamountが0以上であることしか検証しないため、ユニットテストは全件パスしたまま気づけず、実際にブラウザでデモデータを投入して初めて発覚した | 予算額の一部がスキーマ上は自由数値でも、既存の実績計算ロジック（アサイン率・単価等の実データ駆動）と比較対象になる場合は、固定プレースホルダーではなくその実績計算と同一の関数（本件は`calcSectionExpectedRevenue`）をデモ生成時にも呼び出し、実績と同じ桁になるよう予算額を算出する。スキーマ検証だけでなく、実際にUIを操作して数値の妥当性（消化率が100%前後に収まるか等）を確認するまで完了とみなさない |
| コンポーネントのローカルstateをリフト済みcontrolled propsに変換すると、既存のインタラクションテストが「操作しても表示が変わらない」形で静かに壊れる | `AiUsageGrid`の選択中プロバイダを内部`useState`から`BudgetPage`側にリフトした`providerId`/`onProviderChange` propに変更（メンバー別配分と選択状態を共有するため）したところ、既存の「Comboboxで選択肢をクリック→表示内容が切り替わることを検証する」パターンのテストは、クリックが`onProviderChange`（モック関数）を呼ぶだけで実際の表示更新は起きず（親コンポーネントが再レンダーして新しいpropを渡して初めて反映されるため）、アサーションが古い値のまま一致してしまい失敗しない偽陽性を生みかねない | controlled化した状態を検証するテストは、(1) クリック操作については`onXxxChange`が正しい値で呼ばれたことのみを検証する、(2) 実際の表示切り替えは`render()`が返す`rerender()`で新しいprops（変更後の値）を明示的に渡し直してから検証する、の2種類に分けて書く。ローカルstateのまま扱う「クリックで実際に表示が変わる」旧テストパターンをそのまま流用しない |
| jsonStorageベースストアのURL直接アクセス時に初期値確定が遅れる | `projects-store`等の`loadProjects()`は非同期的に`jsonStorage.load()`からデータを読み込むため、`useState`初期化子（マウント時一回限り）内で`useProjectsStore`の派生データ（`majorProjects`等）を検証すると常に検証失敗してしまう。URL直接アクセス（`/wbs?projectId=xxx`）時にストアがまだ空配列なため | 「候補値だけ先に確定し、ストアロード完了を待つ別のuseEffectで確定反映する」2段階パターンを用いること。`useState(() => resolveInitialProjectId(...))`ではなく`const [initialProjectIdCandidate] = useState(...)`で候補値のみ初期化し、後続のuseEffect内でストア購読を経た上で最終確定する |
| AG Grid以外でも`role="combobox"`を持つ要素が複数存在するとE2Eで検索に失敗する | native `<select>`要素やRadix Popoverトリガー等、AG Grid以外でも`role="combobox"`を持つ要素が複数存在しうる。E2Eで`page.getByRole('combobox')`を使うとstrict modeエラーが発生し、特定要素が選択できない | E2Eで`getByRole('combobox')`を使う際は、セレクタを`button[role="combobox"]`等で種別ごとに絞り込むこと。または`.first()`で最初のマッチを明示的に指定する |
| ツリー構造の「自動展開」判定を`expanded`（UI開閉状態）基準で行うと、無関係な操作で全ての閉じたノードが強制展開される | `ProjectTreeGrid.tsx`のWBS完了チェック操作（`Project.completed`のトグル）で`projects`配列が更新されるたびに`tree`（`useMemo`の再計算結果）の参照が変わり、「新規に子を持つようになったノードを自動展開する」`useEffect`が誤発火していた。原因は「新規判定」を前回の`expanded`集合との比較で行っていたため、`next ⊆ prev`という第1ループの性質上、条件が実質「その時点で単に閉じている全ノード」に一致してしまい、構造変化が一切なくても全ての閉じたアコーディオンが強制的に再展開されていた | 「新たに子を持つようになったノード」の判定は、UI開閉状態（`expanded`）ではなく、直前のレンダーで計算した「子を持つノードの集合」を`useRef`でスナップショットし、そのスナップショットとの差分で行う。初回マウント時（スナップショットが未設定）はこのロジックを完全にスキップし、`expanded`の初期値（localStorage復元やデフォルト全展開）をそのまま尊重する |
| AG Gridの`valueSetter`は`onCellValueChanged`より先にrow dataへ値を書き込むため、`onCellValueChanged`側で保存を拒否しても`refreshCells`だけでは編集前の表示に戻らない | `AssignmentTreeGrid.tsx`の月次アサインセルは`valueSetter`が無条件に`params.data[key] = 入力値`を書き込んでから`onCellValueChanged`が呼ばれる。契約単価対象範囲外の入力をブロックする際、`onCellValueChanged`内でstore更新をスキップし`gridApi.refreshCells({force: true})`だけ呼んでも、row data自体は既に入力値で上書き済みのため、画面には拒否したはずの値がそのまま表示され続ける（トーストは出るが値は消えない）。既存の0.0〜1.0範囲チェック（`parsed === null`分岐）も同じ実装パターンで同様の問題を抱えていた | 保存を拒否するときは`refreshCells`の前に、正しい値（storeの現在値）を明示的に`event.data[colDef.field]`へ書き戻してから`refreshCells`を呼ぶ。「保存を拒否したのに画面上の値は変わって見える」挙動はブロック型バリデーションを追加する際に必ず疑うべき症状で、E2Eで実際にセルの表示値・永続化データの両方を確認するまで「ブロックできている」と判断しない |
| AG Grid行のIDを永続化データから毎回再採番すると、行のIDに紐付く展開状態（Setやローカルstate）が全て無効化される | `WbsTemplatesPage.tsx`の`editorNodes`（AG Grid用の安定id付き木構造）を、ストア由来の`selectedTemplate`（オブジェクト参照。`updateWbsTemplate`のたびに新しい参照になる）を依存にした`useMemo`で`toEditorNodes`から作り直していた。`toEditorNodes`は呼び出すたびに全ノードへ`crypto.randomUUID()`を新規採番するため、グリッドで何か1つ編集するたびに無関係なノードも含め全IDが変わり、`WbsTemplateTreeGrid`内部の展開状態（`expanded`、IDで紐付けるSet）が毎回無効化されて、アコーディオンが強制的に全て閉じる不具合になった（`Project.completed`トグル時の誤展開＝上記の「ツリー構造の自動展開」問題とは逆方向の症状だが、根本原因は同じ「IDの参照安定性を軽視した派生state」） | ID再採番を伴う変換関数（本件の`toEditorNodes`）は、ストアの値そのものではなく「本当にリセットすべきタイミング」（本件はテンプレート切替＝`selectedTemplate?.id`の変化）だけを`useEffect`の依存にする。以降の編集はローカルstateを直接更新し、ストアへの反映は別途行う（派生元オブジェクトの参照が変わるたびに再構築される`useMemo`を、IDに安定性が求められるデータへ気軽に使わない） |
| CSSカスタムプロパティを`setProperty()`でJSから書き込んでも、それを`var()`で参照するCSSルールが存在しなければ何の効果もない | `app-store.ts`の`fontSize`設定（`sm`/`base`/`lg`/`xl`）は`document.documentElement.style.setProperty('--app-font-size', ...)`を呼ぶ`applyFontSize()`を実装済みだったが、`--app-font-size`を`var()`で参照するCSSルールが`index.css`に一つも存在せず、機能として完全に死んでいた（呼び出し元の`initialize()`自体もどこからも呼ばれておらず、二重に死んでいた）。Zustandの状態・永続化・型定義は揃っていたためコードレビューで見落としやすく、ユニットテストも存在しなかった（テストするインターフェース＝CSSの実際の見た目を検証していなかった） | JSから`setProperty()`で書き込むCSSカスタムプロパティを追加する場合、対応する`var(--xxx, フォールバック値)`を参照する側のCSSルールを同じPRで必ず書く。「ストアにアクションがある」ことと「実際に画面に反映される」ことは別であり、実機（またはスクリーンショット）で見た目の変化を確認するまで機能として完了とみなさない |
| Tailwindのrem基準ユーティリティは`<html>`の`font-size`を変えるだけで全体を一括スケールできるが、AG Gridはこの仕組みを継承しない | 全体の表示密度を1段階コンパクト化する際、`:root`の`font-size`を14pxに変更するだけでText/Spacing/Icon等ほぼ全てのTailwindユーティリティ（rem基準）が連動して縮小したが、AG Grid（Theming API）は独自の`fontSize`/`spacing`パラメータで密度を管理しており、rem基準のスケーリングを継承しない。Grid部分だけ変更前の密度のまま取り残される | AG Gridを含む画面全体の密度を変える場合、`:root`のfont-size変更に加えて`shared/ag-grid-theme.ts`の`fontSize`/`spacing`パラメータも同じ比率で個別に調整する（`rowHeight`/`headerHeight`は`spacing`から自動算出されるため直接指定は不要）。「rem基準だから全部連動するはず」という思い込みでAG Grid部分の確認を省略しない |
| persistミドルウェアの状態のデフォルト値をコード側で変更しても、既にlocalStorageへ書き込み済みの既存ブラウザには反映されない | `app-store.ts`の`fontSize`の既定値を`'base'`（16px）→`'sm'`（14px）に変更したが、`fontSize`は`partialize`で永続化対象に含まれており、かつ`version`/`migrate`の仕組みが存在しなかった。過去に一度でもapp-storeへの書き込みが起きたブラウザ（テーマ切替・サイドバー開閉等、`fontSize`と無関係な操作でも`partialize`は状態全体をシリアライズするため巻き込まれる）は、localStorageに旧既定値`'base'`が残ったままになり、`onRehydrateStorage`がそれを読み込んで`--app-font-size`へ`setProperty()`で明示的に書き込む。CSS側の`var(--app-font-size, 14px)`というフォールバックは、カスタムプロパティが（フォールバックが要る）未設定の状態でしか効かないため、JSが一度でも明示値をセットすると新しいCSS既定値は永久に無効化される。フレッシュな環境（新規ブラウザ、Playwrightの新規コンテキスト等）でのみ検証していたため、この不具合はリリース直後には発覚しなかった | `persist`する状態のデフォルト値を変更する際は、既存ユーザーのlocalStorageに旧値が残っている前提で考える。`docs/development-patterns.md` §1.4の`version`+`migrate`パターン（`persisted.version === 0`のとき当該フィールドを新デフォルトへ強制上書きする）を使い、実機で「意図的に旧バージョンのpersist blobをlocalStorageへ注入してから読み込む」テストをして初めて確認完了とする。フレッシュな環境での確認だけでは、この種の不具合は原理的に再現しない |
| Zustandストアを`jsonStorage`直呼び出しから`DataAdapter`経由の楽観的更新へ移行する際、`DataAdapter.create()`が返す確定idが呼び出し元の仮idと異なりうることを見落とすと、戻り値idを連鎖利用する箇所が壊れる | `companies-store`のDataAdapter配線（`docs/project.md`「17ストアのDataAdapter配線」参照）で、`EntityCreateInput<E> = Omit<EntityMap[E],'id'>`のため呼び出し元がidを指定できず、`LocalJsonAdapter`/サーバー側が独自に新規idを確定する設計だと判明した。楽観的更新は「クライアント生成の仮idで即座にstate反映→確定後に本物のレコードへ差し替え」というパターンになるが、`features/projects/utils/wbs-template.ts`の`applyWbsTemplate`は`addProject()`の戻り値`created.id`を再帰的に子タスクの`parentId`として同期的に連鎖利用しており、このパターンをそのまま適用すると子レコードが既に存在しない仮idを参照したまま永続化されツリー構造が壊れる（実装前に反証で発見、companies-storeは連鎖利用箇所が無いため対象外と確認済み） **2026-08-14解決済み**: `DataAdapter.create(entity, data, options?: { id?: string })`にクライアント生成idを受け渡せる第3引数を追加し、`LocalJsonAdapter`（`options?.id ?? crypto.randomUUID()`）・`PostgresApiAdapter`（POSTボディへ`id`を含める）・サーバー側`crud-factory.ts`（`createSchema`とは独立にボディの`id`をプラック・UUID形式検証してINSERT値へ合流、不正形式は400・重複は既存の409ハンドリングでカバー）の3箇所で尊重させた。呼び出し元は楽観的更新の仮idをそのまま`create()`の第3引数へ渡せば確定後もidが変わらなくなるため、戻り値idの連鎖利用が安全に行える（`companies-store.ts`の`addCompany`が実装例、実Postgres・`DataAdapter`契約テスト双方で反証済み）。ストアをDataAdapter経由へ書き換える際は、`addXxx()`内で`create()`にidを渡すこの実装例を踏襲する |
| 「マウント時に0件ならシードする」パターンを同期jsonStorageから非同期DataAdapterへ移行すると、React StrictMode（開発時のuseEffect二重発火）と組み合わさって二重シードのTOCTOUレースが発生する | `wbs-template-store`の`seedStandardTemplate()`をDataAdapter経由へ変換した際、ローカルZustand state（`get().wbsTemplates.length`）ではなく`DataAdapter.list()`の都度確認に変えたが、それでも実ブラウザE2Eで標準テンプレートが2件作成される実バグが発生した。原因はStrictModeが`WbsTemplatesPage`のマウント時`useEffect`（`seedStandardTemplate()`を呼ぶ）を意図的に2回連続発火させ、1回目の`list()`が解決する前に2回目が割り込むと、両方とも「まだ0件」と判定してしまうため（`loadWbsTemplates()`という別のuseEffectとの競合ではなく、同一関数の自己二重発火が原因だった点が、当初想定していたuseEffect順序レースとは異なる新たな発見）。単体テスト（モック）は同期的に1回だけ呼ぶため、この種のレースを検出できない | 非同期化した「初回のみ実行」系アクションには、呼び出しの1回目で即座に立つモジュールスコープの同期フラグ（`let seedAttempted = false`、ページ読み込みごとに自然リセットされる）を、非同期処理の完了を待たずに追加すること。ローカルstate/DataAdapterの0件判定だけでは、非同期処理中に割り込む2回目の呼び出しを防げない。テストからは`resetXxxForTesting()`のようなエクスポート関数でリセットする（`resetDataAdapterForTesting()`と同じパターン）。**StrictMode前提の実ブラウザE2Eで検証するまで、この種のレースは原理的に再現しない**（jsdomの単体テストは同期的な単発呼び出しのみを想定するため）。**⚠️ 2026-08-14追記・判断基準の訂正（`tech-tags-store`の`seedFromMaster`で反証）**: 当初「戻り値が呼び出し元で同期的に消費されるか」だけで対策を切り替えられると考え、`personnel-plan-store`の`getOrCreateAllCategories`ではローカルstate同期チェックのみ（`DataAdapter.list()`ゲートなし）を採用し実ブラウザE2Eでも通過した。しかし同じ設計を`tech-tags-store`の`seedFromMaster`に適用したところ、**リロード時にタグが398件（199×2）へ重複する実バグ**が発生した。原因を切り分けた結果、真の判断基準は「戻り値の同期消費有無」ではなく**「シードをトリガーするuseEffectが、ページ読み込みのたびに実ユーザー操作を挟まず即座に発火するか」**だと判明した。`personnel-plan-store`の`getOrCreateAllCategories`は「人員計画」タブをクリックして初めて呼ばれる（`PersonnelPlanPanel`のマウント）ため、`loadPersonnelPlans()`のlist()は実ユーザーのクリック操作（実時間で数百ms以上）を挟んで確実に解決済みになり、たまたまレースが顕在化しなかっただけだった。一方`tech-tags-store`の`seedFromMaster`は`TechTagsPage`のマウント時に`loadTechTags()`と**同一コミットで**即座に発火するため、`loadTechTags()`のlist()が未解決のままローカルstateが空と誤判定され続ける。**対策**: ローカルstateへの楽観的`set()`（同期契約・即時UI反映）はそのまま残しつつ、実際の`DataAdapter.create()`発火だけを`DataAdapter.list()`による実データ確認の後段に回す（`tech-tags-store.ts`の`seedFromMaster`参照）。これにより戻り値の同期消費有無に関わらず、UIの即時反映と永続化層での重複防止を両立できる。**シード系アクションを新設・変換する際は、トリガーのuseEffectが人間の操作を挟まず発火しうるかを必ず確認し、挟まない場合は無条件でDataAdapter.list()による確認をcreate()の前段に置くこと** |
| 自己参照/親子FKに`ON DELETE CASCADE`を張ったエンティティを「親+子孫をPromise.allで一括remove()」すると、postgresモードで実際には成功した削除がUI上はロールバックして見える | `projects-store.ts`の`deleteProject`（`projects.parent_id`が自己参照FK、`ON DELETE CASCADE`）で、親案件と全子孫のidを収集し`Promise.all(ids.map(id => getDataAdapter().remove('projects', id)))`で並行削除する実装にしたところ、実Postgres（`fastify.inject()`での反証）で「親のDELETEがサーバー側で先に処理されると、DBのカスケードで既に消えている子孫への個別DELETEリクエストが404を返す」ことを確認した。`Promise.all`は1つでもrejectすると全体がrejectするため、`PostgresApiAdapter`の`remove()`が404を`ApiError`として投げる実装と組み合わさり、削除全体がロールバックされてしまう（サーバー側のデータは正しく削除済みなのに、UIだけ削除前の状態に戻って見える食い違いが生じる）。`team-store.ts`の`deleteDivision`（`sections.division_id`→`divisions.id`も`ON DELETE CASCADE`）にも同型のバグが既に存在していたことを、この発見をきっかけに気づき合わせて修正した | 自己参照/親FKに`ON DELETE CASCADE`があるエンティティの一括カスケード削除では、各`remove()`呼び出しを個別に`.catch()`し、`error instanceof ApiError && error.status === 404`の場合はエラー扱いしない（「対象が既に存在しない」は削除という目的を既に満たしている）。`localStorage`モード（`LocalJsonAdapter`）にはこのカスケードが無いため単体テスト（モック）だけでは検出できず、実Postgres（`fastify.inject()`で並行DELETEを発行し結果を確認）での反証が必須。同種の「親を削除すればDBが子も勝手に消す」設計のエンティティ（`sections`/`assignments`/`efforts`/`scheduleEntries`等）を持つストアで、クライアント側も明示的に子孫をPromise.all一括削除する実装を新設・変更する際は、同じ404耐性パターンを適用すること |
| 「load」と「初回のみのレガシーデータ移行」を同一アクションに同居させると、DataAdapter.list()確認ゲートだけでは二重発火レースを防げない | `schedule-settings-store`/`wbs-settings-store`（17ストアのDataAdapter配線・第11弾）の`loadScheduleSettings()`/`loadWbsSettings()`は、旧Zustand persistの独立localStorageキーからの1回限りレガシー移行を内蔵する設計にした。当初は`wbs-template-store`の`seedStandardTemplate`と同じ「関数先頭で同期的にモジュールスコープの移行フラグを立てる」パターンを踏襲したが、`load`自体と`migrate`が**同一関数**に同居している点が`seedStandardTemplate`（`load`とは別関数）と違い、ユニットテストで実際に「同一tick内で2回呼ばれても移行は1回だけ」という反証を書いたところ再現した：1回目の呼び出しがmigrateフラグを立てて`list()`→移行処理（`set({entries: migratedEntries})`→`Promise.all(create())`)を開始する一方、2回目の呼び出しは（移行はスキップするが）**自分自身の`list()`結果**で無条件に`set({entries})`を呼んでしまい、これが1回目の移行完了より先に解決すると、1回目がset()した移行後データを空配列で上書きして消してしまう（移行フラグのみのガードは「migrateの二重実行」は防ぐが「loadのset()同士の競合」は防げなかった） | `load`と`migrate`を同一アクションに同居させる場合、移行フラグ単体ではなく**アクション全体をsingle-flight化**する（`let inFlightLoad: Promise<void> \| null = null`を関数先頭で確認し、既に実行中なら即座にreturnして`list()`すら呼ばない。完了時は`.finally()`で`null`に戻す）。これにより2回目の呼び出しは自身の`set()`すら発行せず、1回目の結果に完全に委ねられる。ユニットテストのモック（`mockList.mockResolvedValue([])`で`mockResolvedValueOnce`ではなく毎回同じ値を返す設定）で「同一tick内2回呼び出し」を明示的に反証しない限り、この種の競合はモックの解決タイミング次第で偶然パスすることがあるため注意 |
| `jsonStorage`を静的モック（`load()`が常に固定値を返す）したまま既存ストアをDataAdapter経由へ変換すると、同一テスト内のcreate→update/remove連鎖が「対象が見つからない」まま常に失敗する | `budget-store.test.ts`（3201行・147件）は元々`jsonStorage.load: vi.fn(() => ({ ...mockDb }))`という固定値を返す静的モックだった。旧実装はZustandの`state`引数から直接読み書きしていたため`jsonStorage.load()`が過去の`save()`を反映するかは無関係だったが、`budget-store`をDataAdapter経由へ変換すると、`LocalJsonAdapter`の`update()`/`remove()`は「`jsonStorage.load()`で都度最新状態を読み直し、対象idを`list.findIndex()`で探す」実装のため、静的モックでは`addXxx()`（create）で追加したはずのレコードを後続の`updateXxx()`/`deleteXxx()`が永遠に「見つからない」まま`Promise`をrejectし続ける。テストの大半（146/147）は`await`せず同期的な楽観的state（`useXxxStore.getState()`）だけを検証していたため症状が表面化しなかったが、`await flushMicrotasks()`後に`jsonStorage.save`の呼び出しを検証する1件でのみ「saveが呼ばれない」という形で顕在化した（本質的には他の145件超も「持続的な永続化」ではなく「楽観的UI反映」しか検証できていなかったことを意味する、静かな検証範囲の縮退） | 静的モックのまま放置せず、`jsonStorage.save()`に渡された内容を次の`jsonStorage.load()`が返すステートフルなモックへ切り替える（`vi.mock`のホイスティング制約により`vi.hoisted()`で可変状態を保持: `const { getMockDbState, setMockDbState } = vi.hoisted(() => { let state; return { getMockDbState: () => state, setMockDbState: (n) => { state = n } } })`）。`beforeEach`で`setMockDbState({ ...mockDb })`しリセットする。既存の`mockLoad.mockReturnValueOnce(...)`によるテスト個別の上書きはステートフルなデフォルト実装より優先されるため、そのまま共存できる。ストアを`jsonStorage`直呼び出しからDataAdapter経由へ変換する際は、対応するテストファイルの`jsonStorage`モックが静的か確認し、静的なら早期にステートフル化すること |
| EVMのPVを「月次計画コストの単純累積」で引くと、PVの終点がBACに届かずEVMが破綻する | ベースライン（`ProjectBaseline`）にアサイン計画×単価の月次コストを凍結し、それをそのまま累積してPVにする実装にしたところ、BAC（WBS工数×概算単価×係数）とアサイン計画の総額が一致しないケース（体制が組みきれていない案件ではアサイン側が小さい）で、**計画どおり100%完了してもPVがBACに届かない**状態になった。EVはBAC基準で伸びるため、EVが常にPVを上回りSPIが1を超え続ける（実装中にテストで発見） | 月次計画コストは「配分の形（shape）」としてのみ使い、総額はBACへスケールする: `PV(w) = BAC × (経過分の計画コスト / 計画コスト総額)`。PVの形はアサイン計画の山に、終点はBACに従う。計画コスト総額が0（アサイン未登録）の場合はPV曲線を引けないため、スケジュール期間の直線按分へフォールバックする（`calcPvFromBaseline` / `calcEvmSeries`） |
| Zodスキーマへ`.optional().default(x)`でフィールドを追加すると、出力型が必須になり既存の型リテラルが一斉に壊れる | `Member.capacityRatio`を`z.number().gt(0).max(1).optional().default(1)`で追加したところ、`z.infer`の出力型が`capacityRatio: number`（必須）になり、テスト等で`Member`オブジェクトを直接構築している箇所が軒並み型エラーになった（`Project.completed`は既存テストが`completed: false`を明示していたため偶然通っていただけ） | 既存データ・既存リテラルへの影響を避けたいフィールドは`.optional()`のみで定義し、利用箇所で`?? 既定値`する。`.default()`は「新規作成時にフォームから必ず値が来る」フィールドか、全リテラルを直す覚悟があるときだけ使う |
| `// biome-ignore` は直後の1行にしか効かないため、関数シグネチャが複数行に折り返されると無効化される | `migrateProjects`を`export`した結果シグネチャが80文字を超えてBiomeが3行に折り返し、`data: Record<string, any>`と戻り値型が別行になったことで、直前に置いた`biome-ignore lint/suspicious/noExplicitAny`が効かなくなり警告が2件増えた（さらに「使われていない抑制コメント」の警告も出た） | 型注釈が複数箇所に散る場合は、`type RawJsonRecord = Record<string, any>`のような**型エイリアスを1行で定義してそこに`biome-ignore`を付け**、シグネチャからは型名だけを参照する |
| `shared`層のユーティリティから`features`層の関数を呼びたくなったら、コアを`shared`へ移して`features`側をリエクスポートにする | EVのために`shared/utils/evm-utils.ts`から`features/projects/utils/wbs-progress-utils.ts`の`calcWbsProgressAtDate`を呼ぶ必要が生じたが、`shared → features`は依存方向違反。UIフィルタ（`getIncompleteVisibleIds`）まで含めて丸ごと移すと、features固有のロジックがsharedへ流出する | 算出コアだけを`shared/utils/`へ移し、`features/X/utils/`側は「コアのリエクスポート＋feature固有関数」の構成にする（`effort-utils`で確立済みのパターン）。テストも実体の配置先（`shared/utils/__tests__/`）へ移し、features側にはfeature固有関数のテストだけを残す |
| 「マウント時に0件ならシードする」パターンで、load()と初回シードを別useEffectから呼ぶと、StrictModeの二重マウントで**2周目のload()の空配列set()がシードの楽観的stateを上書きして消す** | `document-template-store`のシードで、`loadDocumentTemplates()`と`seedStandardDocumentTemplates()`を別useEffectからマウント時に呼ぶ構成にしたところ、StrictModeでは「load#1 → seed#1 → load#2（ガードでシードはスキップ）」の順に発火し、list()も発行順（L1→S1→L2）で解決する。S1が楽観的set()でシード33件を反映した直後にL2の`set({items})`（まだ空のadapter結果…ではなく、シードのcreate()群が未解決のため空配列）が上書きし、create確定時の「id一致でmap置換」はもう対象を見つけられず、**localStorageには正しく永続化されるのにUIだけ空**になる。ユニットテスト（モック・単発呼び出し）では検出できず、実ブラウザE2E（本文編集テストがUI空で失敗）で発見。既存の`wbs-template-store`にも同型の潜在バグがあった | シードのcreate確定時の反映は「id一致でmap置換」ではなく**upsert**（無ければ追加）にする。どのlist()解決順でも最終状態がシード結果へ収束する。ユニットテストでは「同一tick内にload→seed→loadを呼び、十分にflushした後の件数がマスタ件数と一致する」反証を書く（`document-template-store.test.ts`/`wbs-template-store.test.ts`参照）。シード系アクションを新設する際はDataAdapter.list()ゲート・single-flightガード（既存の対策）に加えてこのupsert反映を必ずセットで実装する |
| ローテーション方式のリフレッシュトークンを使う認証で、リフレッシュAPIを並行呼び出しできる構造を放置すると、**フルリロードのたびにセッション全体が死ぬ** | postgresモードの実機動作確認で、ログイン済み状態からのフルページリロードが約31ms差の`/api/auth/refresh`並行2連発を生み、1回目の200がトークンをローテーションした直後に2回目が旧トークンで401→その401ハンドリングが先着のauthenticated状態を`unauthenticated`で上書きし、`/login`へ強制送還された（以降のリフレッシュも全て失敗＝セッション完全喪失）。並行発火の出所はReact StrictModeのuseEffect二重発火で、`RequireAuth`の`status === 'idle'`ガードは**同一レンダーのクロージャ値を両方の発火が見る**ため防げない（`restoreSession()`内の同期的な`set({status:'authenticating'})`もレンダー間でしか効かない）。本番ビルド（StrictMode二重発火なし）では顕在化しないため、実機のdevサーバーで確認するまで存在に気づけなかった | リフレッシュ呼び出しをストア側で**single-flight化**する（`auth-store.ts`の`inFlightRestore`: 実行中のPromiseがあれば相乗りし、`.finally()`で解放。`DataAdapter`の401リトライ（`onUnauthorized`→`restoreSession`）も自動的に同じ1本へ相乗りする）。コンポーネント側のガード強化では原理的に防げないので、必ずHTTP呼び出しの直前（ストア/クライアント層）で直列化する。反証は「同一tick内2回呼び出しでfetchが1回だけ」「完了後の再呼び出しは新規リフレッシュを実行（永続抑止ではない）」の両面で書く（`auth-store.test.ts`） |
| AG Gridの`valueSetter`がrow dataへ書き込まずtrueだけ返す設計にすると、`onCellValueChanged`の`event.newValue`が**valueGetter再解決の値**（＝未更新のdata由来）になり、入力値が取れない | 月次実績グリッド（P1-a）で「valueSetterは編集値を通すだけ、保存はonCellValueChangedで`event.newValue`から行う」設計にしたところ、valueSetterには'0.8'が渡るのにonCellValueChangedの`event.newValue`は常に空文字になった。AG Grid v33はイベント構築時にnewValueを**valueGetterで読み直す**ため、valueSetterがdataへ書き込まないと編集値がイベントへ伝わらない（E2Eで「編集しても表示が戻る」形で発見。単体テストはグリッドを描画しないため検出不能） | 検証・row dataへの反映はvalueSetterで完結させ（不正値は`return false`＝変更なし扱いでイベント自体を発火させない＋モジュールレベル`toast`で通知）、onCellValueChangedは`event.newValue`ではなく**valueSetterが確定済みのdataフィールド**を読んで保存だけを行う（`MonthlyActualsGrid.tsx`参照）。既存の`AssignmentTreeGrid`（valueSetterがdataへ書き込む）と同じ前提を崩さない |
| Zodスキーマの値域制約（`.max()`等）が楽観的更新のロールバックとして現れ、「UIで一瞬成功→静かに元へ戻る」という原因の見えにくい症状になる | 実績入力（1.2人月）がグリッド上で一度1.20と表示された直後に元の値へ戻った。原因は`AssignmentEntry.actualMonthlyValues`のZodが計画と同じ`.max(1)`を持っていたことで、`LocalJsonAdapter`の保存時`DatabaseSchema.parse()`がrejectし、ストアの`.catch()`ロールバックが働いた（設計上は「実績は事実の記録、上限でブロックしない」が正）。エラートーストは出るが、単体テスト（モックDataAdapter）はスキーマ検証を通らないため全件パスし、実localStorage経由のE2Eで初めて発見 | データモデルの意味が分岐したら（計画=配分率0〜1 vs 実績=事実・上限なし）、UI・ストア・**Zodの値域**の3層すべてを分岐に追随させる。楽観的更新のストアで「一瞬表示されて戻る」症状を見たらまずアダプタ層のスキーマ検証rejectを疑う。値域を変えたら必ず実ストレージ経由（E2EまたはLocalJsonAdapter実体を使うテスト）で境界値を反証する |
| Radix Popover + cmdk系UIのE2Eで、通常の`click()`/`fill()`が「element was detached」のリトライ地獄でハングする | 月次実績のダイアログ（Combobox3連続選択）のE2Eで、①itemのclickは選択成功と同時にPopoverごとunmountされるためPlaywrightのactionabilityチェックがdetachとみなして永遠にリトライ、②開閉時にPopover内容が再マウントされ検索inputへのfillも同様にハング、③マウント直後の複数ストア非同期ロード（4連続set）によるグリッド再レンダーと操作が衝突、の3種のflakeが並列実行の高負荷時に頻発した | ①選択肢は`dispatchEvent('click')`（actionabilityチェックなし・即発火）で選び、成否は**トリガーの表示テキスト**で別途検証する。dispatch自体も短timeoutを付けてtry-catchでリトライへ回す（発火後のunmountは無害）。②操作と結果確認を`expect(async () => {...}).toPass()`で丸ごとリトライする（再解決で新要素を掴み直す）。③シード後に初期ロードの静定を待ってから操作を始める（`monthly-actuals.spec.ts`の`seedAndNavigate`参照）。「detached」でハングしたら要素の消滅がバグではなく**成功の副作用**でないかをまず疑う |
| Playwrightの`webServer`が`reuseExistingServer`のとき、同一ポートで動いている**別プロジェクトの**devサーバーへ接続してテストする | E2E実行時にポート5173を別プロジェクト（yado-search）のViteが使用していたところ、Playwrightは「URLが応答する＝サーバー起動済み」とみなして自分のViteを起動せず、全テストが**無関係のアプリ**に対して実行されてタイムアウトした。エラーメッセージは「heading not found」で、原因（別アプリに接続している）が読み取れない | `playwright.config.ts`の`webServer.command`に`--strictPort`を付け、ポートを`E2E_PORT`環境変数で切り替え可能にする（`E2E_PORT=5273 npx playwright test`）。strictPortにより指定ポートが使用中ならViteの起動自体が失敗し、別アプリへ接続する前に気づける。E2Eが「要素が見つからない」で一斉にタイムアウトしたら、まずerror-context.mdのページスナップショットで**どのアプリが表示されているか**を確認する |
| 追記専用エンティティの`Create*Schema`が`createdAt`（ISO文字列）を含んだままだと、サーバーのtimestamp列へのINSERTが「value.toISOString is not a function」で500になる | `CreateProjectBaselineSchema`は履歴の追跡性のため`id`のみ除外＝`createdAt`を含む設計だが、サーバー側`project_baselines.created_at`はDrizzleの`timestamp`列（期待値はDateオブジェクト）のため、Zodを通過したISO文字列をそのままINSERTすると実行時に500になる。postgresモードの`freezeBaseline`（計画の凍結）が一度も成功しない実バグとして、Phase 3のダイジェスト統合テスト（ベースラインをAPI経由でシードした）で初めて発覚した。他の追記専用エンティティ（skillEvaluations等）は`Create*`から`createdAt`を除外（DB既定値now()に委譲）、またはtext列（monthlyCloseEvents.occurredAt等）のためこの問題が無く、projectBaselinesだけが該当する非対称だった | クライアント契約（LocalJsonAdapterは`createdAt`必須）を変えず、サーバー側ルートの`beforeCreate`で文字列→Dateへ変換する（`project-baselines.ts`参照）。**`Create*Schema`にdatetime文字列フィールドを含む新規エンティティをtimestamp列で定義する場合、POSTの統合テスト（実Postgres）を必ず1本書く**（単体テスト・localモードE2Eでは原理的に検出できない） |
| Radix Dialogの`DialogContent`に`max-h`+`overflow-y-auto`が無いと、縦長ダイアログのフッターボタンがビューポート外に出てクリック不能になる | `ProjectDialog`（フィールド15個超）だけが本リポジトリの慣例`max-h-[90vh] overflow-y-auto`を持たず`max-w-2xl`のみだった。`DialogContent`は`fixed top-[50%] translate-y-[-50%]`の中央固定配置のため、コンテンツが視高を超えるとページスクロールでは届かず、720〜900px高の実画面（一般的なノートPC）で「追加」ボタンが物理的に押せない。postgresブラウザE2Eのプロジェクト作成ステップが「element is outside of the viewport」で110回リトライし続けて発覚した（localモードE2Eはこのダイアログを送信まで操作するテストが無く未検出だった） | フォームダイアログの`DialogContent`には既存慣例どおり`max-h-[90vh] overflow-y-auto`を必ず付ける。E2Eのクリックが「element is outside of the viewport」でリトライし続けたら、ビューポートを広げる前にまず対象要素の親がスクロール可能かを疑う（ビューポート拡大は症状の隠蔽で、実ユーザーの画面では再現し続ける） |
| 権限で読めないデータの403を「読み込み失敗」として通知すると、そのロールは画面を開くたびに警告が出る | postgresモードのサーバーは金額系エンティティのGETに`financials:read`を要求するため、`partner`ロールでは**設計どおり**403になる。ところがストアの読み込み失敗を一律`toast`していたため、ダッシュボードを開くと「予算情報の読み込みに失敗しました」等が表示された（実測: 1画面あたり403が60回・8エンティティ）。UIは既に金額セクションを隠しているので利用者には意味不明な警告になる。単体テスト・API統合テストはどちらも「サーバーが403を返すこと」しか見ておらず、**403を受けた画面がどうなるか**は誰も見ていなかった（ペルソナ別E2Eにより発見） | 読み取りの403は不具合ではなく「このロールには見えないデータ」として扱い、状態を空のままにして通知しない（`src/stores/persistence-error.ts`の`isForbiddenReadError`）。**書き込みの403は通知する**（viewerの編集失敗等、利用者が結果を知るべき操作のため）。ロール別の読み取り制限を新設したら、そのロールで実際に画面を開くE2Eを併せて書く |
| 「エラートーストが出ないこと」を素朴に検証すると偽陰性になる（修正前でも通ってしまう） | ①shadcn/uiのToastはRadixの`ToastViewport`=`<ol>`／`Toast`=`<li>`として描画され、**`role="status"`は付かない**ため`getByRole`系で取れない ②**トーストは約5秒で自動的に消える**（`TOAST_REMOVE_DELAY=1000000`は状態配列からの削除遅延であって表示時間ではない）。そのため「一定時間待ってから存在しないことを確認する」形にすると、待つほど見逃す。で実際にこの偽陰性を踏み、製品修正を無効化しても通るテストを一度書いてしまった | `page.addInitScript`＋MutationObserverで**トーストの出現を記録**し、後から記録を検証する（`e2e-postgres/personas.ts`の`installToastRecorder`/`expectNoErrorToast`）。addInitScriptはナビゲーションのたびに実行されるため画面遷移をまたいでも記録が続く。**「〜が起きないこと」のテストは、製品側の修正を一時的に無効化して失敗することを確認してから採用する**（成立しない検証は無いより悪い） |
| 索引（Map）を関数内で毎回構築する純関数をループから呼ぶと、静かにO(n²)になる | `findRootProjectId`/`resolveTaskPhaseKey`（`shared/utils/task-phase-utils.ts`）は呼び出しのたびに`new Map(projects.map(...))`で索引を作っていた。単体では速いが、`calcPhaseProgress`のfilterや`buildMyTaskRows`・`searchEntities`のループから1件ずつ呼ばれるため全体がO(n²)になる。**実測: 2,120件で650ms、10,300件で22,990ms**（ガント1画面＝5工程ぶんの`progressOf`）。単体テストは小さなデータで通るため気づけず、件数が増えて初めてブラウザが固まる（のスケーラビリティ計測で発見） | 索引は**配列参照をキーにしたWeakMapでキャッシュ**する（Zustandはイミュータブル更新なので、中身が変われば参照も変わり古い索引は使われない）。修正後は10,300件で22,990ms→18.9ms。**ループから呼ばれうる純関数を書くときは、関数内でO(n)の前処理をしていないかを確認する。**「純関数だから安全」と「呼び出しコストが一定」は別の話 |
| 認証テーブルから業務テーブルへFKを張ると、`TRUNCATE ... CASCADE`が認証ユーザーごと消す | `users.member_id → members.id`のFKを`ON DELETE SET NULL`で追加したところ、`database/import`（業務テーブルを`TRUNCATE ... CASCADE`で全消ししてから流し込む）が**usersまで巻き込んで全削除**した。PostgreSQLの`TRUNCATE ... CASCADE`は「参照されている側」だけでなく**参照している側のテーブルもTRUNCATEする**ため。`import-database.ts`は「usersは認証基盤なので対象外」と明示していたが、その前提はFKを1本足すだけで崩れる（JSONインポートしたら誰もログインできない状態になる）。統合テストの`actorName`がnullになったことから発覚 | 認証・監査系テーブルから業務テーブルへはFKを張らず**弱参照**にし、参照整合性はアプリ側で担保する（存在しないidは未設定として扱う）。FKを追加するときは`TRUNCATE CASCADE`を使う処理（import・テストのクリーンアップ）の影響範囲を必ず確認する。回帰テストは「import往復後も認証ユーザーが残る」で固定した |
| `timestamptz`のマイクロ秒精度とJSのミリ秒精度がずれ、updatedAtベースの楽観ロックが常に競合扱いになる | Postgresの`timestamp with time zone`はマイクロ秒まで保持するが、JSの`Date`とJSONのISO文字列はミリ秒までしか持たない。行の`updatedAt`がDB既定値（`now()`）で作られていると、クライアントが受け取った値（ミリ秒へ丸められた文字列）とDBの実値（マイクロ秒）が**必ず不一致**になり、`WHERE updated_at = ?`で0件更新＝全ての更新が412で弾かれる（に予見し、実Postgresの統合テストで確認） | 比較時にSQLで丸める（`date_trunc('milliseconds', updated_at) = ?`）。列の型を変える・INSERT時に明示値を入れるといった対策は既存行に効かないため、比較側で吸収するのが唯一の後方互換な解。**timestamptz列を等値比較に使う場面（楽観ロック・冪等キー）では、まず精度差を疑う** |
| ツリーを平坦化して描くグリッドにAG Gridの列フィルタを使うと階層が壊れる | `ProjectTreeGrid`は`flattenTree`でツリーを行の配列へ落としてAG Gridへ渡すため、列フィルタで行を独立に絞ると**親が消えて子だけが並ぶ**（どのタスクがどの工程の下にあるか分からなくなる）。`defaultColDef`が`filter: false`なのは意図的な設定で、外すと壊れる。既存の「未完了のみ表示」が`getIncompleteVisibleIds`（未完了リーフ＋**その祖先**を可視IDにする）という実装なのも同じ理由（絞り込みを追加する際に再確認） | ツリーグリッドの絞り込みは「一致したノード＋その祖先のID集合」を作り、`flattenTree`側でIDフィルタとして適用する（`getMatchingVisibleIds`。複数フィルタは積集合で併用できる）。AG Gridの列フィルタ・`quickFilter`は平坦なグリッドにだけ使う |
| 外部APIの「同じ意味のフィールド」が同じ型とは限らない（Jiraの`description`はADFオブジェクト） | API起票の実装で、Backlog（`description`）・Asana（`notes`）・GitHub（`body`）はプレーン文字列で完了条件を送れるのに、**Jiraだけ`description`が送られていなかった**。Jira API v3の`description`はADF（Atlassian Document Format）のリッチテキスト**オブジェクト**を要求し、文字列を渡すと400になる。実装時に落ちるので外したまま、設計文書にもテストにも記録されず、Jira利用者だけが完了条件を受け取れない非対称が残っていた | ツール横断の共通ペイロードを作るときは、「同名フィールドが同型か」を各ツールの公式リファレンスで確認する。**送れなかったフィールドを黙って落とさない**（落とすなら理由をコード・設計文書・テストの3箇所へ残す）。ADFへは`{type:'doc',version:1,content:[{type:'paragraph',content:[{type:'text',text}]}]}`で包み、改行は段落に分割する（textノードは改行文字を含められない） |
| 「実行できる権限」と「実行の前提を参照する権限」がズレると、機能全体が誰にも使えない状態で静かに成立する | API起票は`POST /api/taskCreation/execute`が`data:write`（editor以上）なのに、起票先を選ぶための`GET /api/externalToolConnections`が`users:manage`（admin限定）だった。editorには「API起票」ボタンが表示され、押すと接続一覧の取得で403になり起票できない。adminだけで動作確認していたため気づかず、**統合テストは「editorはGETも403」を期待して書かれており、バグを仕様として固定していた**。ドキュメント（`docs/project.md`）にも「起票実行＝editor以上」と書かれており、実装と文書が矛盾していた | 新しい機能の権限を決めるときは、**その操作を完遂するために必要な参照系APIの権限も同じ強さに揃っているか**を確認する（「実行できる人が、実行に必要な情報を読めるか」）。RBACの統合テストで「できない」を書くときは、それが職務分掌上の意図なのか、単に未検証なだけかを必ず区別する。管理者アカウントだけで動作確認しない（ペルソナ別E2E＝の観点をAPI設計時にも適用する） |
| AG Gridは列も仮想化するため、右端に置いた列は横スクロールするまでDOMに存在しない（E2Eが「element not found」で落ち、実運用でも見えない） | WBSグリッドに「連携」列（起票状態の可視化）を最終列として追加したところ、`.ag-center-cols-container ... .ag-cell[col-id="externalTaskId"]`がE2Eで見つからなかった。原因は列仮想化で、工数列が並ぶ本グリッドでは初期表示のビューポート外だったため。**「一覧で起票済みか分かる」という機能目的そのものが、横スクロール必須の位置では達成できていない**（E2Eの失敗が仕様上の欠陥を先に検出した形） | 一覧性が目的の補助列は`pinned: 'right'`（右端固定）にする。E2Eのセレクタも`.ag-pinned-right-cols-container`へ変える（pinned/bodyで行DOMが重複する既存の落とし穴と同根）。E2Eが「セルが見つからない」で落ちたら、セレクタを疑う前に**その列が実ユーザーの初期表示で見えているか**を確認する |
| `npm audit`の`fixAvailable.isSemVerMajor: false`を「安全に上げられる」と読むと壊れる | CI（security-audit）のhigh 3件はすべて`react-joyride@3.0.0-7`（**RC版**）由来で、`npm audit`は`react-joyride@3.2.0`への更新を`isSemVerMajor: false`として提示していた。実際に上げるとdefault exportの廃止・`CallBackProps`型の消滅・step optionの`disableBeacon`廃止と**API破壊変更**が入り、ガイドツアー（TourProvider＋7つのステップ定義）の全面書き換えになった。RC（`3.0.0-rc`/`3.0.0-N`）から正式版への移行はsemver上のmajor差にならないため、この指標では検出できない | プレリリース版を本番依存に含めない。やむを得ず含める場合、`npm audit`の提示だけで更新を判断せず、**上げてから型チェックを通す**ところまでを1セットにする（型エラーが出たらその場で戻す判断ができる）。CIのaudit失敗を「既存だから」と放置すると、更新経路が塞がったまま脆弱性が残り続ける |
| **`@theme`をメディアクエリの中に置くと、Tailwind 4がメディアクエリを剥がして無条件適用する** | `@media (prefers-color-scheme: dark) { @theme { --color-background: #0e0e10 } }` と書いていたため、ビルド後CSSでダーク値が`:root`へ直接展開され、**ライトの既定値を上書き**していた。結果、OSがライト設定でも常にダーク表示（既定は`theme: 'system'`なので初回起動が必ずダーク）。さらにAG Gridの行色は`getThemeColor(color, theme)`が`matchMedia`を見てライト用の薄い青を返すため、**ダークUIの上にライト用の背景色が乗って文字が読めない**という二次被害も出ていた（デモデータを入れて画面を目視して発見） | `@theme`はトップレベルのみ。テーマ別の上書きは通常のCSS宣言（`@media { :root:not(.light) { ... } }`）で行う（ユーティリティ生成はトップレベルの`@theme`が担うので問題ない）。`:not(.light)`は利用者の明示選択をOS設定で上書きしないため。**ビルド後CSSで`:root`直下の値を確認する**のが確実な検証で、`e2e/theme-resolution.spec.ts`が「OS設定×明示選択」の4通りを固定している |
| 色トークンの検証を片方のテーマだけで行うと、もう一方の違反を見逃す | a11y監査を導入した時点ではテーマ解決バグでダーク表示になっており、ライト側が未検査だった。バグを直してライトが既定になった途端、`text-muted-foreground`が`bg-*`の半透明背景の上でAA未達（4.26）になり4件の違反が出た。**旧値#6b6b76は白カード上でも4.54**と余裕が無く、背景が少しでも色づくと割る水準だった | 色を決めるときは**最も不利な組み合わせ**（半透明の色付き背景×最も薄い文字色）で比を計算する。a11yのE2Eは代表画面をダークモードでも走らせる（`e2e/a11y.spec.ts`の`DARK_TARGETS`） |
| メジャー更新では「同じ名前のオプションが逆の意味になる」ことがあり、**型チェックを通っても壊れる** | react-joyride 3.2への移行で、型エラーを解消してもE2Eが2件落ちた。①`dismissKeyAction`/`overlayClickAction`の`'close'`は「現在のステップを閉じて**次へ進む**」で、3.0の`disableCloseOnEsc={false}`＝「ESCでツアーを閉じる」とは**逆の意味**だった（ESCを押すとindexが0→1に進み、ツアーからの離脱手段が消えていた）。②ステップ遷移の前後にスクロール・before hook・target待ちの非同期段階が入り、その最中に「次へ」を押すと`step:after`ではなく`scroll:end action=next`が飛ぶため、外部で`stepIndex`を制御していると更新が漏れてツアーが停止した | 型が通っただけで移行完了としない。**イベント駆動のライブラリはイベント列をログに出して観測する**（`onEvent`で`type/action/status/index`を出すE2Eを1本書くと、どの操作でどう遷移するかが確定する）。ライブラリが内部状態を持つなら**外部から制御しない**（uncontrolled）ほうが壊れにくい。同名オプションは意味が同じと仮定せず、更新後の型定義のdocコメントを読む |
| `npm ci`がCIだけEBADENGINEで落ちる。**1つ固定しても次が出る** | `server/package.json`の`dependency-cruiser@18.2.0`が引く`commander@15.0.0`が`node>=22.12.0`を要求し、CIとサポート表明の**Node 20**と食い違って`npm ci`が落ちていた（ローカルはNode 24のため再現しない）。17.4.3へ下げると今度は`cookie@2.0.1`（`node>=22`）が同じ理由で落ちた。**個別固定はいたちごっこ**で、依存ツリー全体が上のNodeへ移っているサインだった | 同じ症状が2つ目のパッケージで出たら、固定を続けずに**サポート表明そのものを引き上げる**（本リポジトリは2026-08-22にNode 22以上へ移行。CI・`engines`・README・`docs/project.md`をまとめて更新）。**引き上げ後は次にnpmのメジャー差が露出する**: Node 22同梱のnpmは10系だが、開発機（Node 24）のnpm 11が生成した`package-lock.json`は依存の記録形式が異なり、npm 10の`npm ci`が`Missing ... from lock file`（EUSAGE）で落ちる。lockを生成するnpmとCIのnpmは必ず揃える（本リポジトリはCIで`npm install -g npm@11`し、`engines.npm`にも下限を明記）。切り分けは`npx npm@10 ci --dry-run`でローカル再現できる。サポートNodeを変えるのはポリシー変更なので、勝手に決めず判断を仰ぐ。開発ツールはクライアントとサーバーでバージョンを揃える（片方だけ上げない） |
| `@fastify/cors`の既定`methods`は`GET,HEAD,POST`のため、別オリジン構成では**PATCH/DELETEが全滅する** | postgresモードはVite（5173）とAPIサーバー（3001）が別オリジンで、更新・削除はCORSプリフライトを必要とする。`methods`を明示していなかったため`Access-Control-Allow-Methods: GET,HEAD,POST`が返り、ブラウザはPATCHを**送信すらせず**`net::ERR_FAILED`（＝アプリ側は「Failed to fetch」）になっていた。作成（POST）と参照（GET）は通るため「保存しても反映されない」という形でしか症状が出ない。`fastify.inject()`はプリフライトを経ないため**150件超の統合テストが全てパスしたまま**見逃されており、楽観ロックの連続編集をpostgresブラウザE2Eで検証して初めて発覚した | `@fastify/cors`には`methods`を必ず明示する（`['GET','HEAD','POST','PATCH','PUT','DELETE','OPTIONS']`）。CORSは`@fastify/compress`等より**先に**registerする。統合テストに`OPTIONS`のプリフライト検証（`access-control-allow-methods`にPATCH/DELETEが含まれる／`access-control-allow-headers`にカスタムヘッダーが含まれる）を1本置く。カスタムリクエストヘッダーを新設したときも同じ経路が壊れるため、**ブラウザ経由で書き込みを1往復させるE2E**を必ず持つ |
| 楽観ロックでサーバー確定の`updatedAt`をローカルへ反映し忘れると、**単独ユーザーでも2回目の更新が必ず412になる** | `X-Expected-Updated-At`にクライアントが保持する`updatedAt`を送る設計で、サーバーは`setValues.updatedAt = new Date()`（サーバー時計）で更新する。`.update()`の応答を捨てるとローカルには**クライアント時計の値**が残り続け、次の更新が古い期待値を送って必ず不一致になる。`create`側には応答反映（`.then((created) => set(...))`）が既にあったのに、`update`側だけ抜けていた。モックアダプタのユニットテストは「送ったpatchがそのまま返る」ため一致してしまい、localモードE2Eはそもそもロックしないため、どちらでも検出できない | `.update()`にも`.then((saved) => set(...))`でサーバー確定行を反映する（`create`と同じ形にそろえる）。ユニットテストは「サーバーが別の`updatedAt`を返す」モックにして、2回目の呼び出しの`expectedUpdatedAt`がサーバー値であることを反証する。合わせてpostgresブラウザE2Eで**同じレコードを2回続けて編集**する |
| appSettingsへフィールドを追加する際、`LocalJsonAdapter.loadAppSettings()`の返却オブジェクトが**手書きの明示列挙**のため追加漏れが起きる（保存は成功するのに読み出しだけ欠落する） | `hoursPerDay`（P1-a導入）が`loadAppSettings()`の返却リストに漏れており、localモードで時間換算の設定が**リロード後に既定値8へ戻る**実バグだった。`updateAppSettings()`は汎用ループ（`Object.entries(patch)`）のため保存自体は成功しており、設定直後の画面では正しく見える。ユニットテストの契約テストも当時は当該フィールドの往復ケースを持たず未検出だった | appSettingsへフィールドを追加する際は、①クライアントZod（`DatabaseSchema`と`AppSettingsPatchSchema`の2箇所）②`LocalJsonAdapter.loadAppSettings()`の返却列挙 ③サーバー`app-settings.ts`のGET/PATCH両方の返却列挙 ④サーバーDrizzleスキーマ＋マイグレーション ⑤budget-storeのstate/load/setter ⑥Layout設定UI、の6箇所を必ずセットで更新し、**アダプタ契約テストに新フィールドの`update→load`往復ケースを追加**する（`adapter-contract.ts`。契約テストはLocal/Postgres両実装で自動的に走るため、列挙漏れをどちらのモードでも検出できる） |
| 権限でメニューを隠しただけの機能は、URL直打ちで素通りする | 管理画面を作った際、左ペインのメニューは`settings:manage`で隠したが、`/admin/settings`へ直接アクセスすると全社設定が普通に開けた。旧実装（サイドバーのポップオーバー）は権限が無ければセクション自体を描画しなかったため、**画面を切り出したことで生じた退行**。ペルソナE2Eをポップオーバー前提のまま放置していたら、テストが古い導線で落ちるだけで新しい穴には気づけなかった | メニューの出し分けと**ページ側のガード**（`AdminAccessGuard`）を必ずセットで置き、同じ権限を指定する。E2Eは「メニューに出ない」だけでなく「URLを直接叩いても中身が出ない」まで反証する。UIを別画面へ切り出すリファクタでは、旧UIが持っていた**条件付き描画**が移設先へ引き継がれているかを1つずつ確認する（見た目の移設だけを追うと落ちる） |
| ラベルと紐づけたトグルボタンは、ボタン文言がアクセシブルネームにならない | 全社設定の「金額の表示」トグル（文言が表示中/非表示で変わる）を`getByRole('button', { name: '表示中' })`で掴もうとしたら見つからなかった。`<Label htmlFor>`が紐づいているとラベル文字列がアクセシブルネームになり、ボタン内のテキストは名前に含まれない。E2Eが落ちて初めて「支援技術からは押下状態が読み取れない」ことにも気づいた | 状態を持つボタンには`aria-pressed`を付け、テストも名前（不変）＋`aria-pressed`（可変）で判定する。文言でボタンを特定するテストは、ラベルの有無で壊れるうえに状態の伝達漏れを隠す |
| jsdomは`Blob`/`File`の`text()`を実装していないため、ファイル読み込みを伴うUIの単体テストが「何も起きない」形で落ちる | マスタCSV取込のコンポーネントテストで、`userEvent.upload`しても読み込み後の表示が出なかった。製品コードは`await file.text()`（ブラウザ標準）で、既存の実績CSV取込も同じ書き方。**jsdom側の欠落**で、既存はE2Eしか無かったため表面化していなかった | 製品コードを`FileReader`へ書き換えるのではなく、`src/test/setup.ts`で`Blob.prototype.text`を`FileReader`ベースに補う。ブラウザで動く書き方を歪めない。「アップロードしても画面が変わらない」でテストが落ちたら、まず環境側のAPI欠落を疑う（`typeof file.text`を1行で確認できる） |
| 取込テンプレートを配る機能は、列定義を1箇所の正本にしないと「配ったテンプレートが通らない」 | テンプレート生成・取込時の列解決・画面の列一覧が別々に列名を持つと、片方だけ直したときに利用者側だけが失敗する（しかもエラーは「列が見つかりません」で、原因がテンプレート側にあると気づきにくい）。必須を示す`*`を付けたテンプレートを配るなら、取込側がそれを落とせないと即座に破綻する | 列定義（キー・必須・説明・例）を1つの配列に持ち、3用途すべてがそれを読む。テストは「テンプレートのヘッダを正規化すると列定義と完全に一致する」という往復で固定し、**正規化を壊すと落ちる**ことを確認しておく |
| ライブラリのDOM属性値の形式はminor更新でも変わる（SVAR Gantt 2.7の `:` 前置） | 依存の週次更新で`@svar-ui/react-gantt`が2.5→2.7.1へ上がり、グリッドセルとバーの`data-col-id`／`data-row-id`／`data-id`の値が`"startText"`→`":startText"`のように`:`前置に変わった。`ScheduleGantt`はこの属性値をそのまま工程キーとして比較・使用していたため、**日付セルとバーのダブルクリックで編集ダイアログが開かなくなる**実バグになった。ユニットテストはDOMを描かず、E2EはCIに含まれていなかったため、公開準備でE2E全件を回して初めて発覚した | DOMの属性値からキーを取り出す箇所は1つの正規化関数（`normalizeGanttId`）を通す。E2Eのセレクタは後方一致（`$=`）で新旧の形式を許容する。**E2EをCIに入れる**（依存更新のPRがE2Eで検証されないと、この種の回帰はマージ後まで見えない） |
| サーバーの`tsc -b`は`../src/shared`配下（**テストを含む**）も検査し、クライアントより厳しい`noUncheckedIndexedAccess`が効く | 見積機能で`shared/utils`とそのテストに`list[list.length - 1]`・`issues[0].path`・`ESTIMATE_STAGES[i - 1]`のような添字アクセスを書いたところ、クライアントの`tsc -b`は通るのにサーバーの`npm --prefix server run build`だけが「Object is possibly 'undefined'」で落ちた。サーバーがshared層を`@/shared/*`で取り込むため、shared配下は**両方のtsconfigで型検査される** | shared層（テスト含む）では添字アクセスに`?.`か`.at(-1) ?? null`を使い、両方の`tsc -b`を回してから提出する。superRefine済みのZodスキーマは`.partial()`を持たないので、部分更新スキーマが要るなら**refine前のフィールド定義を別名でexport**する |
| dependabotのmajorバンプPRをCI失敗のままマージすると、`package.json`と`package-lock.json`が別々の版を指してmainの`npm ci`が落ちる | 2026-09-05、Vite 8／TypeScript 7／dependency-cruiser 18／@hookform/resolvers 5／server zod 4の各PRをCI失敗のままマージし、その後に来たminor-and-patchグループPRのconflict解消で`package.json`は旧版・lockは新版という状態になった。lockはVite 8が`@vitejs/plugin-react@5.1.2`のpeer範囲外で**そもそも解決不能**、TypeScript 7.0.2は`baseUrl`を廃止（TS5102）してビルド設定ごと落ち、さらにdependency-cruiser 17が**「0 modules cruised」で成功扱い**になる（依存方向違反が素通りする）。| dependabotのPRは**CIが緑のものだけ**マージする（majorはまとめて別ブランチで検証する）。`npm ci`が`EUSAGE`で落ちたら`package.json`の宣言を正として`npm install`でlockを作り直し、majorの採否は別途判断する。depcruiseの結果は「違反0」だけでなく**モジュール数**を見る（0なら検査が走っていない）。TypeScript 7へ上げるときは`baseUrl`の除去とdependency-cruiserの対応版への更新をセットで行う |
