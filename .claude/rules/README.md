# .claude/rules/ — パス別 / 言語別ルールの拡張ポイント

`.claude/rules/` は、**段階的にルールを拡張できるオプトイン領域**。
初期状態では `*.example` ファイルのみが配置され、実運用には使われない。

## なぜこのディレクトリがあるか

`CLAUDE.md` はプロジェクト横断ルールに特化し、**200 行以内に収める**のが望ましい
（`.claude/pitfalls.md` の #1 参照）。

プロジェクト固有のコーディング規約や言語別の細かいルールを CLAUDE.md に詰め込むと:

- 読み込み精度が落ちる（重要度の低い指示に埋もれる）
- トークンコストが増える（全セッション読み込み）
- メンテナンスしにくい

そこで、**段階的なルール拡張の受け皿**として `.claude/rules/` を用意する。
`*.example` ファイルをコピー・編集してオプトインする方式で、**CLAUDE.md は変更せずに**拡張できる。

## 使い方（3 ステップ）

### ステップ 1: 必要なルールを選ぶ

用意されている example:

| ファイル | 用途 |
| -------- | ---- |
| `language-typescript.md.example` | TypeScript 固有の規約（型戦略・エラーハンドリング等） |
| `language-python.md.example` | Python 固有の規約（PEP 準拠・型ヒント・例外処理） |
| `path-backend.md.example` | `backend/**/*` 配下に適用するパス別ルール例 |

### ステップ 2: コピーして有効化

```bash
# TypeScript ルールを有効化
cp .claude/rules/language-typescript.md.example .claude/rules/language-typescript.md

# 必要に応じて編集
vi .claude/rules/language-typescript.md
```

### ステップ 3: CLAUDE.md から参照（任意）

全セッションで常に読ませたい場合は `CLAUDE.md` 末尾に追加:

```markdown
@.claude/rules/language-typescript.md
@.claude/rules/path-backend.md
```

パスが特定のファイルのときだけ読ませたい場合は、skill 側から参照するか、
将来的な Claude Code の path-specific rules 機能を利用する。

## 命名規則

| プレフィックス | 用途 | 例 |
| -------------- | ---- | -- |
| `language-*.md` | 言語 / フレームワーク別 | `language-typescript.md`, `language-python.md`, `language-swift.md` |
| `path-*.md` | 特定パス配下のみに適用するルール | `path-backend.md`, `path-frontend.md`, `path-mobile.md` |
| `rule-*.md` | 特定の技術トピックに対するルール | `rule-accessibility.md`, `rule-performance-budget.md` |

## コンセプト整合

- `.claude/rules/` は汎用テンプレート層の一部（プロジェクト固有は `project-config.md` や `docs/` に）
- **デフォルトでは** CLAUDE.md を変更しない（非破壊）。ルールを全セッションで読ませたい場合のみ `@.claude/rules/...` 参照を追記する（上記ステップ 3 参照）
- ルールは 1 ファイル 50〜100 行を目安に（CLAUDE.md と同じ理由で肥大化を避ける）
- example は初期状態で**無効**（`.example` 拡張子がついている限り読まれない）

## 注意

- ルールが増えすぎるとトークンコストが再び膨らむ。必要最小限に
- パス別ルールは「そのパスを触るときだけ読まれる」仕組みが Claude Code で将来サポートされる想定。
  現状は CLAUDE.md からの `@import` で全セッション読み込みになる
- 詳細は `@.claude/pitfalls.md` の #1, #4 参照
