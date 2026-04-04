#!/usr/bin/env node

/**
 * Run Startup Validation
 *
 * Comprehensive validation of all Raven systems on startup.
 * Validates backend, frontend, integration, components, and user flows.
 */

import { StartupValidator } from '../services/startup-validator.js';
import { RavenDB } from '../db.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  try {
    // Wait a bit for servers to stabilize if --wait parameter is provided
    const waitSeconds = process.argv.includes('--wait')
      ? parseInt(process.argv.find(arg => arg.startsWith('--wait=')).split('=')[1])
      : 0;

    if (waitSeconds > 0) {
      await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
    }

    // Initialize database for checks
    const projectRoot = path.resolve(__dirname, '../.raven');
    const dbPath = path.join(projectRoot, 'db/raven.db');
    const db = new RavenDB(dbPath);

    // Create validator
    const validator = new StartupValidator({
      backendUrl: process.env.BACKEND_URL || 'http://localhost:9100',
      frontendUrl: process.env.FRONTEND_URL || 'http://localhost:9000',
      db
    });

    // Run validation
    const results = await validator.runAll();

    // Exit with appropriate code
    if (results.healthy) {
      process.exit(0); // Success
    } else if (results.failed > 0) {
      // Some failures but maybe not critical
      const backendFailed = validator.results.backend.filter(r => r.status === 'failed').length;
      if (backendFailed > 0) {
        process.exit(1); // Critical failure
      } else {
        process.exit(2); // Warnings only
      }
    }
  } catch (error) {
    console.error('\n❌ Startup validation error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
