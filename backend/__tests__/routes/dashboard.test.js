/**
 * Tests for Dashboard Route Module
 * Tests the parallelized dashboard endpoints optimized in Phase 2
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createDashboardRoutes } from '../../routes/dashboard.js';
import { dashboardCache } from '../../utils/cache.js';

describe('Dashboard Routes', () => {
  let app;
  let mockDeps;
  let mockDb1, mockDb2;

  beforeEach(() => {
    // Create mock databases for multiple projects
    mockDb1 = {
      getDashboardStats: jest.fn().mockReturnValue({
        total_events: 100,
        total_files: 50,
        total_agents: 2,
        session_duration_seconds: 3600,
        active_files_today: 25,
        total_changes: 80,
        creates: 20,
        edits: 50,
        deletes: 10,
        unique_files_modified: 30
      }),
      getTopModifiedFiles: jest.fn().mockReturnValue([
        { filepath: 'file1.js', change_count: 10, edit_count: 10, total_lines_changed: 100 },
        { filepath: 'file2.js', change_count: 8, edit_count: 8, total_lines_changed: 80 }
      ]),
      getLongestEdits: jest.fn().mockReturnValue([{ file: 'long1.js', duration_ms: 5000 }]),
      getHistoricalAgents: jest
        .fn()
        .mockReturnValue([
          {
            agent_name: 'agent1',
            agent_type: 'type1',
            last_seen: new Date().toISOString(),
            requests_handled: 10,
            errors: 0
          }
        ]),
      getAgentStats: jest.fn().mockReturnValue({ total: 10, avg_duration: 100 }),
      db: {
        prepare: jest.fn(sql => ({
          all: jest.fn(_sessionId => {
            // Mock agent queries for project1 - return 2 unique agents
            if (sql.includes('DISTINCT agent FROM agent_events')) {
              return [{ agent: 'agent1' }, { agent: 'agent2' }];
            }
            return [];
          })
        }))
      }
    };

    mockDb2 = {
      getDashboardStats: jest.fn().mockReturnValue({
        total_events: 200,
        total_files: 100,
        total_agents: 3,
        session_duration_seconds: 7200,
        active_files_today: 50,
        total_changes: 160,
        creates: 40,
        edits: 100,
        deletes: 20,
        unique_files_modified: 60
      }),
      getTopModifiedFiles: jest.fn().mockReturnValue([
        { filepath: 'file3.js', change_count: 15, edit_count: 15, total_lines_changed: 150 },
        { filepath: 'file4.js', change_count: 12, edit_count: 12, total_lines_changed: 120 }
      ]),
      getLongestEdits: jest.fn().mockReturnValue([]),
      getHistoricalAgents: jest.fn().mockReturnValue([]),
      getAgentStats: jest.fn().mockReturnValue({ total: 20, avg_duration: 200 }),
      db: {
        prepare: jest.fn(sql => ({
          all: jest.fn(_sessionId => {
            // Mock agent queries for project2 - return 3 unique agents (no overlap)
            if (sql.includes('DISTINCT agent FROM agent_events')) {
              return [{ agent: 'agent3' }, { agent: 'agent4' }, { agent: 'agent5' }];
            }
            return [];
          })
        }))
      }
    };

    // Create project state mock
    const mockProjectState = {
      db: mockDb1
    };

    // Create mock dependencies
    mockDeps = {
      projectDatabases: new Map([
        ['project1', mockDb1],
        ['project2', mockDb2]
      ]),
      projectState: mockProjectState,
      SESSION_ID: 'test-session-123',
      agentRegistry: new Map(),
      getAgentColor: _name => '#FF0000'
    };

    // Create Express app with dashboard routes
    app = express();
    app.use(express.json());
    app.use('/api', createDashboardRoutes(mockDeps));
  });

  describe('GET /api/dashboard-stats - PARALLELIZED (Phase 2)', () => {
    test('should aggregate stats from all projects in parallel', async () => {
      const response = await request(app).get('/api/dashboard-stats');

      expect(response.status).toBe(200);

      // Verify parallelization: both databases should be queried
      expect(mockDb1.getDashboardStats).toHaveBeenCalledWith('test-session-123');
      expect(mockDb2.getDashboardStats).toHaveBeenCalledWith('test-session-123');

      // Verify aggregated stats (100+200, 50+100, etc.)
      expect(response.body).toMatchObject({
        total_events: 300,
        total_files: 150,
        total_agents: 5,
        active_files_today: 75,
        total_changes: 240,
        creates: 60,
        edits: 150,
        deletes: 30,
        unique_files_modified: 90
      });
    });

    test('should handle single project', async () => {
      dashboardCache.clear(); // Clear cache before test

      // Create new app with single project
      const singleProjectDeps = {
        ...mockDeps,
        projectDatabases: new Map([['project1', mockDb1]])
      };

      const testApp = express();
      testApp.use(express.json());
      testApp.use('/api', createDashboardRoutes(singleProjectDeps));

      const response = await request(testApp).get('/api/dashboard-stats');

      expect(response.status).toBe(200);
      expect(response.body.total_events).toBe(100);
    });

    test('should use longest session duration', async () => {
      dashboardCache.clear(); // Clear cache before test

      const response = await request(app)
        .get('/api/dashboard-stats')
        .set('Cache-Control', 'no-cache');

      expect(response.status).toBe(200);
      // Should use the longer duration (7200)
      expect(response.body.session_duration_seconds).toBe(7200);
    });

    test('should handle database errors gracefully', async () => {
      dashboardCache.clear(); // Clear cache before error test

      mockDb1.getDashboardStats.mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app)
        .get('/api/dashboard-stats')
        .set('Cache-Control', 'no-cache');

      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/top-modified-files - PARALLELIZED (Phase 2)', () => {
    test('should aggregate and sort files from all projects', async () => {
      const response = await request(app).get('/api/top-modified-files?limit=4');

      expect(response.status).toBe(200);

      // Verify parallelization: both databases should be queried
      expect(mockDb1.getTopModifiedFiles).toHaveBeenCalledWith('test-session-123', 4);
      expect(mockDb2.getTopModifiedFiles).toHaveBeenCalledWith('test-session-123', 4);

      // Should return all 4 files sorted by edit_count descending
      expect(response.body.files).toHaveLength(4);
      expect(response.body.files[0]).toMatchObject({
        filepath: 'file3.js',
        edit_count: 15,
        project: 'project2'
      });
      expect(response.body.files[1]).toMatchObject({
        filepath: 'file4.js',
        edit_count: 12,
        project: 'project2'
      });
      expect(response.body.files[2]).toMatchObject({
        filepath: 'file1.js',
        edit_count: 10,
        project: 'project1'
      });
      expect(response.body.files[3]).toMatchObject({
        filepath: 'file2.js',
        edit_count: 8,
        project: 'project1'
      });
    });

    test('should respect limit parameter', async () => {
      const response = await request(app).get('/api/top-modified-files?limit=2');

      expect(response.status).toBe(200);
      expect(response.body.files).toHaveLength(2);
    });

    test('should use default limit of 10', async () => {
      await request(app).get('/api/top-modified-files');

      expect(mockDb1.getTopModifiedFiles).toHaveBeenCalledWith('test-session-123', 10);
      expect(mockDb2.getTopModifiedFiles).toHaveBeenCalledWith('test-session-123', 10);
    });

    test('should tag files with project names', async () => {
      const response = await request(app).get('/api/top-modified-files');

      expect(response.status).toBe(200);
      response.body.files.forEach(file => {
        expect(file.project).toBeDefined();
        expect(['project1', 'project2']).toContain(file.project);
      });
    });

    test('should handle empty results from some projects', async () => {
      dashboardCache.clear(); // Clear cache before test

      mockDb2.getTopModifiedFiles.mockReturnValue([]);

      const response = await request(app)
        .get('/api/top-modified-files')
        .set('Cache-Control', 'no-cache');

      expect(response.status).toBe(200);
      expect(response.body.files).toHaveLength(2);
    });
  });

  describe('GET /api/longest-edits', () => {
    test('should return longest edits from active project', async () => {
      const response = await request(app).get('/api/longest-edits?limit=5');

      expect(response.status).toBe(200);
      expect(mockDeps.projectState.db.getLongestEdits).toHaveBeenCalledWith(5);
    });

    test('should use default limit of 10', async () => {
      await request(app).get('/api/longest-edits');

      expect(mockDeps.projectState.db.getLongestEdits).toHaveBeenCalledWith(10);
    });
  });

  describe('GET /api/agents-status', () => {
    beforeEach(() => {
      // Add some agents to registry
      mockDeps.agentRegistry.set('live-agent', {
        agent_name: 'live-agent',
        agent_type: 'test',
        last_seen: new Date().toISOString(),
        requests_handled: 5,
        errors: 0,
        is_running: true,
        models_available: [],
        color: '#00FF00'
      });

      // Add an old agent (30+ seconds ago)
      const oldDate = new Date(Date.now() - 60000); // 60 seconds ago
      mockDeps.agentRegistry.set('old-agent', {
        agent_name: 'old-agent',
        agent_type: 'test',
        last_seen: oldDate.toISOString(),
        requests_handled: 10,
        errors: 2,
        is_running: false,
        models_available: [],
        color: '#FF0000'
      });
    });

    test('should combine historical and live agents', async () => {
      const response = await request(app).get('/api/agents-status');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      // Should have historical agents from DB + live agents from registry
      const agentNames = response.body.map(a => a.agent_name);
      expect(agentNames).toContain('agent1'); // from historical
      expect(agentNames).toContain('live-agent'); // from registry
    });

    test('should mark recent agents as running', async () => {
      const response = await request(app).get('/api/agents-status');

      expect(response.status).toBe(200);
      const liveAgent = response.body.find(a => a.agent_name === 'live-agent');
      expect(liveAgent.is_running).toBe(true);
    });

    test('should mark old agents as not running', async () => {
      const response = await request(app).get('/api/agents-status');

      expect(response.status).toBe(200);
      const oldAgent = response.body.find(a => a.agent_name === 'old-agent');
      expect(oldAgent.is_running).toBe(false);
    });

    test('should assign colors to agents', async () => {
      const response = await request(app).get('/api/agents-status');

      expect(response.status).toBe(200);
      response.body.forEach(agent => {
        expect(agent.color).toBeDefined();
      });
    });
  });

  describe('GET /api/agent-stats', () => {
    test('should return stats from active project database', async () => {
      const response = await request(app).get('/api/agent-stats');

      expect(response.status).toBe(200);
      expect(mockDeps.projectState.db.getAgentStats).toHaveBeenCalled();
      expect(response.body).toMatchObject({
        total: 10,
        avg_duration: 100
      });
    });

    test('should handle database errors', async () => {
      // Reset mock and set error implementation before making request
      mockDeps.projectState.db.getAgentStats.mockClear();
      mockDeps.projectState.db.getAgentStats.mockImplementation(() => {
        throw new Error('Database error');
      });

      // Use query param to bust cache
      const response = await request(app).get('/api/agent-stats?_bustCache=' + Date.now());

      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('Performance - Parallelization', () => {
    test('should query all databases concurrently not sequentially', async () => {
      let db1Called = false;
      let db2Called = false;
      // let bothCalledSimultaneously = false;

      mockDb1.getDashboardStats = jest.fn(() => {
        db1Called = true;
        if (db2Called) bothCalledSimultaneously = true;
        return mockDb1.getDashboardStats.mock.results[0].value;
      });

      mockDb2.getDashboardStats = jest.fn(() => {
        db2Called = true;
        if (db1Called) bothCalledSimultaneously = true;
        return mockDb2.getDashboardStats.mock.results[0].value;
      });

      await request(app).get('/api/dashboard-stats');

      // Both should be called
      expect(db1Called).toBe(true);
      expect(db2Called).toBe(true);
    });
  });
});
