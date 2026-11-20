# 開発パターン集

> **このファイルは毎セッション常時ロードされる。** 索引と要約だけを置き、非空行300行以内を保つ。
> 機能の経緯・設計判断・フィールド仕様などの詳細は `docs/reference/` 配下へ書き、ここからは1行で参照する。

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

→ [reference/patterns/numeric-input-ui.md](reference/patterns/numeric-input-ui.md)

- 数値入力は`NumericInput`（`value` / `onValueChange`）を使う。`type="number"`は使わない
- **負値は入力できない**。増減両対応は絶対値＋種別フィールド（`adjustmentType`等）で表す
- React Hook Formとは`watch`/`setValue`で橋渡しする（`{...field}`展開は不可）

## 7. UI 規約

→ [reference/patterns/numeric-input-ui.md](reference/patterns/numeric-input-ui.md)

- 色はセマンティックカラー（`text-foreground`等）か`dark:`プレフィックス。色値のハードコード禁止
- `components/`はPresentationalを基本とし、ストアを直接参照するものはContainerとして扱う
- 表形式の金額は`manYenFormatter`（固定小数点2桁）＋`text-right tabular-nums`
- フォームダイアログの`DialogContent`には`max-h-[90vh] overflow-y-auto`を付ける

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

→ [reference/patterns/design-system.md](reference/patterns/design-system.md)
（参照するデザインシステムと出典表示・カラートークン・予算画面の配色ルール・スペーシングと表示密度・
コンポーネント追加手順・アクセシビリティ・アイコン規約）

- 新しい色トークンは`src/index.css`の4箇所（`@theme`本体・`prefers-color-scheme: dark`・`:root.dark`・`:root.light`）すべてに定義する。`@theme`はトップレベル専用
- 新しい画面・ダイアログを追加したら`e2e/a11y.spec.ts`の対象リストへ足す（WCAG 2.1 A/AA違反0件を固定）
- アイコンのみのボタンには`aria-label`、状態を持つボタンには`aria-pressed`を付ける

---

## 10. 過去の問題事例

実際に踏んだ問題と対策を分野別に記録している。**該当分野を実装・レビューする前に読む**こと。
新しい事例は該当ファイルの表の末尾へ追記する（本ファイルには書かない）。

| ファイル | 分野 | 件数 | 主な内容 |
| -------- | ---- | ---: | -------- |
| [reference/patterns/pitfalls-ui-grid.md](reference/patterns/pitfalls-ui-grid.md) | UI・AG Grid・スタイル | 18 | AG Grid（valueSetter・列仮想化・行ID・ツリー）、ダークモード・テーマ・色トークン、Radix Dialog、a11y |
| [reference/patterns/pitfalls-stores-persistence.md](reference/patterns/pitfalls-stores-persistence.md) | ストア・永続化・DataAdapter | 15 | Zustandセレクタ・購読漏れ、persistの既定値変更、シードの二重発火、楽観的更新のロールバック、Zodの後方互換、appSettings追加の6箇所 |
| [reference/patterns/pitfalls-testing.md](reference/patterns/pitfalls-testing.md) | テスト・E2E | 16 | シードデータのUUID形式・年度ずれ、AG GridのDOM重複、Testing Libraryのクエリ、jsdomの制約、cmdkのdetach、トースト検証の偽陰性 |
| [reference/patterns/pitfalls-server-auth.md](reference/patterns/pitfalls-server-auth.md) | サーバー・DB・認証・権限・外部API | 10 | ON DELETE CASCADEと404、TRUNCATE CASCADE、timestamptzの精度、CORSプリフライト、リフレッシュトークン競合、読み取り403、権限のズレ、Jira ADF |
| [reference/patterns/pitfalls-tooling-deps.md](reference/patterns/pitfalls-tooling-deps.md) | ツール・依存更新・ビルド | 9 | Biome（check・biome-ignore・依存配列）、npm audit／npm ci／dependabot、メジャー更新の意味反転、サーバーtscのshared検査 |
| [reference/patterns/pitfalls-domain-design.md](reference/patterns/pitfalls-domain-design.md) | ドメインロジック・設計 | 8 | 年度月変換、EVMのPVスケール、デモデータの妥当性、shared→features依存の回避、O(n²)の索引構築、列定義の正本化、語彙の一括置換 |

### 分野を問わず効く教訓

- **「〜が起きないこと」のテストは、製品側の修正を一時的に無効化して落ちることを確認してから採用する**
- ユニットテスト（モック）で通っても、実ストレージ・実ブラウザ・実Postgresで初めて出る不具合がある。
  楽観的更新で「一瞬表示されて戻る」ときはアダプタ層のスキーマ検証rejectを疑う
- マウント時にシード・移行するアクションは、`DataAdapter.list()`での実データ確認・single-flightガード・
  create確定時のupsert反映をセットで実装する（StrictModeの二重発火で重複・消失する）
- E2Eシードのidは必ず`0-9a-f`のみの完全なUUID形式にする（不正だと静かに空データへフォールバックする）
- 権限でメニューを隠すだけにしない。ページ側ガードと、そのロールで実際に画面を開くE2Eをセットで置く
- 依存更新は型チェックが通っただけで完了としない。dependabotのPRはCIが緑のものだけマージする
