/**
 * Tests for Diff Risk Scores Database Operations
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { RavenDB } from '../../dist/db.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let db;
let tmpDir;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'raven-risk-test-'));
  db = new RavenDB(join(tmpDir, 'test.db'));
});

afterAll(() => {
  if (db) db.close();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('Diff Risk Scores', () => {
  test('insertDiffRiskScore returns an ID', () => {
    const id = db.insertDiffRiskScore(
      1,
      '/src/app.js',
      7,
      'Removed error handling in catch block',
      new Date().toISOString(),
      'qwen2.5-coder:14b',
      'session-1'
    );
    expect(id).toBeGreaterThan(0);
  });

  test('insertDiffRiskScore with low risk score', () => {
    const id = db.insertDiffRiskScore(
      2,
      '/src/utils.js',
      2,
      'Added a simple utility function',
      new Date().toISOString(),
      'qwen2.5-coder:14b',
      'session-1'
    );
    expect(id).toBeGreaterThan(0);
  });

  test('getRecentDiffRiskScores returns scores sorted by timestamp', () => {
    const scores = db.getRecentDiffRiskScores(10);
    expect(scores.length).toBe(2);
    expect(scores[0]).toHaveProperty('event_id');
    expect(scores[0]).toHaveProperty('filepath');
    expect(scores[0]).toHaveProperty('score');
    expect(scores[0]).toHaveProperty('reason');
    expect(scores[0]).toHaveProperty('timestamp');
    expect(scores[0]).toHaveProperty('model');
  });

  test('getRecentDiffRiskScores respects limit', () => {
    const scores = db.getRecentDiffRiskScores(1);
    expect(scores.length).toBe(1);
  });

  test('getDiffRiskScoreByEventId returns correct score', () => {
    const score = db.getDiffRiskScoreByEventId(1);
    expect(score).not.toBeNull();
    expect(score.filepath).toBe('/src/app.js');
    expect(score.score).toBe(7);
    expect(score.reason).toBe('Removed error handling in catch block');
  });

  test('getDiffRiskScoreByEventId returns null for nonexistent event', () => {
    const score = db.getDiffRiskScoreByEventId(9999);
    expect(score).toBeNull();
  });

  test('scores have correct value range', () => {
    // Insert scores at boundary values
    db.insertDiffRiskScore(10, '/a.js', 1, 'Safe', new Date().toISOString(), null, null);
    db.insertDiffRiskScore(11, '/b.js', 10, 'Dangerous', new Date().toISOString(), null, null);

    const low = db.getDiffRiskScoreByEventId(10);
    const high = db.getDiffRiskScoreByEventId(11);
    expect(low.score).toBe(1);
    expect(high.score).toBe(10);
  });
});
