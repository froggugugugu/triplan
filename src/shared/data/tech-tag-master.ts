/**
 * 技術タグマスタデータ
 *
 * docs/appendix/技術タグマスタ一覧.xlsx から抽出。
 * ストアが空の場合にシードデータとして使用する。
 */

export interface MasterCategory {
  name: string
  subCategories: MasterSubCategory[]
}

export interface MasterSubCategory {
  name: string
  tags: MasterTag[]
}

export interface MasterTag {
  name: string
  note?: string
}

/** カテゴリごとのデフォルト色（HSLベースで視覚的に区別しやすい色を割り当て） */
export const CATEGORY_DEFAULT_COLORS: Record<string, string> = {
  'ロール・マネジメント': '#6366f1',
  プログラミング言語: '#3b82f6',
  'フレームワーク（バックエンド）': '#0ea5e9',
  'フレームワーク（フロントエンド）': '#06b6d4',
  モバイル: '#14b8a6',
  クラウド: '#f59e0b',
  'コンテナ・オーケストレーション': '#f97316',
  'IaC・構成管理': '#ef4444',
  'CI/CD': '#ec4899',
  '監視・オブザーバビリティ': '#a855f7',
  データベース: '#8b5cf6',
  'メッセージング・ストリーミング': '#d946ef',
  '認証・認可・セキュリティ': '#dc2626',
  'API・アーキテクチャ': '#059669',
  'テスト・品質': '#2563eb',
  'バージョン管理・コラボレーション': '#64748b',
  'データ・ML・AI': '#7c3aed',
}

export const MASTER_DATA: MasterCategory[] = [
  {
    name: 'ロール・マネジメント',
    subCategories: [
      {
        name: 'マネジメント',
        tags: [
          { name: 'プロジェクトマネジメント（PM）' },
          { name: 'プロダクトマネジメント（PdM）' },
          { name: 'エンジニアリングマネジメント（EM）' },
          { name: 'スクラムマスター' },
          { name: 'テックリード' },
          { name: 'アーキテクト' },
          { name: 'SRE' },
          { name: 'QAリード' },
        ],
      },
      {
        name: '業務ドメイン',
        tags: [
          { name: '金融（銀行・証券・保険）' },
          { name: 'EC・小売' },
          { name: '物流・サプライチェーン' },
          { name: '医療・ヘルスケア' },
          { name: '製造業' },
          { name: '広告・メディア' },
          { name: '公共・官公庁' },
          { name: '通信・ISP' },
          { name: 'ゲーム' },
          { name: 'SaaS・BtoB' },
          { name: 'HR・人材' },
          { name: '教育・EdTech' },
        ],
      },
    ],
  },
  {
    name: 'プログラミング言語',
    subCategories: [
      {
        name: 'バックエンド系',
        tags: [
          { name: 'Java' },
          { name: 'Kotlin' },
          { name: 'Go' },
          { name: 'Python' },
          { name: 'Ruby' },
          { name: 'PHP' },
          { name: 'C#' },
          { name: 'Scala' },
          { name: 'Rust' },
          { name: 'C / C++' },
          { name: 'Elixir' },
        ],
      },
      {
        name: 'フロントエンド系',
        tags: [{ name: 'TypeScript' }, { name: 'JavaScript' }],
      },
      {
        name: 'モバイル系',
        tags: [
          { name: 'Swift' },
          { name: 'Kotlin（Android）', note: 'Android固有として分ける場合' },
          { name: 'Dart', note: 'Flutter用' },
        ],
      },
      {
        name: 'データ・ML系',
        tags: [
          { name: 'Python（ML/DS）', note: 'ML/データサイエンス文脈' },
          { name: 'R' },
          { name: 'SQL' },
        ],
      },
      {
        name: 'インフラ・自動化系',
        tags: [{ name: 'Shell / Bash' }, { name: 'PowerShell' }],
      },
    ],
  },
  {
    name: 'フレームワーク（バックエンド）',
    subCategories: [
      {
        name: 'Java系',
        tags: [
          { name: 'Spring Boot' },
          { name: 'Spring Cloud' },
          { name: 'Jakarta EE (Java EE)' },
        ],
      },
      {
        name: 'Python系',
        tags: [{ name: 'Django' }, { name: 'FastAPI' }, { name: 'Flask' }],
      },
      {
        name: 'Ruby系',
        tags: [{ name: 'Ruby on Rails' }],
      },
      {
        name: 'PHP系',
        tags: [{ name: 'Laravel' }],
      },
      {
        name: 'Go系',
        tags: [{ name: 'Gin' }, { name: 'Echo' }],
      },
      {
        name: '.NET系',
        tags: [{ name: 'ASP.NET Core' }, { name: '.NET（MAUI / Blazor）' }],
      },
      {
        name: 'Node.js系',
        tags: [{ name: 'Express' }, { name: 'NestJS' }, { name: 'Hono' }],
      },
    ],
  },
  {
    name: 'フレームワーク（フロントエンド）',
    subCategories: [
      {
        name: 'React系',
        tags: [{ name: 'React' }, { name: 'Next.js' }, { name: 'Remix' }],
      },
      {
        name: 'Vue系',
        tags: [{ name: 'Vue.js' }, { name: 'Nuxt.js' }],
      },
      {
        name: 'その他',
        tags: [
          { name: 'Angular' },
          { name: 'Svelte / SvelteKit' },
          { name: 'Astro' },
        ],
      },
      {
        name: 'CSS/UI',
        tags: [
          { name: 'Tailwind CSS' },
          { name: 'Material UI (MUI)' },
          { name: 'Chakra UI' },
          { name: 'shadcn/ui' },
        ],
      },
    ],
  },
  {
    name: 'モバイル',
    subCategories: [
      {
        name: 'クロスプラットフォーム',
        tags: [
          { name: 'Flutter' },
          { name: 'React Native' },
          { name: 'Kotlin Multiplatform（KMP）' },
        ],
      },
      {
        name: 'ネイティブ',
        tags: [
          { name: 'SwiftUI / UIKit', note: 'iOS' },
          { name: 'Jetpack Compose', note: 'Android' },
        ],
      },
    ],
  },
  {
    name: 'クラウド',
    subCategories: [
      {
        name: 'AWS',
        tags: [
          { name: 'AWS（全般）' },
          { name: 'EC2' },
          { name: 'ECS / Fargate' },
          { name: 'Lambda' },
          { name: 'S3' },
          { name: 'RDS / Aurora' },
          { name: 'DynamoDB' },
          { name: 'CloudFront' },
          { name: 'API Gateway' },
          { name: 'SQS / SNS' },
          { name: 'Step Functions' },
          { name: 'EKS' },
          { name: 'Cognito' },
          { name: 'CloudWatch' },
          { name: 'IAM' },
          { name: 'VPC設計' },
          { name: 'CDK / CloudFormation' },
        ],
      },
      {
        name: 'GCP',
        tags: [
          { name: 'GCP（全般）' },
          { name: 'Cloud Run' },
          { name: 'GKE' },
          { name: 'BigQuery' },
          { name: 'Cloud Functions' },
          { name: 'Cloud Storage' },
          { name: 'Pub/Sub' },
          { name: 'Firebase' },
        ],
      },
      {
        name: 'Azure',
        tags: [
          { name: 'Azure（全般）' },
          { name: 'Azure App Service' },
          { name: 'Azure Functions' },
          { name: 'Azure Kubernetes Service（AKS）' },
          { name: 'Azure DevOps' },
          { name: 'Cosmos DB' },
          { name: 'Azure AD / Entra ID' },
        ],
      },
    ],
  },
  {
    name: 'コンテナ・オーケストレーション',
    subCategories: [
      {
        name: 'コンテナ・オーケストレーション',
        tags: [
          { name: 'Docker' },
          { name: 'Kubernetes' },
          { name: 'Helm' },
          { name: 'Istio / Envoy', note: 'サービスメッシュ' },
          { name: 'ArgoCD' },
        ],
      },
    ],
  },
  {
    name: 'IaC・構成管理',
    subCategories: [
      {
        name: 'IaC・構成管理',
        tags: [
          { name: 'Terraform' },
          { name: 'Pulumi' },
          { name: 'Ansible' },
          { name: 'AWS CDK' },
          { name: 'CloudFormation' },
        ],
      },
    ],
  },
  {
    name: 'CI/CD',
    subCategories: [
      {
        name: 'CI/CD',
        tags: [
          { name: 'GitHub Actions' },
          { name: 'GitLab CI/CD' },
          { name: 'Jenkins' },
          { name: 'CircleCI' },
          { name: 'AWS CodePipeline / CodeBuild' },
          { name: 'ArgoCD', note: 'GitOps' },
          { name: 'Spinnaker' },
        ],
      },
    ],
  },
  {
    name: '監視・オブザーバビリティ',
    subCategories: [
      {
        name: 'APM・エラー監視',
        tags: [
          { name: 'Datadog' },
          { name: 'New Relic' },
          { name: 'Sentry' },
          { name: 'PagerDuty' },
        ],
      },
      {
        name: 'ログ・メトリクス',
        tags: [
          { name: 'Prometheus' },
          { name: 'Grafana' },
          {
            name: 'ELK Stack（Elasticsearch / Logstash / Kibana）',
          },
          { name: 'Fluentd / Fluent Bit' },
          { name: 'OpenTelemetry' },
        ],
      },
      {
        name: 'クラウドネイティブ',
        tags: [
          { name: 'CloudWatch（AWS）' },
          { name: 'Cloud Monitoring（GCP）' },
          { name: 'Azure Monitor' },
        ],
      },
    ],
  },
  {
    name: 'データベース',
    subCategories: [
      {
        name: 'RDBMS',
        tags: [
          { name: 'PostgreSQL' },
          { name: 'MySQL' },
          { name: 'Oracle Database' },
          { name: 'SQL Server' },
          { name: 'Aurora（AWS）' },
          { name: 'Cloud SQL（GCP）' },
        ],
      },
      {
        name: 'NoSQL',
        tags: [
          { name: 'MongoDB' },
          { name: 'DynamoDB' },
          { name: 'Redis' },
          { name: 'Cassandra' },
          { name: 'Firestore' },
        ],
      },
      {
        name: '検索エンジン',
        tags: [
          { name: 'Elasticsearch' },
          { name: 'OpenSearch' },
          { name: 'Algolia' },
        ],
      },
      {
        name: 'データウェアハウス',
        tags: [
          { name: 'BigQuery' },
          { name: 'Redshift' },
          { name: 'Snowflake' },
        ],
      },
    ],
  },
  {
    name: 'メッセージング・ストリーミング',
    subCategories: [
      {
        name: 'メッセージング・ストリーミング',
        tags: [
          { name: 'Apache Kafka' },
          { name: 'RabbitMQ' },
          { name: 'Amazon SQS / SNS' },
          { name: 'Google Pub/Sub' },
          { name: 'Amazon Kinesis' },
          { name: 'Apache Flink' },
        ],
      },
    ],
  },
  {
    name: '認証・認可・セキュリティ',
    subCategories: [
      {
        name: '認証基盤',
        tags: [
          { name: 'OAuth 2.0 / OIDC' },
          { name: 'SAML' },
          { name: 'Auth0 / Okta' },
          { name: 'AWS Cognito' },
          { name: 'Firebase Authentication' },
          { name: 'Keycloak' },
        ],
      },
      {
        name: 'セキュリティ',
        tags: [
          { name: 'WAF運用' },
          { name: '脆弱性診断（DAST/SAST）' },
          { name: 'OWASP Top 10対応' },
          { name: 'SOC2 / ISMS対応' },
          { name: 'ゼロトラストアーキテクチャ' },
          { name: 'HashiCorp Vault', note: 'シークレット管理' },
        ],
      },
    ],
  },
  {
    name: 'API・アーキテクチャ',
    subCategories: [
      {
        name: 'API設計',
        tags: [
          { name: 'REST API設計' },
          { name: 'GraphQL' },
          { name: 'gRPC' },
          { name: 'OpenAPI (Swagger)' },
        ],
      },
      {
        name: 'アーキテクチャ',
        tags: [
          { name: 'マイクロサービス設計' },
          { name: 'モノリス→マイクロサービス移行' },
          { name: 'イベント駆動アーキテクチャ' },
          { name: 'DDD（ドメイン駆動設計）' },
          { name: 'CQRS / Event Sourcing' },
          { name: 'サーバーレスアーキテクチャ' },
        ],
      },
    ],
  },
  {
    name: 'テスト・品質',
    subCategories: [
      {
        name: 'テストツール',
        tags: [
          { name: 'JUnit / Mockito', note: 'Java系' },
          { name: 'pytest', note: 'Python系' },
          { name: 'Jest / Vitest', note: 'JS/TS系' },
          { name: 'Playwright', note: 'E2Eテスト' },
          { name: 'Cypress', note: 'E2Eテスト' },
          { name: 'Selenium' },
          { name: 'k6 / JMeter / Locust', note: '負荷テスト' },
        ],
      },
      {
        name: '品質管理',
        tags: [
          { name: 'SonarQube' },
          { name: 'テスト自動化戦略' },
          { name: 'CI組込みテスト設計' },
        ],
      },
    ],
  },
  {
    name: 'バージョン管理・コラボレーション',
    subCategories: [
      {
        name: 'バージョン管理・コラボレーション',
        tags: [
          { name: 'Git' },
          { name: 'GitHub' },
          { name: 'GitLab' },
          { name: 'Bitbucket' },
          { name: 'GitHub Copilot' },
        ],
      },
    ],
  },
  {
    name: 'データ・ML・AI',
    subCategories: [
      {
        name: 'ML/DL',
        tags: [
          { name: 'TensorFlow' },
          { name: 'PyTorch' },
          { name: 'scikit-learn' },
          { name: 'Hugging Face Transformers' },
        ],
      },
      {
        name: 'MLOps',
        tags: [{ name: 'MLflow' }],
      },
    ],
  },
]
