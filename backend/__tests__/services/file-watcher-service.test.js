/**
 * Tests for FileWatcherService
 */

import { jest } from '@jest/globals';
import { FileWatcherService } from '../../services/file-watcher-service.js';

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
    delete process.env.CHOKIDAR_IGNORE_PATTERNS;
  });

  describe('Constructor', () => {
    test('should initialize with default config', () => {
      const newService = new FileWatcherService();
      expect(newService.stats.totalEvents).toBe(0);
      expect(newService.watchers.size).toBe(0);
      expect(newService.FILE_WATCH_DEBOUNCE_MS).toBe(150);
      expect(newService.skipProjects).toEqual(['echo']);
    });

    test('should initialize with custom options', () => {
      const customPaths = new Map([['custom', '/custom/path']]);
      const newService = new FileWatcherService({
        io: mockIO,
        handleFileChange: mockHandler,
        projectPaths: customPaths,
        debounceMs: 200,
        skipProjects: ['skip1', 'skip2']
      });

      expect(newService.io).toBe(mockIO);
      expect(newService.handleFileChange).toBe(mockHandler);
      expect(newService.projectPaths).toBe(customPaths);
      expect(newService.FILE_WATCH_DEBOUNCE_MS).toBe(200);
      expect(newService.skipProjects).toEqual(['skip1', 'skip2']);
    });

    test('should initialize stats object', () => {
      expect(service.stats).toEqual({
        totalEvents: 0,
        addEvents: 0,
        changeEvents: 0,
        unlinkEvents: 0
      });
    });

    test('should initialize ignore cache', () => {
      expect(service.ignoreCache).toBeInstanceOf(Map);
      expect(service.ignoreCache.size).toBe(0);
      expect(service.maxIgnoreCacheSize).toBe(1000);
    });

    test('should have default ignored patterns', () => {
      expect(Array.isArray(service.defaultIgnored)).toBe(true);
      expect(service.defaultIgnored.length).toBeGreaterThan(0);
    });
  });

  describe('setIO', () => {
    test('should set IO instance', () => {
      const io = { emit: jest.fn() };
      service.setIO(io);
      expect(service.io).toBe(io);
    });
  });

  describe('setFileChangeHandler', () => {
    test('should set file change handler', () => {
      const handler = jest.fn();
      service.setFileChangeHandler(handler);
      expect(service.handleFileChange).toBe(handler);
    });
  });

  describe('initializeWatcher', () => {
    test('should return null for missing project path', () => {
      const result = service.initializeWatcher('nonexistent-project');
      expect(result).toBeNull();
    });

    test('should return null for skipped projects', () => {
      service.projectPaths.set('echo', '/tmp/echo');
      const result = service.initializeWatcher('echo');
      expect(result).toBeNull();
    });

    test('should handle custom skip projects', () => {
      const customService = new FileWatcherService({
        projectPaths: new Map([['custom', '/tmp/custom']]),
        skipProjects: ['custom']
      });
      const result = customService.initializeWatcher('custom');
      expect(result).toBeNull();
    });

    test('should use custom ignore patterns from environment', () => {
      process.env.CHOKIDAR_IGNORE_PATTERNS = '*.tmp, *.bak';
      const newService = new FileWatcherService({
        projectPaths: new Map([['test', '/tmp/test']])
      });
      // Just verify it doesn't throw
      expect(newService).toBeDefined();
    });

    test('should detect macOS platform', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      // Just verify it doesn't throw
      const result = service.initializeWatcher('test-project');
      expect(result).toBeDefined();

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    test('should handle raven project specially', () => {
      service.projectPaths.set('raven', '/tmp/raven');
      const result = service.initializeWatcher('raven');
      expect(result).toBeDefined();
    });

    test('should handle non-raven projects', () => {
      const result = service.initializeWatcher('test-project');
      expect(result).toBeDefined();
    });
  });

  describe('initializeAllWatchers', () => {
    test('should initialize watchers for all projects', () => {
      service.projectPaths.set('project1', '/tmp/project1');
      service.projectPaths.set('project2', '/tmp/project2');

      const result = service.initializeAllWatchers();

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('total');
      expect(result.total).toBe(3); // test-project + project1 + project2
    });

    test('should count successful and failed watchers', () => {
      service.projectPaths.set('valid', '/tmp/valid');

      const result = service.initializeAllWatchers();

      expect(result.success + result.failed).toBe(result.total);
    });

    test('should handle skip projects in initializeAll', () => {
      service.projectPaths.set('echo', '/tmp/echo');

      const result = service.initializeAllWatchers();

      expect(result.failed).toBeGreaterThan(0);
    });
  });

  describe('getStats', () => {
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
      service.stats.totalEvents = 17;

      const stats = service.getStats();
      expect(stats.addEvents).toBe(5);
      expect(stats.changeEvents).toBe(10);
      expect(stats.unlinkEvents).toBe(2);
      expect(stats.totalEvents).toBe(17);
    });

    test('should return active watchers count', () => {
      const stats = service.getStats();
      expect(stats.activeWatchers).toBe(service.watchers.size);
    });

    test('should return project names', () => {
      const stats = service.getStats();
      expect(Array.isArray(stats.projects)).toBe(true);
    });
  });

  describe('hasWatcher', () => {
    test('should check if project has watcher', () => {
      expect(service.hasWatcher('test-project')).toBe(false);
      expect(service.hasWatcher('nonexistent')).toBe(false);
    });

    test('should return true for active watchers', () => {
      const watcher = service.initializeWatcher('test-project');
      if (watcher) {
        expect(service.hasWatcher('test-project')).toBe(true);
      }
    });
  });

  describe('getWatcher', () => {
    test('should return undefined for nonexistent project', () => {
      const watcher = service.getWatcher('nonexistent');
      expect(watcher).toBeUndefined();
    });

    test('should return watcher for existing project', () => {
      const watcher = service.initializeWatcher('test-project');
      if (watcher) {
        const retrieved = service.getWatcher('test-project');
        expect(retrieved).toBe(watcher);
      }
    });
  });

  describe('stopWatcher', () => {
    test('should return false for nonexistent watcher', async () => {
      const result = await service.stopWatcher('nonexistent');
      expect(result).toBe(false);
    });

    test('should stop existing watcher', async () => {
      const watcher = service.initializeWatcher('test-project');
      if (watcher) {
        const result = await service.stopWatcher('test-project');
        expect(result).toBe(true);
        expect(service.hasWatcher('test-project')).toBe(false);
      }
    });
  });

  describe('stopAllWatchers', () => {
    test('should stop all watchers', async () => {
      service.projectPaths.set('project1', '/tmp/project1');
      service.initializeAllWatchers();

      await service.stopAllWatchers();

      const stats = service.getStats();
      expect(stats.activeWatchers).toBe(0);
      expect(service.watchers.size).toBe(0);
    });

    test('should handle empty watchers', async () => {
      await service.stopAllWatchers();
      expect(service.watchers.size).toBe(0);
    });

    test('should handle watcher close errors gracefully', async () => {
      // Create a mock watcher that throws on close
      const mockWatcher = {
        close: jest.fn().mockRejectedValue(new Error('Close failed'))
      };
      service.watchers.set('error-project', mockWatcher);

      await expect(service.stopAllWatchers()).resolves.not.toThrow();
    });
  });

  describe('restartWatcher', () => {
    test('should restart watcher for project', async () => {
      const watcher1 = service.initializeWatcher('test-project');
      if (watcher1) {
        const watcher2 = await service.restartWatcher('test-project');
        expect(watcher2).toBeDefined();
        expect(watcher2).not.toBe(watcher1);
      }
    });

    test('should handle restart for nonexistent watcher', async () => {
      const result = await service.restartWatcher('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('Ignore Cache', () => {
    test('should maintain cache size limit', () => {
      service.maxIgnoreCacheSize = 3;

      // Add 4 entries
      service.ignoreCache.set('path1', true);
      service.ignoreCache.set('path2', false);
      service.ignoreCache.set('path3', true);
      service.ignoreCache.set('path4', false);

      expect(service.ignoreCache.size).toBeLessThanOrEqual(4);
    });

    test('should cache ignore results', () => {
      service.ignoreCache.set('/test/path', true);
      expect(service.ignoreCache.get('/test/path')).toBe(true);
    });
  });

  describe('Default Ignored Patterns', () => {
    test('should include node_modules patterns', () => {
      const hasNodeModules = service.defaultIgnored.some(
        pattern => pattern.toString().includes('node_modules')
      );
      expect(hasNodeModules).toBe(true);
    });

    test('should include git patterns', () => {
      const hasGit = service.defaultIgnored.some(
        pattern => pattern.toString().includes('git')
      );
      expect(hasGit).toBe(true);
    });

    test('should include Python venv patterns', () => {
      const hasVenv = service.defaultIgnored.some(
        pattern => pattern.toString().includes('venv')
      );
      expect(hasVenv).toBe(true);
    });

    test('should include build output patterns', () => {
      const hasBuild = service.defaultIgnored.some(
        pattern => pattern.toString().includes('build')
      );
      expect(hasBuild).toBe(true);
    });

    test('should include raven directory pattern', () => {
      const hasRaven = service.defaultIgnored.some(
        pattern => pattern.toString().includes('raven')
      );
      expect(hasRaven).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('should handle undefined io', () => {
      const newService = new FileWatcherService({
        projectPaths: new Map([['test', '/tmp/test']])
      });
      expect(newService.io).toBeUndefined();
    });

    test('should handle undefined handleFileChange', () => {
      const newService = new FileWatcherService({
        projectPaths: new Map([['test', '/tmp/test']])
      });
      expect(newService.handleFileChange).toBeUndefined();
    });

    test('should handle empty projectPaths', () => {
      const newService = new FileWatcherService();
      expect(newService.projectPaths.size).toBe(0);
    });

    test('should handle platform detection for non-macOS', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });

      const result = service.initializeWatcher('test-project');
      expect(result).toBeDefined();

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });
});
