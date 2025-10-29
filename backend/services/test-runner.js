import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

/**
 * Test Runner Service
 * Detects and runs test frameworks
 */
export class TestRunner {
  constructor(db, sessionId, io) {
    this.db = db;
    this.sessionId = sessionId;
    this.io = io;

    // Supported test frameworks with detection patterns
    this.frameworks = [
      {
        name: 'jest',
        detectFiles: ['jest.config.js', 'jest.config.json', 'jest.config.ts'],
        detectPackage: 'jest',
        runCommand: 'npm test',
        parseOutput: this.parseJestOutput.bind(this)
      },
      {
        name: 'mocha',
        detectFiles: ['.mocharc.js', '.mocharc.json', '.mocharc.yml'],
        detectPackage: 'mocha',
        runCommand: 'npm test',
        parseOutput: this.parseMochaOutput.bind(this)
      },
      {
        name: 'vitest',
        detectFiles: ['vitest.config.js', 'vitest.config.ts'],
        detectPackage: 'vitest',
        runCommand: 'npm test',
        parseOutput: this.parseVitestOutput.bind(this)
      },
      {
        name: 'pytest',
        detectFiles: ['pytest.ini', 'pyproject.toml', 'tox.ini'],
        detectPackage: null, // Python doesn't use package.json
        runCommand: 'pytest --tb=short',
        parseOutput: this.parsePytestOutput.bind(this)
      }
    ];
  }

  /**
   * Detect available test frameworks in a project
   */
  detectFrameworks(projectPath) {
    const detected = [];

    for (const framework of this.frameworks) {
      // Check for config files
      const hasConfigFile = framework.detectFiles.some(file =>
        existsSync(join(projectPath, file))
      );

      // Check package.json for the framework
      let hasPackage = false;
      try {
        const packageJson = JSON.parse(readFileSync(join(projectPath, 'package.json'), 'utf-8'));
        if (framework.detectPackage) {
          hasPackage = !!(packageJson.dependencies?.[framework.detectPackage] ||
                         packageJson.devDependencies?.[framework.detectPackage]);
        }
      } catch (error) {
        // No package.json or not parseable
      }

      if (hasConfigFile || hasPackage) {
        detected.push(framework.name);
      }
    }

    return detected;
  }

  /**
   * Run tests for a specific framework
   */
  async runTests(projectPath, framework) {
    const frameworkConfig = this.frameworks.find(f => f.name === framework);
    if (!frameworkConfig) {
      throw new Error(`Unknown framework: ${framework}`);
    }

    try {
      logger.info(`Running ${framework} tests in ${projectPath}`);

      const { stdout, stderr } = await execAsync(frameworkConfig.runCommand, {
        cwd: projectPath,
        timeout: 60000, // 60 second timeout
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });

      // Parse the output
      const results = frameworkConfig.parseOutput(stdout + stderr);

      // Store results in database
      const timestamp = new Date().toISOString();
      for (const result of results) {
        this.db.insertTestResult(
          timestamp,
          framework,
          result.file,
          result.name,
          result.status,
          result.duration,
          result.error,
          result.stack,
          this.sessionId
        );
      }

      // Emit WebSocket event with summary
      const passed = results.filter(r => r.status === 'passed').length;
      const failed = results.filter(r => r.status === 'failed').length;

      this.io.emit('test-results', {
        timestamp,
        framework,
        total: results.length,
        passed,
        failed,
        duration: results.reduce((sum, r) => sum + (r.duration || 0), 0)
      });

      return { results, passed, failed, total: results.length };
    } catch (error) {
      logger.error(`Error running ${framework} tests:`, error);

      // Store failure
      const timestamp = new Date().toISOString();
      this.db.insertTestResult(
        timestamp,
        framework,
        null,
        'Test Run',
        'failed',
        0,
        error.message,
        error.stack,
        this.sessionId
      );

      throw error;
    }
  }

  /**
   * Parse Jest output
   */
  parseJestOutput(output) {
    const results = [];

    // Simple parsing - in production this would be more robust
    // Looking for patterns like "✓ test name" or "✗ test name"
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('✓') || line.includes('PASS')) {
        results.push({
          name: line.trim(),
          status: 'passed',
          duration: 0,
          file: null,
          error: null,
          stack: null
        });
      } else if (line.includes('✗') || line.includes('FAIL')) {
        results.push({
          name: line.trim(),
          status: 'failed',
          duration: 0,
          file: null,
          error: line.trim(),
          stack: null
        });
      }
    }

    return results;
  }

  /**
   * Parse Mocha output
   */
  parseMochaOutput(output) {
    // Similar to Jest parsing
    return this.parseJestOutput(output);
  }

  /**
   * Parse Vitest output
   */
  parseVitestOutput(output) {
    // Similar to Jest parsing
    return this.parseJestOutput(output);
  }

  /**
   * Parse Pytest output
   */
  parsePytestOutput(output) {
    const results = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.includes('PASSED')) {
        results.push({
          name: line.split('::')[1]?.trim() || line.trim(),
          status: 'passed',
          duration: 0,
          file: null,
          error: null,
          stack: null
        });
      } else if (line.includes('FAILED')) {
        results.push({
          name: line.split('::')[1]?.trim() || line.trim(),
          status: 'failed',
          duration: 0,
          file: null,
          error: line.trim(),
          stack: null
        });
      }
    }

    return results;
  }
}
