/** Architecture rules for the Raven backend.
 *  Encodes the audit findings as enforceable lint rules.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make refactoring risky and tests brittle.',
      from: {},
      to: { circular: true }
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Files not reachable from any entry point — dead code candidates.',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts)$',
          '\\.d\\.ts$',
          '(^|/)tsconfig\\.json$',
          '(^|/)package\\.json$',
          '__tests__/',
          '\\.test\\.(js|ts)$',
          '\\.spec\\.(js|ts)$',
          'migrations/',
          'scripts/',
          'test-shims/'
        ]
      },
      to: {}
    },
    {
      name: 'no-deprecated-core',
      comment: "Don't reach into Node's deprecated modules.",
      severity: 'warn',
      from: {},
      to: { dependencyTypes: ['core'], path: ['^punycode$', '^domain$', '^constants$'] }
    },
    {
      name: 'no-non-package-json-deps',
      severity: 'error',
      comment: 'A dependency is used but not declared in package.json.',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] }
    },
    {
      name: 'not-to-test',
      comment: 'Production code must not import from test files.',
      severity: 'error',
      from: { pathNot: ['__tests__/', '\\.test\\.(js|ts)$', '\\.spec\\.(js|ts)$'] },
      to: { path: ['__tests__/', '\\.test\\.(js|ts)$', '\\.spec\\.(js|ts)$'] }
    },
    {
      name: 'no-raw-sql-in-routes',
      severity: 'error',
      // NOTE: depcruise can only flag imports. Direct `db.db.prepare()` / `db.db.exec()`
      // calls via the RavenDB connection still slip through here; the ESLint rule
      // `no-restricted-syntax` in eslint.config.js targets that syntactic pattern.
      comment:
        'Route handlers must go through services or repositories — raw better-sqlite3 imports in routes/ are forbidden.',
      from: { path: '^routes/' },
      to: { path: '^node_modules/better-sqlite3' }
    },
    {
      name: 'better-sqlite3-only-in-data-layer',
      severity: 'error',
      comment:
        'Direct better-sqlite3 imports are restricted to db.ts, database/, and repositories/. Other modules go through these.',
      from: {
        pathNot: [
          '^db\\.ts$',
          '^database/',
          '^repositories/',
          '^scripts/',
          '^migrations/',
          '^run-migrations\\.js$'
        ]
      },
      to: { path: '^node_modules/better-sqlite3' }
    },
    {
      name: 'routes-not-coupled',
      severity: 'warn',
      comment: 'Route modules should not import each other — share via services/ or modules/.',
      from: { path: '^routes/[^/]+\\.(ts|js)$' },
      to: { path: '^routes/' }
    },
    {
      name: 'middleware-no-routes',
      severity: 'error',
      comment: 'Middleware is a lower layer than routes — it must not import from routes/.',
      from: { path: '^middleware/' },
      to: { path: '^routes/' }
    },
    {
      name: 'utils-pure',
      severity: 'warn',
      comment: 'utils/ should be leaf-level — no imports from services, routes, or middleware.',
      from: { path: '^utils/' },
      to: { path: '^(services|routes|middleware)/' }
    }
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: ['node_modules/', 'dist/', '__tests__/', 'tests/', 'test-shims/', 'logs/']
    },
    includeOnly:
      '^(server\\.ts|db\\.ts|routes/|services/|modules/|middleware/|utils/|config/|database/|types/|scripts/|migrations/|run-migrations\\.js|healthcheck\\.js)',
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      mainFields: ['main', 'types']
    },
    reporterOptions: {
      text: { highlightFocused: true }
    }
  }
};
