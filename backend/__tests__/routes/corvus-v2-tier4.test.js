/**
 * Corvus V2 Tier 4 Routes Tests
 * Tests for health scoring, drift detection, productivity insights,
 * personality analysis, growth tracking, and integrations
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createCorvusV2Tier4Routes } from '../../routes/corvus-v2-tier4.js';
import { RavenDB } from '../../db.js';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Corvus V2 Tier 4 Routes', () => {
  let app;
  let testDb;
  let testDir;
  let mockProjectDatabases;

  beforeAll(async () => {
    // Create express app
    app = express();
    app.use(express.json());

    // Create test directory and database
    testDir = join(tmpdir(), `tier4-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const dbPath = join(testDir, 'test.db');
    testDb = new RavenDB(dbPath);

    // The RavenDB class handles schema creation automatically
    // But we need to create Tier 4 specific tables
    testDb.db.exec(`
      CREATE TABLE IF NOT EXISTS health_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT NOT NULL,
        score REAL NOT NULL,
        metrics TEXT NOT NULL,
        recommendations TEXT,
        calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS drift_detections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT NOT NULL,
        category TEXT NOT NULL,
        severity TEXT NOT NULL,
        description TEXT NOT NULL,
        detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP,
        resolution_notes TEXT
      );

      CREATE TABLE IF NOT EXISTS productivity_insights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT NOT NULL,
        insights TEXT NOT NULL,
        period_start TIMESTAMP NOT NULL,
        period_end TIMESTAMP NOT NULL,
        calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS claude_personality (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        insights TEXT NOT NULL,
        period_start TIMESTAMP NOT NULL,
        period_end TIMESTAMP NOT NULL,
        analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS growth_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT NOT NULL,
        metrics TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS integration_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT NOT NULL,
        integration_type TEXT NOT NULL,
        config TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_name, integration_type)
      );

      CREATE TABLE IF NOT EXISTS integration_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT NOT NULL,
        integration_type TEXT NOT NULL,
        event_type TEXT NOT NULL,
        status TEXT NOT NULL,
        details TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Mock dependencies
    mockProjectDatabases = new Map();
    mockProjectDatabases.set('test-project', testDb);

    // Create router with dependencies
    const router = createCorvusV2Tier4Routes({
      projectDatabases: mockProjectDatabases
    });

    // Mount router
    app.use('/api/corvus/v2/tier4', router);
  });

  afterAll(async () => {
    if (testDb) {
      testDb.close();
    }
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clear data between tests
    testDb.db.exec(`
      DELETE FROM health_scores;
      DELETE FROM drift_detections;
      DELETE FROM productivity_insights;
      DELETE FROM claude_personality;
      DELETE FROM growth_snapshots;
      DELETE FROM integration_configs;
      DELETE FROM integration_events;
      DELETE FROM events;
    `);
  });

  describe('Health Score Endpoints', () => {
    it('POST /health/calculate - should calculate and store health score', async () => {
      const res = await request(app)
        .post('/api/corvus/v2/tier4/health/calculate?project=test-project')
        .expect(200);

      expect(res.body).toHaveProperty('score');
      expect(res.body).toHaveProperty('metrics');
      expect(res.body).toHaveProperty('recommendations');
      expect(typeof res.body.score).toBe('number');
    });

    it('GET /health/history - should retrieve health score history', async () => {
      // Insert test data
      testDb.db
        .prepare(
          `
        INSERT INTO health_scores (project_name, score, metrics)
        VALUES (?, ?, ?)
      `
        )
        .run('test-project', 85.5, JSON.stringify({ test: 'metrics' }));

      const res = await request(app)
        .get('/api/corvus/v2/tier4/health/history?project=test-project')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('GET /health/latest - should retrieve latest health score', async () => {
      // Insert test data
      testDb.db
        .prepare(
          `
        INSERT INTO health_scores (project_name, score, metrics)
        VALUES (?, ?, ?)
      `
        )
        .run('test-project', 90.0, JSON.stringify({ test: 'metrics' }));

      const res = await request(app)
        .get('/api/corvus/v2/tier4/health/latest?project=test-project')
        .expect(200);

      expect(res.body).toHaveProperty('score');
      expect(res.body.score).toBe(90.0);
    });
  });

  describe('Drift Detection Endpoints', () => {
    it('POST /drift/detect - should detect and store drift', async () => {
      const res = await request(app)
        .post('/api/corvus/v2/tier4/drift/detect?project=test-project')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /drift/recent - should retrieve recent drift detections', async () => {
      // Insert test data
      testDb.db
        .prepare(
          `
        INSERT INTO drift_detections (project_name, category, severity, description)
        VALUES (?, ?, ?, ?)
      `
        )
        .run('test-project', 'code-quality', 'medium', 'Test drift');

      const res = await request(app)
        .get('/api/corvus/v2/tier4/drift/recent?project=test-project')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('POST /drift/:driftId/resolve - should mark drift as resolved', async () => {
      // Insert test drift
      const stmt = testDb.db.prepare(`
        INSERT INTO drift_detections (project_name, category, severity, description)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run('test-project', 'code-quality', 'medium', 'Test drift');
      const driftId = testDb.db.prepare('SELECT last_insert_rowid() as id').get().id;

      const res = await request(app)
        .post(`/api/corvus/v2/tier4/drift/${driftId}/resolve?project=test-project`)
        .send({ notes: 'Fixed the issue' })
        .expect(200);

      expect(res.body.success).toBe(true);

      // Verify it was resolved
      const drift = testDb.db.prepare('SELECT * FROM drift_detections WHERE id = ?').get(driftId);
      expect(drift.resolved_at).not.toBeNull();
    });

    it('GET /drift/summary - should retrieve drift summary statistics', async () => {
      // Insert test data
      testDb.db
        .prepare(
          `
        INSERT INTO drift_detections (project_name, category, severity, description)
        VALUES (?, ?, ?, ?)
      `
        )
        .run('test-project', 'code-quality', 'high', 'Critical drift');

      const res = await request(app)
        .get('/api/corvus/v2/tier4/drift/summary?project=test-project')
        .expect(200);

      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('by_severity');
      expect(res.body).toHaveProperty('by_category');
    });
  });

  describe('Productivity Insights Endpoints', () => {
    it('POST /productivity/calculate - should calculate productivity insights', async () => {
      const res = await request(app)
        .post('/api/corvus/v2/tier4/productivity/calculate?project=test-project')
        .expect(200);

      expect(res.body).toHaveProperty('insights');
    });

    it('GET /productivity/history - should retrieve productivity history', async () => {
      // Insert test data
      const insights = JSON.stringify({ peak_hours: { start: '14:00', end: '17:00' } });
      testDb.db
        .prepare(
          `
        INSERT INTO productivity_insights (project_name, insights, period_start, period_end)
        VALUES (?, ?, ?, ?)
      `
        )
        .run('test-project', insights, '2025-01-01', '2025-01-07');

      const res = await request(app)
        .get('/api/corvus/v2/tier4/productivity/history?project=test-project')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /productivity/latest - should retrieve latest productivity insights', async () => {
      const insights = JSON.stringify({ peak_hours: { start: '14:00', end: '17:00' } });
      testDb.db
        .prepare(
          `
        INSERT INTO productivity_insights (project_name, insights, period_start, period_end)
        VALUES (?, ?, ?, ?)
      `
        )
        .run('test-project', insights, '2025-01-01', '2025-01-07');

      const res = await request(app)
        .get('/api/corvus/v2/tier4/productivity/latest?project=test-project')
        .expect(200);

      expect(res.body).toHaveProperty('insights');
    });
  });

  describe('Personality Analysis Endpoints', () => {
    it('POST /personality/analyze - should analyze personality', async () => {
      const res = await request(app)
        .post('/api/corvus/v2/tier4/personality/analyze?project=test-project')
        .expect(200);

      expect(res.body).toHaveProperty('insights');
    });

    it('GET /personality/history - should retrieve personality history', async () => {
      const insights = JSON.stringify({ communication_style: { style: 'concise' } });
      testDb.db
        .prepare(
          `
        INSERT INTO claude_personality (project_name, agent_name, insights, period_start, period_end)
        VALUES (?, ?, ?, ?, ?)
      `
        )
        .run('test-project', 'claude', insights, '2025-01-01', '2025-01-31');

      const res = await request(app)
        .get('/api/corvus/v2/tier4/personality/history?project=test-project')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /personality/latest - should retrieve latest personality analysis', async () => {
      const insights = JSON.stringify({ communication_style: { style: 'concise' } });
      testDb.db
        .prepare(
          `
        INSERT INTO claude_personality (project_name, agent_name, insights, period_start, period_end)
        VALUES (?, ?, ?, ?, ?)
      `
        )
        .run('test-project', 'claude', insights, '2025-01-01', '2025-01-31');

      const res = await request(app)
        .get('/api/corvus/v2/tier4/personality/latest?project=test-project')
        .expect(200);

      expect(res.body).toHaveProperty('insights');
    });
  });

  describe('Growth Tracking Endpoints', () => {
    it('POST /growth/snapshot - should create growth snapshot', async () => {
      const res = await request(app)
        .post('/api/corvus/v2/tier4/growth/snapshot?project=test-project')
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('GET /growth/timeseries - should retrieve growth timeseries', async () => {
      const metrics = JSON.stringify({ health_score: 85 });
      testDb.db
        .prepare(
          `
        INSERT INTO growth_snapshots (project_name, metrics)
        VALUES (?, ?)
      `
        )
        .run('test-project', metrics);

      const res = await request(app)
        .get('/api/corvus/v2/tier4/growth/timeseries?project=test-project')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /growth/comparison - should compare growth periods', async () => {
      const res = await request(app)
        .get('/api/corvus/v2/tier4/growth/comparison?project=test-project')
        .expect(200);

      expect(res.body).toHaveProperty('current');
      expect(res.body).toHaveProperty('previous');
    });

    it('GET /growth/milestones - should retrieve growth milestones', async () => {
      const res = await request(app)
        .get('/api/corvus/v2/tier4/growth/milestones?project=test-project')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /growth/summary - should retrieve growth summary', async () => {
      const res = await request(app)
        .get('/api/corvus/v2/tier4/growth/summary?project=test-project')
        .expect(200);

      expect(res.body).toHaveProperty('total_snapshots');
    });

    it('GET /growth/history - should retrieve growth history', async () => {
      const res = await request(app)
        .get('/api/corvus/v2/tier4/growth/history?project=test-project')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GitHub Integration Endpoints', () => {
    it('POST /integrations/github/configure - should configure GitHub integration', async () => {
      const res = await request(app)
        .post('/api/corvus/v2/tier4/integrations/github/configure?project=test-project')
        .send({
          token: 'test-token',
          owner: 'test-owner',
          repo: 'test-repo'
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('POST /integrations/github/config - should configure GitHub (alias)', async () => {
      const res = await request(app)
        .post('/api/corvus/v2/tier4/integrations/github/config?project=test-project')
        .send({
          token: 'test-token',
          owner: 'test-owner',
          repo: 'test-repo'
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('GET /integrations/github/test - should test GitHub connection', async () => {
      // Configure first
      testDb.db
        .prepare(
          `
        INSERT INTO integration_configs (project_name, integration_type, config)
        VALUES (?, ?, ?)
      `
        )
        .run(
          'test-project',
          'github',
          JSON.stringify({
            token: 'test',
            owner: 'test',
            repo: 'test'
          })
        );

      const res = await request(app)
        .get('/api/corvus/v2/tier4/integrations/github/test?project=test-project')
        .expect(200);

      expect(res.body).toHaveProperty('result');
    });

    it('POST /integrations/github/post-health - should post health to GitHub', async () => {
      // Configure first
      testDb.db
        .prepare(
          `
        INSERT INTO integration_configs (project_name, integration_type, config)
        VALUES (?, ?, ?)
      `
        )
        .run(
          'test-project',
          'github',
          JSON.stringify({
            token: 'test',
            owner: 'test',
            repo: 'test'
          })
        );

      const res = await request(app)
        .post('/api/corvus/v2/tier4/integrations/github/post-health?project=test-project')
        .expect(200);

      expect(res.body).toHaveProperty('success');
    });

    it('POST /integrations/github/disable - should disable GitHub integration', async () => {
      const res = await request(app)
        .post('/api/corvus/v2/tier4/integrations/github/disable?project=test-project')
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('GET /integrations/github/events - should retrieve GitHub events', async () => {
      const res = await request(app)
        .get('/api/corvus/v2/tier4/integrations/github/events?project=test-project')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Discord Integration Endpoints', () => {
    it('POST /integrations/discord/configure - should configure Discord integration', async () => {
      const res = await request(app)
        .post('/api/corvus/v2/tier4/integrations/discord/configure?project=test-project')
        .send({ webhookUrl: 'https://discord.com/api/webhooks/test' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('POST /integrations/discord/config - should configure Discord (alias)', async () => {
      const res = await request(app)
        .post('/api/corvus/v2/tier4/integrations/discord/config?project=test-project')
        .send({ webhookUrl: 'https://discord.com/api/webhooks/test' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('GET /integrations/discord/test - should test Discord connection', async () => {
      testDb.db
        .prepare(
          `
        INSERT INTO integration_configs (project_name, integration_type, config)
        VALUES (?, ?, ?)
      `
        )
        .run(
          'test-project',
          'discord',
          JSON.stringify({
            webhookUrl: 'https://discord.com/api/webhooks/test'
          })
        );

      const res = await request(app)
        .get('/api/corvus/v2/tier4/integrations/discord/test?project=test-project')
        .expect(200);

      expect(res.body).toHaveProperty('result');
    });

    it('POST /integrations/discord/send-health - should send health to Discord', async () => {
      testDb.db
        .prepare(
          `
        INSERT INTO integration_configs (project_name, integration_type, config)
        VALUES (?, ?, ?)
      `
        )
        .run(
          'test-project',
          'discord',
          JSON.stringify({
            webhookUrl: 'https://discord.com/api/webhooks/test'
          })
        );

      const res = await request(app)
        .post('/api/corvus/v2/tier4/integrations/discord/send-health?project=test-project')
        .expect(200);

      expect(res.body).toHaveProperty('success');
    });

    it('POST /integrations/discord/disable - should disable Discord integration', async () => {
      const res = await request(app)
        .post('/api/corvus/v2/tier4/integrations/discord/disable?project=test-project')
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('GET /integrations/discord/events - should retrieve Discord events', async () => {
      const res = await request(app)
        .get('/api/corvus/v2/tier4/integrations/discord/events?project=test-project')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Slack Integration Endpoints', () => {
    it('POST /integrations/slack/configure - should configure Slack integration', async () => {
      const res = await request(app)
        .post('/api/corvus/v2/tier4/integrations/slack/configure?project=test-project')
        .send({ webhookUrl: 'https://hooks.slack.com/services/test' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('POST /integrations/slack/config - should configure Slack (alias)', async () => {
      const res = await request(app)
        .post('/api/corvus/v2/tier4/integrations/slack/config?project=test-project')
        .send({ webhookUrl: 'https://hooks.slack.com/services/test' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('GET /integrations/slack/test - should test Slack connection', async () => {
      testDb.db
        .prepare(
          `
        INSERT INTO integration_configs (project_name, integration_type, config)
        VALUES (?, ?, ?)
      `
        )
        .run(
          'test-project',
          'slack',
          JSON.stringify({
            webhookUrl: 'https://hooks.slack.com/services/test'
          })
        );

      const res = await request(app)
        .get('/api/corvus/v2/tier4/integrations/slack/test?project=test-project')
        .expect(200);

      expect(res.body).toHaveProperty('result');
    });

    it('POST /integrations/slack/send-health - should send health to Slack', async () => {
      testDb.db
        .prepare(
          `
        INSERT INTO integration_configs (project_name, integration_type, config)
        VALUES (?, ?, ?)
      `
        )
        .run(
          'test-project',
          'slack',
          JSON.stringify({
            webhookUrl: 'https://hooks.slack.com/services/test'
          })
        );

      const res = await request(app)
        .post('/api/corvus/v2/tier4/integrations/slack/send-health?project=test-project')
        .expect(200);

      expect(res.body).toHaveProperty('success');
    });

    it('POST /integrations/slack/disable - should disable Slack integration', async () => {
      const res = await request(app)
        .post('/api/corvus/v2/tier4/integrations/slack/disable?project=test-project')
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('GET /integrations/slack/events - should retrieve Slack events', async () => {
      const res = await request(app)
        .get('/api/corvus/v2/tier4/integrations/slack/events?project=test-project')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
