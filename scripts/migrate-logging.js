#!/usr/bin/env node

/**
 * Raven Logging Migration Script
 * Converts console.log/error/warn/debug to logger equivalents
 *
 * Usage: node scripts/migrate-logging.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import { relative } from 'path';

console.log('🔍 Starting logging migration...\n');

// Find all backend JS files (excluding node_modules, dist, tests)
const files = glob.sync('backend/**/*.js', {
  ignore: [
    '**/node_modules/**',
    '**/dist/**',
    '**/__tests__/**',
    '**/tests/**',
    '**/coverage/**'
  ]
});

console.log(`Found ${files.length} files to process\n`);

let totalReplacements = 0;
let filesModified = 0;

files.forEach(file => {
  let content = readFileSync(file, 'utf8');
  let changed = false;
  let fileReplacements = 0;

  // Check if logger is already imported
  const hasLoggerImport = content.includes("from './utils/logger.js'") ||
                           content.includes('from "../utils/logger.js"') ||
                           content.includes('from "../../utils/logger.js"') ||
                           content.includes('from "../../../utils/logger.js"');

  // Count replacements
  const logMatches = (content.match(/console\.log\(/g) || []).length;
  const errorMatches = (content.match(/console\.error\(/g) || []).length;
  const warnMatches = (content.match(/console\.warn\(/g) || []).length;
  const debugMatches = (content.match(/console\.debug\(/g) || []).length;

  fileReplacements = logMatches + errorMatches + warnMatches + debugMatches;

  if (fileReplacements > 0) {
    // Add logger import if not present
    if (!hasLoggerImport && !content.includes('logger')) {
      // Find the right import path based on file location
      const depth = file.split('/').length - 2; // -2 for backend/ and filename
      const loggerPath = '../'.repeat(depth) + 'utils/logger.js';

      // Add import after other imports
      const importRegex = /(import .+?;\n)/;
      if (importRegex.test(content)) {
        content = content.replace(
          importRegex,
          `$1import { logger } from '${loggerPath}';\n`
        );
      } else {
        // No imports found, add at top
        content = `import { logger } from '${loggerPath}';\n\n` + content;
      }
      changed = true;
    }

    // Replace console.log
    if (logMatches > 0) {
      content = content.replace(/console\.log\(/g, 'logger.info(');
      changed = true;
    }

    // Replace console.error
    if (errorMatches > 0) {
      content = content.replace(/console\.error\(/g, 'logger.error(');
      changed = true;
    }

    // Replace console.warn
    if (warnMatches > 0) {
      content = content.replace(/console\.warn\(/g, 'logger.warn(');
      changed = true;
    }

    // Replace console.debug
    if (debugMatches > 0) {
      content = content.replace(/console\.debug\(/g, 'logger.debug(');
      changed = true;
    }

    if (changed) {
      writeFileSync(file, content);
      filesModified++;
      totalReplacements += fileReplacements;

      const relPath = relative(process.cwd(), file);
      console.log(`✓ ${relPath}: ${fileReplacements} replacements`);
    }
  }
});

console.log(`\n${'='.repeat(60)}`);
console.log(`✅ Migration complete!`);
console.log(`   Files modified: ${filesModified}`);
console.log(`   Total replacements: ${totalReplacements}`);
console.log(`${'='.repeat(60)}\n`);

if (totalReplacements > 0) {
  console.log('⚠️  IMPORTANT: Please review the changes and test your application!');
  console.log('   Run: git diff backend/');
  console.log('   Test: npm test\n');
}
