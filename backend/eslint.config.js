import prettierConfig from 'eslint-config-prettier';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.config.js']
  },
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      semi: ['error', 'always'],
      quotes: ['error', 'single', { avoidEscape: true }],
      indent: ['error', 2],
      'comma-dangle': ['error', 'never'],
      'eol-last': ['error', 'always']
    }
  },
  {
    // TS-specific: the plain JS `no-unused-vars` rule doesn't understand TS
    // interface declarations — every unused param in an interface fires a
    // warning. Use the TS-aware variant which ignores declaration-only
    // contexts. Block must come AFTER the general block so its overrides win.
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
      ]
    }
  },
  {
    // CLI scripts use console as their primary user-facing output. Don't
    // flag console statements there.
    files: ['scripts/**/*.{ts,js}', 'migrations/**/*.{ts,js}'],
    rules: {
      'no-console': 'off'
    }
  },
  {
    // Routes must go through repositories — flag direct SQL via db.db.{prepare,exec,transaction}.
    // Complements the dependency-cruiser `no-raw-sql-in-routes` rule, which only blocks the
    // `import 'better-sqlite3'` form. Existing offenders are baselined; new code is blocked.
    files: ['routes/**/*.ts', 'routes/**/*.js'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            "MemberExpression[object.object.name='db'][object.property.name='db'][property.name=/^(prepare|exec|transaction)$/]",
          message:
            'Routes must not run SQL directly — add a method to the appropriate repository in repositories/ instead.'
        }
      ]
    }
  },
  prettierConfig
];
