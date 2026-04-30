/**
 * Tests for recent-load-hints
 * Pure in-memory module — no DB, no fetch, no time travel needed.
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  recordLoadHint,
  findLoadHint,
  _resetForTests
} from '../../dist/services/recent-load-hints.js';

beforeEach(() => {
  _resetForTests();
});

describe('recent-load-hints — canonicalization', () => {
  test('untagged model matches a :latest lookup', () => {
    recordLoadHint({ model: 'nomic-embed-text', pid: 1, cwd: '/x', project: 'p' });
    expect(findLoadHint('nomic-embed-text:latest')).not.toBeNull();
  });

  test(':latest record matches an untagged lookup', () => {
    recordLoadHint({ model: 'nomic-embed-text:latest', pid: 1, cwd: '/x', project: 'p' });
    expect(findLoadHint('nomic-embed-text')).not.toBeNull();
  });

  test('tagged model matches the same tag', () => {
    recordLoadHint({ model: 'qwen2.5-coder:14b', pid: 1, cwd: '/x', project: 'p' });
    expect(findLoadHint('qwen2.5-coder:14b')).not.toBeNull();
  });

  test('different tags do not match', () => {
    recordLoadHint({ model: 'qwen2.5-coder:14b', pid: 1, cwd: '/x', project: 'p' });
    expect(findLoadHint('qwen2.5-coder:7b')).toBeNull();
  });

  test('trailing colon normalizes to :latest', () => {
    recordLoadHint({ model: 'foo:', pid: 1, cwd: '/x', project: 'p' });
    expect(findLoadHint('foo')).not.toBeNull();
    expect(findLoadHint('foo:latest')).toBeNull(); // already consumed
  });

  test('empty model string is rejected', () => {
    const remove = recordLoadHint({ model: '', pid: 1, cwd: '/x', project: 'p' });
    expect(typeof remove).toBe('function');
    expect(findLoadHint('')).toBeNull();
  });
});

describe('recent-load-hints — ordering and time window', () => {
  test('returns most recent matching hint when several exist', () => {
    recordLoadHint({ model: 'm', pid: 1, cwd: null, project: 'first' });
    recordLoadHint({ model: 'm', pid: 2, cwd: null, project: 'second' });
    expect(findLoadHint('m').project).toBe('second');
  });

  test('hints older than the window are not returned', async () => {
    recordLoadHint({ model: 'm', pid: 1, cwd: null, project: 'p' });
    await new Promise(r => setTimeout(r, 10));
    expect(findLoadHint('m', 5)).toBeNull(); // window narrower than the wait
  });

  test('non-matching hints do not stop the walk-back', () => {
    recordLoadHint({ model: 'a', pid: 1, cwd: null, project: 'pa' });
    recordLoadHint({ model: 'b', pid: 2, cwd: null, project: 'pb' });
    recordLoadHint({ model: 'a', pid: 3, cwd: null, project: 'pa-newer' });
    expect(findLoadHint('a').project).toBe('pa-newer');
  });
});

describe('recent-load-hints — consumption', () => {
  test('findLoadHint removes the matched hint', () => {
    recordLoadHint({ model: 'm', pid: 1, cwd: null, project: 'p' });
    expect(findLoadHint('m')).not.toBeNull();
    expect(findLoadHint('m')).toBeNull();
  });

  test('remover function pulls the hint out of the ring', () => {
    const remove = recordLoadHint({ model: 'm', pid: 1, cwd: null, project: 'p' });
    remove();
    expect(findLoadHint('m')).toBeNull();
  });

  test('remover is idempotent', () => {
    const remove = recordLoadHint({ model: 'm', pid: 1, cwd: null, project: 'p' });
    remove();
    expect(() => remove()).not.toThrow();
  });

  test('consuming one hint leaves an older matching hint reachable', () => {
    recordLoadHint({ model: 'm', pid: 1, cwd: null, project: 'older' });
    recordLoadHint({ model: 'm', pid: 2, cwd: null, project: 'newer' });
    expect(findLoadHint('m').project).toBe('newer');
    expect(findLoadHint('m').project).toBe('older');
    expect(findLoadHint('m')).toBeNull();
  });
});

describe('recent-load-hints — bounded growth', () => {
  test('ring evicts oldest entries past MAX_HINTS', () => {
    // Add many more than the cap; the oldest should be gone.
    for (let i = 0; i < 100; i++) {
      recordLoadHint({ model: `m${i}`, pid: i, cwd: null, project: `p${i}` });
    }
    expect(findLoadHint('m0')).toBeNull();
    expect(findLoadHint('m99')).not.toBeNull();
  });
});
