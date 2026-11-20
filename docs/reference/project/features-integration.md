# 機能リファレンス: 外部連携（完了同期・API起票・公開API・通知）

> [`docs/project.md`](../../project.md) から分割した詳細リファレンス。常時ロードされないため、必要なときにこのファイルを直接Readする。

### 外部実行管理ツールとの完了同期（P1-c改）

2026-08-16、非公開の設計文書のPhase 1を実装した。「餅は餅屋」で実行管理を
委ねた外部ツール（Backlog・Asana・Jira）から**タスク完了の事実を受信**し、WBS完了チェックの
二重入力を解消する（受信主・送出従。これでEVMの3指標すべて＝PV凍結・EV完了同期・AC月次実績が
手入力ゼロの動線で回る）。

- **行き**: `/wbs`の「連携CSV出力」（`TaskSyncExportDialog`）。リーフタスクを件名`[コード] 名前`＋
  直近親のグループ列（Backlog=カテゴリー/Asana=Section/Jira=Epic Link）で出力。
  階層はツリー複製ではなくグルーピング写像（構造の正本は本ツール1箇所）
- **帰り**: `/wbs`の「完了CSV取込」（`TaskSyncImportDialog`、3ステップウィザード）。突合は
  ①学習済み外部ID→②件名の`[コード]`→③コード直値/タスク名（複数一致・非リーフはskip）。
  初回突合成功時に`Project.externalSource`/`externalTaskId`を学習保存し、以降は外部IDが
  一次キー（件名改変に強い）。書込みは`completed`/`completedAt`のみ・同期ログ追記
- **コード一意性**: タスクコードが突合キーになるため、新たな重複を作る保存を
  ProjectDialog（クライアント）＋サーバー`beforeCreate`/`beforeUpdate`で拒否
  （既存重複データの無関係な編集はブロックしない）。DB unique制約は既存データ互換のため見送り
- **Phase 2（Webhook受信・postgresモード専用）実装済み**: `POST /api/webhooks/tasks/:source`
  （source=generic/backlog/jira/asana/github）。認証はURLシークレット（`TASK_WEBHOOK_SECRET`環境変数、
  未設定時は全401=機能無効）。冪等（同一イベント再送は変化なしに収束しログも増えない）。
  突合不能・解釈不能は**202**で受理してskipログへ記録（4xxを返すと外部ツールのリトライ嵐を招くため）。
  アダプタ: Backlog=`content.changes[]`のstatus変更が一次情報（完了状態名は
  `TASK_WEBHOOK_BACKLOG_DONE_STATUSES`環境変数で設定可、既定「完了」。で仮定を解消）／Jira=`statusCategory.key==='done'`（言語非依存）／Asana=X-Hook-Secret
  ハンドシェイク＋APIフェッチ（`ASANA_ACCESS_TOKEN`環境変数、未設定時はasanaソース無効）／
  **GitHub=`X-GitHub-Event`ヘッダで`issues`判定＋action closed/reopened、外部ID`owner/repo#番号`、
  `ping`は202で受理（環境変数の追加なし）**。
  仕様は公式ドキュメント調査に基づく
- Phase 3（アラート送出）は未着手

### API起票基盤（行き・postgresモード専用）

2026-08-20、非公開の設計文書に沿ってWBSタスクを外部ツールへAPIで
一括起票する基盤を実装した。**起票時に外部IDを即時学習する**ため、CSV経路の既知の弱点
（初回同期前のコード変更で追跡が切れる）がAPI経路では構造的に消える。

- **接続管理**: `/admin/external-tools`（`users:manage`＝admin限定）。ツール（backlog/
  asana/jira/github）・接続名・URL（Backlog=スペース／Jira=サイト）・APIトークン・
  起票先（プロジェクト/リポジトリ）を登録。トークンはAES-256-GCM暗号化保存の書き込み専用
  （GETは設定済みフラグのみ、PATCHはundefined=変更なし/null=クリア/文字列=再設定の3値。
  notificationChannelsと同じ整理でEntityMap非登録＝localモードには存在しない）。
  **接続一覧のGETのみ`data:write`**（`users:manage`から緩和）。起票実行が
  `data:write`である以上、editorが起票先の接続を選べないと機能が成立しない
  （緩和前は「API起票ボタンは押せるが接続取得で403」という実バグだった）。
  作成・更新・削除・接続テスト・起票先の選択肢取得は`users:manage`のまま＝職務分掌を維持。
  baseUrlは**https必須＋ホスト許可リスト**（`*.backlog.jp/.com/backlogtool.com`・
  `*.atlassian.net`）でSSRF面を限定（クラウド版専用の割り切り）
- **起票実行**: `POST /api/taskCreation/execute`（`data:write`＝editor以上）。
  クライアント申告のtaskIdsをそのまま起票せず、**サーバー側で対象を再検証**する
  （指定ルート配下・リーフ・未起票のみ。判定はクライアントのドライランと同一の
  `buildTaskCreationPlan`＝`shared/utils/task-creation-core.ts`）。逐次POST＋約1件/秒の
  スロットル（GitHubの二次制限80件/分が4ツール最小のため全ツール共通）・1リクエスト50件上限・
  **1件成功ごとに外部IDを即時UPDATE**（クラッシュ窓の最小化）。学習済みは常にskipされるため
  再実行は冪等（未起票分だけが対象）
- **案件ごとの既定接続**: `Project.externalConnectionId`で案件に接続を紐づける。`ProjectDialog`の「起票先の接続」欄（level===0・postgresモードのみ）で設定し、`TaskCreationDialog`が自動選択する（未設定・無効・削除済みなら先頭へフォールバック）。**案件ごとに委譲先ツールが違う運用**（A案件=Asana／B案件=GitHub）で、起票のたびに選び間違えて別ツールへ起票する事故（外部IDを学習するため取り消しが面倒）を防ぐ。同時に、同一ツールに複数接続（別スペース）がある場合の外部リンクもこの参照で確定できる
- **UI**: `/wbs`の「API起票」ボタン（postgresモードのみ表示）→`TaskCreationDialog`
  （接続選択→ドライラン→実行）。起票結果は`taskSyncLogs`（`channel='api'`・`createdCount`）へ追記
- **起票状態の可視化と外部リンク**: WBSグリッド右端固定の「連携」列に、
  起票済み＝外部タスクへのリンク／URL解決不能＝外部IDバッジ／未起票＝「—」を表示する。
  URLは`features/projects/utils/external-task-url.ts`の純関数が組み立て、**形式に合致しない
  外部ID・baseUrl不明のツールはリンクを出さない**（別スペースの同名課題へ飛ばさない）。
  baseUrlはWbsPageが接続一覧から取得するが、**取得失敗（viewer/partnerの403等）は握り潰す**
  ＝リンクが出ないだけで画面は成立する。localモードは接続を持たないためbaseUrl不要の
  github・asanaのみリンクになる
- **期日の送信**: タスクの所属工程（`Project.phaseKey`、祖先から継承）に
  引かれたスケジュールの終了日を`dueDate`として送る（Backlog=`dueDate`／Jira=`duedate`／
  Asana=`due_on`）。**【判断】GitHubには送らない**（Issueに期日フィールドが無く、
  マイルストーンは番号指定が必要で工程名から解決できない）。工程未設定・スケジュール未登録の
  タスクはキー自体を送らない。**【判断】担当者・優先度は送らない**: 担当者はemail→ユーザーID
  解決が全ツールで追加API往復を要し（Backlog=projects/:id/users、Jira=user/search（GDPR設定で
  失敗しうる）、GitHub=login解決）、1件/秒のスロットルに往復が乗る。優先度はツール間で表現が
  非互換（Jiraは名称文字列で日本語環境と不一致→400リスク、Asanaはカスタムフィールド、
  GitHubのラベルはグループで使用済み）で、値の不一致で起票が落ちる方が有害
- **Jiraの`description`はADF**（Atlassian Document Format）オブジェクトで送る。
  API v3はプレーン文字列を受け付けず400になる。改行は段落ノードへ分割し、完了条件が空なら
  キー自体を省略する（他3ツールは文字列のまま）
- **外部IDの形式はWebhookアダプタと完全一致**（backlog=`PROJ-123`／jira=`PROJ-123`／
  asana=gid／github=`owner/repo#123`）。不一致だと経路ごとに別IDで学習され突合が分裂する
- **【判断】Jiraのバルク作成API（≤50件）は使わない**: per-rowエラー処理と1件ごとの外部ID学習を
  4ツール単一実装に保つため。スループットはスロットル律速で差が出ない
- 【判断】グループ（直近親の工程名）はBacklog=カテゴリー（`categoryId[]`）／Asana=セクション
  （起票後に`POST /sections/{gid}/addTask`）／Jira・GitHub=ラベル。Backlog・Asanaは
  **未存在なら外部側に作成する**（CSVインポート時に外部ツールが作るのと等価。副作用は利用ガイドに明記）。
  同一実行内は工程名→識別子をキャッシュし、解決失敗時はグループ無しで起票を続行する
- **⚠️ 送信形式はツールで異なる**: **Backlogは`application/x-www-form-urlencoded`必須**
  （公式のAdd Issue仕様。配列は`categoryId[]`表記）、他3ツールはJSON。`CreateRequest.encoding`で
  出し分ける。統合テストはfetchスタブのため実APIとの相性は検出できず、実アカウント検証CLI
  （`npm --prefix server run verify:external-tool`）で確認する
- **実アカウント検証CLI**（`server/src/scripts/verify-external-tool.ts`）:
  DB・サーバー起動なしで本番と同じ`client.ts`/`payload.ts`を通し、①接続テスト ②起票先の選択肢
  （プロジェクトID・課題種別ID・優先度ID）取得 ③実起票（`EXT_CREATE=1`のときのみ）を行う。
  トークンは伏字表示。手順は`docs/guide/external-tools-setup.md`

**GitHub連携の非対称性**: 取込（`TaskSyncTool`）には`github`があるが、
エクスポート形式（`TaskSyncExportFormat` = `Exclude<TaskSyncTool, 'github'>`・
`TASK_SYNC_EXPORT_FORMATS`）には**含めない**。GitHubにはIssueのCSVインポート標準機能が
無いため（行きはAPI起票が担う。非公開の設計文書）。
CSV取込のgithubプリセットは`externalKey`を推定しない（CSVの`number`列＝`123`を学習すると
Webhook/API起票側の`owner/repo#123`と別IDになり経路間で突合が分裂するため）。

### 公開API v1（read-only）

2026-08-19、外部システム（BI・会計・スクリプト）が「判断の結果」を機械的に取得するための
読み取り専用APIを実装した（postgresモード専用・最小構成）。

- **認証**: APIキー（`X-Api-Key: rpk_...`または`Authorization: Bearer rpk_...`）。
  キーは`/admin/api-keys`で発行し、SHA-256ハッシュのみ保存（平文は発行時に一度だけ表示）。
  無効化は即時反映（次のリクエストから401）
- **エンドポイント8本**（集計はすべて画面・CSVと同一のshared純関数を再利用=数値の単一実装）:
  `GET /api/v1/billing`（請求データ、projectId絞り込み可）／`/api/v1/project-finance`
  （案件別収支。原価4区分＋配賦後利益を含む）／`/api/v1/statements/partner-payment`・`/api/v1/statements/client`
  （月次明細、month=YYYY-MM・mode=actual|plan。準委任精算適用済み）／`/api/v1/alerts`
  （アラートセンターと同一判定）／`/api/v1/projects`・`/api/v1/projects/{id}`
  （プロジェクト一覧・詳細=タスクツリー・スケジュール・進捗率。外部からの進捗報告参照用、
  金額は含めない=project-financeとの責務分離）／`/api/v1/projects/{id}/evm`
  （EVMのPV/EV/AC週次系列。EvmPanelと同一のBAC解決=ベースライン優先→WBS積み上げ→予算枠。
  スケジュールもベースラインも無い案件はeligible=false）
- **OAS**: `GET /api/v1/openapi.yaml`（認証不要=利用者への提供物。OpenAPI 3.0.3、
  正本は`server/openapi/v1.yaml`）
- 集計ビルダーのサーバー再利用のため`statement-utils`・案件別収支レコードビルダー
  （`project-finance.ts`）をshared/utilsへ移設（旧位置はリエクスポート）
- 書き込みAPI（実績工数の投入等）はスコープ外（需要が現れたらscope列を追加して拡張）

### チャットツール通知（Phase 3）

2026-08-17、非公開の設計文書に沿ってサーバー発の通知送出を実装した
（postgresモード専用。完了同期のWebhook「受信」と対をなす「送出」側）。

- **対応プロバイダ6種**: Slack／Microsoft Teams（Workflows、Adaptive Card形式）／Google Chat／
  Discord／Chatwork（APIトークン＋ルームID）／汎用Webhook（共通モデルをそのままJSON送出）
- **2系統の送出**:
  - 即時イベント: 月次締め/解除（`monthlyCloseEvents`のafterCreate）・変更要求の承認/却下
    （`changeRequests`のafterUpdate、pending→決定の遷移時のみ）。fire-and-forgetで業務処理を
    ブロックしない
  - 日次ダイジェスト: アラートセンターと同一の純関数（`shared/utils/alert-utils.ts`）をサーバー
    から再利用し、8種（納期超過・遅延予測・納期接近／検収予定日の接近・経過／リスク対応期限／
    SaaS更新期限／稼働超過／ベースライン乖離／予算超過。検収予定日・リスクの文面は金額を
    含めない=決定事項7維持）を
    重大度順に1通へ集約。envの`NOTIFY_DIGEST_TIME`（HH:MM）で内蔵スケジューラが毎日送信
    （未設定なら無効）。チャンネルごとの`minSeverity`で絞り込み、対象0件なら送らない。
    digestログによる同日再送防止（手動送信APIはバイパス）
- **通知文面に具体的な金額を含めない**（決定事項7。予算超過はダイジェスト専用文面で消化率%のみ）
- **管理**: `/admin/notifications`（`users:manage`権限）でチャンネルCRUD・テスト送信・送信ログ確認。
  Webhook URL・APIトークンはAES-256-GCM暗号化保存の書き込み専用（GETは設定済みフラグのみ、
  PATCHはundefined=変更なし/null=クリア/文字列=再設定の3値）
- **データ**: `notificationChannels`／`notificationLogs`（追記・FKカスケード）はサーバー専用
  エンティティ（EntityMap非登録、localモードには存在しない。usersと同じ整理）
