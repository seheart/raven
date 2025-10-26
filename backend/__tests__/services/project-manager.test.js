/**
 * Tests for ProjectManager
 */

import { jest } from '@jest/globals';
import { ProjectManager } from '../../services/project-manager.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ProjectManager', () => {
  let manager;
  let testDir;

  beforeEach(() => {
    // Create temporary test directory
    testDir = join(tmpdir(), `raven-test-${Date.now()}`);
    const dbDir = join(testDir, 'db');
    mkdirSync(dbDir, { recursive: true });

    manager = new ProjectManager({
      ravenDir: testDir,
      dbDir
    });
  });

  afterEach(async () => {
    if (manager) {
      await manager.cleanup();
    }

    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Initialization', () => {
    test('should initialize with default paths', () => {
      expect(manager.projectState).toBeInstanceOf(Map);
      expect(manager.projectDatabases).toBeInstanceOf(Map);
      expect(manager.projectPaths).toBeInstanceOf(Map);
      expect(manager.availableProjects).toEqual([]);
    });

    test('should have correct paths', () => {
      expect(manager.RAVEN_DIR).toBe(testDir);
      expect(manager.DB_DIR).toBe(join(testDir, 'db'));
    });
  });

  describe('Project Discovery', () => {
    test('should discover projects from DB files', () => {
      // Create test DB files
      const dbDir = join(testDir, 'db');
      writeFileSync(join(dbDir, 'project1.db'), '');
      writeFileSync(join(dbDir, 'project2.db'), '');

      const projects = manager.discoverProjects();

      expect(Array.isArray(projects)).toBe(true);
      expect(projects.length).toBeGreaterThan(0);
      expect(projects.some(p => p.name === 'project1')).toBe(true);
      expect(projects.some(p => p.name === 'project2')).toBe(true);
    });

    test('should return default project when no DB files exist', () => {
      const projects = manager.discoverProjects();

      expect(Array.isArray(projects)).toBe(true);
      expect(projects.length).toBe(1);
      expect(projects[0]).toHaveProperty('is_default', true);
    });
  });

  describe('Project Operations', () => {
    test('should get default project name', () => {
      const name = manager.getDefaultProjectName();
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    });

    test('should get all projects', () => {
      const projects = manager.getAllProjects();
      expect(Array.isArray(projects)).toBe(true);
    });

    test('should get project state', () => {
      const state = manager.getProjectState('nonexistent');
      expect(state).toBeUndefined();
    });

    test('should get project database', () => {
      const db = manager.getProjectDatabase('nonexistent');
      expect(db).toBeUndefined();
    });
  });

  describe('Mutex Operations', () => {
    test('should execute function with mutex', async () => {
      const result = await manager.withMutex(async () => {
        return 'test-result';
      });

      expect(result).toBe('test-result');
    });

    test('should handle errors in mutex', async () => {
      await expect(manager.withMutex(async () => {
        throw new Error('Test error');
      })).rejects.toThrow('Test error');
    });

    test('should queue operations when mutex is locked', async () => {
      const results = [];

      // Start two operations
      const promise1 = manager.withMutex(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push(1);
        return 1;
      });

      const promise2 = manager.withMutex(async () => {
        results.push(2);
        return 2;
      });

      await Promise.all([promise1, promise2]);

      // Both should complete
      expect(results).toContain(1);
      expect(results).toContain(2);
    });
  });

  describe('Cleanup', () => {
    test('should cleanup resources', async () => {
      await manager.cleanup();

      expect(manager.projectDatabases.size).toBe(0);
      expect(manager.projectState.size).toBe(0);
      expect(manager.availableProjects.length).toBe(0);
      expect(manager.activeProject).toBeNull();
    });
  });
});
