/**
 * Tests for API Documentation Routes
 */

import express from 'express';
import request from 'supertest';
import { createApiDocsRoutes } from '../../routes/api-docs.js';
import { openApiSpec } from '../../config/openapi.js';

describe('API Documentation Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use('/api-docs', createApiDocsRoutes());
  });

  describe('GET /api-docs/', () => {
    it('should serve Swagger UI HTML', async () => {
      const response = await request(app).get('/api-docs/');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      // Swagger UI should render HTML containing script or style tags
      expect(response.text).toMatch(/<html|<script|<style/i);
    });

    it('should redirect /api-docs to /api-docs/', async () => {
      const response = await request(app).get('/api-docs');

      expect(response.status).toBe(301);
      expect(response.headers.location).toContain('/api-docs/');
    });
  });

  describe('GET /api-docs/openapi.json', () => {
    it('should return OpenAPI specification as JSON', async () => {
      const response = await request(app).get('/api-docs/openapi.json');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(openApiSpec);
      expect(response.body.openapi).toBeDefined();
      expect(response.body.info).toBeDefined();
    });

    it('should have correct content-type header', async () => {
      const response = await request(app).get('/api-docs/openapi.json');

      expect(response.headers['content-type']).toContain('application/json');
    });

    it('should have info object with title and version', async () => {
      const response = await request(app).get('/api-docs/openapi.json');

      expect(response.body.info.title).toBeDefined();
      expect(response.body.info.version).toBeDefined();
    });

    it('should have paths object', async () => {
      const response = await request(app).get('/api-docs/openapi.json');

      expect(response.body.paths).toBeDefined();
      expect(typeof response.body.paths).toBe('object');
    });
  });
});
