/**
 * Integration Tests for File Watcher Recovery
 * Tests the automatic recovery mechanisms added in CRITICAL-7
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { join } from 'path';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';

const TEST_PROJECT_NAME = 'test-watcher-recovery';
const TEST_PROJECT_PATH = join(tmpdir(), TEST_PROJECT_NAME);

describe('File Watcher Recovery Integration', () => {
  let FileWatcherService;
  let watcherService;
  let mockIo;

  beforeEach(async () => {
    // Create test directory
    if (existsSync(TEST_PROJECT_PATH)) {
      rmSync(TEST_PROJECT_PATH, { recursive: true });
    }
    mkdirSync(TEST_PROJECT_PATH, { recursive: true });

    // Mock Socket.IO
    mockIo = {
      emit: jest.fn()
    };

    // Import FileWatcherService
    const module = await import('../../services/file-watcher-service.js');
    FileWatcherService = module.FileWatcherService;

    // Create watcher service
    watcherService = new FileWatcherService(mockIo);
  });

  afterEach(async () => {
    // Clean up
    if (watcherService) {
      await watcherService.stopAllWatchers();
    }

    if (existsSync(TEST_PROJECT_PATH)) {
      rmSync(TEST_PROJECT_PATH, { recursive: true });
    }
  });

  test('should initialize watcher for a project', () => {
    watcherService.setProjectPaths(new Map([[TEST_PROJECT_NAME, TEST_PROJECT_PATH]]));

    const watcher = watcherService.initializeWatcher(TEST_PROJECT_NAME);

    expect(watcher).toBeDefined();
    expect(watcherService.watchers.has(TEST_PROJECT_NAME)).toBe(true);
  });

  test('should restart watcher after stop', async () => {
    watcherService.setProjectPaths(new Map([[TEST_PROJECT_NAME, TEST_PROJECT_PATH]]));

    // Initialize
    const watcher1 = watcherService.initializeWatcher(TEST_PROJECT_NAME);
    expect(watcher1).toBeDefined();

    // Stop
    await watcherService.stopWatcher(TEST_PROJECT_NAME);
    expect(watcherService.watchers.has(TEST_PROJECT_NAME)).toBe(false);

    // Restart
    const watcher2 = await watcherService.restartWatcher(TEST_PROJECT_NAME);
    expect(watcher2).toBeDefined();
    expect(watcherService.watchers.has(TEST_PROJECT_NAME)).toBe(true);
  });

  test('should handle multiple concurrent restarts gracefully', async () => {
    watcherService.setProjectPaths(new Map([[TEST_PROJECT_NAME, TEST_PROJECT_PATH]]));

    watcherService.initializeWatcher(TEST_PROJECT_NAME);

    // Try to restart multiple times concurrently
    const restarts = Promise.all([
      watcherService.restartWatcher(TEST_PROJECT_NAME),
      watcherService.restartWatcher(TEST_PROJECT_NAME),
      watcherService.restartWatcher(TEST_PROJECT_NAME)
    ]);

    await expect(restarts).resolves.toBeDefined();

    // Should still have exactly one watcher
    expect(watcherService.watchers.size).toBe(1);
  });

  test('should detect file changes after restart', async () => {
    watcherService.setProjectPaths(new Map([[TEST_PROJECT_NAME, TEST_PROJECT_PATH]]));

    let changeDetected = false;
    watcherService.handleFileChange = (type, path) => {
      if (type === 'add' && path.includes('test-file.txt')) {
        changeDetected = true;
      }
    };

    watcherService.initializeWatcher(TEST_PROJECT_NAME);

    // Stop and restart
    await watcherService.stopWatcher(TEST_PROJECT_NAME);
    await watcherService.restartWatcher(TEST_PROJECT_NAME);

    // Wait for watcher to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create a file
    writeFileSync(join(TEST_PROJECT_PATH, 'test-file.txt'), 'test content');

    // Wait for change detection
    await new Promise(resolve => setTimeout(resolve, 500));

    expect(changeDetected).toBe(true);
  });

  test('should clean up all watchers on stopAllWatchers', async () => {
    const projects = new Map([
      ['project1', join(tmpdir(), 'project1')],
      ['project2', join(tmpdir(), 'project2')]
    ]);

    // Create directories
    for (const [, path] of projects) {
      if (!existsSync(path)) {
        mkdirSync(path, { recursive: true });
      }
    }

    watcherService.setProjectPaths(projects);
    watcherService.initializeAllWatchers();

    expect(watcherService.watchers.size).toBe(2);

    await watcherService.stopAllWatchers();

    expect(watcherService.watchers.size).toBe(0);

    // Clean up test directories
    for (const [, path] of projects) {
      if (existsSync(path)) {
        rmSync(path, { recursive: true });
      }
    }
  });
});
