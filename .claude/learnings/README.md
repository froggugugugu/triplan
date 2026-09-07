# `.claude/learnings/` — 成功パターン蓄積(`pitfalls.md` の対概念)

`pitfalls.md` が**失敗パターン集**なのに対し、`learnings/` は**成功パターン集**。
ECC(everything-claude-code)の instinct 機構にインスパイアされた「継続学習層」。

## なぜこれが必要か

`pitfalls.md` だけでは「何をしないか」しか伝わらない。
「何が**うまくいったか**」を残さないと、AI は過剰に保守的になり、検証済みの判断にも毎回確認を取りに来る。

成功パターンを confidence スコア付きで蓄積し、
将来のセッションが同じ判断点に来たときに**自動で参照**できるようにする。

## ファイル構造

```text
.claude/learnings/
├── README.md           # 本ファイル
├── TEMPLATE.md         # 新しい learning のテンプレ
└── L<NNNN>-<topic>.md  # 個別の learning(連番管理)
```

各 learning は次のフロントマター付き Markdown:

```yaml
---
id: L0001
topic: <短い主題>
confidence: 0.85         # 0.0-1.0(再現性の高さ)
sample_size: 3           # 観察された事例数
first_seen: 2026-04-01
last_confirmed: 2026-04-23
status: active           # active | deprecated | superseded
related: [L0002, P12]    # 他 learning(L)・pitfalls(P)への参照
---
```

## 運用ルール

### 追加するタイミング(when)

- ユーザーから「**いいね、その方針で**」と肯定的フィードバックを受けたとき
- 同じ判断パターンが **3 回以上**(別セッション含む)再現したとき
- 失敗パターン(pitfalls)を回避できた具体的手段が判明したとき

### 追加しないとき(when not)

- 当たり前すぎる事項(コードから読める)
- 1 回しか観察していない(sample_size=1)— 偶然の可能性が高い
- ユーザー固有の好み(`feedback` メモリに書くべき)

### 信頼度更新(confidence update)

- 適用して**成功** → confidence を +0.05(上限 0.95)
- 適用して**失敗** → confidence を -0.20、`status` を `deprecated` に近づける
- 6 ヶ月以上 `last_confirmed` が更新されなければ `status: stale` に下げる

## CLAUDE.md / pitfalls との役割分担

| 種類 | 何を書く | 更新頻度 | 場所 |
| ---- | -------- | -------- | ---- |
| CLAUDE.md | 横断ルール(must) | 低 | `.claude/CLAUDE.md` |
| pitfalls.md | 失敗パターン(避けるべき) | 中 | `.claude/pitfalls.md` |
| learnings/ | 成功パターン(再利用すべき) | 高 | `.claude/learnings/L*.md` |
| auto memory | ユーザー固有の事実・嗜好 | 高 | `~/.claude/projects/<proj>/memory/` |

## 自動参照

- 各 skill の冒頭で「関連する learning があれば参照」と指示する(skill 側で `@.claude/learnings/L0001-<topic>.md` 等を必要に応じて読む)
- セッション開始時にすべて読む必要はない(肥大化を避ける)
- `confidence >= 0.8` のもののみを「強い参考」として扱う

## 関連

- `@.claude/pitfalls.md` — 失敗パターン
- `~/.claude/projects/<proj>/memory/` — Claude Code Auto Memory
- `@.claude/CLAUDE.md` — 横断ルール
