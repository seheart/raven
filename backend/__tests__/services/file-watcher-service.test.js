/**
 * Tests for FileWatcherService
 */

import { jest } from '@jest/globals';
import { FileWatcherService } from '../../services/file-watcher-service.js';
// import { EventEmitter } from 'events';

describe('FileWatcherService', () => {
  let service;
  let mockIO;
  let mockHandler;

  beforeEach(() => {
    mockIO = {
      emit: jest.fn()
    };

    mockHandler = jest.fn();

    const projectPaths = new Map();
    projectPaths.set('test-project', '/tmp/test-project');

    service = new FileWatcherService({
      io: mockIO,
      handleFileChange: mockHandler,
      projectPaths,
      debounceMs: 50
    });
  });

  afterEach(async () => {
    if (service) {
      await service.stopAllWatchers();
    }
  });

  describe('Initialization', () => {
    test('should initialize with default config', () => {
      const newService = new FileWatcherService();
      expect(newService.stats.totalEvents).toBe(0);
      expect(newService.watchers.size).toBe(0);
    });

    test('should set IO instance', () => {
      const io = { emit: jest.fn() };
      service.setIO(io);
      expect(service.io).toBe(io);
    });

    test('should set file change handler', () => {
      const handler = jest.fn();
      service.setFileChangeHandler(handler);
      expect(service.handleFileChange).toBe(handler);
    });
  });

  describe('Stats', () => {
    test('should return watcher statistics', () => {
      const stats = service.getStats();
      expect(stats).toHaveProperty('totalEvents');
      expect(stats).toHaveProperty('addEvents');
      expect(stats).toHaveProperty('changeEvents');
      expect(stats).toHaveProperty('unlinkEvents');
      expect(stats).toHaveProperty('activeWatchers');
      expect(stats).toHaveProperty('projects');
    });

    test('should track event counts', () => {
      service.stats.addEvents = 5;
      service.stats.changeEvents = 10;
      service.stats.unlinkEvents = 2;

      const stats = service.getStats();
      expect(stats.addEvents).toBe(5);
      expect(stats.changeEvents).toBe(10);
      expect(stats.unlinkEvents).toBe(2);
    });
  });

  describe('Watcher Management', () => {
    test('should check if project has watcher', () => {
      expect(service.hasWatcher('test-project')).toBe(false);
      expect(service.hasWatcher('nonexistent')).toBe(false);
    });

    test('should return null for watcher of nonexistent project', () => {
      const watcher = service.getWatcher('nonexistent');
      expect(watcher).toBeUndefined();
    });

    test('should handle missing project path gracefully', () => {
      const result = service.initializeWatcher('nonexistent-project');
      expect(result).toBeNull();
    });
  });

  describe('Cleanup', () => {
    test('should stop watcher for specific project', async () => {
      const result = await service.stopWatcher('nonexistent');
      expect(result).toBe(false);
    });

    test('should stop all watchers', async () => {
      await service.stopAllWatchers();
      const stats = service.getStats();
      expect(stats.activeWatchers).toBe(0);
    });
  });
});
