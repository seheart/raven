/**
 * Errors API Test Suite
 */

import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const app = express();
app.use(express.json());

app.get('/api/errors', (req, res) => {
  res.json({ errors: [], total: 0, hasMore: false });
});

describe('Errors API', () => {
  it('should return errors list', async () => {
    const res = await request(app).get('/api/errors');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });
});
