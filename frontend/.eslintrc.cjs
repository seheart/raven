module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true
  },
  extends: [
    'eslint:recommended',
    'plugin:svelte/recommended',
    'prettier'
  ],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
    extraFileExtensions: ['.svelte']
  },
  rules: {
    // ===== CRITICAL RULES =====
    
    // No console.log in production (error level)
    'no-console': ['error', { 
      allow: ['warn', 'error'] // Allow console.warn and console.error
    }],
    
    // No unused variables (catch unused imports)
    'no-unused-vars': ['error', { 
      vars: 'all',
      args: 'after-used',
      ignoreRestSiblings: true,
      argsIgnorePattern: '^_' // Allow _unused
    }],
    
    // No debugger statements
    'no-debugger': 'error',
    
    // ===== CODE QUALITY RULES =====
    
    // No undefined variables
    'no-undef': 'error',
    
    // No unreachable code
    'no-unreachable': 'error',
    
    // Require async functions to have await
    'require-await': 'warn',
    
    // No empty blocks
    'no-empty': ['error', { allowEmptyCatch: true }],
    
    // No constant conditions (while(true), if(false))
    'no-constant-condition': 'warn',
    
    // Prefer const over let when variable is never reassigned
    'prefer-const': 'warn',
    
    // No var declarations (use let/const)
    'no-var': 'error',
    
    // Require === instead of ==
    'eqeqeq': ['error', 'always', { null: 'ignore' }],
    
    // No duplicate imports
    'no-duplicate-imports': 'error',
    
    // ===== BEST PRACTICES =====
    
    // Warn about TODO/FIXME comments
    'no-warning-comments': ['warn', { 
      terms: ['TODO', 'FIXME', 'XXX', 'HACK'],
      location: 'start' 
    }],
    
    // No magic numbers (numbers without explanation)
    'no-magic-numbers': ['warn', {
      ignore: [0, 1, -1, 2],
      ignoreArrayIndexes: true,
      ignoreDefaultValues: true,
      enforceConst: true
    }],
    
    // Limit cyclomatic complexity
    'complexity': ['warn', { max: 15 }],
    
    // Limit function length
    'max-lines-per-function': ['warn', {
      max: 150,
      skipBlankLines: true,
      skipComments: true
    }],
    
    // Limit file length
    'max-lines': ['warn', {
      max: 500,
      skipBlankLines: true,
      skipComments: true
    }]
  },
  overrides: [
    {
      // Svelte-specific rules
      files: ['*.svelte'],
      parser: 'svelte-eslint-parser',
      rules: {
        // Allow console in Svelte components during development
        'no-console': 'off',
        
        // Svelte has its own unused variable checking
        'no-unused-vars': 'off',
        
        // Disable magic numbers for Svelte (too many false positives with styling)
        'no-magic-numbers': 'off'
      }
    }
  ]
};
