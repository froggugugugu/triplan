/**
 * デモデータ: メンバー定義（28名）
 *
 * SES/受託開発会社の組織構成。
 * tagNames は MASTER_DATA のタグ名と完全一致させること。
 */

export interface DemoMemberProfile {
  name: string
  role: string
  sectionKey: string
  domain: 'frontend' | 'backend' | 'infra' | 'mobile' | 'data' | 'management'
  tagNames: string[]
  unitPrice: number
}

/** 組織構成 */
export const DEMO_DIVISIONS = [
  { key: 'tech-solutions', name: 'テクノロジーソリューション事業部' },
  { key: 'digital-innovation', name: 'デジタルイノベーション事業部' },
] as const

export const DEMO_SECTIONS = [
  { key: 'dev1', divisionKey: 'tech-solutions', name: 'システム開発1課' },
  { key: 'dev2', divisionKey: 'tech-solutions', name: 'システム開発2課' },
  {
    key: 'infra',
    divisionKey: 'tech-solutions',
    name: 'インフラソリューション課',
  },
  {
    key: 'webapp',
    divisionKey: 'digital-innovation',
    name: 'Webアプリケーション課',
  },
  { key: 'mobile', divisionKey: 'digital-innovation', name: 'モバイル開発課' },
  {
    key: 'data-science',
    divisionKey: 'digital-innovation',
    name: 'データサイエンス課',
  },
] as const

/** メンバー定義（28名） */
export const DEMO_MEMBERS: DemoMemberProfile[] = [
  // ── 管理職（4名）──
  {
    name: '山田 太郎',
    role: 'PM',
    sectionKey: 'dev1',
    domain: 'management',
    tagNames: [
      'プロジェクトマネジメント（PM）',
      'EC・小売',
      'Java',
      'Spring Boot',
    ],
    unitPrice: 130,
  },
  {
    name: '鈴木 花子',
    role: 'EM',
    sectionKey: 'webapp',
    domain: 'management',
    tagNames: [
      'エンジニアリングマネジメント（EM）',
      'TypeScript',
      'React',
      'Next.js',
    ],
    unitPrice: 120,
  },
  {
    name: '高橋 健一',
    role: 'PdM',
    sectionKey: 'dev2',
    domain: 'management',
    tagNames: [
      'プロダクトマネジメント（PdM）',
      '金融（銀行・証券・保険）',
      'SaaS・BtoB',
    ],
    unitPrice: 120,
  },
  {
    name: '田中 美咲',
    role: 'テックリード',
    sectionKey: 'infra',
    domain: 'management',
    tagNames: [
      'テックリード',
      'SRE',
      'AWS（全般）',
      'Terraform',
      'Docker',
      'Kubernetes',
    ],
    unitPrice: 125,
  },

  // ── フロントエンド（5名）──
  {
    name: '伊藤 翔太',
    role: 'シニアエンジニア',
    sectionKey: 'webapp',
    domain: 'frontend',
    tagNames: [
      'TypeScript',
      'React',
      'Next.js',
      'Tailwind CSS',
      'Jest / Vitest',
      'GitHub Actions',
    ],
    unitPrice: 95,
  },
  {
    name: '渡辺 優子',
    role: 'エンジニア',
    sectionKey: 'webapp',
    domain: 'frontend',
    tagNames: ['TypeScript', 'React', 'Vue.js', 'Tailwind CSS', 'Playwright'],
    unitPrice: 80,
  },
  {
    name: '中村 大輝',
    role: 'エンジニア',
    sectionKey: 'webapp',
    domain: 'frontend',
    tagNames: ['TypeScript', 'JavaScript', 'React', 'Next.js', 'shadcn/ui'],
    unitPrice: 75,
  },
  {
    name: '小林 真央',
    role: 'エンジニア',
    sectionKey: 'dev1',
    domain: 'frontend',
    tagNames: [
      'TypeScript',
      'React',
      'Angular',
      'Material UI (MUI)',
      'REST API設計',
    ],
    unitPrice: 75,
  },
  {
    name: '加藤 莉子',
    role: 'エンジニア',
    sectionKey: 'dev1',
    domain: 'frontend',
    tagNames: ['TypeScript', 'Vue.js', 'Nuxt.js', 'Tailwind CSS', 'Cypress'],
    unitPrice: 70,
  },

  // ── バックエンド（7名）──
  {
    name: '吉田 和也',
    role: 'シニアエンジニア',
    sectionKey: 'dev1',
    domain: 'backend',
    tagNames: [
      'Java',
      'Spring Boot',
      'PostgreSQL',
      'Docker',
      'AWS（全般）',
      'REST API設計',
      'マイクロサービス設計',
    ],
    unitPrice: 100,
  },
  {
    name: '佐藤 啓介',
    role: 'シニアエンジニア',
    sectionKey: 'dev2',
    domain: 'backend',
    tagNames: [
      'Java',
      'Spring Boot',
      'Oracle Database',
      'MySQL',
      '金融（銀行・証券・保険）',
      'DDD（ドメイン駆動設計）',
    ],
    unitPrice: 100,
  },
  {
    name: '松本 直樹',
    role: 'エンジニア',
    sectionKey: 'dev1',
    domain: 'backend',
    tagNames: [
      'Python',
      'FastAPI',
      'PostgreSQL',
      'Docker',
      'GitHub Actions',
      'REST API設計',
    ],
    unitPrice: 85,
  },
  {
    name: '井上 悠斗',
    role: 'エンジニア',
    sectionKey: 'dev2',
    domain: 'backend',
    tagNames: ['Go', 'Gin', 'PostgreSQL', 'Redis', 'gRPC', 'Docker'],
    unitPrice: 85,
  },
  {
    name: '木村 さくら',
    role: 'エンジニア',
    sectionKey: 'dev2',
    domain: 'backend',
    tagNames: ['Java', 'Spring Boot', 'MySQL', 'RabbitMQ', 'JUnit / Mockito'],
    unitPrice: 80,
  },
  {
    name: '林 拓海',
    role: 'エンジニア',
    sectionKey: 'dev1',
    domain: 'backend',
    tagNames: [
      'TypeScript',
      'NestJS',
      'PostgreSQL',
      'Redis',
      'GraphQL',
      'Docker',
    ],
    unitPrice: 80,
  },
  {
    name: '清水 遥',
    role: 'エンジニア',
    sectionKey: 'dev2',
    domain: 'backend',
    tagNames: ['Python', 'Django', 'PostgreSQL', 'AWS（全般）', 'SaaS・BtoB'],
    unitPrice: 75,
  },

  // ── インフラ（4名）──
  {
    name: '山口 慎太郎',
    role: 'SRE',
    sectionKey: 'infra',
    domain: 'infra',
    tagNames: [
      'AWS（全般）',
      'ECS / Fargate',
      'Terraform',
      'Docker',
      'Kubernetes',
      'Datadog',
      'GitHub Actions',
    ],
    unitPrice: 100,
  },
  {
    name: '斎藤 あかり',
    role: 'エンジニア',
    sectionKey: 'infra',
    domain: 'infra',
    tagNames: [
      'AWS（全般）',
      'Lambda',
      'CloudFront',
      'CDK / CloudFormation',
      'Shell / Bash',
      'Prometheus',
      'Grafana',
    ],
    unitPrice: 85,
  },
  {
    name: '前田 隆志',
    role: 'エンジニア',
    sectionKey: 'infra',
    domain: 'infra',
    tagNames: [
      'GCP（全般）',
      'Cloud Run',
      'GKE',
      'Terraform',
      'Docker',
      'Kubernetes',
      'ArgoCD',
    ],
    unitPrice: 85,
  },
  {
    name: '藤田 凛',
    role: 'エンジニア',
    sectionKey: 'infra',
    domain: 'infra',
    tagNames: [
      'AWS（全般）',
      'VPC設計',
      'IAM',
      'WAF運用',
      'Ansible',
      'Jenkins',
    ],
    unitPrice: 80,
  },

  // ── モバイル（4名）──
  {
    name: '岡田 陸',
    role: 'シニアエンジニア',
    sectionKey: 'mobile',
    domain: 'mobile',
    tagNames: [
      'Swift',
      'SwiftUI / UIKit',
      'Kotlin（Android）',
      'Jetpack Compose',
      'Firebase',
      'REST API設計',
    ],
    unitPrice: 95,
  },
  {
    name: '後藤 菜々美',
    role: 'エンジニア',
    sectionKey: 'mobile',
    domain: 'mobile',
    tagNames: ['Dart', 'Flutter', 'Firebase', 'REST API設計', 'Git'],
    unitPrice: 80,
  },
  {
    name: '村上 蓮',
    role: 'エンジニア',
    sectionKey: 'mobile',
    domain: 'mobile',
    tagNames: [
      'Kotlin（Android）',
      'Jetpack Compose',
      'Firebase',
      'GitHub Actions',
    ],
    unitPrice: 75,
  },
  {
    name: '近藤 結衣',
    role: 'エンジニア',
    sectionKey: 'mobile',
    domain: 'mobile',
    tagNames: ['Swift', 'SwiftUI / UIKit', 'React Native', 'TypeScript'],
    unitPrice: 75,
  },

  // ── データ（4名）──
  {
    name: '石井 大地',
    role: 'シニアエンジニア',
    sectionKey: 'data-science',
    domain: 'data',
    tagNames: [
      'Python（ML/DS）',
      'PyTorch',
      'BigQuery',
      'scikit-learn',
      'Docker',
      'MLflow',
    ],
    unitPrice: 100,
  },
  {
    name: '三浦 ひなた',
    role: 'エンジニア',
    sectionKey: 'data-science',
    domain: 'data',
    tagNames: [
      'Python（ML/DS）',
      'TensorFlow',
      'SQL',
      'BigQuery',
      'Hugging Face Transformers',
    ],
    unitPrice: 85,
  },
  {
    name: '原田 一輝',
    role: 'エンジニア',
    sectionKey: 'data-science',
    domain: 'data',
    tagNames: [
      'Python',
      'SQL',
      'BigQuery',
      'Redshift',
      'Apache Kafka',
      'Datadog',
    ],
    unitPrice: 80,
  },
  {
    name: '小川 彩花',
    role: 'エンジニア',
    sectionKey: 'data-science',
    domain: 'data',
    tagNames: [
      'Python（ML/DS）',
      'R',
      'SQL',
      'BigQuery',
      'scikit-learn',
      'Grafana',
    ],
    unitPrice: 75,
  },
]
