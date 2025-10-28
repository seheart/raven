/**
 * Tests for Documentation Routes
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createDocumentationRoutes } from '../../routes/documentation.js';
import fs from 'fs';

describe('Documentation Routes', () => {
  let app;

  beforeEach(() => {
    // Create Express app with documentation routes
    app = express();
    app.use(express.json());

    const router = createDocumentationRoutes({});
    app.use('/api', router);
  });

  describe('GET /api/docs/list', () => {
    test('should list documentation files successfully', async () => {
      const response = await request(app)
        .get('/api/docs/list');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('docs');
      expect(response.body).toHaveProperty('all');
    });

    test('should organize files by category', async () => {
      const response = await request(app)
        .get('/api/docs/list');

      expect(response.status).toBe(200);
      expect(response.body.docs).toHaveProperty('root');
      expect(response.body.docs).toHaveProperty('api');
      expect(response.body.docs).toHaveProperty('other');
    });

    test('should return array of all docs', async () => {
      const response = await request(app)
        .get('/api/docs/list');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.all)).toBe(true);
      expect(response.body.total).toBe(response.body.all.length);
    });

    test('should include file metadata for each doc', async () => {
      const response = await request(app)
        .get('/api/docs/list');

      expect(response.status).toBe(200);
      if (response.body.all.length > 0) {
        expect(response.body.all[0]).toHaveProperty('path');
        expect(response.body.all[0]).toHaveProperty('name');
        expect(response.body.all[0]).toHaveProperty('title');
        expect(response.body.all[0]).toHaveProperty('category');
      }
    });

    test('should only list markdown files', async () => {
      const response = await request(app)
        .get('/api/docs/list');

      expect(response.status).toBe(200);
      response.body.all.forEach(doc => {
        expect(doc.name).toMatch(/\.md$/);
      });
    });

    test('should handle filesystem errors gracefully', async () => {
      // Mock readdirSync to throw an error
      const originalReaddirSync = fs.readdirSync;
      fs.readdirSync = () => {
        throw new Error('Permission denied');
      };

      // Need to reload the route with the mocked fs
      const app2 = express();
      app2.use(express.json());
      const router = createDocumentationRoutes({});
      app2.use('/api', router);

      const response = await request(app2)
        .get('/api/docs/list');

      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();

      // Restore original
      fs.readdirSync = originalReaddirSync;
    });
  });

  describe('GET /api/docs/:filepath(*)', () => {
    test('should return documentation file content for existing files', async () => {
      const response = await request(app)
        .get('/api/docs/README.md');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('filepath');
      expect(response.body).toHaveProperty('markdown');
      expect(response.body).toHaveProperty('title');
      expect(typeof response.body.markdown).toBe('string');
    });

    test('should reject non-markdown files', async () => {
      const response = await request(app)
        .get('/api/docs/image.png');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Only markdown files allowed');
    });

    test('should reject files without .md extension', async () => {
      const response = await request(app)
        .get('/api/docs/script.js');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Only markdown files allowed');
    });

    test('should return 404 for non-existent files', async () => {
      const response = await request(app)
        .get('/api/docs/nonexistent-file-that-does-not-exist-12345.md');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Documentation file not found');
    });

    test('should handle deeply nested paths that exist', async () => {
      const response = await request(app)
        .get('/api/docs/api/REST_API.md');

      if (response.status === 200) {
        expect(response.body).toHaveProperty('filepath');
        expect(response.body.filepath).toBe('api/REST_API.md');
        expect(response.body.title).toContain(' / ');
      } else {
        // File might not exist, which is fine
        expect(response.status).toBe(404);
      }
    });

    test('should format title from filepath correctly', async () => {
      const response = await request(app)
        .get('/api/docs/README.md');

      expect(response.status).toBe(200);
      expect(response.body.title).toBe('README');
    });

    test('should reject txt files', async () => {
      const response = await request(app)
        .get('/api/docs/test.txt');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Only markdown files allowed');
    });

    test('should reject html files', async () => {
      const response = await request(app)
        .get('/api/docs/test.html');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Only markdown files allowed');
    });

    test('should reject path traversal attempts', async () => {
      // Path traversal that would escape docs directory
      const response = await request(app)
        .get('/api/docs/../../../../etc/passwd.md');

      // May return 404 if path resolves to non-existent or 403 if detected
      expect([403, 404]).toContain(response.status);
    });

    test('should reject path traversal with encoded slashes', async () => {
      const response = await request(app)
        .get('/api/docs/..%2F..%2Fetc%2Fpasswd.md');

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied: Path traversal attempt detected');
    });

    test('should handle file read errors gracefully', async () => {
      // This test attempts to trigger the catch block on lines 117-118
      // by requesting a directory with .md extension (exists but can't be read as file)
      const response = await request(app)
        .get('/api/docs/test-dir.md');

      // Should return 500 with error message when trying to read directory as file
      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
    });
  });
});
