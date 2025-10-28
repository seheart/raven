/**
 * Tests for ProjectManager
 */

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
    } catch (_error) {
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

    test('should load projects from config file', () => {
      const configPath = join(testDir, 'config.toml');
      const configContent = `
[projects]
path = "/path/to/project1"
path = "/path/to/project2"
`;
      writeFileSync(configPath, configContent);

      const projects = manager.discoverProjects();

      expect(projects.length).toBeGreaterThan(0);
      expect(projects.some(p => p.name === 'project1')).toBe(true);
      expect(projects.some(p => p.name === 'project2')).toBe(true);
    });

    test('should handle config parsing errors gracefully', () => {
      const configPath = join(testDir, 'config.toml');
      // Create invalid config that causes read error by making it a directory
      mkdirSync(configPath, { recursive: true });

      const projects = manager.discoverProjects();

      // Should fallback to auto-discovery or default
      expect(Array.isArray(projects)).toBe(true);
    });

    test('should ignore hidden DB files', () => {
      const dbDir = join(testDir, 'db');
      writeFileSync(join(dbDir, 'project1.db'), '');
      writeFileSync(join(dbDir, '.hidden.db'), '');

      const projects = manager.discoverProjects();

      expect(projects.some(p => p.name === 'project1')).toBe(true);
      expect(projects.some(p => p.name === '.hidden')).toBe(false);
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

  describe('Project Initialization', () => {
    test('should initialize a single project successfully', () => {
      const result = manager.initializeProject('test-project');

      expect(result.success).toBe(true);
      expect(result.projectName).toBe('test-project');
      expect(result.database).toContain('test-project.db');
      expect(manager.projectDatabases.has('test-project')).toBe(true);
      expect(manager.projectState.has('test-project')).toBe(true);
    });

    test('should store project state when initializing', () => {
      manager.initializeProject('test-project');

      const state = manager.projectState.get('test-project');
      expect(state).toBeDefined();
      expect(state.name).toBe('test-project');
      expect(state.initialized).toBe(true);
      expect(state.startTime).toBeDefined();
    });

    test('should initialize all discovered projects', () => {
      const dbDir = join(testDir, 'db');
      writeFileSync(join(dbDir, 'project1.db'), '');
      writeFileSync(join(dbDir, 'project2.db'), '');

      const result = manager.initializeAllProjects();

      expect(result.success).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
      expect(result.projects).toBeDefined();
      expect(manager.availableProjects.length).toBeGreaterThan(0);
    });

    test('should set active project after initialization', () => {
      const dbDir = join(testDir, 'db');
      writeFileSync(join(dbDir, 'project1.db'), '');

      manager.initializeAllProjects();

      expect(manager.activeProject).toBeDefined();
      expect(manager.availableProjects).toContain(manager.activeProject);
    });

    test('should handle initialization failure gracefully', () => {
      // Create manager with invalid db directory
      const badManager = new ProjectManager({
        ravenDir: testDir,
        dbDir: '/invalid/nonexistent/path/that/does/not/exist'
      });

      const result = badManager.initializeProject('failing-project');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should count successful and failed initializations', () => {
      const dbDir = join(testDir, 'db');
      writeFileSync(join(dbDir, 'project1.db'), '');

      const result = manager.initializeAllProjects();

      expect(result.success + result.failed).toBe(result.total);
    });

    test('should increment failCount when project initialization fails', () => {
      const dbDir = join(testDir, 'db');
      // Create two db files - one will succeed, one will fail
      writeFileSync(join(dbDir, 'good-project.db'), '');
      writeFileSync(join(dbDir, 'bad-project.db'), '');

      // Mock initializeProject to fail for bad-project
      const originalInit = manager.initializeProject.bind(manager);
      manager.initializeProject = function(projectName) {
        if (projectName === 'bad-project') {
          return { success: false, projectName, error: 'Forced failure' };
        }
        return originalInit(projectName);
      };

      const result = manager.initializeAllProjects();

      expect(result.failed).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(1);

      // Restore
      manager.initializeProject = originalInit;
    });
  });

  describe('Project Switching', () => {
    test('should switch to an existing project', async () => {
      const dbDir = join(testDir, 'db');
      writeFileSync(join(dbDir, 'project1.db'), '');
      writeFileSync(join(dbDir, 'project2.db'), '');

      manager.initializeAllProjects();

      const result = await manager.switchProject('project2');

      expect(result.success).toBe(true);
      expect(result.activeProject).toBe('project2');
      expect(manager.activeProject).toBe('project2');
    });

    test('should throw error when switching to nonexistent project', async () => {
      await expect(manager.switchProject('nonexistent-project'))
        .rejects.toThrow('Project not found: nonexistent-project');
    });

    test('should switch project with mutex protection', async () => {
      const dbDir = join(testDir, 'db');
      writeFileSync(join(dbDir, 'project1.db'), '');
      writeFileSync(join(dbDir, 'project2.db'), '');

      manager.initializeAllProjects();

      // Test that multiple switches queue properly
      const switch1 = manager.switchProject('project1');
      const switch2 = manager.switchProject('project2');

      const results = await Promise.all([switch1, switch2]);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(manager.activeProject).toBe('project2');
    });
  });

  describe('Database Access', () => {
    test('should get database for active project', () => {
      const dbDir = join(testDir, 'db');
      writeFileSync(join(dbDir, 'project1.db'), '');

      manager.initializeAllProjects();

      const db = manager.getProjectDatabase();
      expect(db).toBeDefined();
    });

    test('should get database for specific project', () => {
      manager.initializeProject('test-project');

      const db = manager.getProjectDatabase('test-project');
      expect(db).toBeDefined();
    });

    test('should get default project database', () => {
      manager.initializeProject('test-project');
      manager.activeProject = 'test-project';

      const db = manager.getDefaultProjectDb();
      expect(db).toBeDefined();
    });

    test('should fallback to first database when no active project', () => {
      manager.initializeProject('test-project');
      manager.activeProject = null;

      const db = manager.getDefaultProjectDb();
      expect(db).toBeDefined();
    });

    test('should return null when no databases exist', () => {
      const db = manager.getDefaultProjectDb();
      expect(db).toBeNull();
    });

    test('should get state for active project when no projectName specified', () => {
      manager.initializeProject('test-project');
      manager.activeProject = 'test-project';

      const state = manager.getProjectState();
      expect(state).toBeDefined();
      expect(state.name).toBe('test-project');
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

    test('should cleanup all initialized projects', async () => {
      const dbDir = join(testDir, 'db');
      writeFileSync(join(dbDir, 'project1.db'), '');
      writeFileSync(join(dbDir, 'project2.db'), '');

      manager.initializeAllProjects();

      expect(manager.projectDatabases.size).toBeGreaterThan(0);

      await manager.cleanup();

      expect(manager.projectDatabases.size).toBe(0);
      expect(manager.projectPaths.size).toBe(0);
    });

    test('should handle cleanup errors gracefully', async () => {
      manager.initializeProject('test-project');

      // Mock a database that throws on close
      const mockDb = manager.projectDatabases.get('test-project');
      mockDb.close = () => {
        throw new Error('Close error');
      };

      // Should not throw
      await expect(manager.cleanup()).resolves.not.toThrow();

      // Should still clear maps
      expect(manager.projectDatabases.size).toBe(0);
    });
  });
});
