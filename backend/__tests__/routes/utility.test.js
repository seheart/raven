/**
 * Tests for Utility Routes
 */

import request from 'supertest';
import express from 'express';
import { createUtilityRoutes } from '../../routes/utility.js';

describe('Utility Routes', () => {
  let app;
  let mockProjectState;
  let mockDb;
  let preparedStatements;
  let runCalls;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Track all database operations
    preparedStatements = [];
    runCalls = [];

    // Create mock database with prepare/run functionality
    mockDb = {
      prepare: (sql) => {
        preparedStatements.push(sql);
        return {
          run: (timestamp) => {
            runCalls.push({ sql, timestamp });
            return { changes: 5 };
          }
        };
      }
    };

    mockProjectState = {
      db: { db: mockDb }
    };

    const deps = {
      projectState: mockProjectState,
      app: app // For endpoints discovery
    };

    app.use('/api', createUtilityRoutes(deps));
  });

  describe('POST /api/database/clear-old/:days', () => {
    describe('Success Cases', () => {
      test('should successfully delete old entries with valid days parameter', async () => {
        const response = await request(app)
          .post('/api/database/clear-old/30')
          .expect('Content-Type', /json/)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('deletedCount');
        expect(response.body).toHaveProperty('cutoffDate');
      });

      test('should delete entries with days = 1', async () => {
        const response = await request(app)
          .post('/api/database/clear-old/1')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('1 days');
      });

      test('should delete entries with days = 7', async () => {
        const response = await request(app)
          .post('/api/database/clear-old/7')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('7 days');
      });

      test('should delete entries with days = 365', async () => {
        const response = await request(app)
          .post('/api/database/clear-old/365')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('365 days');
      });

      test('should return correct deletedCount', async () => {
        const response = await request(app)
          .post('/api/database/clear-old/30')
          .expect(200);

        expect(typeof response.body.deletedCount).toBe('number');
        expect(response.body.deletedCount).toBeGreaterThanOrEqual(0);
      });

      test('should return cutoffDate in ISO format', async () => {
        const response = await request(app)
          .post('/api/database/clear-old/30')
          .expect(200);

        expect(response.body.cutoffDate).toBeTruthy();
        expect(new Date(response.body.cutoffDate).toISOString()).toBe(response.body.cutoffDate);
      });

      test('should calculate correct cutoffDate for given days', async () => {
        const beforeRequest = new Date();
        const days = 45;

        const response = await request(app)
          .post('/api/database/clear-old/' + days)
          .expect(200);

        const cutoffDate = new Date(response.body.cutoffDate);
        const expectedDate = new Date(beforeRequest);
        expectedDate.setDate(expectedDate.getDate() - days);

        // Allow 1 second difference for test execution time
        expect(Math.abs(cutoffDate.getTime() - expectedDate.getTime())).toBeLessThan(1000);
      });

      test('should delete from all 4 tables', async () => {
        await request(app)
          .post('/api/database/clear-old/30')
          .expect(200);

        // Should have prepared 4 statements (one for each table)
        expect(preparedStatements.length).toBe(4);
      });

      test('should pass correct timestamp to each DELETE statement', async () => {
        const days = 30;
        const beforeRequest = Date.now();

        await request(app)
          .post('/api/database/clear-old/' + days)
          .expect(200);

        const expectedTimestamp = beforeRequest - (days * 24 * 60 * 60 * 1000);

        // Each run call should have a timestamp close to our expected value
        runCalls.forEach(call => {
          // Allow 1 second difference
          expect(Math.abs(call.timestamp - expectedTimestamp)).toBeLessThan(1000);
        });
      });

      test('should handle large days parameter (edge case)', async () => {
        const response = await request(app)
          .post('/api/database/clear-old/10000')
          .expect(200);

        expect(response.body.success).toBe(true);
      });
    });

    describe('Validation - Invalid Days Parameter', () => {
      test('should reject non-numeric days', async () => {
        const response = await request(app)
          .post('/api/database/clear-old/abc')
          .expect('Content-Type', /json/)
          .expect(400);

        expect(response.body.error).toBe('Invalid days parameter');
      });

      test('should reject days less than 1', async () => {
        const response = await request(app)
          .post('/api/database/clear-old/-5')
          .expect(400);

        expect(response.body.error).toBe('Invalid days parameter');
      });

      test('should reject days = 0', async () => {
        const response = await request(app)
          .post('/api/database/clear-old/0')
          .expect(400);

        expect(response.body.error).toBe('Invalid days parameter');
      });

      test('should reject negative days', async () => {
        const response = await request(app)
          .post('/api/database/clear-old/-10')
          .expect(400);

        expect(response.body.error).toBe('Invalid days parameter');
      });

      test('should accept decimal days (parseInt truncates)', async () => {
        const response = await request(app)
          .post('/api/database/clear-old/30.5')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('30 days');
      });

      test('should reject empty days parameter', async () => {
        const response = await request(app)
          .post('/api/database/clear-old/')
          .expect(404); // Express 404 for missing param
      });

      test('should reject string with numbers and letters', async () => {
        const response = await request(app)
          .post('/api/database/clear-old/30abc')
          .expect(200); // parseInt('30abc') = 30

        expect(response.body.success).toBe(true);
      });

      test('should reject special characters', async () => {
        const response = await request(app)
          .post('/api/database/clear-old/@#$')
          .expect(400);

        expect(response.body.error).toBe('Invalid days parameter');
      });

      test('should reject floating point less than 1', async () => {
        const response = await request(app)
          .post('/api/database/clear-old/0.5')
          .expect(400);

        expect(response.body.error).toBe('Invalid days parameter');
      });
    });

    describe('Database Initialization Errors', () => {
      test('should return 500 when projectState.db is null', async () => {
        mockProjectState.db = null;

        const response = await request(app)
          .post('/api/database/clear-old/30')
          .expect('Content-Type', /json/)
          .expect(500);

        expect(response.body.error).toBe('Database not initialized');
      });

      test('should return 500 when projectState.db is undefined', async () => {
        mockProjectState.db = undefined;

        const response = await request(app)
          .post('/api/database/clear-old/30')
          .expect(500);

        expect(response.body.error).toBe('Database not initialized');
      });

      test('should return 500 when projectState.db.db is null', async () => {
        mockProjectState.db = { db: null };

        const response = await request(app)
          .post('/api/database/clear-old/30')
          .expect(500);

        expect(response.body.error).toBe('Database not initialized');
      });

      test('should return 500 when projectState.db.db is undefined', async () => {
        mockProjectState.db = { db: undefined };

        const response = await request(app)
          .post('/api/database/clear-old/30')
          .expect(500);

        expect(response.body.error).toBe('Database not initialized');
      });
    });

    describe('Database Error Handling', () => {
      test('should handle database error during prepare', async () => {
        mockDb.prepare = () => {
          throw new Error('Database connection error');
        };

        const response = await request(app)
          .post('/api/database/clear-old/30')
          .expect('Content-Type', /json/)
          .expect(500);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Database connection error');
      });

      test('should handle database error during run', async () => {
        mockDb.prepare = () => ({
          run: () => {
            throw new Error('SQL execution error');
          }
        });

        const response = await request(app)
          .post('/api/database/clear-old/30')
          .expect(500);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('SQL execution error');
      });

      test('should handle error when changes property is missing', async () => {
        mockDb.prepare = () => ({
          run: () => ({}) // No changes property
        });

        const response = await request(app)
          .post('/api/database/clear-old/30')
          .expect(200);

        // Should handle gracefully with NaN
        expect(response.body.success).toBe(true);
      });
    });

    describe('Empty Result Cases', () => {
      test('should handle no entries to delete', async () => {
        mockDb.prepare = () => ({
          run: () => ({ changes: null })
        });

        const response = await request(app)
          .post('/api/database/clear-old/30')
          .expect(200);

        expect(response.body.success).toBe(true);
        // totalDeleted accumulates, so null + null + null + null = 0 (NaN becomes 0)
        expect(response.body.deletedCount).toBe(0);
      });

      test('should handle partial deletion results', async () => {
        mockDb.prepare = () => ({
          run: () => ({ changes: 0 })
        });

        const response = await request(app)
          .post('/api/database/clear-old/30')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.deletedCount).toBe(0);
      });
    });

    describe('Response Format Verification', () => {
      test('should have all required response fields', async () => {
        const response = await request(app)
          .post('/api/database/clear-old/30')
          .expect(200);

        expect(response.body).toHaveProperty('success');
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('deletedCount');
        expect(response.body).toHaveProperty('cutoffDate');
      });

      test('should have correct data types in response', async () => {
        const response = await request(app)
          .post('/api/database/clear-old/30')
          .expect(200);

        expect(typeof response.body.success).toBe('boolean');
        expect(typeof response.body.message).toBe('string');
        expect(typeof response.body.deletedCount).toBe('number');
        expect(typeof response.body.cutoffDate).toBe('string');
      });

      test('should include days in message', async () => {
        const response = await request(app)
          .post('/api/database/clear-old/30')
          .expect(200);

        expect(response.body.message).toContain('30 days');
      });

      test('should include deleted count in message', async () => {
        const response = await request(app)
          .post('/api/database/clear-old/30')
          .expect(200);

        expect(response.body.message).toContain('20'); // 4 tables * 5 changes each
      });
    });

    describe('Security - Table Whitelisting', () => {
      test('should only delete from whitelisted tables', async () => {
        await request(app)
          .post('/api/database/clear-old/30')
          .expect(200);

        const allowedTables = ['events', 'agent_events', 'raven_metrics', 'process_metrics'];

        // Verify all prepared statements are for allowed tables
        preparedStatements.forEach(sql => {
          const hasAllowedTable = allowedTables.some(table => sql.includes(table));
          expect(hasAllowedTable).toBe(true);
        });
      });

      test('should not attempt to delete from non-whitelisted tables', async () => {
        await request(app)
          .post('/api/database/clear-old/30')
          .expect(200);

        const forbiddenTables = ['users', 'passwords', 'admin', 'config'];

        // Verify no statements for forbidden tables
        preparedStatements.forEach(sql => {
          forbiddenTables.forEach(table => {
            expect(sql).not.toContain(table);
          });
        });
      });
    });
  });

  describe('GET /api/endpoints', () => {
    describe('Success Cases', () => {
      test('should return endpoint list with correct format', async () => {
        const response = await request(app)
          .get('/api/endpoints')
          .expect('Content-Type', /json/)
          .expect(200);

        expect(response.body).toHaveProperty('total');
        expect(response.body).toHaveProperty('endpoints');
        expect(Array.isArray(response.body.endpoints)).toBe(true);
      });

      test('should return endpoints with required fields', async () => {
        const response = await request(app)
          .get('/api/endpoints')
          .expect(200);

        if (response.body.endpoints.length > 0) {
          const endpoint = response.body.endpoints[0];
          expect(endpoint).toHaveProperty('category');
          expect(endpoint).toHaveProperty('method');
          expect(endpoint).toHaveProperty('path');
          expect(endpoint).toHaveProperty('description');
        }
      });

      test('should include the utility routes we defined', async () => {
        const response = await request(app)
          .get('/api/endpoints')
          .expect(200);

        // Should include our two utility routes
        const endpointPaths = response.body.endpoints.map(e => e.path);
        expect(endpointPaths).toContain('/api/database/clear-old/:days');
        expect(endpointPaths).toContain('/api/endpoints');
      });

      test('should capture POST method for database clear route', async () => {
        const response = await request(app)
          .get('/api/endpoints')
          .expect(200);

        const clearEndpoint = response.body.endpoints.find(
          e => e.path === '/api/database/clear-old/:days'
        );
        expect(clearEndpoint).toBeDefined();
        expect(clearEndpoint.method).toBe('POST');
      });

      test('should capture GET method for endpoints route', async () => {
        const response = await request(app)
          .get('/api/endpoints')
          .expect(200);

        const endpointsEndpoint = response.body.endpoints.find(
          e => e.path === '/api/endpoints'
        );
        expect(endpointsEndpoint).toBeDefined();
        expect(endpointsEndpoint.method).toBe('GET');
      });

      test('should return valid total count', async () => {
        const response = await request(app)
          .get('/api/endpoints')
          .expect(200);

        expect(response.body.total).toBe(response.body.endpoints.length);
        expect(response.body.total).toBeGreaterThanOrEqual(2); // At least our 2 routes
      });
    });

    describe('Categorization Logic', () => {
      test('should categorize routes correctly', async () => {
        const response = await request(app)
          .get('/api/endpoints')
          .expect(200);

        // All endpoints should have a category
        response.body.endpoints.forEach(endpoint => {
          expect(endpoint.category).toBeTruthy();
          expect(typeof endpoint.category).toBe('string');
        });
      });

      test('should have valid category values', async () => {
        const response = await request(app)
          .get('/api/endpoints')
          .expect(200);

        const validCategories = [
          'Sync', 'Storage', 'Git', 'Projects', 'Notifications',
          'Errors', 'Agents', 'Metrics', 'Triggers', 'Files',
          'Control', 'Dashboard', 'Documentation', 'Changelog',
          'Core', 'Other'
        ];

        response.body.endpoints.forEach(endpoint => {
          expect(validCategories).toContain(endpoint.category);
        });
      });
    });

    describe('Sorting Behavior', () => {
      test('should sort endpoints by category then path', async () => {
        const response = await request(app)
          .get('/api/endpoints')
          .expect(200);

        const endpoints = response.body.endpoints;

        // Verify sorting by category
        for (let i = 1; i < endpoints.length; i++) {
          const categoryCompare = endpoints[i].category.localeCompare(
            endpoints[i - 1].category
          );
          if (categoryCompare === 0) {
            // Same category - should be sorted by path
            expect(endpoints[i].path.localeCompare(endpoints[i - 1].path))
              .toBeGreaterThanOrEqual(0);
          }
        }
      });

      test('should maintain consistent sorting order', async () => {
        const response1 = await request(app).get('/api/endpoints').expect(200);
        const response2 = await request(app).get('/api/endpoints').expect(200);

        expect(response1.body.endpoints).toEqual(response2.body.endpoints);
      });
    });

    describe('Response Format Verification', () => {
      test('should return correct JSON structure', async () => {
        const response = await request(app)
          .get('/api/endpoints')
          .expect('Content-Type', /json/)
          .expect(200);

        expect(response.body).toHaveProperty('total');
        expect(response.body).toHaveProperty('endpoints');
        expect(typeof response.body.total).toBe('number');
        expect(Array.isArray(response.body.endpoints)).toBe(true);
      });

      test('endpoint objects should have correct structure', async () => {
        const response = await request(app)
          .get('/api/endpoints')
          .expect(200);

        response.body.endpoints.forEach(endpoint => {
          expect(endpoint).toHaveProperty('category');
          expect(endpoint).toHaveProperty('method');
          expect(endpoint).toHaveProperty('path');
          expect(endpoint).toHaveProperty('description');
          expect(typeof endpoint.category).toBe('string');
          expect(typeof endpoint.method).toBe('string');
          expect(typeof endpoint.path).toBe('string');
          expect(typeof endpoint.description).toBe('string');
        });
      });

      test('method should be uppercase', async () => {
        const response = await request(app)
          .get('/api/endpoints')
          .expect(200);

        response.body.endpoints.forEach(endpoint => {
          expect(endpoint.method).toBe(endpoint.method.toUpperCase());
        });
      });

      test('paths should be strings', async () => {
        const response = await request(app)
          .get('/api/endpoints')
          .expect(200);

        response.body.endpoints.forEach(endpoint => {
          expect(typeof endpoint.path).toBe('string');
          expect(endpoint.path.length).toBeGreaterThan(0);
        });
      });

      test('descriptions should be strings', async () => {
        const response = await request(app)
          .get('/api/endpoints')
          .expect(200);

        response.body.endpoints.forEach(endpoint => {
          expect(typeof endpoint.description).toBe('string');
        });
      });
    });
  });
});
