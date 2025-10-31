/**
 * Security Headers Test Suite
 * Tests OWASP security header compliance
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { setupHelmet } from '../../middleware/security.js';

describe('Security Headers', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(setupHelmet());
    app.get('/test', (req, res) => res.json({ ok: true }));
  });

  describe('Helmet Security Headers', () => {
    it('should set X-Content-Type-Options to nosniff', async () => {
      const res = await request(app).get('/test');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should set X-Frame-Options to DENY', async () => {
      const res = await request(app).get('/test');
      expect(res.headers['x-frame-options']).toBe('DENY');
    });

    it('should set Strict-Transport-Security', async () => {
      const res = await request(app).get('/test');
      expect(res.headers['strict-transport-security']).toContain('max-age=');
    });

    it('should set Referrer-Policy', async () => {
      const res = await request(app).get('/test');
      expect(res.headers['referrer-policy']).toBeDefined();
    });

    it('should remove X-Powered-By header', async () => {
      const res = await request(app).get('/test');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('should set Content-Security-Policy', async () => {
      const res = await request(app).get('/test');
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['content-security-policy']).toContain('default-src');
    });

    it('should set X-DNS-Prefetch-Control', async () => {
      const res = await request(app).get('/test');
      expect(res.headers['x-dns-prefetch-control']).toBe('off');
    });
  });

  describe('CSP Directives', () => {
    it('should block inline scripts by default', async () => {
      const res = await request(app).get('/test');
      const csp = res.headers['content-security-policy'];
      expect(csp).toContain('script-src');
    });

    it('should set frame-ancestors to none', async () => {
      const res = await request(app).get('/test');
      const csp = res.headers['content-security-policy'];
      expect(csp).toContain('frame-ancestors');
    });

    it('should set object-src to none', async () => {
      const res = await request(app).get('/test');
      const csp = res.headers['content-security-policy'];
      expect(csp).toContain("object-src 'none'");
    });
  });
});
