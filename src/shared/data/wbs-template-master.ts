import type { WbsTemplateNode } from '@/shared/types/wbs-template'
import { DOC_TEMPLATE_IDS } from './document-template-master'

/**
 * 標準WBSテンプレートのマスタデータ。`completionCriteria`（完了条件）を軸に、
 * 一般的なシステム開発ライフサイクル（要求整理〜リリースまで）の標準工程を表す。
 * 各工程は、IPA共通フレーム（SLCP-JCF）・IPA非機能要求グレードで整理されている
 * 標準的な成果物（要件定義書/基本設計書/詳細設計書等の目次構成）を軸に、
 * 作成が想定されるドキュメント単位まで子ノードへ分解している（2026-08-13の依頼により拡充。
 * ソフトウェア開発分析データ集2022は定量メトリクス集であり成果物一覧を持たないため、
 * 共通フレームおよびそれに準拠した実務資料を参照した）。
 * 子を持つノード（UT/ITa/ITb/負荷試験）は「方針/計画/実施/報告」の4点セットで統一し、
 * 親ノード自体は完了条件を持たない（配下の完了フラグからロールアップ集計されるため）。
 *
 * 2026-08-16: 各ノードに`documentTemplateIds`で標準ドキュメント
 * テンプレート（`document-template-master.ts`、固定UUID）を紐づけた。また共通フレームの
 * 運用プロセスに対応する「運用設計」工程を補完した。
 *
 * `tech-tag-master.ts`と同じ位置づけのシードデータ。`stores/wbs-template-store.ts`が
 * 初回シード時にそのまま1件のWbsTemplateとして保存する（stores→featuresの依存を避けるため、
 * features配下ではなくshared/data配下に置く。依存方向ルール遵守）。
 */
interface TestPhaseDocLinks {
  policy?: string[]
  plan?: string[]
  execution?: string[]
  report?: string[]
}

function testPhaseChildren(
  label: string,
  docLinks: TestPhaseDocLinks = {},
): WbsTemplateNode[] {
  return [
    {
      name: `${label}方針`,
      completionCriteria: `${label}実施方針書が承認されている`,
      documentTemplateIds: docLinks.policy,
    },
    {
      name: `${label}計画`,
      completionCriteria: `${label}実施計画書（体制・スケジュール含む）が承認されている`,
      documentTemplateIds: docLinks.plan,
    },
    {
      name: `${label}実施`,
      completionCriteria: '全テストケースを実施し、結果を記録している',
      documentTemplateIds: docLinks.execution,
    },
    {
      name: `${label}報告`,
      completionCriteria: `${label}結果報告書が提出されている`,
      documentTemplateIds: docLinks.report,
    },
  ]
}

/**
 * 標準WBSテンプレート。要求整理〜リリースまでの一般的なシステム開発ライフサイクルを表す。
 * UT/ITa/ITb（単体・結合テストA/B）に加え、IPA非機能要求グレード・共通フレームの観点から
 * 負荷試験・セキュリティ試験・移行・運用設計・リリース判定を補完している。
 */
export const STANDARD_WBS_TEMPLATE: WbsTemplateNode[] = [
  {
    name: '要求整理',
    children: [
      {
        name: '要求一覧',
        completionCriteria:
          'システム化の目的・背景・狙いを整理した要求一覧が文書化され、顧客の合意を得ている',
        documentTemplateIds: [DOC_TEMPLATE_IDS.requestList],
      },
      {
        name: 'RFP（提案依頼書）／提案書',
        completionCriteria: 'RFP（提案依頼書）または提案書が確定している',
        documentTemplateIds: [DOC_TEMPLATE_IDS.rfp],
      },
    ],
  },
  {
    name: '要件定義',
    children: [
      {
        name: '業務要件定義書',
        completionCriteria:
          '業務機能構成表・ビジネスプロセスフロー・システム化業務フロー・業務処理定義書がレビュー・承認されている',
        documentTemplateIds: [DOC_TEMPLATE_IDS.businessRequirements],
      },
      {
        name: '機能要件定義書',
        completionCriteria:
          'システム方式（ハードウェア/ソフトウェア/ネットワーク構成）・画面要件・帳票要件・バッチ要件・テーブル/ファイル要件・外部インターフェース要件がレビュー・承認されている',
        documentTemplateIds: [DOC_TEMPLATE_IDS.functionalRequirements],
      },
      {
        name: '非機能要件定義書',
        completionCriteria:
          '可用性・性能拡張性・運用保守性・移行性・セキュリティ・システム環境エコロジーの6区分（IPA非機能要求グレード準拠）がレビュー・承認されている',
        documentTemplateIds: [DOC_TEMPLATE_IDS.nonFunctionalRequirements],
      },
    ],
  },
  {
    name: '基本設計',
    children: [
      {
        name: 'システム方式設計書',
        completionCriteria:
          'ハードウェア構成図・ソフトウェア構成図・ネットワーク構成図・アプリケーション機能構成図がレビュー・承認されている',
        documentTemplateIds: [DOC_TEMPLATE_IDS.systemArchitectureDesign],
      },
      {
        name: '画面設計書',
        completionCriteria:
          '画面一覧・画面遷移図・画面レイアウト・画面入出力項目一覧・画面アクション定義がレビュー・承認されている',
        documentTemplateIds: [DOC_TEMPLATE_IDS.screenDesign],
      },
      {
        name: '帳票設計書',
        completionCriteria:
          '帳票一覧・帳票レイアウト・帳票出力項目一覧・帳票編集定義がレビュー・承認されている',
        documentTemplateIds: [DOC_TEMPLATE_IDS.reportDesign],
      },
      {
        name: 'バッチ設計書',
        completionCriteria:
          'バッチ処理一覧・バッチ処理フロー・バッチ処理定義がレビュー・承認されている',
        documentTemplateIds: [DOC_TEMPLATE_IDS.batchDesign],
      },
      {
        name: 'データベース設計書',
        completionCriteria:
          'テーブル関連図・テーブル/ファイル一覧・テーブル/ファイル定義・CRUD図がレビュー・承認されている',
        documentTemplateIds: [DOC_TEMPLATE_IDS.databaseDesign],
      },
      {
        name: '外部インターフェース設計書',
        completionCriteria:
          '外部システム関連図・外部インターフェース一覧・外部インターフェース定義書・処理概要がレビュー・承認されている',
        documentTemplateIds: [DOC_TEMPLATE_IDS.externalInterfaceDesign],
      },
      {
        name: '結合テスト計画書',
        completionCriteria: '結合テスト計画書がレビュー・承認されている',
        documentTemplateIds: [DOC_TEMPLATE_IDS.integrationTestPlan],
      },
    ],
  },
  {
    name: '詳細設計',
    children: [
      {
        name: '詳細設計書',
        completionCriteria:
          'クラス図・モジュール構造図・アクティビティ図・シーケンス図・IPO（処理機能記述）がレビュー・承認されている',
        documentTemplateIds: [DOC_TEMPLATE_IDS.detailedDesign],
      },
      {
        name: '開発方針書',
        completionCriteria:
          '開発ライブラリ・コーディング規約を定めた開発方針書が承認されている',
        documentTemplateIds: [DOC_TEMPLATE_IDS.developmentPolicy],
      },
      {
        name: '単体テスト計画書',
        completionCriteria:
          '単体テスト計画書・単体テスト用データが準備されている',
        documentTemplateIds: [DOC_TEMPLATE_IDS.unitTestPlan],
      },
    ],
  },
  {
    name: '実装',
    children: [
      {
        name: 'プログラムソースコード',
        completionCriteria:
          '全モジュールのコーディングが完了し、コードレビューを通過している',
        documentTemplateIds: [DOC_TEMPLATE_IDS.developmentPolicy],
      },
      {
        name: '結合テスト用環境・データ準備',
        completionCriteria: '結合テスト用の環境・データが準備されている',
      },
      {
        name: '本番稼働環境構築',
        completionCriteria: '本番稼働環境の構築が完了している',
      },
    ],
  },
  {
    name: 'UT（単体テスト）',
    children: testPhaseChildren('UT', {
      policy: [DOC_TEMPLATE_IDS.testPolicy],
      plan: [DOC_TEMPLATE_IDS.unitTestPlan],
      execution: [DOC_TEMPLATE_IDS.unitTestSpec],
      report: [DOC_TEMPLATE_IDS.unitTestReport],
    }),
  },
  {
    name: 'ITa（結合テストA）',
    children: testPhaseChildren('ITa', {
      policy: [DOC_TEMPLATE_IDS.testPolicy],
      plan: [DOC_TEMPLATE_IDS.integrationTestPlan],
      execution: [DOC_TEMPLATE_IDS.integrationTestSpec],
      report: [DOC_TEMPLATE_IDS.integrationTestReport],
    }),
  },
  {
    name: 'ITb（結合テストB）',
    children: testPhaseChildren('ITb', {
      policy: [DOC_TEMPLATE_IDS.testPolicy],
      plan: [DOC_TEMPLATE_IDS.integrationTestPlan],
      execution: [DOC_TEMPLATE_IDS.integrationTestSpec],
      report: [DOC_TEMPLATE_IDS.integrationTestReport],
    }),
  },
  {
    name: '負荷試験（性能テスト）',
    children: testPhaseChildren('負荷試験', {
      policy: [DOC_TEMPLATE_IDS.testPolicy],
      plan: [DOC_TEMPLATE_IDS.performanceTestPlan],
      report: [DOC_TEMPLATE_IDS.performanceTestReport],
    }),
  },
  {
    name: 'セキュリティ試験',
    completionCriteria: '脆弱性診断を実施し、重大な指摘事項が解消されている',
    documentTemplateIds: [
      DOC_TEMPLATE_IDS.securityTestPlan,
      DOC_TEMPLATE_IDS.securityTestReport,
    ],
  },
  {
    name: 'システムテスト',
    completionCriteria: '全テストケースを実施し、重大な不具合が0件である',
    documentTemplateIds: [DOC_TEMPLATE_IDS.systemTestPlan],
  },
  {
    name: '受け入れテスト',
    children: [
      {
        name: '受入テスト計画書',
        completionCriteria: '受入テスト計画書が顧客の承認を得ている',
        documentTemplateIds: [DOC_TEMPLATE_IDS.acceptanceTestPlan],
      },
      {
        name: '検収書（受入テスト結果報告書）',
        completionCriteria:
          '検収書（受入テスト結果報告書）を顧客から受領している',
        documentTemplateIds: [DOC_TEMPLATE_IDS.acceptanceTestReport],
      },
    ],
  },
  {
    name: '移行（本番移行・切替）',
    children: [
      {
        name: '移行計画書',
        completionCriteria:
          '移行計画書（移行方式・移行スケジュール・切り戻し手順を含む）が承認されている',
        documentTemplateIds: [
          DOC_TEMPLATE_IDS.dataMigrationPlan,
          DOC_TEMPLATE_IDS.businessMigrationPlan,
        ],
      },
      {
        name: '操作マニュアル・業務運用マニュアル',
        completionCriteria:
          '操作マニュアル・業務運用マニュアルが整備されている',
        documentTemplateIds: [DOC_TEMPLATE_IDS.businessMigrationPlan],
      },
      {
        name: '移行リハーサル結果報告書',
        completionCriteria:
          '移行リハーサルを実施し、結果報告書が提出されている',
        documentTemplateIds: [DOC_TEMPLATE_IDS.migrationRehearsalReport],
      },
      {
        name: '本番移行実施',
        completionCriteria:
          '本番移行・切替作業が完了し、新システムでの稼働を確認している',
        documentTemplateIds: [DOC_TEMPLATE_IDS.migrationRehearsalReport],
      },
    ],
  },
  {
    name: '運用設計',
    children: [
      {
        name: '運用設計書',
        completionCriteria:
          '運用設計書（日常運用・監視・バックアップ/リストア・障害対応・セキュリティ運用を含む）がレビュー・承認されている',
        documentTemplateIds: [DOC_TEMPLATE_IDS.operationDesign],
      },
    ],
  },
  {
    name: 'リリース判定',
    children: [
      {
        name: 'リリース判定資料',
        completionCriteria:
          'リリース判定会議用の資料（品質状況・残課題一覧含む）が準備されている',
        documentTemplateIds: [DOC_TEMPLATE_IDS.releaseJudgementChecklist],
      },
      {
        name: 'プロジェクト完了報告書',
        completionCriteria:
          'プロジェクト完了報告書が提出され、リリースが承認されている',
        documentTemplateIds: [DOC_TEMPLATE_IDS.projectCompletionReport],
      },
    ],
  },
]
