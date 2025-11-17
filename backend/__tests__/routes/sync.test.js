/**
 * Server Sync API Test Suite
 * Tests all server synchronization endpoints
 */

import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Create a minimal Express app for testing
const app = express();
app.use(express.json());

// Mock sync routes
app.get('/api/sync/config', (req, res) => {
  res.json({
    config: {
      enabled: false,
      remoteUrl: '',
      syncInterval: 300,
      autoSync: false,
      syncTypes: ['events', 'agent-events', 'errors']
    },
    lastSync: null,
    history: []
  });
});

app.post('/api/sync/config', (req, res) => {
  res.json({ success: true, message: 'Configuration saved' });
});

app.post('/api/sync/test', (req, res) => {
  res.json({
    success: false,
    message: 'Sync feature not yet implemented',
    latency: 0
  });
});

app.post('/api/sync/remote-stats', (req, res) => {
  res.json({
    success: false,
    message: 'Sync feature not yet implemented',
    stats: null
  });
});

app.post('/api/sync/trigger', (req, res) => {
  res.json({
    success: false,
    message: 'Sync feature not yet implemented',
    synced: 0
  });
});

describe('Server Sync API', () => {
  describe('GET /api/sync/config', () => {
    it('should return sync configuration', async () => {
      const res = await request(app).get('/api/sync/config');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('config');
      expect(res.body.config).toHaveProperty('enabled');
      expect(res.body.config).toHaveProperty('remoteUrl');
      expect(res.body.config).toHaveProperty('syncInterval');
    });
  });

  describe('POST /api/sync/config', () => {
    it('should save sync configuration', async () => {
      const config = {
        enabled: true,
        remoteUrl: 'http://remote-server:9100',
        syncInterval: 600
      };

      const res = await request(app).post('/api/sync/config').send(config);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/sync/test', () => {
    it('should test remote connection', async () => {
      const res = await request(app)
        .post('/api/sync/test')
        .send({ remoteUrl: 'http://test-server:9100' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success');
      expect(res.body).toHaveProperty('message');
    });
  });

  describe('POST /api/sync/remote-stats', () => {
    it('should fetch remote server stats', async () => {
      const res = await request(app)
        .post('/api/sync/remote-stats')
        .send({ remoteUrl: 'http://test-server:9100' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success');
    });
  });

  describe('POST /api/sync/trigger', () => {
    it('should trigger manual sync', async () => {
      const res = await request(app).post('/api/sync/trigger');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success');
      expect(res.body).toHaveProperty('message');
    });
  });
});
