/**
 * デモデータ: 案件定義（10案件 + 子タスク約30件）
 *
 * SES/受託開発会社の年間案件ポートフォリオ。
 * WBS列定義の tagNames は MASTER_DATA のタグ名と完全一致させること。
 */

export interface DemoWbsColumn {
  displayName: string
  tagNames: string[]
}

export interface DemoSubTask {
  codeSuffix: string
  name: string
}

export interface DemoTask {
  codeSuffix: string
  name: string
  subTasks: DemoSubTask[]
}

export interface DemoProjectDef {
  code: string
  name: string
  description: string
  status: 'not_started' | 'active' | 'completed'
  confidence: 'S' | 'A' | 'B' | 'C'
  /** 開始年度月（1=4月, 12=3月） */
  startFiscalMonth: number
  /** 終了年度月（1=4月, 12=3月） */
  endFiscalMonth: number
  tasks: DemoTask[]
  wbsColumns: DemoWbsColumn[]
}

export const DEMO_PROJECTS: DemoProjectDef[] = [
  {
    code: 'P001',
    name: 'ECサイトリニューアル',
    description:
      '大手小売業向けECサイトのフルリニューアル。Next.js + Spring Boot構成。',
    status: 'active',
    confidence: 'S',
    startFiscalMonth: 1,
    endFiscalMonth: 12,
    tasks: [
      {
        codeSuffix: '01',
        name: 'フロントエンド開発',
        subTasks: [
          { codeSuffix: '001', name: '商品一覧・検索画面' },
          { codeSuffix: '002', name: '商品詳細・カート機能' },
          { codeSuffix: '003', name: '決済・注文フロー' },
          { codeSuffix: '004', name: 'マイページ・会員機能' },
          { codeSuffix: '005', name: 'レスポンシブ対応・パフォーマンス最適化' },
        ],
      },
      {
        codeSuffix: '02',
        name: 'バックエンドAPI開発',
        subTasks: [
          { codeSuffix: '001', name: '商品管理API' },
          { codeSuffix: '002', name: '注文・決済API' },
          { codeSuffix: '003', name: '会員・認証API' },
          { codeSuffix: '004', name: '在庫管理API' },
          { codeSuffix: '005', name: '外部連携API' },
        ],
      },
      {
        codeSuffix: '03',
        name: 'インフラ構築',
        subTasks: [
          { codeSuffix: '001', name: 'AWS環境設計・VPC構築' },
          { codeSuffix: '002', name: 'ECS/Fargate環境構築' },
          { codeSuffix: '003', name: 'CI/CDパイプライン構築' },
          { codeSuffix: '004', name: '監視・アラート設定' },
        ],
      },
      {
        codeSuffix: '04',
        name: 'テスト・QA',
        subTasks: [
          { codeSuffix: '001', name: 'テスト計画・設計' },
          { codeSuffix: '002', name: '結合テスト' },
          { codeSuffix: '003', name: '性能テスト' },
          { codeSuffix: '004', name: 'セキュリティテスト' },
          { codeSuffix: '005', name: '受入テスト支援' },
        ],
      },
    ],
    wbsColumns: [
      {
        displayName: 'フロントエンド',
        tagNames: ['TypeScript', 'React', 'Next.js', 'Tailwind CSS'],
      },
      {
        displayName: 'バックエンド',
        tagNames: ['Java', 'Spring Boot', 'PostgreSQL'],
      },
      {
        displayName: 'インフラ',
        tagNames: ['AWS（全般）', 'ECS / Fargate', 'Terraform'],
      },
      {
        displayName: 'テスト',
        tagNames: ['Jest / Vitest', 'Playwright', 'JUnit / Mockito'],
      },
    ],
  },
  {
    code: 'P002',
    name: '金融機関向け口座管理システム',
    description:
      '地方銀行の口座管理・取引照会システム。セキュリティ要件が厳しい。',
    status: 'active',
    confidence: 'A',
    startFiscalMonth: 1,
    endFiscalMonth: 12,
    tasks: [
      {
        codeSuffix: '01',
        name: '業務ロジック開発',
        subTasks: [
          { codeSuffix: '001', name: '口座開設・解約処理' },
          { codeSuffix: '002', name: '入出金・振替処理' },
          { codeSuffix: '003', name: '取引照会・明細出力' },
          { codeSuffix: '004', name: '金利計算・利息処理' },
          { codeSuffix: '005', name: 'バッチ処理（日次/月次）' },
        ],
      },
      {
        codeSuffix: '02',
        name: 'セキュリティ実装',
        subTasks: [
          { codeSuffix: '001', name: '認証・認可基盤' },
          { codeSuffix: '002', name: '暗号化・鍵管理' },
          { codeSuffix: '003', name: '監査ログ実装' },
          { codeSuffix: '004', name: 'WAF・不正検知' },
        ],
      },
      {
        codeSuffix: '03',
        name: 'DB設計・移行',
        subTasks: [
          { codeSuffix: '001', name: 'データモデル設計' },
          { codeSuffix: '002', name: 'マイグレーション計画' },
          { codeSuffix: '003', name: 'データ移行実施' },
          { codeSuffix: '004', name: 'パフォーマンスチューニング' },
        ],
      },
    ],
    wbsColumns: [
      {
        displayName: 'バックエンド',
        tagNames: ['Java', 'Spring Boot', 'Spring Cloud'],
      },
      { displayName: 'DB', tagNames: ['Oracle Database', 'PostgreSQL'] },
      {
        displayName: 'セキュリティ',
        tagNames: ['OAuth 2.0 / OIDC', 'WAF運用'],
      },
      { displayName: 'テスト', tagNames: ['JUnit / Mockito', 'SonarQube'] },
    ],
  },
  {
    code: 'P003',
    name: 'SaaS型勤怠管理システム',
    description:
      '自社プロダクト。マルチテナント対応のクラウド勤怠管理サービス。',
    status: 'active',
    confidence: 'S',
    startFiscalMonth: 1,
    endFiscalMonth: 12,
    tasks: [
      {
        codeSuffix: '01',
        name: 'フロントエンド',
        subTasks: [
          { codeSuffix: '001', name: '打刻・勤怠入力画面' },
          { codeSuffix: '002', name: 'シフト管理画面' },
          { codeSuffix: '003', name: '申請・承認フロー画面' },
          { codeSuffix: '004', name: '管理者ダッシュボード' },
          { codeSuffix: '005', name: 'レポート・CSV出力' },
        ],
      },
      {
        codeSuffix: '02',
        name: 'API開発',
        subTasks: [
          { codeSuffix: '001', name: '勤怠CRUD API' },
          { codeSuffix: '002', name: 'シフト管理API' },
          { codeSuffix: '003', name: '承認ワークフローAPI' },
          { codeSuffix: '004', name: 'レポート集計API' },
        ],
      },
      {
        codeSuffix: '03',
        name: 'インフラ・CI/CD',
        subTasks: [
          { codeSuffix: '001', name: 'マルチテナント基盤構築' },
          { codeSuffix: '002', name: 'CI/CDパイプライン' },
          { codeSuffix: '003', name: '監視・ログ基盤' },
          { codeSuffix: '004', name: 'バックアップ・DR設計' },
        ],
      },
    ],
    wbsColumns: [
      {
        displayName: 'フロントエンド',
        tagNames: ['TypeScript', 'React', 'Tailwind CSS'],
      },
      {
        displayName: 'バックエンド',
        tagNames: ['Go', 'Gin', 'PostgreSQL', 'Redis'],
      },
      {
        displayName: 'インフラ',
        tagNames: ['AWS（全般）', 'Docker', 'GitHub Actions'],
      },
    ],
  },
  {
    code: 'P004',
    name: '物流管理モバイルアプリ',
    description:
      '倉庫ピッキング・配送管理のFlutterアプリ。バーコードスキャン対応。',
    status: 'active',
    confidence: 'B',
    startFiscalMonth: 3,
    endFiscalMonth: 9,
    tasks: [
      {
        codeSuffix: '01',
        name: 'モバイルアプリ開発',
        subTasks: [
          { codeSuffix: '001', name: 'バーコードスキャン機能' },
          { codeSuffix: '002', name: 'ピッキングリスト画面' },
          { codeSuffix: '003', name: '配送ルート表示' },
          { codeSuffix: '004', name: 'プッシュ通知' },
          { codeSuffix: '005', name: 'オフライン対応' },
        ],
      },
      {
        codeSuffix: '02',
        name: 'バックエンドAPI',
        subTasks: [
          { codeSuffix: '001', name: '在庫管理API' },
          { codeSuffix: '002', name: '配送管理API' },
          { codeSuffix: '003', name: 'ルート最適化API' },
          { codeSuffix: '004', name: '通知配信基盤' },
        ],
      },
    ],
    wbsColumns: [
      { displayName: 'モバイル', tagNames: ['Dart', 'Flutter', 'Firebase'] },
      {
        displayName: 'バックエンド',
        tagNames: ['Python', 'FastAPI', 'PostgreSQL'],
      },
      { displayName: 'インフラ', tagNames: ['GCP（全般）', 'Cloud Run'] },
    ],
  },
  {
    code: 'P005',
    name: 'クラウドインフラ移行支援',
    description: '大手製造業のオンプレ→AWS移行。段階的なリフト&シフト。',
    status: 'active',
    confidence: 'A',
    startFiscalMonth: 1,
    endFiscalMonth: 12,
    tasks: [
      {
        codeSuffix: '01',
        name: 'アセスメント・設計',
        subTasks: [
          { codeSuffix: '001', name: '現状環境調査' },
          { codeSuffix: '002', name: '移行対象選定・優先度付け' },
          { codeSuffix: '003', name: 'アーキテクチャ設計' },
          { codeSuffix: '004', name: 'セキュリティ設計' },
          { codeSuffix: '005', name: 'コスト試算' },
        ],
      },
      {
        codeSuffix: '02',
        name: '移行実施',
        subTasks: [
          { codeSuffix: '001', name: 'ネットワーク構築' },
          { codeSuffix: '002', name: 'サーバー移行' },
          { codeSuffix: '003', name: 'データベース移行' },
          { codeSuffix: '004', name: 'アプリケーション移行' },
          { codeSuffix: '005', name: '動作検証・切替' },
        ],
      },
      {
        codeSuffix: '03',
        name: '監視・運用設計',
        subTasks: [
          { codeSuffix: '001', name: '監視ダッシュボード構築' },
          { codeSuffix: '002', name: 'アラート設計' },
          { codeSuffix: '003', name: '運用手順書作成' },
          { codeSuffix: '004', name: '障害対応フロー策定' },
        ],
      },
    ],
    wbsColumns: [
      {
        displayName: 'インフラ',
        tagNames: ['AWS（全般）', 'VPC設計', 'IAM', 'Terraform'],
      },
      {
        displayName: 'コンテナ',
        tagNames: ['Docker', 'Kubernetes', 'ECS / Fargate'],
      },
      {
        displayName: '監視',
        tagNames: ['Datadog', 'CloudWatch', 'Prometheus'],
      },
      { displayName: 'セキュリティ', tagNames: ['WAF運用', 'IAM'] },
    ],
  },
  {
    code: 'P006',
    name: 'AI問い合わせチャットボット',
    description: '保険会社のカスタマーサポート向けAIチャットボット。RAG構成。',
    status: 'active',
    confidence: 'A',
    startFiscalMonth: 4,
    endFiscalMonth: 9,
    tasks: [
      {
        codeSuffix: '01',
        name: 'MLモデル開発',
        subTasks: [
          { codeSuffix: '001', name: 'データ収集・前処理' },
          { codeSuffix: '002', name: 'RAGパイプライン構築' },
          { codeSuffix: '003', name: 'モデルファインチューニング' },
          { codeSuffix: '004', name: '評価・精度改善' },
        ],
      },
      {
        codeSuffix: '02',
        name: 'フロントエンド',
        subTasks: [
          { codeSuffix: '001', name: 'チャットUI実装' },
          { codeSuffix: '002', name: '管理画面実装' },
          { codeSuffix: '003', name: 'FAQ管理画面' },
          { codeSuffix: '004', name: 'レスポンス表示最適化' },
        ],
      },
      {
        codeSuffix: '03',
        name: 'API統合',
        subTasks: [
          { codeSuffix: '001', name: 'チャットAPI開発' },
          { codeSuffix: '002', name: 'ナレッジベースAPI' },
          { codeSuffix: '003', name: 'CRM連携API' },
          { codeSuffix: '004', name: '分析・ログAPI' },
        ],
      },
    ],
    wbsColumns: [
      {
        displayName: 'ML/AI',
        tagNames: ['Python（ML/DS）', 'PyTorch', 'Hugging Face Transformers'],
      },
      {
        displayName: 'フロントエンド',
        tagNames: ['TypeScript', 'React', 'Next.js'],
      },
      { displayName: 'バックエンド', tagNames: ['Python', 'FastAPI'] },
      { displayName: 'インフラ', tagNames: ['AWS（全般）', 'Lambda', 'S3'] },
    ],
  },
  {
    code: 'P007',
    name: '社内ナレッジ管理ツール',
    description: '自社向け技術ナレッジ共有ツール。Markdown対応、全文検索付き。',
    status: 'active',
    confidence: 'S',
    startFiscalMonth: 5,
    endFiscalMonth: 10,
    tasks: [
      {
        codeSuffix: '01',
        name: 'フロントエンド',
        subTasks: [
          { codeSuffix: '001', name: '記事エディタ（Markdown）' },
          { codeSuffix: '002', name: '記事一覧・検索UI' },
          { codeSuffix: '003', name: 'タグ・カテゴリ管理' },
          { codeSuffix: '004', name: 'ユーザープロフィール' },
        ],
      },
      {
        codeSuffix: '02',
        name: 'バックエンド・検索',
        subTasks: [
          { codeSuffix: '001', name: '記事CRUD API' },
          { codeSuffix: '002', name: '全文検索エンジン統合' },
          { codeSuffix: '003', name: 'ユーザー管理API' },
          { codeSuffix: '004', name: '通知・お気に入りAPI' },
          { codeSuffix: '005', name: 'アクセス権限管理' },
        ],
      },
    ],
    wbsColumns: [
      {
        displayName: 'フロントエンド',
        tagNames: ['TypeScript', 'React', 'Tailwind CSS'],
      },
      {
        displayName: 'バックエンド',
        tagNames: ['TypeScript', 'NestJS', 'PostgreSQL', 'Elasticsearch'],
      },
      { displayName: 'インフラ', tagNames: ['Docker', 'GitHub Actions'] },
    ],
  },
  {
    code: 'P008',
    name: 'ヘルスケアアプリAPI開発',
    description: '健康管理アプリ向けREST API。ウェアラブルデバイス連携。',
    status: 'not_started',
    confidence: 'C',
    startFiscalMonth: 10,
    endFiscalMonth: 12,
    tasks: [
      {
        codeSuffix: '01',
        name: 'API設計・開発',
        subTasks: [
          { codeSuffix: '001', name: 'ユーザー・認証API' },
          { codeSuffix: '002', name: '健康データ記録API' },
          { codeSuffix: '003', name: 'デバイスデータ取込API' },
          { codeSuffix: '004', name: 'レポート・統計API' },
        ],
      },
      {
        codeSuffix: '02',
        name: 'モバイル連携',
        subTasks: [
          { codeSuffix: '001', name: 'iOS連携モジュール' },
          { codeSuffix: '002', name: 'Android連携モジュール' },
          { codeSuffix: '003', name: 'ウェアラブルSDK統合' },
          { codeSuffix: '004', name: 'プッシュ通知実装' },
        ],
      },
    ],
    wbsColumns: [
      { displayName: 'バックエンド', tagNames: ['Go', 'Gin', 'PostgreSQL'] },
      { displayName: 'モバイル', tagNames: ['Swift', 'Kotlin（Android）'] },
      { displayName: 'インフラ', tagNames: ['GCP（全般）', 'Cloud Run'] },
    ],
  },
  {
    code: 'P009',
    name: '教育プラットフォーム保守',
    description: 'EdTech企業の学習管理プラットフォーム。機能追加と保守運用。',
    status: 'active',
    confidence: 'A',
    startFiscalMonth: 1,
    endFiscalMonth: 12,
    tasks: [
      {
        codeSuffix: '01',
        name: '機能追加開発',
        subTasks: [
          { codeSuffix: '001', name: 'テスト・クイズ機能拡張' },
          { codeSuffix: '002', name: '動画コンテンツ対応' },
          { codeSuffix: '003', name: '学習進捗ダッシュボード' },
          { codeSuffix: '004', name: '多言語対応' },
          { codeSuffix: '005', name: 'レポート機能強化' },
        ],
      },
      {
        codeSuffix: '02',
        name: '保守・障害対応',
        subTasks: [
          { codeSuffix: '001', name: '性能改善・チューニング' },
          { codeSuffix: '002', name: 'セキュリティパッチ適用' },
          { codeSuffix: '003', name: 'インフラ監視・運用' },
          { codeSuffix: '004', name: 'バグ修正・問い合わせ対応' },
        ],
      },
    ],
    wbsColumns: [
      {
        displayName: 'フロントエンド',
        tagNames: ['TypeScript', 'Vue.js', 'Nuxt.js'],
      },
      {
        displayName: 'バックエンド',
        tagNames: ['Ruby', 'Ruby on Rails', 'PostgreSQL'],
      },
      {
        displayName: 'インフラ',
        tagNames: ['AWS（全般）', 'Docker', 'Terraform'],
      },
    ],
  },
  {
    code: 'P010',
    name: '広告配信レポート基盤',
    description:
      'アドテク企業向けレポーティング基盤。大量データの集計・可視化。',
    status: 'completed',
    confidence: 'S',
    startFiscalMonth: 1,
    endFiscalMonth: 6,
    tasks: [
      {
        codeSuffix: '01',
        name: 'データパイプライン構築',
        subTasks: [
          { codeSuffix: '001', name: 'データ収集パイプライン' },
          { codeSuffix: '002', name: 'ETL処理開発' },
          { codeSuffix: '003', name: 'データウェアハウス設計' },
          { codeSuffix: '004', name: 'リアルタイム集計基盤' },
        ],
      },
      {
        codeSuffix: '02',
        name: 'レポートUI',
        subTasks: [
          { codeSuffix: '001', name: 'ダッシュボード画面' },
          { codeSuffix: '002', name: 'カスタムレポート作成' },
          { codeSuffix: '003', name: 'グラフ・チャート表示' },
          { codeSuffix: '004', name: 'CSV/PDF出力機能' },
        ],
      },
      {
        codeSuffix: '03',
        name: 'バッチ処理最適化',
        subTasks: [
          { codeSuffix: '001', name: '日次バッチ最適化' },
          { codeSuffix: '002', name: '月次レポート生成' },
          { codeSuffix: '003', name: 'データアーカイブ処理' },
          { codeSuffix: '004', name: 'パフォーマンス監視' },
        ],
      },
    ],
    wbsColumns: [
      {
        displayName: 'データ基盤',
        tagNames: ['Python', 'SQL', 'BigQuery', 'Apache Kafka'],
      },
      {
        displayName: 'フロントエンド',
        tagNames: ['TypeScript', 'React', 'Next.js'],
      },
      {
        displayName: 'インフラ',
        tagNames: ['GCP（全般）', 'Cloud Run', 'Terraform'],
      },
    ],
  },
]
