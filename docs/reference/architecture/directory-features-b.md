# ディレクトリ構成: `src/features/`（tech-tags〜admin）

> [`docs/architecture.md`](../../architecture.md) から分割した詳細リファレンス。常時ロードされないため、必要なときにこのファイルを直接Readする。

前半は [directory-features-a.md](directory-features-a.md)。

```
src/
├── features/
│   ├── tech-tags/         # 技術タグ管理（カテゴリ/サブカテゴリ対応）
│   │   ├── components/    # TechTagDialog
│   │   ├── pages/         # TechTagsPage
│   │   └── utils/         # リエクスポート: tech-tag-master, tag-filter
│   │
│   ├── dashboard/         # ダッシュボード（チャート・サマリー・EVM）
│   │   ├── components/    # AlertCenter（散在する警告判定を集約し重大度順に一覧表示。納期超過/遅延予測/
│   │   │                    納期接近/検収予定日の接近・経過/リスク対応期限/予算超過/稼働超過/ベースライン乖離/SaaS更新/
│   │   │                    スキルレビュー未実施。ダッシュボード最上部の「まず開く画面」）,
│   │   │                    ProjectAssignmentChart, MemberAssignmentChart, BudgetComparisonChart, UtilizationRateChart,
│   │   │                    ResourceDemandSupplyChart（要員の需要（月次アサイン合計の棒）と供給
│   │   │                    （在籍メンバーのcapacityRatio合計の線）を重ねた山積みグラフ。棒が線を超える月＝要員不足）,
│   │   │                    SkillDistributionChart（skillEvaluations propを渡すとカテゴリ×レベル別積み上げ棒グラフに切替、
│   │   │                    未指定時は従来のカテゴリ別単色棒グラフのまま後方互換）
│   │   ├── pages/         # DashboardPage（四半期レビュー未実施件数サマリーを部門・課フィルタ連動で表示。EVMパネル部門セレクタ・2分割レイアウト（ProjectAssignmentChart/BudgetComparisonChart横並び）追加。EvmPanelは`readOnly`指定で常時表示し、週次進捗率入力フォームは持たない。表示プロジェクトはEvmPanel内蔵のセレクタ（対象プロジェクトが2件以上のとき表示）で切替）
│   │   └── utils/         # dashboard-utils（集計・充足率・スキル分布・カテゴリ×レベル別スキル分布
│   │                         (getSkillLevelDistribution、代表レベルは上長評価優先)・
│   │                         定期評価レビュー未実施件数(getStaleSkillReviewCount)）
│   │
│   ├── guide-tour/        # 操作ガイダンスツアー（React Joyride 3.2）。TourProviderは
│   │                        uncontrolled（進行はjoyride側が管理）で、`onEvent`の
│   │                        `EVENTS.TOUR_END`だけをstopTourへ繋ぐ。ESCでの離脱は
│   │                        自前のkeydownで実装（3.2の`dismissKeyAction`は
│   │                        「次へ進む」で旧挙動と逆のため無効化）
│   │   ├── components/    # TourProvider, TourTooltip, TourMenuButton
│   │   ├── steps/         # ツアーステップ定義（global, dashboard, team, projects, wbs, schedule, assignment）
│   │   └── utils/         # tour-route-map + __tests__/
│   │
│   ├── my-tasks/          # 自分の担当（/my-tasks、postgresモード専用）
│   │   └── pages/         # MyTasksPage（ログインユーザーに紐づく担当者のアサインから
│   │                        今年度に配分のあるタスクを期日順に一覧。金額を一切表示しない
│   │                        ＝partnerにも開ける。未紐づけユーザーには案内を表示）
│   │
│   ├── estimates/         # 見積（/estimates、非公開の設計文書）。
│   │   │                    1案件フォーカスで記録／コーン／振り返りの3タブ。金額を持つためルート側で
│   │   │                    FinancialAccessGuardに包む（/budgetと同じ整理）
│   │   ├── components/    # EstimateRecordDialog（見積の記録。方法=簡易FP: NESMA概算法/推定法の
│   │   │                    項目行（名前／種別／件数）と合計FP・人日・人月・万円のライブ表示、
│   │   │                    「前回のFP項目をコピー」／方法=WBS: 現在のWBS概算を読み取り専用で表示／
│   │   │                    方法=手入力・実績: 人日と万円を直接入力（実績は現在の実績が初期値、段階は完了固定）。
│   │   │                    承認済みCRを選ぶとchangeRequestIdを紐づけラベルに表題を補完。
│   │   │                    行のkeyは行ごとのUUID（index keyにしない）），
│   │   │                    EstimateHistoryTable（版一覧: 版・記録日・段階・方法・工数・金額・幅・前版比・
│   │   │                    ラベル・記録者。前版比とFP項目の差分はdiffEstimateSnapshotsでUI側が導出），
│   │   │                    UncertaintyConeChart（Recharts ComposedChart。x=段階、y=万円。各段階の最新版の
│   │   │                    見積を線・幅（low〜high）を帯・実績を横線で描く。buildConePointsは純関数），
│   │   │                    UncertaintyConeInfo（Infoアイコン→Popover。3行の要旨＋段階×幅の表＋
│   │   │                    「なぜ狭まるのか」。段階セレクタの横とコーンタブの見出しに置く），
│   │   │                    EstimateRetrospectivePanel（比較する実績（完了時の記録／現在の実績）・
│   │   │                    実績 人時/FP vs 設定値・校正ヒント・版ごとの実績÷見積と幅の判定）
│   │   └── pages/         # EstimatesPage（案件セレクタ＝?projectId=の2段階解決・3タブ・「見積を記録」
│   │                        「最新版を取り消す」（確認ダイアログ）「実績を記録」・WBS/サマリーへの相互リンク。
│   │                        実績の基準日はマウント時に一度だけ確定）+ __tests__/
│   │
│   ├── document-templates/ # ドキュメントテンプレート管理（/document-templates）
│   │   └── pages/         # DocumentTemplatesPage（IPA準拠の標準テンプレート33件を初回シード。
│   │                        一覧（工程ラベル付きセレクタ）・新規作成（OKF準拠の初期本文）・
│   │                        名称/工程/説明/本文（マークダウン）のblur即時保存・削除・.mdダウンロード）
│   │
│   ├── statements/        # 月次明細（/statements。単価の二重管理を2方向の帳票に写す）
│   │   ├── pages/         # StatementsPage（対象月セレクタ・計画/実績トグル・タブ2面・CSV出力。
│   │   │                    協力会社への支払=会社→人→PJコード（契約単価×配分、単価0行は入力漏れとして
│   │   │                    警告色）／発注元向け=案件→会社→人（見積単価×配分、発注元名表示））
│   │   └── utils/         # statement-utils（buildPartnerPaymentLines=協力会社のみ・契約単価のみで
│   │                         フォールバックなし／buildClientStatementLines=全メンバー・見積単価／
│   │                         CSV行構築・合計。純粋関数）
│   ├── reports/           # レポート出力（CSV）・スナップショット・データ管理
│   │   ├── components/    # CsvReportExport（案件別収支表・要員別稼働表・部門予算予実表の3帳票を
│   │   │                    UTF-8 BOM付きCSVでダウンロード。行データ構築はutils/report-csv.tsが担い、
│   │   │                    本コンポーネントはストアからの入力集めとBlobダウンロード発火のみ）,
│   │   │                    DataExport, SnapshotHistory
│   │   ├── utils/         # report-csv（3帳票の行データ構築。既存の算出ロジック（概算予算・損益・
│   │   │                    進捗率・アサイン集計）を再利用し画面表示と同じ数値を保証する純粋関数）
│   │   └── pages/         # ReportsPage
│   │
│   ├── auth/              # 認証（postgresモード専用。localモードでは未使用）
│   │   ├── components/    # RequireAuth（ルートガード。localモードでは常にパススルー、requiredRole propで
│   │   │                    ロール制限も可能）
│   │   └── pages/         # LoginPage
│   │
│   └── admin/             # 管理画面（/admin/*）。全社設定・データ管理・マスタ・
│       │                    admin限定機能を業務画面とは別レイアウトへ集約。
│       │                    ルートはLayoutの外側（App.tsx）で、AdminLayoutが内部に<Routes>を持つ
│       ├── api/           # users-api（ユーザー管理API、DataAdapterの汎用CRUDには含めない専用クライアント）。
│       │                    外部ツール接続APIは`shared/api/external-tools-api.ts`に置く
│       │                    （features/projectsのWBS起票からも使うため。features間依存の回避）,
│       │                    notifications-api（通知チャンネル管理API。シークレットは
│       │                    書き込み専用でレスポンス型に平文フィールド自体が無い）,
│       │                    api-keys-api（APIキー管理API。平文キーは発行レスポンス
│       │                    でのみ得られる・openApiSpecUrl=OAS仕様書URL）,
│       │                    audit-logs-api（監査証跡の参照API。読み取りのみで
│       │                    書き込み関数を持たない＝改ざんの経路を作らない）
│       ├── components/    # MasterCsvImportCard（マスタCSV一括登録。3種の
│       │                    列一覧（COLUMN_SPECSを読むのでテンプレートと必ず一致）＋
│       │                    テンプレートDL＋取込。突合・適用はshared/utilsの純関数へ委譲し、
│       │                    ここはストアのアクションをdepsとして渡すだけ）,
│       │                    MasterCsvImportDialog（2ステップ=ファイル選択→ドライラン確認・適用。
│       │                    実績CSV取込（3ステップ）と違い列マッピングの段を持たない
│       │                    ＝テンプレートで列名を配っているため。**両ステップにプレビュー表**を
│       │                    持ち、①解釈前のCSV（列のずれ・文字化けの確認）②登録される内容
│       │                    （解釈後の値）を見せる。PreviewGridが両方の見た目を担う）,
│       │                    AdminLayout（左ペイン=メニュー（設定/マスタ/管理者）＋右ペイン=内容。
│       │                    「システムに戻る」で/dashboardへ。NAV_GROUPSはグループ単位の
│       │                    visible()に加えて項目単位のpermissionでも絞り、
│       │                    全項目が消えたグループは見出しごと出さない）,
│       │                    AdminAccessGuard（ページ側の権限ガード。FinancialAccessGuardと同型で、
│       │                    権限が無ければ中身を一切描画しない＝メニューを隠すだけでは
│       │                    URL直打ちで素通りするため）,
│       │                    AdminIndexRedirect（/adminの着地先。settings:manageが無い利用者を
│       │                    いきなり「権限がありません」に落とさず/admin/companiesへ送る）,
│       │                    CreateUserDialog, NotificationChannelDialog（追加・編集。プロバイダ別
│       │                    フィールド切替＝chatworkはAPIトークン+ルームID/他はWebhook URL。
│       │                    編集時の空欄=変更なし）
│       │                    ExternalToolConnectionDialog（接続の追加・編集。ツール別フィールド
│       │                    切替＝Backlog/JiraはURL・Jiraはメール。編集時のトークン空欄=変更なし）,
│       │                    ExternalToolTargetDialog（起票先設定。保存済みトークンで
│       │                    /metadataから選択肢を引く2段階フローの後半。GitHubはowner/repo直接入力）
│       └── pages/         # SystemSettingsPage（/admin/settings。旧サイドバーの
│                            ポップオーバーで直接編集していた11項目を基本／見積・単価／
│                            警告のしきい値／表示／セットアップの5カードへ整理。SettingRowが
│                            ラベル＋説明＋入力の組を作る。金額の表示トグルはaria-pressedで
│                            状態を示す（ラベルがアクセシブルネームを担うため文言だけでは
│                            状態が読み取れない）。初期設定ウィザードはopenSetupWizard()後に
│                            /dashboardへ遷移する（本体はDashboardPageがマウントするため））,
│                            DataManagementPage（/admin/data。DataExport・SnapshotHistoryを載せる）,
│                            UserManagementPage（ユーザー一覧・追加・ロール変更・有効/無効化）,
│                            AuditLogsPage（/admin/audit-logs。変更履歴の閲覧＋
│                            保持管理（総件数・最古日時の表示、期間を選んで一括パージ。
│                            確認ダイアログ必須）。
│                            対象データ・操作種別・レコードIDで絞り込み。update=フィールドの
│                            before→after、delete=削除直前の値の要約、create=差分なし。
│                            操作者はactorName→actorEmail→「（不明）」の順にフォールバック）,
│                            ExternalToolsPage（/admin/external-tools。接続一覧・
│                            追加/編集/削除・接続テスト・起票先設定。トークンは設定済みフラグのみ表示）,
│                            NotificationSettingsPage（/admin/notifications。チャンネル
│                            一覧・追加/編集/削除確認・テスト送信・送信ログ直近20件）,
│                            ApiKeysPage（/admin/api-keys。キー発行=平文一度だけ表示・
│                            コピー・無効化/有効化・削除確認・OAS仕様書リンク）
```
