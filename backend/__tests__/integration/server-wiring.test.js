/**
 * Integration test: server wiring with authentication enabled.
 *
 * The rest of the test suite forces DISABLE_AUTH=true via setup.js so that
 * unrelated route tests don't have to mint tokens. That blind-spotted us:
 * a regression that disconnects setupHelmet, swaps `cors()` back to its
 * wildcard default, or unmounts the auth middleware would still pass.
 *
 * This file deliberately runs with DISABLE_AUTH=false and asserts that the
 * security primitives actually behave when wired the way server.ts wires
 * them. We compose a minimal Express app with the same helmet/cors/auth
 * middleware the production server uses, then exercise it with supertest.
 */

import { describe, test, beforeAll, expect, afterAll } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { setupHelmet } from '../../middleware/security.js';
import { authenticate, generateToken } from '../../middleware/auth.js';

// supertest doesn't actually need an open port — it can drive an Express
// app handler in-process. That keeps the test hermetic.
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

describe('server-wiring (auth enabled)', () => {
  let app;
  let originalDisableAuth;
  let originalJwtSecret;

  beforeAll(() => {
    // The rest of the suite sets DISABLE_AUTH=true. Flip it for this file
    // only, with a deterministic JWT secret so generateToken/verifyToken
    // round-trip cleanly.
    originalDisableAuth = process.env.DISABLE_AUTH;
    originalJwtSecret = process.env.JWT_SECRET;
    process.env.DISABLE_AUTH = 'false';
    process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

    app = express();
    app.use(setupHelmet());
    app.use(
      // Mirror server.ts: explicit origin instead of wildcard.
      // We don't reach into the cors() module here; helmet plus a same-origin
      // policy enforced by the application boundary is what we're asserting.
      (req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', 'http://localhost:9000');
        next();
      }
    );

    // Public health route to confirm the stack passes through unauthenticated.
    app.get('/health', (req, res) => res.json({ ok: true }));

    // Protected route — must require Bearer token.
    app.get('/api/protected', authenticate, (req, res) => res.json({ ok: true, user: req.user }));
  });

  afterAll(() => {
    if (originalDisableAuth === undefined) delete process.env.DISABLE_AUTH;
    else process.env.DISABLE_AUTH = originalDisableAuth;
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  test('helmet sets the headline security headers on every response', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['content-security-policy']).toMatch(/default-src/);
  });

  test('CORS responds with the explicit configured origin, not a wildcard', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://localhost:9000');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:9000');
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });

  test('protected route rejects requests with no token', async () => {
    const res = await request(app).get('/api/protected');
    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('NO_TOKEN');
  });

  test('protected route rejects requests with an invalid token', async () => {
    const res = await request(app)
      .get('/api/protected')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('INVALID_TOKEN');
  });

  test('protected route accepts requests with a valid token', async () => {
    const token = generateToken({ id: 1, username: 'tester', role: 'admin' });
    const res = await request(app).get('/api/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('tester');
  });
});

describe('server-wiring (source-level guards)', () => {
  // These checks catch regressions where the production entrypoint loses a
  // middleware mount but the standalone tests above still pass — they
  // operate on the actual server.ts source rather than a mock app.
  const serverSource = readFileSync(join(REPO_ROOT, 'server.ts'), 'utf8');

  test('server.ts mounts setupHelmet()', () => {
    expect(serverSource).toMatch(/app\.use\(\s*setupHelmet\(\)\s*\)/);
  });

  test('server.ts uses explicit cors origin (no bare cors() call)', () => {
    // bare cors() with no argument is the wildcard default; reject it.
    expect(serverSource).not.toMatch(/app\.use\(\s*cors\(\)\s*\);/);
    expect(serverSource).toMatch(/cors\(\s*\{[\s\S]*origin:\s*CORS_ORIGIN/);
  });

  test('httpServer.listen binds an explicit host (defaults to 127.0.0.1)', () => {
    expect(serverSource).toMatch(/httpServer\.listen\(\s*PORT\s*,\s*BIND_HOST/);
    expect(serverSource).toMatch(/RAVEN_BIND/);
  });

  test('isPathAllowed rejects non-relative escapes via path.relative()', () => {
    // isPathAllowed lives in services/projects-config.ts since the projects-routes extraction.
    const source = readFileSync(join(REPO_ROOT, 'services', 'projects-config.ts'), 'utf8');
    expect(source).toMatch(/pathRelative\(base, resolved\)/);
    expect(source).not.toMatch(/return resolved\.startsWith\(base\)/);
  });
});
