/**
 * Tests for Sync Routes
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createSyncRoutes } from '../../routes/sync.js';

// Mock the sync-service module
jest.unstable_mockModule('../../sync-service.js', () => ({
  loadConfig: jest.fn(),
  saveConfig: jest.fn(),
  testConnection: jest.fn(),
  performSync: jest.fn()
}));

const mockSyncService = await import('../../sync-service.js');

describe('Sync Routes', () => {
  let app;
  let mockIo;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    mockIo = {
      emit: jest.fn()
    };

    const deps = {
      io: mockIo
    };

    app.use('/api/sync', createSyncRoutes(deps));

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('GET /api/sync/config', () => {
    test('should return sync configuration', async () => {
      const mockConfig = {
        host: 'backup.example.com',
        user: 'backup-user',
        path: '/backups'
      };

      mockSyncService.loadConfig.mockResolvedValue(mockConfig);

      const response = await request(app)
        .get('/api/sync/config')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toEqual(mockConfig);
      expect(mockSyncService.loadConfig).toHaveBeenCalled();
    });

    test('should handle configuration load errors', async () => {
      mockSyncService.loadConfig.mockRejectedValue(new Error('Config not found'));

      const response = await request(app)
        .get('/api/sync/config')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/sync/config', () => {
    test('should save sync configuration', async () => {
      const newConfig = {
        host: 'new-server.com',
        user: 'admin',
        path: '/data'
      };

      mockSyncService.saveConfig.mockResolvedValue({ success: true });

      const response = await request(app)
        .post('/api/sync/config')
        .send(newConfig)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toContain('saved');
      expect(mockSyncService.saveConfig).toHaveBeenCalledWith(newConfig);
    });

    test('should reject empty configuration', async () => {
      const response = await request(app)
        .post('/api/sync/config')
        .send(null)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('required');
    });

    test('should handle save errors', async () => {
      mockSyncService.saveConfig.mockResolvedValue({
        success: false,
        error: 'Permission denied'
      });

      const response = await request(app)
        .post('/api/sync/config')
        .send({ host: 'test.com' })
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/sync/test', () => {
    test('should test SSH connection successfully', async () => {
      const testConfig = {
        host: 'server.com',
        user: 'testuser',
        port: 22
      };

      mockSyncService.testConnection.mockResolvedValue({
        success: true,
        message: 'Connection successful'
      });

      const response = await request(app)
        .post('/api/sync/test')
        .send(testConfig)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockSyncService.testConnection).toHaveBeenCalledWith(testConfig);
    });

    test('should require host and user for connection test', async () => {
      const response = await request(app)
        .post('/api/sync/test')
        .send({ port: 22 })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });

    test('should handle connection test failure', async () => {
      mockSyncService.testConnection.mockResolvedValue({
        success: false,
        error: 'Connection refused'
      });

      const response = await request(app)
        .post('/api/sync/test')
        .send({ host: 'bad.com', user: 'user' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeTruthy();
    });
  });

  describe('POST /api/sync/trigger', () => {
    test('should trigger sync operation', async () => {
      const syncConfig = {
        host: 'server.com',
        user: 'syncuser',
        path: '/backup'
      };

      mockSyncService.performSync.mockResolvedValue({
        success: true,
        size: 1024000,
        files: 50,
        duration: 2.5
      });

      const response = await request(app)
        .post('/api/sync/trigger')
        .send(syncConfig)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('size');
      expect(response.body).toHaveProperty('files');
      expect(mockSyncService.performSync).toHaveBeenCalled();
      expect(mockIo.emit).toHaveBeenCalledWith('sync-complete', expect.objectContaining({
        success: true
      }));
    });

    test('should require host, user, and path for sync', async () => {
      const response = await request(app)
        .post('/api/sync/trigger')
        .send({ host: 'server.com' })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });

    test('should emit WebSocket event on sync failure', async () => {
      mockSyncService.performSync.mockResolvedValue({
        success: false,
        error: 'Permission denied'
      });

      const response = await request(app)
        .post('/api/sync/trigger')
        .send({ host: 'server.com', user: 'user', path: '/path' })
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(mockIo.emit).toHaveBeenCalledWith('sync-complete', expect.objectContaining({
        success: false,
        error: expect.any(String)
      }));
    });
  });
});
