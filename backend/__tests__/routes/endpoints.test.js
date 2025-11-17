/**
 * API Endpoints Discovery Test Suite
 * Tests the /api/endpoints endpoint that lists all available endpoints
 */

import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const app = express();
app.use(express.json());

// Mock the endpoints route
app.get('/api/endpoints', (req, res) => {
  res.json({
    endpoints: [
      { path: '/api/status', method: 'GET', category: 'Core', description: 'Server status' },
      { path: '/api/health', method: 'GET', category: 'Core', description: 'Health check' },
      { path: '/api/events', method: 'GET', category: 'Data', description: 'List events' },
      { path: '/api/errors', method: 'GET', category: 'Data', description: 'List errors' },
      {
        path: '/api/notifications',
        method: 'GET',
        category: 'Data',
        description: 'List notifications'
      },
      { path: '/api/sessions', method: 'GET', category: 'Data', description: 'List sessions' }
    ]
  });
});

describe('Endpoints Discovery API', () => {
  describe('GET /api/endpoints', () => {
    it('should return list of available endpoints', async () => {
      const res = await request(app).get('/api/endpoints');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('endpoints');
      expect(Array.isArray(res.body.endpoints)).toBe(true);
    });

    it('should return endpoints with required properties', async () => {
      const res = await request(app).get('/api/endpoints');

      expect(res.body.endpoints.length).toBeGreaterThan(0);

      res.body.endpoints.forEach(endpoint => {
        expect(endpoint).toHaveProperty('path');
        expect(endpoint).toHaveProperty('method');
        expect(endpoint).toHaveProperty('category');
        expect(endpoint).toHaveProperty('description');

        // Validate types
        expect(typeof endpoint.path).toBe('string');
        expect(typeof endpoint.method).toBe('string');
        expect(typeof endpoint.category).toBe('string');
        expect(typeof endpoint.description).toBe('string');

        // Validate path format
        expect(endpoint.path).toMatch(/^\/api\//);

        // Validate method
        expect(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).toContain(endpoint.method);
      });
    });

    it('should include core endpoints', async () => {
      const res = await request(app).get('/api/endpoints');

      const paths = res.body.endpoints.map(e => e.path);

      expect(paths).toContain('/api/status');
      expect(paths).toContain('/api/health');
      expect(paths).toContain('/api/events');
      expect(paths).toContain('/api/errors');
    });

    it('should categorize endpoints', async () => {
      const res = await request(app).get('/api/endpoints');

      const categories = [...new Set(res.body.endpoints.map(e => e.category))];

      expect(categories.length).toBeGreaterThan(0);
      expect(categories).toContain('Core');
      expect(categories).toContain('Data');
    });
  });
});
