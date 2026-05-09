/**
 * Self-Analysis Service
 * Runs comprehensive code health checks on the Raven codebase every 24 hours.
 * Checks: tests, linting, type checking, format checking, dependency audit, build.
 * Results stored in SQLite for historical tracking.
 */

import { RavenDB } from '../db.js';
import { logger } from '../utils/logger.js';
import { exec, execFile } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// At runtime __dirname is backend/dist/services/ — go up 3 levels to project root
const BACKEND_DIR = resolve(__dirname, '..', '..');
const PROJECT_ROOT = resolve(BACKEND_DIR, '..');
const FRONTEND_DIR = resolve(PROJECT_ROOT, 'frontend');

interface AnalysisCheck {
  name: string;
  category: 'tests' | 'lint' | 'types' | 'format' | 'security' | 'build' | 'contract' | 'dead-code';
  status: 'pass' | 'warn' | 'fail';
  duration_ms: number;
  summary: string;
  output: string;
}

interface AnalysisRun {
  id: number;
  timestamp: string;
  status: 'running' | 'completed' | 'failed';
  overall_score: string | null;
  duration_ms: number | null;
  total_checks: number;
  passed_checks: number;
  warned_checks: number;
  failed_checks: number;
  session_id: string | null;
  checks?: AnalysisCheck[];
}

function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number = 120000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const fullCmd = [cmd, ...args].join(' ');
  return new Promise(resolve => {
    exec(
      fullCmd,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        env: {
          ...process.env,
          NODE_ENV: 'test',
          FORCE_COLOR: '0',
          // Defense in depth: even though the auth middleware also checks
          // NODE_ENV (set to 'test' above), explicitly clear the dev-only
          // bypass so subprocess auth tests exercise rejection paths rather
          // than passing through. RAVEN_DEV_DISABLE_AUTH replaced the older
          // generic DISABLE_AUTH name; we clear both for safety during
          // any transitional period.
          RAVEN_DEV_DISABLE_AUTH: '',
          DISABLE_AUTH: '',
          // Same reason: if the dev backend was started with insights
          // disabled (RAVEN_INSIGHTS_DISABLED=1), the route tests would
          // inherit that and see 503 from /generate/* instead of the
          // expected 202. Tests build their own InsightsService and need
          // a clean env to exercise the enabled path.
          RAVEN_INSIGHTS_DISABLED: ''
        }
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: error ? ((error as any).code ?? 1) : 0
        });
      }
    );
  });
}

function truncateOutput(output: string, maxLen: number = 50000): string {
  if (output.length <= maxLen) return output;
  return output.slice(0, maxLen) + '\n\n--- Output truncated ---';
}

/**
 * Like runCommand() but uses execFile (no shell), so regex/glob args that
 * contain shell metacharacters (`$`, `*`, backticks) pass through intact.
 */
function runCommandArgs(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number = 60000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise(resolve => {
    execFile(
      cmd,
      args,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, FORCE_COLOR: '0' }
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: error ? ((error as any).code ?? 1) : 0
        });
      }
    );
  });
}

/**
 * Walk an Express app's router stack and return every fully-qualified route path.
 * Handles nested routers by parsing the mount regex Express stores per layer.
 */
function enumerateRoutes(app: unknown): string[] {
  // Duck-typed: we only need ._router.stack, not full Express typings.
  const router = (app as { _router?: { stack?: unknown[] } } | null)?._router;
  if (!router?.stack) return [];

  const routes: string[] = [];

  const mountPathFromLayer = (layer: any): string => {
    const src: string | undefined = layer?.regexp?.source;
    if (!src) return '';
    // Typical source for app.use('/api/session', router): ^\/api\/session\/?(?=\/|$)
    // Strip boundaries, unescape slashes.
    const stripped = src
      .replace(/^\^/, '')
      .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
      .replace(/\\\/\?\$$/, '')
      .replace(/\\\//g, '/');
    return stripped.startsWith('/') ? stripped : stripped ? '/' + stripped : '';
  };

  const walk = (stack: any[], prefix: string): void => {
    for (const layer of stack) {
      if (layer.route?.path) {
        const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
        for (const p of paths) routes.push(prefix + p);
      } else if (layer.name === 'router' && layer.handle?.stack) {
        walk(layer.handle.stack, prefix + mountPathFromLayer(layer));
      }
    }
  };

  walk(router.stack as any[], '');
  return routes;
}

interface AnalysisProgress {
  runId: number;
  checkIndex: number;
  totalChecks: number;
  currentCheck: string;
  completedCheck?: AnalysisCheck;
}

export class SelfAnalysisService {
  private db: RavenDB;
  private intervalHandle: NodeJS.Timeout | null = null;
  private running: boolean = false;
  private sessionId: string;
  private progressCallback: ((progress: AnalysisProgress) => void) | null = null;
  private expressApp: unknown = null;

  constructor(db: RavenDB, sessionId: string) {
    this.db = db;
    this.sessionId = sessionId;

    // Clean up stale "running" runs from crashed/restarted server
    this.db.db.prepare(`UPDATE analysis_runs SET status = 'failed' WHERE status = 'running'`).run();
  }

  /**
   * Attach the live Express app so the API Contract Drift check can introspect
   * actual mounted routes. Call after all app.use(...) route mounts.
   */
  setExpressApp(app: unknown): void {
    this.expressApp = app;
  }

  /**
   * Start the 24-hour analysis cycle.
   * Runs an initial analysis on startup, then every 24 hours.
   */
  startSchedule(): void {
    if (this.intervalHandle) {
      logger.warn('Self-analysis schedule already running');
      return;
    }

    // Run first analysis after a 2-minute delay (let the server settle)
    setTimeout(() => {
      this.runAnalysis().catch(err => {
        logger.error('Scheduled self-analysis failed:', err);
      });
    }, 120000);

    // Then every 24 hours
    this.intervalHandle = setInterval(
      () => {
        this.runAnalysis().catch(err => {
          logger.error('Scheduled self-analysis failed:', err);
        });
      },
      24 * 60 * 60 * 1000
    );

    logger.info('Self-analysis scheduled: every 24 hours');
  }

  stopSchedule(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  onProgress(cb: (progress: AnalysisProgress) => void): void {
    this.progressCallback = cb;
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Run a full analysis. Returns the completed run.
   */
  async runAnalysis(): Promise<AnalysisRun> {
    if (this.running) {
      throw new Error('Analysis already in progress');
    }

    this.running = true;
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    // Create the run record
    const insertRun = this.db.db.prepare(`
      INSERT INTO analysis_runs (timestamp, status, session_id)
      VALUES (?, 'running', ?)
    `);
    const result = insertRun.run(timestamp, this.sessionId);
    const runId = Number(result.lastInsertRowid);

    logger.info(`Starting self-analysis run #${runId}`);

    const checks: AnalysisCheck[] = [];

    try {
      // Run all checks
      // Build first so tests run against fresh dist/
      const checkFns: Array<{ name: string; fn: () => Promise<AnalysisCheck> }> = [
        { name: 'Backend Build', fn: () => this.checkBackendBuild() },
        { name: 'Backend Tests', fn: () => this.checkBackendTests() },
        { name: 'Frontend Tests', fn: () => this.checkFrontendTests() },
        { name: 'Backend Lint', fn: () => this.checkBackendLint() },
        { name: 'Frontend Lint', fn: () => this.checkFrontendLint() },
        { name: 'Backend Types', fn: () => this.checkBackendTypes() },
        { name: 'Frontend Types', fn: () => this.checkFrontendTypes() },
        { name: 'Backend Format', fn: () => this.checkBackendFormat() },
        { name: 'Frontend Format', fn: () => this.checkFrontendFormat() },
        { name: 'Dependency Audit', fn: () => this.checkDependencyAudit() },
        { name: 'API Contract Drift', fn: () => this.checkApiContractDrift() },
        { name: 'Dead Exports', fn: () => this.checkDeadExports() }
      ];

      // Run sequentially to avoid overwhelming the system
      for (let i = 0; i < checkFns.length; i++) {
        const { name, fn } = checkFns[i];

        // Emit "starting check" progress
        this.progressCallback?.({
          runId,
          checkIndex: i,
          totalChecks: checkFns.length,
          currentCheck: name
        });

        try {
          const check = await fn();
          checks.push(check);

          // Emit "check completed" progress
          this.progressCallback?.({
            runId,
            checkIndex: i + 1,
            totalChecks: checkFns.length,
            currentCheck: i + 1 < checkFns.length ? checkFns[i + 1].name : 'Done',
            completedCheck: check
          });
        } catch (err: any) {
          logger.error(`Self-analysis check failed: ${err.message}`);
        }
      }

      // Store check results
      const insertCheck = this.db.db.prepare(`
        INSERT INTO analysis_checks (run_id, name, category, status, duration_ms, summary, output)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMany = this.db.db.transaction((items: AnalysisCheck[]) => {
        for (const c of items) {
          insertCheck.run(
            runId,
            c.name,
            c.category,
            c.status,
            c.duration_ms,
            c.summary,
            truncateOutput(c.output)
          );
        }
      });
      insertMany(checks);

      // Calculate overall score
      const passed = checks.filter(c => c.status === 'pass').length;
      const warned = checks.filter(c => c.status === 'warn').length;
      const failed = checks.filter(c => c.status === 'fail').length;
      const total = checks.length;

      let overall: string;
      if (failed === 0 && warned === 0) overall = 'healthy';
      else if (failed === 0) overall = 'warning';
      else overall = 'critical';

      const durationMs = Date.now() - startTime;

      // Update the run record
      this.db.db
        .prepare(
          `
        UPDATE analysis_runs
        SET status = 'completed', overall_score = ?, duration_ms = ?,
            total_checks = ?, passed_checks = ?, warned_checks = ?, failed_checks = ?
        WHERE id = ?
      `
        )
        .run(overall, durationMs, total, passed, warned, failed, runId);

      logger.info(
        `Self-analysis run #${runId} completed: ${overall} (${passed}/${total} passed) in ${(durationMs / 1000).toFixed(1)}s`
      );

      this.running = false;
      return this.getRun(runId)!;
    } catch (err: any) {
      this.running = false;
      this.db.db.prepare(`UPDATE analysis_runs SET status = 'failed' WHERE id = ?`).run(runId);
      throw err;
    }
  }

  // ==================== Individual Checks ====================

  private async checkBackendTests(): Promise<AnalysisCheck> {
    const start = Date.now();
    const { stdout, stderr, exitCode } = await runCommand(
      'NODE_ENV=test node --experimental-vm-modules node_modules/jest/bin/jest.js',
      ['--forceExit', '--no-coverage', '--json'],
      BACKEND_DIR,
      180000
    );
    const output = stdout + stderr;
    const duration_ms = Date.now() - start;

    let summary: string;
    let status: 'pass' | 'warn' | 'fail';

    // --json outputs a JSON summary to stdout — parse it for reliable results
    try {
      const jsonStart = stdout.indexOf('{"');
      if (jsonStart >= 0) {
        const json = JSON.parse(stdout.slice(jsonStart));
        const failed = json.numFailedTests || 0;
        const passed = json.numPassedTests || 0;
        const total = json.numTotalTests || 0;

        // Build a readable summary of failures
        let readable = `Tests: ${passed} passed, ${failed} failed, ${total} total\n\n`;
        for (const suite of json.testResults || []) {
          const failures = (suite.assertionResults || []).filter((t: any) => t.status === 'failed');
          if (failures.length > 0) {
            const file = suite.testFilePath?.split('/').slice(-2).join('/') || 'unknown';
            readable += `FAIL ${file}\n`;
            for (const t of failures) {
              readable += `  ✕ ${t.fullName}\n`;
              if (t.failureMessages?.[0]) {
                // Keep the first ~8 lines of the failure: assertion + the
                // Expected/Received block + a few stack frames. Single-line
                // truncation lost the actual values, leaving only "Object.is
                // equality" — useless for debugging.
                const trimmed = t.failureMessages[0].split('\n').slice(0, 8).join('\n    ');
                readable += `    ${trimmed}\n`;
              }
            }
            readable += '\n';
          }
        }

        if (failed > 0) {
          status = 'fail';
          summary = `${failed}/${total} tests failed`;
        } else {
          status = 'pass';
          summary = `${passed} tests passed`;
        }
        return {
          name: 'Backend Tests',
          category: 'tests',
          status,
          duration_ms,
          summary,
          output: readable
        };
      }
    } catch {
      // JSON parse failed — fall through to exit code
    }

    status = exitCode === 0 ? 'pass' : 'fail';
    summary = exitCode === 0 ? 'All tests passed' : 'Tests failed (could not parse results)';
    return { name: 'Backend Tests', category: 'tests', status, duration_ms, summary, output };
  }

  private async checkFrontendTests(): Promise<AnalysisCheck> {
    const start = Date.now();
    const { stdout, stderr, exitCode } = await runCommand(
      'npx',
      ['vitest', 'run', '--reporter=verbose'],
      FRONTEND_DIR,
      180000
    );
    const output = stdout + stderr;
    const duration_ms = Date.now() - start;

    let summary: string;
    let status: 'pass' | 'warn' | 'fail';

    if (exitCode === 0) {
      const passMatch = output.match(/(\d+)\s+passed/);
      summary = passMatch ? `${passMatch[1]} tests passed` : 'All tests passed';
      status = 'pass';
    } else {
      const failMatch = output.match(/(\d+)\s+failed/);
      summary = failMatch ? `${failMatch[1]} tests failed` : 'Tests failed';
      status = 'fail';
    }

    return { name: 'Frontend Tests', category: 'tests', status, duration_ms, summary, output };
  }

  private async checkBackendLint(): Promise<AnalysisCheck> {
    const start = Date.now();
    const { stdout, stderr, exitCode } = await runCommand('npm', ['run', 'lint'], BACKEND_DIR);
    const output = stdout + stderr;
    const duration_ms = Date.now() - start;

    // Count warnings vs errors
    const errorCount = (output.match(/\d+ error/g) || []).length;
    const warnCount = (output.match(/\d+ warning/g) || []).length;

    let status: 'pass' | 'warn' | 'fail';
    let summary: string;

    if (exitCode === 0 && errorCount === 0) {
      status = warnCount > 0 ? 'warn' : 'pass';
      summary = warnCount > 0 ? `${warnCount} warnings` : 'No issues';
    } else {
      status = 'fail';
      summary = `Lint errors found`;
    }

    return { name: 'Backend Lint', category: 'lint', status, duration_ms, summary, output };
  }

  private async checkFrontendLint(): Promise<AnalysisCheck> {
    const start = Date.now();
    const { stdout, stderr, exitCode } = await runCommand('npm', ['run', 'lint'], FRONTEND_DIR);
    const output = stdout + stderr;
    const duration_ms = Date.now() - start;

    let status: 'pass' | 'warn' | 'fail';
    let summary: string;

    if (exitCode === 0) {
      status = 'pass';
      summary = 'No issues';
    } else {
      status = 'fail';
      summary = 'Lint errors found';
    }

    return { name: 'Frontend Lint', category: 'lint', status, duration_ms, summary, output };
  }

  private async checkBackendTypes(): Promise<AnalysisCheck> {
    const start = Date.now();
    const { stdout, stderr, exitCode } = await runCommand(
      'npm',
      ['run', 'type-check'],
      BACKEND_DIR
    );
    const output = stdout + stderr;
    const duration_ms = Date.now() - start;

    const errorMatch = output.match(/Found (\d+) error/);
    let status: 'pass' | 'warn' | 'fail';
    let summary: string;

    if (exitCode === 0) {
      status = 'pass';
      summary = 'No type errors';
    } else {
      const count = errorMatch ? errorMatch[1] : '?';
      status = 'fail';
      summary = `${count} type errors`;
    }

    return { name: 'Backend Types', category: 'types', status, duration_ms, summary, output };
  }

  private async checkFrontendTypes(): Promise<AnalysisCheck> {
    const start = Date.now();
    const { stdout, stderr, exitCode } = await runCommand('npm', ['run', 'check'], FRONTEND_DIR);
    const output = stdout + stderr;
    const duration_ms = Date.now() - start;

    const errorMatch = output.match(/(\d+) error/);
    const warnMatch = output.match(/(\d+) warning/);

    let status: 'pass' | 'warn' | 'fail';
    let summary: string;

    const warnCount = warnMatch ? parseInt(warnMatch[1], 10) : 0;

    if (exitCode === 0) {
      status = warnCount > 0 ? 'warn' : 'pass';
      summary = warnCount > 0 ? `${warnCount} warnings` : 'No issues';
    } else {
      const count = errorMatch ? errorMatch[1] : '?';
      status = 'fail';
      summary = `${count} errors`;
    }

    return { name: 'Frontend Types', category: 'types', status, duration_ms, summary, output };
  }

  private async checkBackendFormat(): Promise<AnalysisCheck> {
    const start = Date.now();
    const { stdout, stderr, exitCode } = await runCommand(
      'npm',
      ['run', 'format:check'],
      BACKEND_DIR
    );
    const output = stdout + stderr;
    const duration_ms = Date.now() - start;

    // Prettier lists unformatted files
    const unformatted = output
      .split('\n')
      .filter(l => l.trim() && !l.includes('Checking') && !l.includes('All matched')).length;

    let status: 'pass' | 'warn' | 'fail';
    let summary: string;

    if (exitCode === 0) {
      status = 'pass';
      summary = 'All files formatted';
    } else {
      status = 'warn';
      summary = `${unformatted} files need formatting`;
    }

    return { name: 'Backend Format', category: 'format', status, duration_ms, summary, output };
  }

  private async checkFrontendFormat(): Promise<AnalysisCheck> {
    const start = Date.now();
    const { stdout, stderr, exitCode } = await runCommand(
      'npm',
      ['run', 'format:check'],
      FRONTEND_DIR
    );
    const output = stdout + stderr;
    const duration_ms = Date.now() - start;

    let status: 'pass' | 'warn' | 'fail';
    let summary: string;

    if (exitCode === 0) {
      status = 'pass';
      summary = 'All files formatted';
    } else {
      status = 'warn';
      summary = 'Some files need formatting';
    }

    return { name: 'Frontend Format', category: 'format', status, duration_ms, summary, output };
  }

  private async checkDependencyAudit(): Promise<AnalysisCheck> {
    const start = Date.now();

    // Run audit for both backend and frontend
    const [backendAudit, frontendAudit] = await Promise.all([
      runCommand('npm', ['audit', '--json'], BACKEND_DIR),
      runCommand('npm', ['audit', '--json'], FRONTEND_DIR)
    ]);

    const duration_ms = Date.now() - start;

    let totalVulns = 0;
    let criticalCount = 0;
    const outputs: string[] = [];

    for (const [label, result] of [
      ['Backend', backendAudit],
      ['Frontend', frontendAudit]
    ] as const) {
      try {
        const audit = JSON.parse(result.stdout);
        const vulns = audit.metadata?.vulnerabilities || {};
        const count =
          (vulns.critical || 0) + (vulns.high || 0) + (vulns.moderate || 0) + (vulns.low || 0);
        criticalCount += (vulns.critical || 0) + (vulns.high || 0);
        totalVulns += count;
        outputs.push(
          `--- ${label} ---\nCritical: ${vulns.critical || 0}, High: ${vulns.high || 0}, Moderate: ${vulns.moderate || 0}, Low: ${vulns.low || 0}`
        );
      } catch {
        outputs.push(`--- ${label} ---\n${result.stdout.slice(0, 2000)}`);
      }
    }

    let status: 'pass' | 'warn' | 'fail';
    let summary: string;

    if (totalVulns === 0) {
      status = 'pass';
      summary = 'No vulnerabilities';
    } else if (criticalCount > 0) {
      status = 'fail';
      summary = `${totalVulns} vulnerabilities (${criticalCount} critical/high)`;
    } else {
      status = 'warn';
      summary = `${totalVulns} low/moderate vulnerabilities`;
    }

    return {
      name: 'Dependency Audit',
      category: 'security',
      status,
      duration_ms,
      summary,
      output: outputs.join('\n\n')
    };
  }

  private async checkBackendBuild(): Promise<AnalysisCheck> {
    const start = Date.now();
    const { stdout, stderr, exitCode } = await runCommand(
      'npm',
      ['run', 'build'],
      BACKEND_DIR,
      120000
    );
    const output = stdout + stderr;
    const duration_ms = Date.now() - start;

    let status: 'pass' | 'warn' | 'fail';
    let summary: string;

    if (exitCode === 0) {
      status = 'pass';
      summary = 'Build successful';
    } else {
      status = 'fail';
      summary = 'Build failed';
    }

    return { name: 'Backend Build', category: 'build', status, duration_ms, summary, output };
  }

  private async checkApiContractDrift(): Promise<AnalysisCheck> {
    const start = Date.now();

    let documented: string[] = [];
    try {
      const mod = (await import('../config/openapi.js')) as {
        openApiSpec?: { paths?: Record<string, unknown> };
      };
      documented = Object.keys(mod.openApiSpec?.paths ?? {});
    } catch (err: any) {
      return {
        name: 'API Contract Drift',
        category: 'contract',
        status: 'fail',
        duration_ms: Date.now() - start,
        summary: 'Could not load OpenAPI spec',
        output: err?.message ?? String(err)
      };
    }

    const implemented = new Set(enumerateRoutes(this.expressApp));
    const app = this.expressApp;
    const duration_ms = Date.now() - start;

    if (!app || implemented.size === 0) {
      return {
        name: 'API Contract Drift',
        category: 'contract',
        status: 'warn',
        duration_ms,
        summary: 'Skipped — Express app not attached',
        output:
          'The check requires the live Express app; call selfAnalysisService.setExpressApp(app) after routes are mounted.'
      };
    }

    // Route shape match: strip parameter *names*, keep just ":" placeholders.
    // `/api/projects/{name}` and `/api/projects/:id` both become `/api/projects/:`,
    // so a documented route with a differently-named param still counts as implemented.
    // Also strip a trailing slash so `app.use('/telemetry', router)` + `router.post('/')`
    // (which enumerates as `/telemetry/`) matches a documented `/telemetry`.
    const normalize = (p: string): string =>
      p
        .replace(/\{(\w+)\}/g, ':')
        .replace(/:\w+/g, ':')
        .replace(/(.)\/+$/, '$1');
    const implementedNorm = new Set(Array.from(implemented).map(normalize));
    const missing = documented.filter(p => !implementedNorm.has(normalize(p)));

    let status: 'pass' | 'warn' | 'fail';
    let summary: string;
    let output: string;

    if (missing.length === 0) {
      status = 'pass';
      summary = `${documented.length} documented paths all have handlers`;
      output = `Verified ${documented.length} OpenAPI paths against ${implemented.size} mounted Express routes.`;
    } else {
      status = 'fail';
      summary = `${missing.length}/${documented.length} documented paths have no handler`;
      output = `Missing handlers:\n${missing.map(p => `  - ${p}`).join('\n')}\n\nDocumented: ${documented.length}\nImplemented: ${implemented.size}`;
    }

    return {
      name: 'API Contract Drift',
      category: 'contract',
      status,
      duration_ms,
      summary,
      output
    };
  }

  private async checkDeadExports(): Promise<AnalysisCheck> {
    const start = Date.now();

    // Find every named export across source files (excluding tests, dist, node_modules).
    // Uses runCommandArgs (execFile, no shell) so the regex's $ and * survive.
    const exportsOutput = await runCommandArgs(
      'rg',
      [
        '--no-heading',
        '-n',
        '-t',
        'ts',
        '-t',
        'js',
        '-t',
        'svelte',
        '-g',
        '!**/node_modules/**',
        '-g',
        '!**/dist/**',
        '-g',
        '!**/__tests__/**',
        '-g',
        '!**/*.test.*',
        '-g',
        '!**/*.spec.*',
        '-g',
        '!**/*.d.ts',
        // Storybook stories are glob-loaded at runtime; static scans can't see
        // their consumers, so every story export would look dead.
        '-g',
        '!**/*.stories.*',
        'export\\s+(?:async\\s+)?(?:function|const|class|interface|type|enum|let|var)\\s+([A-Za-z_$][\\w$]*)',
        'backend',
        'frontend/src'
      ],
      PROJECT_ROOT,
      60000
    );

    type Decl = { file: string; line: number };
    const declarations = new Map<string, Decl[]>();
    for (const raw of exportsOutput.stdout.split('\n')) {
      const m = raw.match(
        /^([^:]+):(\d+):.*export\s+(?:async\s+)?(?:function|const|class|interface|type|enum|let|var)\s+([A-Za-z_$][\w$]*)/
      );
      if (!m) continue;
      const [, file, line, name] = m;
      if (!declarations.has(name)) declarations.set(name, []);
      declarations.get(name)!.push({ file, line: Number(line) });
    }

    const dead: string[] = [];
    for (const [name, locs] of declarations) {
      const declaringFiles = new Set(locs.map(l => l.file));
      const ignoreGlobs: string[] = [];
      for (const file of declaringFiles) {
        ignoreGlobs.push('-g', `!${file}`);
      }

      const refs = await runCommandArgs(
        'rg',
        [
          '-l',
          '-t',
          'ts',
          '-t',
          'js',
          '-t',
          'svelte',
          '-g',
          '!**/node_modules/**',
          '-g',
          '!**/dist/**',
          ...ignoreGlobs,
          `\\b${name}\\b`,
          'backend',
          'frontend/src'
        ],
        PROJECT_ROOT,
        10000
      );

      const referencingFiles = refs.stdout.split('\n').filter(l => l.trim());
      if (referencingFiles.length === 0) {
        const first = locs[0];
        dead.push(`${first.file}:${first.line} — ${name}`);
      }
    }

    const duration_ms = Date.now() - start;
    const total = declarations.size;

    let status: 'pass' | 'warn' | 'fail';
    let summary: string;
    let output: string;

    if (dead.length === 0) {
      status = 'pass';
      summary = `All ${total} exports are referenced`;
      output = `Scanned ${total} named exports; every one is referenced outside its declaring file.`;
    } else if (dead.length <= 5) {
      status = 'warn';
      summary = `${dead.length} unreferenced exports`;
      output = `Unreferenced exports (declaration file has no cross-file usage):\n${dead.join('\n')}`;
    } else {
      status = 'fail';
      summary = `${dead.length} unreferenced exports`;
      output = `Unreferenced exports (declaration file has no cross-file usage):\n${dead.join('\n')}\n\nNote: dynamic imports and re-exports can cause false positives.`;
    }

    return { name: 'Dead Exports', category: 'dead-code', status, duration_ms, summary, output };
  }

  // ==================== Query Methods ====================

  getRun(id: number): AnalysisRun | null {
    const run = this.db.db.prepare('SELECT * FROM analysis_runs WHERE id = ?').get(id) as any;
    if (!run) return null;

    const checks = this.db.db
      .prepare('SELECT * FROM analysis_checks WHERE run_id = ? ORDER BY id')
      .all(id) as any[];

    return { ...run, checks };
  }

  getLatestRun(): AnalysisRun | null {
    const run = this.db.db
      .prepare(
        "SELECT * FROM analysis_runs WHERE status = 'completed' ORDER BY timestamp DESC LIMIT 1"
      )
      .get() as any;
    if (!run) return null;

    const checks = this.db.db
      .prepare('SELECT * FROM analysis_checks WHERE run_id = ? ORDER BY id')
      .all(run.id) as any[];

    return { ...run, checks };
  }

  getRunHistory(limit: number = 20): AnalysisRun[] {
    const runs = this.db.db
      .prepare('SELECT * FROM analysis_runs ORDER BY timestamp DESC LIMIT ?')
      .all(limit) as any[];
    return runs;
  }
}
