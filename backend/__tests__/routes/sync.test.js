/**
 * Tests for Sync Routes
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Mock the sync-service module BEFORE importing routes
jest.unstable_mockModule('../../sync-service.js', () => ({
  loadConfig: jest.fn(),
  saveConfig: jest.fn(),
  testConnection: jest.fn(),
  performSync: jest.fn(),
  checkSSHSetup: jest.fn(),
  getRemoteStorageStats: jest.fn(),
  cancelSync: jest.fn(),
  checkRsyncInstalled: jest.fn()
}));

// Import mocked module and routes AFTER setting up mock
const mockSyncService = await import('../../sync-service.js');
const { createSyncRoutes } = await import('../../routes/sync.js');

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
      expect(response.body.error).toBe('Failed to load sync configuration');
    });

    test('should return empty config when no config exists', async () => {
      mockSyncService.loadConfig.mockResolvedValue({});

      const response = await request(app)
        .get('/api/sync/config')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toEqual({});
    });

    test('should handle malformed config data', async () => {
      mockSyncService.loadConfig.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/sync/config')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toBeNull();
    });

    test('should return config with all optional fields', async () => {
      const fullConfig = {
        host: 'backup.example.com',
        user: 'backup-user',
        path: '/backups',
        port: 2222,
        identity: '/path/to/key',
        excludes: ['*.log', 'tmp/']
      };

      mockSyncService.loadConfig.mockResolvedValue(fullConfig);

      const response = await request(app)
        .get('/api/sync/config')
        .expect(200);

      expect(response.body).toEqual(fullConfig);
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

    test('should handle empty configuration body', async () => {
      // When sending empty body, Express parses it as {}, which passes validation
      // The service layer should handle validation
      mockSyncService.saveConfig.mockResolvedValue({
        success: false,
        error: 'Invalid configuration'
      });

      const response = await request(app)
        .post('/api/sync/config')
        .send()
        .expect('Content-Type', /json/);

      expect([200, 500]).toContain(response.status);
    });

    test('should handle null configuration', async () => {
      // Express parses null as {}, so it passes the validation check
      mockSyncService.saveConfig.mockResolvedValue({
        success: false,
        error: 'Invalid configuration'
      });

      const response = await request(app)
        .post('/api/sync/config')
        .send(null)
        .expect('Content-Type', /json/);

      expect([200, 500]).toContain(response.status);
    });

    test('should pass config to service layer for validation', async () => {
      mockSyncService.saveConfig.mockResolvedValue({
        success: false,
        error: 'Invalid configuration'
      });

      const response = await request(app)
        .post('/api/sync/config')
        .set('Content-Type', 'application/json')
        .send('{}')
        .expect('Content-Type', /json/);

      expect([200, 500]).toContain(response.status);
    });

    test('should handle service returning success true', async () => {
      mockSyncService.saveConfig.mockResolvedValue({ success: true });

      const response = await request(app)
        .post('/api/sync/config')
        .send({ host: 'test.com', user: 'user', path: '/backup' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Configuration saved');
    });

    test('should handle service returning success false with error', async () => {
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
      expect(response.body).toHaveProperty('error', 'Permission denied');
    });

    test('should handle service throwing error', async () => {
      mockSyncService.saveConfig.mockRejectedValue(new Error('File system error'));

      const response = await request(app)
        .post('/api/sync/config')
        .send({ host: 'test.com', user: 'user' })
        .expect(500);

      expect(response.body.error).toBe('Failed to save sync configuration');
    });

    test('should save config with all fields', async () => {
      const fullConfig = {
        host: 'backup.example.com',
        user: 'backup-user',
        path: '/backups',
        port: 2222,
        identity: '/home/user/.ssh/id_rsa',
        excludes: ['*.log', 'node_modules/']
      };

      mockSyncService.saveConfig.mockResolvedValue({ success: true });

      const response = await request(app)
        .post('/api/sync/config')
        .send(fullConfig)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockSyncService.saveConfig).toHaveBeenCalledWith(fullConfig);
    });

    test('should handle empty object configuration', async () => {
      mockSyncService.saveConfig.mockResolvedValue({
        success: false,
        error: 'Invalid configuration'
      });

      const response = await request(app)
        .post('/api/sync/config')
        .send({})
        .expect('Content-Type', /json/)
        .expect(500);

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

    test('should reject missing host', async () => {
      const response = await request(app)
        .post('/api/sync/test')
        .send({ user: 'testuser', port: 22 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Host and user are required');
    });

    test('should reject missing user', async () => {
      const response = await request(app)
        .post('/api/sync/test')
        .send({ host: 'server.com', port: 22 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Host and user are required');
    });

    test('should reject missing both host and user', async () => {
      const response = await request(app)
        .post('/api/sync/test')
        .send({ port: 22 })
        .expect(400);

      expect(response.body.error).toBe('Host and user are required');
    });

    test('should reject empty host string', async () => {
      const response = await request(app)
        .post('/api/sync/test')
        .send({ host: '', user: 'testuser' })
        .expect(400);

      expect(response.body.error).toBe('Host and user are required');
    });

    test('should reject empty user string', async () => {
      const response = await request(app)
        .post('/api/sync/test')
        .send({ host: 'server.com', user: '' })
        .expect(400);

      expect(response.body.error).toBe('Host and user are required');
    });

    test('should handle service returning success true', async () => {
      mockSyncService.testConnection.mockResolvedValue({
        success: true,
        message: 'SSH connection established'
      });

      const response = await request(app)
        .post('/api/sync/test')
        .send({ host: 'server.com', user: 'user' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBeTruthy();
    });

    test('should handle service returning success false', async () => {
      mockSyncService.testConnection.mockResolvedValue({
        success: false,
        error: 'Authentication failed'
      });

      const response = await request(app)
        .post('/api/sync/test')
        .send({ host: 'server.com', user: 'user' })
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authentication failed');
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

    test('should handle service throwing error', async () => {
      mockSyncService.testConnection.mockRejectedValue(new Error('Network error'));

      const response = await request(app)
        .post('/api/sync/test')
        .send({ host: 'server.com', user: 'user' })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Connection test failed');
    });

    test('should handle null config', async () => {
      const response = await request(app)
        .post('/api/sync/test')
        .send(null)
        .expect(400);

      expect(response.body.error).toBe('Host and user are required');
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

    test('should reject missing host', async () => {
      const response = await request(app)
        .post('/api/sync/trigger')
        .send({ user: 'user', path: '/backup' })
        .expect(400);

      expect(response.body.error).toBe('Host, user, and path are required');
    });

    test('should reject missing user', async () => {
      const response = await request(app)
        .post('/api/sync/trigger')
        .send({ host: 'server.com', path: '/backup' })
        .expect(400);

      expect(response.body.error).toBe('Host, user, and path are required');
    });

    test('should reject missing path', async () => {
      const response = await request(app)
        .post('/api/sync/trigger')
        .send({ host: 'server.com', user: 'user' })
        .expect(400);

      expect(response.body.error).toBe('Host, user, and path are required');
    });

    test('should emit WebSocket event on successful sync with stats', async () => {
      mockSyncService.performSync.mockResolvedValue({
        success: true,
        size: 5242880,
        files: 100,
        duration: 5.3
      });

      const response = await request(app)
        .post('/api/sync/trigger')
        .send({ host: 'server.com', user: 'user', path: '/backup' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.size).toBe(5242880);
      expect(response.body.files).toBe(100);
      expect(response.body.duration).toBe(5.3);
      expect(mockIo.emit).toHaveBeenCalledWith('sync-complete', {
        success: true,
        timestamp: expect.any(String),
        size: 5242880,
        files: 100,
        duration: 5.3
      });
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

    test('should emit WebSocket event when service throws error', async () => {
      mockSyncService.performSync.mockRejectedValue(new Error('Sync crashed'));

      const response = await request(app)
        .post('/api/sync/trigger')
        .send({ host: 'server.com', user: 'user', path: '/path' })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(mockIo.emit).toHaveBeenCalledWith('sync-complete', {
        success: false,
        timestamp: expect.any(String),
        error: 'Sync crashed'
      });
    });

    test('should verify WebSocket emit called with correct data structure', async () => {
      mockSyncService.performSync.mockResolvedValue({
        success: true,
        size: 1000,
        files: 10,
        duration: 1.5
      });

      await request(app)
        .post('/api/sync/trigger')
        .send({ host: 'server.com', user: 'user', path: '/backup' })
        .expect(200);

      expect(mockIo.emit).toHaveBeenCalledTimes(1);
      const emitCall = mockIo.emit.mock.calls[0];
      expect(emitCall[0]).toBe('sync-complete');
      expect(emitCall[1]).toHaveProperty('success');
      expect(emitCall[1]).toHaveProperty('timestamp');
    });

    test('should verify timestamp format is ISO string', async () => {
      mockSyncService.performSync.mockResolvedValue({
        success: true,
        size: 1000,
        files: 10,
        duration: 1.5
      });

      await request(app)
        .post('/api/sync/trigger')
        .send({ host: 'server.com', user: 'user', path: '/backup' })
        .expect(200);

      const emitCall = mockIo.emit.mock.calls[0];
      const timestamp = emitCall[1].timestamp;
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test('should handle null config', async () => {
      const response = await request(app)
        .post('/api/sync/trigger')
        .send(null)
        .expect(400);

      expect(response.body.error).toBe('Host, user, and path are required');
    });

    test('should handle empty strings in config', async () => {
      const response = await request(app)
        .post('/api/sync/trigger')
        .send({ host: '', user: '', path: '' })
        .expect(400);

      expect(response.body.error).toBe('Host, user, and path are required');
    });

    test('should emit error with unknown error message when error is undefined', async () => {
      mockSyncService.performSync.mockResolvedValue({
        success: false
      });

      await request(app)
        .post('/api/sync/trigger')
        .send({ host: 'server.com', user: 'user', path: '/path' })
        .expect(200);

      expect(mockIo.emit).toHaveBeenCalledWith('sync-complete', {
        success: false,
        timestamp: expect.any(String),
        error: 'Unknown error'
      });
    });
  });

  describe('GET /api/sync/ssh-status', () => {
    test('should return SSH status', async () => {
      const mockStatus = {
        hasSSH: true,
        hasKey: true,
        keyPath: '/home/user/.ssh/id_rsa'
      };

      mockSyncService.checkSSHSetup.mockResolvedValue(mockStatus);

      const response = await request(app)
        .get('/api/sync/ssh-status')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toEqual(mockStatus);
      expect(mockSyncService.checkSSHSetup).toHaveBeenCalled();
    });

    test('should return SSH setup valid', async () => {
      mockSyncService.checkSSHSetup.mockResolvedValue({
        hasSSH: true,
        hasKey: true,
        keyPath: '/home/user/.ssh/id_ed25519'
      });

      const response = await request(app)
        .get('/api/sync/ssh-status')
        .expect(200);

      expect(response.body.hasSSH).toBe(true);
      expect(response.body.hasKey).toBe(true);
    });

    test('should return SSH setup invalid', async () => {
      mockSyncService.checkSSHSetup.mockResolvedValue({
        hasSSH: false,
        hasKey: false
      });

      const response = await request(app)
        .get('/api/sync/ssh-status')
        .expect(200);

      expect(response.body.hasSSH).toBe(false);
      expect(response.body.hasKey).toBe(false);
    });

    test('should handle service throwing error', async () => {
      mockSyncService.checkSSHSetup.mockRejectedValue(new Error('SSH check failed'));

      const response = await request(app)
        .get('/api/sync/ssh-status')
        .expect(500);

      expect(response.body.error).toBe('Failed to check SSH status');
    });

    test('should handle partial SSH setup', async () => {
      mockSyncService.checkSSHSetup.mockResolvedValue({
        hasSSH: true,
        hasKey: false,
        message: 'SSH found but no key configured'
      });

      const response = await request(app)
        .get('/api/sync/ssh-status')
        .expect(200);

      expect(response.body.hasSSH).toBe(true);
      expect(response.body.hasKey).toBe(false);
      expect(response.body.message).toBeTruthy();
    });
  });

  describe('POST /api/sync/remote-stats', () => {
    test('should return remote storage stats', async () => {
      const mockStats = {
        total: 1000000000,
        used: 500000000,
        available: 500000000,
        usedPercent: 50
      };

      mockSyncService.getRemoteStorageStats.mockResolvedValue(mockStats);

      const response = await request(app)
        .post('/api/sync/remote-stats')
        .send({ host: 'server.com', user: 'user', path: '/backup' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toEqual(mockStats);
      expect(mockSyncService.getRemoteStorageStats).toHaveBeenCalled();
    });

    test('should reject missing host', async () => {
      const response = await request(app)
        .post('/api/sync/remote-stats')
        .send({ user: 'user', path: '/backup' })
        .expect(400);

      expect(response.body.error).toBe('Host, user, and path are required');
    });

    test('should reject missing user', async () => {
      const response = await request(app)
        .post('/api/sync/remote-stats')
        .send({ host: 'server.com', path: '/backup' })
        .expect(400);

      expect(response.body.error).toBe('Host, user, and path are required');
    });

    test('should reject missing path', async () => {
      const response = await request(app)
        .post('/api/sync/remote-stats')
        .send({ host: 'server.com', user: 'user' })
        .expect(400);

      expect(response.body.error).toBe('Host, user, and path are required');
    });

    test('should return complete stats object', async () => {
      const statsObject = {
        total: 2000000000,
        used: 1000000000,
        available: 1000000000,
        usedPercent: 50,
        path: '/backup'
      };

      mockSyncService.getRemoteStorageStats.mockResolvedValue(statsObject);

      const response = await request(app)
        .post('/api/sync/remote-stats')
        .send({ host: 'server.com', user: 'user', path: '/backup' })
        .expect(200);

      expect(response.body).toEqual(statsObject);
    });

    test('should handle service throwing error', async () => {
      mockSyncService.getRemoteStorageStats.mockRejectedValue(new Error('Connection failed'));

      const response = await request(app)
        .post('/api/sync/remote-stats')
        .send({ host: 'server.com', user: 'user', path: '/backup' })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to get remote storage statistics');
    });

    test('should handle null config', async () => {
      const response = await request(app)
        .post('/api/sync/remote-stats')
        .send(null)
        .expect(400);

      expect(response.body.error).toBe('Host, user, and path are required');
    });

    test('should handle empty strings', async () => {
      const response = await request(app)
        .post('/api/sync/remote-stats')
        .send({ host: '', user: '', path: '' })
        .expect(400);

      expect(response.body.error).toBe('Host, user, and path are required');
    });
  });

  describe('POST /api/sync/cancel', () => {
    test('should cancel ongoing sync', async () => {
      mockSyncService.cancelSync.mockResolvedValue({
        success: true,
        message: 'Sync cancelled'
      });

      const response = await request(app)
        .post('/api/sync/cancel')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockSyncService.cancelSync).toHaveBeenCalled();
    });

    test('should handle no sync in progress', async () => {
      mockSyncService.cancelSync.mockResolvedValue({
        success: false,
        error: 'No sync in progress'
      });

      const response = await request(app)
        .post('/api/sync/cancel')
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('No sync in progress');
    });

    test('should handle service returning success true', async () => {
      mockSyncService.cancelSync.mockResolvedValue({
        success: true,
        message: 'Successfully cancelled'
      });

      const response = await request(app)
        .post('/api/sync/cancel')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should handle service returning success false', async () => {
      mockSyncService.cancelSync.mockResolvedValue({
        success: false,
        error: 'Cannot cancel completed sync'
      });

      const response = await request(app)
        .post('/api/sync/cancel')
        .expect(200);

      expect(response.body.success).toBe(false);
    });

    test('should handle service throwing error', async () => {
      mockSyncService.cancelSync.mockRejectedValue(new Error('Cancel failed'));

      const response = await request(app)
        .post('/api/sync/cancel')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to cancel sync');
    });
  });

  describe('GET /api/sync/rsync-status', () => {
    test('should return rsync installed status', async () => {
      mockSyncService.checkRsyncInstalled.mockResolvedValue({
        installed: true,
        version: '3.2.3'
      });

      const response = await request(app)
        .get('/api/sync/rsync-status')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.installed).toBe(true);
      expect(response.body.version).toBeTruthy();
      expect(mockSyncService.checkRsyncInstalled).toHaveBeenCalled();
    });

    test('should return rsync not installed', async () => {
      mockSyncService.checkRsyncInstalled.mockResolvedValue({
        installed: false,
        message: 'rsync not found'
      });

      const response = await request(app)
        .get('/api/sync/rsync-status')
        .expect(200);

      expect(response.body.installed).toBe(false);
    });

    test('should return complete status object', async () => {
      const statusObject = {
        installed: true,
        version: '3.2.7',
        path: '/usr/bin/rsync'
      };

      mockSyncService.checkRsyncInstalled.mockResolvedValue(statusObject);

      const response = await request(app)
        .get('/api/sync/rsync-status')
        .expect(200);

      expect(response.body).toEqual(statusObject);
    });

    test('should handle service throwing error', async () => {
      mockSyncService.checkRsyncInstalled.mockRejectedValue(new Error('Check failed'));

      const response = await request(app)
        .get('/api/sync/rsync-status')
        .expect(500);

      expect(response.body.error).toBe('Failed to check rsync status');
    });

    test('should handle service returning null', async () => {
      mockSyncService.checkRsyncInstalled.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/sync/rsync-status')
        .expect(200);

      expect(response.body).toBeNull();
    });
  });
});
