/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-feature-imports',
      comment: 'features間の直接依存は禁止。shared経由で連携する。',
      severity: 'warn',
      from: { path: '^src/features/([^/]+)/' },
      to: {
        path: '^src/features/([^/]+)/',
        pathNot: '^src/features/$1/',
      },
    },
    {
      name: 'no-shared-to-features',
      comment: 'sharedはfeaturesに依存しない。',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/features/' },
    },
    {
      name: 'no-infrastructure-to-features',
      comment: 'infrastructureはfeaturesに依存しない。',
      severity: 'error',
      from: { path: '^src/infrastructure/' },
      to: { path: '^src/features/' },
    },
    {
      name: 'no-lib-to-app-layers',
      comment: 'libはアプリケーションレイヤーに依存しない。',
      severity: 'error',
      from: { path: '^src/lib/' },
      to: { path: '^src/(features|shared|stores|infrastructure)/' },
    },
    {
      name: 'no-stores-to-features',
      comment: 'storesはfeaturesに依存しない。',
      severity: 'error',
      from: { path: '^src/stores/' },
      to: { path: '^src/features/' },
    },
    {
      name: 'no-circular',
      comment: '循環依存は禁止。',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.app.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/(?:@[^/]+/[^/]+|[^/]+)',
      },
    },
  },
}
