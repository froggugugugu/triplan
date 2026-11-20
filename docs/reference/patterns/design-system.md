# デザインシステム

> [`docs/development-patterns.md`](../../development-patterns.md) から分割した詳細リファレンス。常時ロードされないため、必要なときにこのファイルを直接Readする。

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
