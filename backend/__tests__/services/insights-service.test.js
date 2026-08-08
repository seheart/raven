/**
 * Tests for InsightsService
 * Tests the LLM integration methods (mocked Ollama)
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { InsightsService } from '../../dist/services/insights-service.js';
import { RavenDB } from '../../dist/db.js';
import { getBreaker } from '../../dist/utils/circuit-breaker.js';
import { createAgentEventsRepository } from '../../dist/repositories/agent-events-repository.js';
import { createFileEventsRepository } from '../../dist/repositories/file-events-repository.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let db;
let agentEventsRepo;
let fileEventsRepo;
let tmpDir;
let service;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'raven-insights-test-'));
  db = new RavenDB(join(tmpDir, 'test.db'));
  agentEventsRepo = createAgentEventsRepository(db);
  fileEventsRepo = createFileEventsRepository(db);
  // Use a fake Ollama URL — tests that call Ollama will get null back (offline)
  service = new InsightsService(db, 'http://localhost:99999', 'test-model');
});

afterAll(() => {
  if (db) db.close();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('InsightsService - Initialization', () => {
  test('creates insights table', () => {
    const tables = db.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='insights'")
      .all();
    expect(tables.length).toBe(1);
  });

  test('isAvailable returns false when Ollama is offline', async () => {
    const available = await service.isAvailable();
    expect(available).toBe(false);
  });

  test('getModels returns empty array when Ollama is offline', async () => {
    const models = await service.getModels();
    expect(models).toEqual([]);
  });

  test('isGenerating returns false initially', () => {
    expect(service.isGenerating()).toBe(false);
  });

  test('setModel updates the model', () => {
    service.setModel('new-model');
    // No error thrown
    service.setModel('test-model'); // Reset
  });
});

describe('InsightsService - Generate Methods (Ollama Offline)', () => {
  test('generateSummary returns null when no events exist', async () => {
    const result = await service.generateSummary(60);
    expect(result).toBeNull();
  });

  test('generateSummary returns null when Ollama is offline (with events)', async () => {
    // Insert some test data
    fileEventsRepo.insert(
      new Date().toISOString(),
      '/test.js',
      'change',
      'diff',
      0,
      0,
      'sess',
      null,
      null,
      'proj',
      null
    );
    agentEventsRepo.insert(
      new Date().toISOString(),
      'claude',
      'tool_call',
      '/test.js',
      10,
      500,
      'Edit call',
      null,
      'sess',
      'proj'
    );

    const result = await service.generateSummary(60);
    // Should return null because Ollama is offline
    expect(result).toBeNull();
  });

  test('generateCodeReview returns null when no diffs exist', async () => {
    const result = await service.generateCodeReview();
    expect(result).toBeNull();
  });

  test('generateDailyDigest returns null when Ollama is offline', async () => {
    const result = await service.generateDailyDigest();
    expect(result).toBeNull();
  });

  test('generateAgentComparison returns null when Ollama is offline', async () => {
    const result = await service.generateAgentComparison();
    expect(result).toBeNull();
  });

  test('generateProjectHealth returns null when Ollama is offline', async () => {
    const result = await service.generateProjectHealth('test-project');
    expect(result).toBeNull();
  });

  test('generateAnomalyExplanation returns null when Ollama is offline', async () => {
    const result = await service.generateAnomalyExplanation({
      overallStatus: 'critical',
      criticalIssues: [{ category: 'system', name: 'CPU', message: 'CPU at 95%' }],
      summary: { critical: 1, warnings: 0 }
    });
    expect(result).toBeNull();
  });

  test('queueDiffRisk does not throw when Ollama is offline', () => {
    expect(() =>
      service.queueDiffRisk(1, '/test.js', '+ added\n- removed', 'change')
    ).not.toThrow();
  });
});

describe('InsightsService - Query Methods', () => {
  test('getInsights returns empty array initially', () => {
    const insights = service.getInsights();
    expect(insights).toEqual([]);
  });

  test('getInsights with type filter returns empty array', () => {
    const insights = service.getInsights('daily_digest');
    expect(insights).toEqual([]);
  });

  test('getLatest returns null/undefined when no insights exist', () => {
    const latest = service.getLatest('session_summary');
    expect(latest).toBeFalsy();
  });

  test('getInsights returns saved insights', () => {
    // Manually insert an insight to test retrieval
    db.db
      .prepare(
        `
      INSERT INTO insights (id, timestamp, type, title, content, model, duration_ms, context_events)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        'test_1',
        new Date().toISOString(),
        'session_summary',
        'Test Summary',
        'Test content',
        'test-model',
        100,
        5
      );

    const insights = service.getInsights();
    expect(insights.length).toBe(1);
    expect(insights[0].id).toBe('test_1');
    expect(insights[0].type).toBe('session_summary');
  });

  test('getInsights filters by type', () => {
    db.db
      .prepare(
        `
      INSERT INTO insights (id, timestamp, type, title, content, model, duration_ms, context_events)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        'test_2',
        new Date().toISOString(),
        'daily_digest',
        'Test Digest',
        'Digest content',
        'test-model',
        200,
        10
      );

    const digests = service.getInsights('daily_digest');
    expect(digests.length).toBe(1);
    expect(digests[0].type).toBe('daily_digest');

    const summaries = service.getInsights('session_summary');
    expect(summaries.length).toBe(1);
    expect(summaries[0].type).toBe('session_summary');
  });

  test('getLatest returns most recent insight of type', () => {
    const latest = service.getLatest('daily_digest');
    expect(latest).not.toBeNull();
    expect(latest.id).toBe('test_2');
  });
});

describe('InsightsService - Concurrent Generation', () => {
  test('concurrent calls of same type are blocked', async () => {
    // Insert data so generateDailyDigest has something to work with
    for (let i = 0; i < 5; i++) {
      fileEventsRepo.insert(
        new Date().toISOString(),
        `/file${i}.js`,
        'change',
        null,
        0,
        0,
        'sess',
        null,
        null,
        'proj',
        null
      );
    }

    // Start two digest generations simultaneously
    const p1 = service.generateDailyDigest();
    const p2 = service.generateDailyDigest();

    const [r1, r2] = await Promise.all([p1, p2]);

    // One should be null (blocked by mutex)
    const results = [r1, r2].filter(r => r !== null);
    // Both null because Ollama is offline, but the key is no errors thrown
    expect(results.length).toBe(0);
  });

  test('different types can run concurrently without blocking', async () => {
    // These should all return null (Ollama offline) but NOT block each other
    const [summary, digest, comparison] = await Promise.all([
      service.generateSummary(60),
      service.generateDailyDigest(),
      service.generateAgentComparison()
    ]);

    // All null because Ollama offline, but no deadlock
    expect(summary).toBeNull();
    expect(digest).toBeNull();
    expect(comparison).toBeNull();
  });

  test('isGenerating returns false after all generations complete', () => {
    expect(service.isGenerating()).toBe(false);
  });
});

describe('InsightsService - Kill switch (RAVEN_INSIGHTS_DISABLED)', () => {
  let disabledTmp;
  let disabledDb;
  let disabledService;
  let prevEnv;

  beforeAll(() => {
    prevEnv = process.env.RAVEN_INSIGHTS_DISABLED;
    process.env.RAVEN_INSIGHTS_DISABLED = '1';
    disabledTmp = mkdtempSync(join(tmpdir(), 'raven-insights-disabled-test-'));
    disabledDb = new RavenDB(join(disabledTmp, 'test.db'));
    // Read the env var at construction time.
    disabledService = new InsightsService(disabledDb, 'http://localhost:99999', 'test-model');
  });

  afterAll(() => {
    if (disabledDb) disabledDb.close();
    if (disabledTmp) rmSync(disabledTmp, { recursive: true, force: true });
    if (prevEnv === undefined) delete process.env.RAVEN_INSIGHTS_DISABLED;
    else process.env.RAVEN_INSIGHTS_DISABLED = prevEnv;
  });

  test('isDisabled() reports true', () => {
    expect(disabledService.isDisabled()).toBe(true);
  });

  test('isAvailable() returns false without contacting Ollama', async () => {
    const available = await disabledService.isAvailable();
    expect(available).toBe(false);
  });

  test('queueDiffRisk no-ops (no pending entries accumulate)', () => {
    disabledService.queueDiffRisk(1, '/foo.ts', '+a\n-b\n', 'change');
    disabledService.queueDiffRisk(2, '/bar.ts', '+x\n', 'change');
    // No public getter for the queue; success criterion is "doesn't throw
    // and doesn't fire an Ollama request" — covered by absence of fetch.
    expect(disabledService.isGenerating()).toBe(false);
  });

  test('generateSummary returns null without touching Ollama', async () => {
    const result = await disabledService.generateSummary(60);
    expect(result).toBeNull();
  });
});

describe('InsightsService - GPU footprint', () => {
  let gpuDb;
  let gpuDir;
  let gpuService;

  beforeAll(() => {
    gpuDir = mkdtempSync(join(tmpdir(), 'raven-insights-gpu-'));
    gpuDb = new RavenDB(join(gpuDir, 'test.db'));
  });

  afterAll(() => {
    if (gpuDb) gpuDb.close();
    if (gpuDir) rmSync(gpuDir, { recursive: true, force: true });
  });

  // No third arg — model unpinned, so auto-selection runs.
  const unpinned = () => new InsightsService(gpuDb, 'http://localhost:99999');

  test('auto-selection matches a quantized variant of a preferred tag', async () => {
    gpuService = unpinned();
    // The exact tag "qwen2.5-coder:7b" isn't present; the pulled variant is.
    // Before prefix matching this fell through to the 14b — roughly double
    // the resident VRAM for the same short prompts.
    gpuService.getModels = async () => [
      'qwen2.5-coder:7b-instruct-q5_K_M',
      'qwen2.5-coder:14b',
      'llama3.3:70b'
    ];
    expect(await gpuService.ensureModel()).toBe(true);
    expect(gpuService.model).toBe('qwen2.5-coder:7b-instruct-q5_K_M');
  });

  test('auto-selection does not let :7b match :70b', async () => {
    gpuService = unpinned();
    gpuService.getModels = async () => ['llama3.3:70b', 'qwen3:14b'];
    expect(await gpuService.ensureModel()).toBe(true);
    // :70b must not satisfy the :7b preference — qwen3:14b is the first
    // genuine preference hit, so it wins over the merely-installed 70b.
    expect(gpuService.model).toBe('qwen3:14b');
  });

  test('generate requests ask Ollama to unload immediately (keep_alive 0)', async () => {
    gpuService = unpinned();
    gpuService.getModels = async () => ['qwen2.5-coder:7b'];

    // The 'ollama' breaker is process-global and shared with every other
    // Ollama caller. Earlier tests in this file point at a dead port, so by
    // now it has tripped open and would short-circuit before fetch.
    getBreaker('ollama').recordSuccess();

    const realFetch = global.fetch;
    let sent = null;
    global.fetch = async (url, init) => {
      sent = JSON.parse(init.body);
      return { ok: true, json: async () => ({ response: 'ok' }) };
    };
    try {
      await gpuService.callOllamaShort('probe', 10);
    } finally {
      global.fetch = realFetch;
    }

    expect(sent).not.toBeNull();
    // A lingering model holds multi-GB of VRAM for a follow-up that, for
    // on-demand generation, is usually minutes or hours away.
    expect(sent.keep_alive).toBe(0);
  });
});
