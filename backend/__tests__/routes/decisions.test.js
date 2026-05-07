/**
 * Tests for the Decisions service + /api/decisions routes.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import {
  createDecisionsService,
  parseDecisionsMarkdown
} from '../../dist/services/decisions-service.js';
import { createDecisionsRouter } from '../../dist/routes/decisions.js';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let app;
let tmpDir;
let svc;

const SAMPLE = `# Decisions

## resolved

### Where do events live?

**Decision:** Local SQLite via better-sqlite3.
**Alternatives:** Postgres, Parquet.
**Lives at:** backend/db.ts

### Auth on or off?

**Decision:** Off in dev.
**Alternatives:** Mandatory auth even on localhost.
**Lives at:** backend/middleware/security.ts

## open

### How do we roll up multiple hosts?

Each Raven instance is single-host today. Parking until the demand
signal is clearer.

### Native desktop or stay browser-served?

Browser-served is fine today and avoids a Tauri/Electron build pipeline.
`;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'raven-decisions-'));
  writeFileSync(join(tmpDir, 'DECISIONS.md'), SAMPLE);
  svc = createDecisionsService(tmpDir);
  app = express();
  app.use(express.json());
  app.use('/api/decisions', createDecisionsRouter(svc));
});

afterAll(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('parseDecisionsMarkdown', () => {
  test('splits resolved + open sections by H2', () => {
    const { resolved, open } = parseDecisionsMarkdown(SAMPLE);
    expect(resolved.length).toBe(2);
    expect(open.length).toBe(2);
  });

  test('extracts Decision / Alternatives / Lives-at fields', () => {
    const { resolved } = parseDecisionsMarkdown(SAMPLE);
    expect(resolved[0]).toMatchObject({
      q: 'Where do events live?',
      decision: 'Local SQLite via better-sqlite3.',
      alternatives: 'Postgres, Parquet.',
      livesAt: 'backend/db.ts'
    });
  });

  test('captures open-question note as the H3 body', () => {
    const { open } = parseDecisionsMarkdown(SAMPLE);
    expect(open[0].q).toBe('How do we roll up multiple hosts?');
    expect(open[0].note).toMatch(/single-host today/);
  });

  test('returns empty arrays for an empty document', () => {
    const { resolved, open } = parseDecisionsMarkdown('# Decisions\n');
    expect(resolved).toEqual([]);
    expect(open).toEqual([]);
  });

  test('tolerates missing field labels (returns empty strings)', () => {
    const partial = `## resolved\n\n### Question?\n\n**Decision:** A choice.\n`;
    const { resolved } = parseDecisionsMarkdown(partial);
    expect(resolved[0]).toMatchObject({
      q: 'Question?',
      decision: 'A choice.',
      alternatives: '',
      livesAt: ''
    });
  });
});

describe('Decisions Routes', () => {
  test('GET /api/decisions returns the parsed payload', async () => {
    const res = await request(app).get('/api/decisions');
    expect(res.status).toBe(200);
    expect(res.body.resolved.length).toBe(2);
    expect(res.body.open.length).toBe(2);
    expect(res.body).toHaveProperty('source');
    expect(res.body.mtime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('POST /api/decisions/refresh re-reads disk', async () => {
    const res = await request(app).post('/api/decisions/refresh');
    expect(res.status).toBe(200);
    expect(res.body.resolved.length).toBe(2);
  });

  test('returns empty payload (not 500) when DECISIONS.md is missing', async () => {
    const otherTmp = mkdtempSync(join(tmpdir(), 'raven-decisions-empty-'));
    try {
      const otherSvc = createDecisionsService(otherTmp);
      const otherApp = express();
      // Mount under a unique prefix so the shared cacheMiddleware keyed
      // on req.url doesn't return the populated payload from the other
      // test's `/api/decisions`.
      otherApp.use('/decisions-empty', createDecisionsRouter(otherSvc));
      const res = await request(otherApp).get('/decisions-empty/');
      expect(res.status).toBe(200);
      expect(res.body.resolved).toEqual([]);
      expect(res.body.open).toEqual([]);
      expect(res.body.mtime).toBeNull();
    } finally {
      rmSync(otherTmp, { recursive: true, force: true });
    }
  });
});
