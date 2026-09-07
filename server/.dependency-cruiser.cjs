/**
 * server/ の依存方向ルール。
 * server/ は ../src/shared/* 以外の src/ 配下（features/stores/infrastructure等）へ
 * アクセスしてはならない（非公開の設計文書）。
 */
// 本設定は server/ をカレントディレクトリとして実行する想定（npm --prefix server run depcruise）。
// そのため親プロジェクトの src/ は相対パス ../src/... として観測される。
module.exports = {
  forbidden: [
    {
      name: 'server-no-access-to-src-non-shared',
      comment:
        'server/ は ../src/shared/types, ../src/shared/utils 以外の src/ 配下に依存してはならない',
      severity: 'error',
      from: { path: '^src' },
      to: {
        path: '^\\.\\./src/(?!shared/(types|utils)(/|$))',
      },
    },
    {
      name: 'no-circular',
      comment: '循環依存は禁止',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
}
