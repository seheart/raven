/**
 * Tests for the Session Activity route — `/api/session-activity`.
 *
 * Regression guards from commit 4acd993 and surrounding hardening:
 *  - The parser must handle user, assistant text, assistant tool_use, and
 *    sub-agent (Agent) tool spawns from a Claude Code JSONL log.
 *  - Malformed JSONL lines must be skipped silently; one bad line cannot
 *    take down the whole timeline.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir, tmpdir } from 'os';

let app;
let tmpWatch;
let logDir;
let cleanupLogDir = false;

// `os.homedir()` is resolved from getpwuid(), so overriding process.env.HOME
// doesn't change where the route reads logs from. Instead we set WATCH_PATH
// to a temp directory, compute the same `-tmp-...` encoded path the route
// uses, and create the fixture inside the real ~/.claude/projects/ tree.
// We only remove the directory we created — never touch any pre-existing
// session log directory.
beforeAll(async () => {
  tmpWatch = mkdtempSync(join(tmpdir(), 'raven-session-activity-watch-'));
  process.env.WATCH_PATH = tmpWatch;

  // Mirror the encoding used by getProjectLogDir: leading '-' then '/'→'-'.
  const encoded = '-' + tmpWatch.replace(/^\//, '').replace(/\//g, '-');
  logDir = join(homedir(), '.claude', 'projects', encoded);
  // Track whether we created the directory so cleanup never blows away a
  // real session log tree (defensive — the encoded path is unique per run).
  cleanupLogDir = !existsSync(logDir);
  mkdirSync(logDir, { recursive: true });

  // A JSONL fixture exercising every message branch the parser handles:
  //   user, assistant text + tool_use (Write, Edit, Bash), sub-agent (Agent).
  // Plus a malformed line to verify the parser doesn't crash on it.
  const goodLines = [
    {
      type: 'user',
      timestamp: '2026-05-13T10:00:00Z',
      message: { content: 'hello, please change things' }
    },
    {
      type: 'assistant',
      timestamp: '2026-05-13T10:00:05Z',
      message: {
        content: [
          { type: 'text', text: 'On it.' },
          {
            type: 'tool_use',
            name: 'Write',
            input: { file_path: '/repo/src/new.ts' }
          },
          {
            type: 'tool_use',
            name: 'Edit',
            input: { file_path: '/repo/src/old.ts' }
          },
          {
            type: 'tool_use',
            name: 'Bash',
            input: { command: 'npm test' }
          },
          {
            type: 'tool_use',
            name: 'Agent',
            input: {
              description: 'review pending changes',
              subagent_type: 'reviewer',
              model: 'opus'
            }
          }
        ]
      }
    }
  ];
  const goodJsonl = goodLines.map(l => JSON.stringify(l)).join('\n');
  // The bad line lives between two good lines to prove the parser keeps going.
  const trailingGood = JSON.stringify({
    type: 'user',
    timestamp: '2026-05-13T10:00:10Z',
    message: { content: 'thanks' }
  });
  const fixture = goodJsonl + '\n{ this is not valid json\n' + trailingGood + '\n';
  writeFileSync(join(logDir, 'session-fixture.jsonl'), fixture);

  // Import after env is set so the route's path resolver memoizes our values.
  const { createSessionActivityRouter } = await import('../../dist/routes/session-activity.js');
  app = express();
  app.use('/api/session-activity', createSessionActivityRouter());
});

afterAll(() => {
  if (cleanupLogDir && logDir) rmSync(logDir, { recursive: true, force: true });
  if (tmpWatch) rmSync(tmpWatch, { recursive: true, force: true });
});

describe('GET /api/session-activity', () => {
  test('parses user, assistant, tool, and subagent JSONL types', async () => {
    const res = await request(app).get('/api/session-activity');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('entries');
    expect(Array.isArray(res.body.entries)).toBe(true);

    const types = res.body.entries.map(e => e.type);
    expect(types).toContain('user');
    expect(types).toContain('assistant');
    expect(types).toContain('tool');
    expect(types).toContain('subagent');

    // Tool entries should include both Write and Edit (Bash is also a tool).
    const toolMessages = res.body.entries.filter(e => e.type === 'tool').map(e => e.content);
    expect(toolMessages.some(c => c.startsWith('Write:'))).toBe(true);
    expect(toolMessages.some(c => c.startsWith('Edit:'))).toBe(true);
    expect(toolMessages.some(c => c.startsWith('Bash:'))).toBe(true);

    // Sub-agent entry should carry the description.
    const subagent = res.body.entries.find(e => e.type === 'subagent');
    expect(subagent.content).toBe('review pending changes');
  });

  test('skips malformed JSONL lines without crashing', async () => {
    const res = await request(app).get('/api/session-activity');
    expect(res.status).toBe(200);
    // Both the leading "hello" user message and the trailing "thanks" user
    // message must be present despite the broken line between them.
    const userTexts = res.body.entries.filter(e => e.type === 'user').map(e => e.content);
    expect(userTexts).toEqual(expect.arrayContaining(['hello, please change things', 'thanks']));
  });
});
