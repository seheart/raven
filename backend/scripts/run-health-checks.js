#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Run comprehensive health checks after server startup
 *
 * Usage:
 *   node scripts/run-health-checks.js              # Run checks and report
 *   node scripts/run-health-checks.js --fail-fast  # Exit with error if any critical check fails
 *   node scripts/run-health-checks.js --wait=5     # Wait 5 seconds before running checks
 */

import { HealthChecker } from '../services/health-checker.js';

const args = process.argv.slice(2);
const failFast = args.includes('--fail-fast');
const waitArg = args.find(arg => arg.startsWith('--wait='));
const waitSeconds = waitArg ? parseInt(waitArg.split('=')[1]) : 0;
const baseUrl = process.env.API_BASE || 'http://localhost:9100';

async function main() {
  // Wait if specified
  if (waitSeconds > 0) {
    console.log(`⏳ Waiting ${waitSeconds} seconds for server to fully initialize...`);
    await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
  }

  const checker = new HealthChecker(baseUrl);
  const summary = await checker.runAll();

  // Exit with appropriate code
  if (failFast && !summary.healthy) {
    console.error('\n❌ Health checks failed with critical errors. Exiting.');
    process.exit(1);
  }

  if (summary.warnings > 0) {
    process.exit(2); // Warning exit code
  }

  process.exit(0); // Success
}

main().catch(error => {
  console.error('Fatal error running health checks:', error);
  process.exit(1);
});
